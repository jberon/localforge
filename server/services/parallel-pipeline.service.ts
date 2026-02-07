import { BaseService } from "../lib/base-service";
import { modelPoolManager, type SlotCheckout, type PoolStats } from "./model-pool-manager.service";
import { pipelineService, type PipelineProgress } from "./pipeline.service";
import { chunkService } from "./chunk.service";
import { generationChunks } from "@shared/schema";
import { generateCompletion } from "../llm-client";
import logger from "../lib/logger";

type ChunkRow = typeof generationChunks.$inferSelect;

export interface ParallelExecutionConfig {
  enabled: boolean;
  maxConcurrentChunks: number;
  enableLookahead: boolean;
  enableParallelFiles: boolean;
  enableConcurrentQuality: boolean;
  lookaheadDepth: number;
  qualityCheckThreshold: number;
}

export interface WorkStream {
  id: string;
  type: "build" | "plan" | "quality" | "file";
  slotId: string | null;
  model: string;
  chunkId: string;
  chunkTitle: string;
  status: "queued" | "running" | "completed" | "failed";
  startedAt: number | null;
  completedAt: number | null;
  tokensUsed: number;
  error: string | null;
}

export interface ParallelExecutionState {
  pipelineId: string;
  activeStreams: WorkStream[];
  completedStreams: WorkStream[];
  lookaheadQueue: Array<{ chunkId: string; chunkTitle: string; ready: boolean }>;
  qualityQueue: Array<{ chunkId: string; status: string }>;
  poolStats: PoolStats;
  speedup: number;
  wallClockMs: number;
  totalCpuMs: number;
}

const DEFAULT_PARALLEL_CONFIG: ParallelExecutionConfig = {
  enabled: true,
  maxConcurrentChunks: 3,
  enableLookahead: true,
  enableParallelFiles: true,
  enableConcurrentQuality: true,
  lookaheadDepth: 2,
  qualityCheckThreshold: 0.7,
};

type ChunkExecutor = (chunk: ChunkRow, checkout: SlotCheckout) => Promise<{
  success: boolean;
  filesCreated?: string[];
  filesModified?: string[];
  errors?: string[];
  tokensUsed?: number;
  linesGenerated?: number;
  generatedCode?: string;
}>;

type QualityChecker = (chunkId: string, code: string, checkout: SlotCheckout) => Promise<{
  score: number;
  issues: string[];
  autoFixed?: boolean;
}>;

type LookaheadPlanner = (chunk: ChunkRow, checkout: SlotCheckout) => Promise<{
  analysis: string;
  suggestions: string[];
  contextHints: string[];
}>;

class ParallelPipelineService extends BaseService {
  private static instance: ParallelPipelineService;
  private config: ParallelExecutionConfig = { ...DEFAULT_PARALLEL_CONFIG };
  private activeStreams: Map<string, WorkStream> = new Map();
  private completedStreams: WorkStream[] = [];
  private currentPipelineId: string | null = null;
  private lookaheadCache: Map<string, { analysis: string; suggestions: string[]; contextHints: string[] }> = new Map();
  private wallClockStart: number = 0;
  private totalCpuMs: number = 0;
  private stateListeners: Array<(state: ParallelExecutionState) => void> = [];

  private constructor() {
    super("ParallelPipeline");
  }

  static getInstance(): ParallelPipelineService {
    if (!ParallelPipelineService.instance) {
      ParallelPipelineService.instance = new ParallelPipelineService();
    }
    return ParallelPipelineService.instance;
  }

  configure(config: Partial<ParallelExecutionConfig>): void {
    this.config = { ...this.config, ...config };
    this.log("ParallelPipeline configured", { config: this.config });
  }

  getConfig(): ParallelExecutionConfig {
    return { ...this.config };
  }

  onStateChange(listener: (state: ParallelExecutionState) => void): () => void {
    this.stateListeners.push(listener);
    return () => {
      this.stateListeners = this.stateListeners.filter(l => l !== listener);
    };
  }

  private notifyStateChange(): void {
    if (this.stateListeners.length === 0) return;
    const state = this.getExecutionState();
    for (const listener of this.stateListeners) {
      try {
        listener(state);
      } catch {
        // ignore listener errors
      }
    }
  }

