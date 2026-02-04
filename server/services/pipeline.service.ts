import { db as dbInstance } from "../db";
import { generationPipelines, generationChunks } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import logger from "../lib/logger";
import { chunkService, ChunkCreateInput, TaskDecomposition } from "./chunk.service";

function getDb() {
  if (!dbInstance) {
    throw new Error("Database not initialized. Check DATABASE_URL environment variable.");
  }
  return dbInstance;
}

export interface PipelineConfig {
  parallelism?: number;
  stopOnError?: boolean;
  autoRetry?: boolean;
  maxContextTokens?: number;
}

export interface PipelineStats {
  totalTokensUsed: number;
  totalFilesGenerated: number;
  totalLinesGenerated: number;
  durationMs?: number;
}

export interface PipelineProgress {
  pipelineId: string;
  name: string;
  status: string;
  totalChunks: number;
  completedChunks: number;
  failedChunks: number;
  currentTask?: { id: string; title: string; type: string };
  progressPercent: number;
  stats?: PipelineStats;
}

export class PipelineService {
  async createPipeline(
    projectId: string,
    name: string,
    originalPrompt: string,
    chunks: ChunkCreateInput[],
    config: PipelineConfig = {}
  ): Promise<string> {
    const id = uuidv4();
    const now = Date.now();

    await getDb().insert(generationPipelines).values({
      id,
      projectId,
      name,
      description: `Auto-generated pipeline for: ${originalPrompt.substring(0, 100)}...`,
      originalPrompt,
      status: "pending",
      totalChunks: chunks.length,
      completedChunks: 0,
      failedChunks: 0,
      config: {
        parallelism: config.parallelism || 1,
        stopOnError: config.stopOnError ?? false,
        autoRetry: config.autoRetry ?? true,
        maxContextTokens: config.maxContextTokens || 32000,
      },
      stats: null,
      createdAt: now,
      updatedAt: now,
    });

    for (const chunk of chunks) {
      await chunkService.createChunk({
        ...chunk,
        projectId,
        pipelineId: id,
      });
    }

    logger.info("Pipeline created", { id, projectId, totalChunks: chunks.length });
    return id;
  }

  async getPipeline(id: string): Promise<typeof generationPipelines.$inferSelect | null> {
    const result = await getDb().select().from(generationPipelines).where(eq(generationPipelines.id, id)).limit(1);
    return result[0] || null;
  }

  async getProjectPipelines(projectId: string): Promise<typeof generationPipelines.$inferSelect[]> {
    return await getDb()
      .select()
      .from(generationPipelines)
      .where(eq(generationPipelines.projectId, projectId));
  }

  async startPipeline(id: string): Promise<void> {
    await getDb().update(generationPipelines).set({
      status: "running",
      startedAt: Date.now(),
      updatedAt: Date.now(),
    }).where(eq(generationPipelines.id, id));
    
    logger.info("Pipeline started", { id });
  }

  async pausePipeline(id: string): Promise<void> {
    await getDb().update(generationPipelines).set({
      status: "paused",
      updatedAt: Date.now(),
    }).where(eq(generationPipelines.id, id));
    
    logger.info("Pipeline paused", { id });
  }

  async resumePipeline(id: string): Promise<void> {
    await getDb().update(generationPipelines).set({
      status: "running",
      updatedAt: Date.now(),
    }).where(eq(generationPipelines.id, id));
    
    logger.info("Pipeline resumed", { id });
  }

  async cancelPipeline(id: string): Promise<void> {
    await getDb().update(generationPipelines).set({
      status: "cancelled",
      completedAt: Date.now(),
      updatedAt: Date.now(),
    }).where(eq(generationPipelines.id, id));

    await getDb().update(generationChunks).set({ status: "skipped" })
      .where(and(
        eq(generationChunks.pipelineId, id),
        eq(generationChunks.status, "pending")
      ));
    
    logger.info("Pipeline cancelled", { id });
  }

  async updateProgress(id: string): Promise<void> {
    const chunks = await chunkService.getPipelineChunks(id);
    
    const completedChunks = chunks.filter(c => c.status === "completed").length;
    const failedChunks = chunks.filter(c => c.status === "failed").length;
    const inProgress = chunks.find(c => c.status === "in_progress");

    const allDone = completedChunks + failedChunks === chunks.length;
    
    await getDb().update(generationPipelines).set({
      completedChunks,
      failedChunks,
      currentChunkId: inProgress?.id || null,
      status: allDone ? (failedChunks > 0 ? "failed" : "completed") : "running",
      completedAt: allDone ? Date.now() : null,
      updatedAt: Date.now(),
    }).where(eq(generationPipelines.id, id));
  }

  async getProgress(id: string): Promise<PipelineProgress | null> {
    const pipeline = await this.getPipeline(id);
    if (!pipeline) return null;

    const chunks = await chunkService.getPipelineChunks(id);
    const currentChunk = chunks.find(c => c.id === pipeline.currentChunkId);
    
    const progressPercent = pipeline.totalChunks > 0 
      ? Math.round((pipeline.completedChunks / pipeline.totalChunks) * 100)
      : 0;

    return {
      pipelineId: id,
      name: pipeline.name,
      status: pipeline.status || "pending",
      totalChunks: pipeline.totalChunks,
      completedChunks: pipeline.completedChunks,
      failedChunks: pipeline.failedChunks,
      currentTask: currentChunk ? {
        id: currentChunk.id,
        title: currentChunk.title,
        type: currentChunk.type,
      } : undefined,
      progressPercent,
      stats: pipeline.stats as PipelineStats | undefined,
    };
  }

  async updateStats(id: string, stats: Partial<PipelineStats>): Promise<void> {
    const pipeline = await this.getPipeline(id);
    if (!pipeline) return;

    const existingStats = (pipeline.stats || {}) as PipelineStats;
    const newStats: PipelineStats = {
      totalTokensUsed: (existingStats.totalTokensUsed || 0) + (stats.totalTokensUsed || 0),
      totalFilesGenerated: (existingStats.totalFilesGenerated || 0) + (stats.totalFilesGenerated || 0),
      totalLinesGenerated: (existingStats.totalLinesGenerated || 0) + (stats.totalLinesGenerated || 0),
      durationMs: pipeline.startedAt ? Date.now() - pipeline.startedAt : undefined,
    };

    await getDb().update(generationPipelines).set({
      stats: newStats,
      updatedAt: Date.now(),
    }).where(eq(generationPipelines.id, id));
  }

  async createPipelineFromDecomposition(
    projectId: string,
    name: string,
    originalPrompt: string,
    decomposition: TaskDecomposition,
    config?: PipelineConfig
  ): Promise<string> {
    const chunksWithProject = decomposition.chunks.map((chunk, index) => ({
      ...chunk,
      projectId,
    }));

    return this.createPipeline(projectId, name, originalPrompt, chunksWithProject, config);
  }

  async getNextExecutableChunk(pipelineId: string): Promise<typeof generationChunks.$inferSelect | null> {
    return chunkService.getNextPendingChunk(pipelineId);
  }

  async executeNextChunk(
    pipelineId: string,
    executor: (chunk: typeof generationChunks.$inferSelect) => Promise<{ 
      success: boolean; 
      filesCreated?: string[]; 
      filesModified?: string[]; 
      errors?: string[];
      tokensUsed?: number;
    }>
  ): Promise<{ executed: boolean; chunkId?: string; success?: boolean }> {
    const chunk = await this.getNextExecutableChunk(pipelineId);
    if (!chunk) {
      return { executed: false };
    }

    await chunkService.updateChunkStatus(chunk.id, "in_progress");
    await this.updateProgress(pipelineId);

    try {
      const result = await executor(chunk);
      
      if (result.success) {
        await chunkService.updateChunkStatus(chunk.id, "completed", {
          filesCreated: result.filesCreated || [],
          filesModified: result.filesModified || [],
          errors: [],
        });
        
        if (result.tokensUsed) {
          await this.updateStats(pipelineId, { totalTokensUsed: result.tokensUsed });
        }
      } else {
        const pipeline = await this.getPipeline(pipelineId);
        const config = (pipeline?.config || {}) as PipelineConfig;
        
        if (config.autoRetry && chunk.retryCount < chunk.maxRetries) {
          await chunkService.incrementRetry(chunk.id);
          await chunkService.updateChunkStatus(chunk.id, "pending");
        } else {
          await chunkService.updateChunkStatus(chunk.id, "failed", {
            filesCreated: [],
            filesModified: [],
            errors: result.errors || ["Unknown error"],
          });
        }
      }

      await this.updateProgress(pipelineId);
      return { executed: true, chunkId: chunk.id, success: result.success };
      
    } catch (error) {
      await chunkService.updateChunkStatus(chunk.id, "failed", {
        filesCreated: [],
        filesModified: [],
        errors: [error instanceof Error ? error.message : "Unknown error"],
      });
      await this.updateProgress(pipelineId);
      return { executed: true, chunkId: chunk.id, success: false };
    }
  }