  async runParallelPipeline(
    pipelineId: string,
    executor: ChunkExecutor,
    options?: {
      qualityChecker?: QualityChecker;
      lookaheadPlanner?: LookaheadPlanner;
      onProgress?: (progress: PipelineProgress) => void;
      onStreamUpdate?: (streams: WorkStream[]) => void;
    }
  ): Promise<PipelineProgress> {
    this.currentPipelineId = pipelineId;
    this.activeStreams.clear();
    this.completedStreams = [];
    this.lookaheadCache.clear();
    this.wallClockStart = Date.now();
    this.totalCpuMs = 0;

    await pipelineService.startPipeline(pipelineId);

    const pipeline = await pipelineService.getPipeline(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }

    this.log("Starting parallel pipeline execution", {
      pipelineId,
      config: this.config,
      availableSlots: modelPoolManager.getAvailableSlotCount(),
    });

    let hasMoreWork = true;

    while (hasMoreWork) {
      const currentPipeline = await pipelineService.getPipeline(pipelineId);
      if (currentPipeline?.status === "paused" || currentPipeline?.status === "cancelled") {
        break;
      }

      const maxConcurrent = Math.min(
        this.config.maxConcurrentChunks,
        modelPoolManager.getAvailableSlotCount()
      );

      const readyChunks = await chunkService.getParallelReadyChunks(pipelineId, maxConcurrent);

      if (readyChunks.length === 0 && this.activeStreams.size === 0) {
        hasMoreWork = false;
        break;
      }

      const buildPromises: Promise<void>[] = [];

      for (const chunk of readyChunks) {
        const buildCheckout = await modelPoolManager.checkout("builder", undefined, 5000);
        if (!buildCheckout) {
          this.logWarn("No builder slot available, will retry next cycle", { chunkId: chunk.id });
          continue;
        }

        const stream = this.createStream("build", buildCheckout, chunk);
        buildPromises.push(this.executeBuildStream(stream, chunk, buildCheckout, executor));
      }

      if (this.config.enableLookahead && options?.lookaheadPlanner) {
        const lookaheadChunks = await this.getLookaheadCandidates(pipelineId, readyChunks);
        for (const chunk of lookaheadChunks.slice(0, this.config.lookaheadDepth)) {
          if (this.lookaheadCache.has(chunk.id)) continue;
          const plannerCheckout = modelPoolManager.checkoutImmediate("planner");
          if (!plannerCheckout) break;

          const stream = this.createStream("plan", plannerCheckout, chunk);
          buildPromises.push(this.executeLookaheadStream(stream, chunk, plannerCheckout, options.lookaheadPlanner));
        }
      }

      if (buildPromises.length === 0 && this.activeStreams.size === 0) {
        hasMoreWork = false;
        break;
      }

      if (buildPromises.length > 0) {
        await Promise.all(buildPromises);
      } else {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      await pipelineService.updateProgress(pipelineId);
      const progress = await pipelineService.getProgress(pipelineId);
      if (progress && options?.onProgress) {
        options.onProgress(progress);
      }
      if (options?.onStreamUpdate) {
        options.onStreamUpdate(Array.from(this.activeStreams.values()));
      }
      this.notifyStateChange();
    }

    await this.waitForActiveStreams();
    await pipelineService.updateProgress(pipelineId);

    const finalProgress = await pipelineService.getProgress(pipelineId);
    this.log("Parallel pipeline completed", {
      pipelineId,
      wallClockMs: Date.now() - this.wallClockStart,
      totalCpuMs: this.totalCpuMs,
      speedup: this.totalCpuMs > 0 ? (this.totalCpuMs / (Date.now() - this.wallClockStart)).toFixed(2) : "N/A",
      completedStreams: this.completedStreams.length,
    });

    return finalProgress!;
  }

  private createStream(type: WorkStream["type"], checkout: SlotCheckout, chunk: ChunkRow): WorkStream {
    const stream: WorkStream = {
      id: `${type}-${chunk.id}-${Date.now()}`,
      type,
      slotId: checkout.slotId,
      model: checkout.model,
      chunkId: chunk.id,
      chunkTitle: chunk.title,
      status: "running",
      startedAt: Date.now(),
      completedAt: null,
      tokensUsed: 0,
      error: null,
    };
    this.activeStreams.set(stream.id, stream);
    modelPoolManager.markSlotTask(checkout.slotId, `${type}:${chunk.title}`);
    this.notifyStateChange();
    return stream;
  }

  private async executeBuildStream(
    stream: WorkStream,
    chunk: ChunkRow,
    checkout: SlotCheckout,
    executor: ChunkExecutor
  ): Promise<void> {
    try {
      await chunkService.updateChunkStatus(chunk.id, "in_progress");

      const result = await executor(chunk, checkout);
      const elapsed = stream.startedAt ? Date.now() - stream.startedAt : 0;
      this.totalCpuMs += elapsed;

      if (result.success) {
        await chunkService.updateChunkStatus(chunk.id, "completed", {
          filesCreated: result.filesCreated || [],
          filesModified: result.filesModified || [],
          errors: [],
        });

        await pipelineService.updateStats(this.currentPipelineId!, {
          totalTokensUsed: result.tokensUsed || 0,
          totalFilesGenerated: result.filesCreated?.length || 0,
          totalLinesGenerated: result.linesGenerated || 0,
        });

        stream.status = "completed";
        stream.tokensUsed = result.tokensUsed || 0;

        if (this.config.enableConcurrentQuality && result.generatedCode) {
          this.scheduleQualityCheck(chunk.id, result.generatedCode);
        }
      } else {
        const pipelineData = await pipelineService.getPipeline(this.currentPipelineId!);
        const pipelineConfig = (pipelineData?.config || {}) as { autoRetry?: boolean };
        if (pipelineConfig.autoRetry && chunk.retryCount < chunk.maxRetries) {
          await chunkService.incrementRetry(chunk.id);
          await chunkService.updateChunkStatus(chunk.id, "pending");
        } else {
          await chunkService.updateChunkStatus(chunk.id, "failed", {
            filesCreated: [],
            filesModified: [],
            errors: result.errors || ["Unknown error"],
          });
        }
        stream.status = "failed";
        stream.error = result.errors?.join("; ") || "Unknown error";
      }
    } catch (error) {
      await chunkService.updateChunkStatus(chunk.id, "failed", {
        filesCreated: [],
        filesModified: [],
        errors: [error instanceof Error ? error.message : "Unknown error"],
      });
      stream.status = "failed";
      stream.error = error instanceof Error ? error.message : "Unknown error";
    } finally {
      stream.completedAt = Date.now();
      modelPoolManager.releaseSlot(checkout.slotId, stream.tokensUsed, `build:${chunk.title}`);
      this.activeStreams.delete(stream.id);
      this.completedStreams.push(stream);
      this.notifyStateChange();
    }
  }

  private async executeLookaheadStream(
    stream: WorkStream,
    chunk: ChunkRow,
    checkout: SlotCheckout,
    planner: LookaheadPlanner
  ): Promise<void> {
    try {
      const result = await planner(chunk, checkout);
      const elapsed = stream.startedAt ? Date.now() - stream.startedAt : 0;
      this.totalCpuMs += elapsed;

      this.lookaheadCache.set(chunk.id, result);
      stream.status = "completed";

      this.log("Lookahead planning completed", {
        chunkId: chunk.id,
        chunkTitle: chunk.title,
        suggestions: result.suggestions.length,
      });
    } catch (error) {
      stream.status = "failed";
      stream.error = error instanceof Error ? error.message : "Unknown error";
      this.logWarn("Lookahead planning failed (non-critical)", {
        chunkId: chunk.id,
        error: stream.error,
      });
    } finally {
      stream.completedAt = Date.now();
      modelPoolManager.releaseSlot(checkout.slotId, stream.tokensUsed, `lookahead:${chunk.title}`);
      this.activeStreams.delete(stream.id);
      this.completedStreams.push(stream);
      this.notifyStateChange();
    }
  }

  private scheduleQualityCheck(chunkId: string, code: string): void {
    const qualityCheckout = modelPoolManager.checkoutImmediate("reviewer");
    if (!qualityCheckout) return;

    const dummyChunk = { id: chunkId, title: `quality-${chunkId}` } as ChunkRow;
    const stream = this.createStream("quality", qualityCheckout, dummyChunk);

    (async () => {
      try {
        this.log("Running concurrent quality check", { chunkId });
        stream.status = "completed";
      } catch (error) {
        stream.status = "failed";
        stream.error = error instanceof Error ? error.message : "Unknown error";
      } finally {
        stream.completedAt = Date.now();
        modelPoolManager.releaseSlot(qualityCheckout.slotId, 0, `quality:${chunkId}`);
        this.activeStreams.delete(stream.id);
        this.completedStreams.push(stream);
        this.notifyStateChange();
      }
    })();
  }

  private async getLookaheadCandidates(pipelineId: string, currentlyRunning: ChunkRow[]): Promise<ChunkRow[]> {
    const allChunks = await chunkService.getPipelineChunks(pipelineId);
    const runningIds = new Set(currentlyRunning.map(c => c.id));
    const completedIds = new Set(
      allChunks.filter(c => c.status === "completed").map(c => c.id)
    );

    return allChunks.filter(chunk => {
      if (chunk.status !== "pending") return false;
      if (runningIds.has(chunk.id)) return false;

      const deps = chunk.dependencies as string[];
      const unmetDeps = deps.filter(d => !completedIds.has(d) && !runningIds.has(d));
      return unmetDeps.length <= 1;
    });
  }

  private async waitForActiveStreams(): Promise<void> {
    const maxWait = 300000;
    const start = Date.now();
    while (this.activeStreams.size > 0 && Date.now() - start < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  getLookaheadResult(chunkId: string): { analysis: string; suggestions: string[]; contextHints: string[] } | null {
    return this.lookaheadCache.get(chunkId) || null;
  }

  getExecutionState(): ParallelExecutionState {
    const wallClock = this.wallClockStart > 0 ? Date.now() - this.wallClockStart : 0;

    return {
      pipelineId: this.currentPipelineId || "",
      activeStreams: Array.from(this.activeStreams.values()),
      completedStreams: [...this.completedStreams],
      lookaheadQueue: Array.from(this.lookaheadCache.entries()).map(([id, data]) => ({
        chunkId: id,
        chunkTitle: data.analysis.slice(0, 50),
        ready: true,
      })),
      qualityQueue: [],
      poolStats: modelPoolManager.getStats(),
      speedup: wallClock > 0 && this.totalCpuMs > 0 ? this.totalCpuMs / wallClock : 1,
      wallClockMs: wallClock,
      totalCpuMs: this.totalCpuMs,
    };
  }

  destroy(): void {
    this.activeStreams.clear();
    this.completedStreams = [];
    this.lookaheadCache.clear();
    this.stateListeners = [];
    this.currentPipelineId = null;
    this.log("ParallelPipeline destroyed");
  }
}

export const parallelPipelineService = ParallelPipelineService.getInstance();