  async runPipeline(
    pipelineId: string,
    executor: (chunk: typeof generationChunks.$inferSelect) => Promise<{ 
      success: boolean; 
      filesCreated?: string[]; 
      filesModified?: string[];
      errors?: string[];
      tokensUsed?: number;
      linesGenerated?: number;
    }>,
    onProgress?: (progress: PipelineProgress) => void
  ): Promise<PipelineProgress> {
    await this.startPipeline(pipelineId);
    
    const pipeline = await this.getPipeline(pipelineId);
    const config = (pipeline?.config || {}) as PipelineConfig;
    const parallelism = config.parallelism || 1;
    
    let hasMoreChunks = true;
    
    while (hasMoreChunks) {
      const currentPipeline = await this.getPipeline(pipelineId);
      if (currentPipeline?.status === "paused" || currentPipeline?.status === "cancelled") {
        break;
      }

      const readyChunks = await chunkService.getParallelReadyChunks(pipelineId, parallelism);
      
      if (readyChunks.length === 0) {
        hasMoreChunks = false;
        break;
      }

      const executionPromises = readyChunks.map(async (chunk) => {
        await chunkService.updateChunkStatus(chunk.id, "in_progress");
        
        try {
          const result = await executor(chunk);
          
          if (result.success) {
            await chunkService.updateChunkStatus(chunk.id, "completed", {
              filesCreated: result.filesCreated || [],
              filesModified: result.filesModified || [],
              errors: [],
            });
            
            await this.updateStats(pipelineId, {
              totalTokensUsed: result.tokensUsed || 0,
              totalFilesGenerated: (result.filesCreated?.length || 0),
              totalLinesGenerated: result.linesGenerated || 0,
            });
            
            return { chunkId: chunk.id, success: true };
          } else {
            const pipelineConfig = (currentPipeline?.config || {}) as PipelineConfig;
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
            return { chunkId: chunk.id, success: false };
          }
        } catch (error) {
          await chunkService.updateChunkStatus(chunk.id, "failed", {
            filesCreated: [],
            filesModified: [],
            errors: [error instanceof Error ? error.message : "Unknown error"],
          });
          return { chunkId: chunk.id, success: false };
        }
      });

      const results = await Promise.all(executionPromises);
      await this.updateProgress(pipelineId);
      
      const progress = await this.getProgress(pipelineId);
      if (progress && onProgress) {
        onProgress(progress);
      }

      if (config.stopOnError && results.some(r => !r.success)) {
        await getDb().update(generationPipelines).set({
          status: "failed",
          completedAt: Date.now(),
          updatedAt: Date.now(),
        }).where(eq(generationPipelines.id, pipelineId));
        break;
      }
    }

    const allChunks = await chunkService.getPipelineChunks(pipelineId);
    const pendingChunks = allChunks.filter(c => c.status === "pending");
    const inProgressChunks = allChunks.filter(c => c.status === "in_progress");
    
    if (pendingChunks.length > 0 && inProgressChunks.length === 0) {
      logger.warn("Pipeline has pending chunks with unsatisfied dependencies (deadlock)", { pipelineId, pendingCount: pendingChunks.length });
      await getDb().update(generationPipelines).set({
        status: "failed",
        completedAt: Date.now(),
        updatedAt: Date.now(),
      }).where(eq(generationPipelines.id, pipelineId));
    }

    await this.updateProgress(pipelineId);
    const finalProgress = await this.getProgress(pipelineId);
    return finalProgress!;
  }
}

export const pipelineService = new PipelineService();
