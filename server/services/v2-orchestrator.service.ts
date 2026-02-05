import { logger } from "../lib/logger";
import { speculativeDecodingService } from "./speculative-decoding.service";
import { quantizationDetectorService } from "./quantization-detector.service";
import { kvCacheService } from "./kv-cache.service";
import { localEmbeddingService } from "./local-embedding.service";
import { hardwareOptimizerService } from "./hardware-optimizer.service";
import { modelRouterService } from "./model-router.service";
import { streamingBudgetService } from "./streaming-budget.service";
import { conversationCompressorService, type Message } from "./conversation-compressor.service";
import { performanceProfilerService } from "./performance-profiler.service";
import { patternLibraryService } from "./pattern-library.service";

export interface V2Config {
  speculativeDecoding: boolean;
  quantizationAware: boolean;
  kvCaching: boolean;
  localEmbeddings: boolean;
  hardwareOptimization: boolean;
  adaptiveRouting: boolean;
  streamingBudget: boolean;
  conversationCompression: boolean;
  performanceProfiling: boolean;
  patternLibrary: boolean;
}

export interface V2GenerationContext {
  prompt: string;
  messages?: Message[];
  projectId?: string;
  taskType: "plan" | "build" | "refine" | "review";
  modelName?: string;
  previousContext?: string;
  systemPrompt?: string;
}

export interface V2GenerationResult {
  optimizedContext: string;
  selectedModel: string;
  selectedEndpoint: string;
  cacheHit: boolean;
  compressionApplied: boolean;
  estimatedSpeedup: number;
  patterns: string[];
  metrics: {
    contextTokens: number;
    budgetAllocation: number;
    hardwareProfile: string;
    quantizationType?: string;
    routingTier?: string;
    recommendedMaxTokens?: number;
    gpuLayers?: number;
    batchSize?: number;
  };
  sessionId?: string;
  semanticContext?: string[];
}

class V2OrchestratorService {
  private static instance: V2OrchestratorService;
  private config: V2Config;
  private initialized = false;

  private constructor() {
    this.config = {
      speculativeDecoding: true,
      quantizationAware: true,
      kvCaching: true,
      localEmbeddings: true,
      hardwareOptimization: true,
      adaptiveRouting: true,
      streamingBudget: true,
      conversationCompression: true,
      performanceProfiling: true,
      patternLibrary: true,
    };
  }

  static getInstance(): V2OrchestratorService {
    if (!V2OrchestratorService.instance) {
      V2OrchestratorService.instance = new V2OrchestratorService();
    }
    return V2OrchestratorService.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info("Initializing V2 Orchestrator with all optimizations...");

    const profile = hardwareOptimizerService.getHardwareProfile();
    if (profile) {
      logger.info("Hardware detected", { 
        platform: profile.platform, 
        cpuCores: profile.cpuCores,
        gpuType: profile.gpuType
      });
    }

    logger.info("Local embeddings service ready", {
      enabled: localEmbeddingService.isEnabled()
    });

    this.initialized = true;
    logger.info("V2 Orchestrator initialized successfully");
  }

  configure(config: Partial<V2Config>): void {
    this.config = { ...this.config, ...config };
    logger.info("V2 Orchestrator configured", { config: this.config });
  }

  async prepareGeneration(context: V2GenerationContext): Promise<V2GenerationResult> {
    const requestId = this.config.performanceProfiling
      ? performanceProfilerService.startOperation(`gen_${context.taskType}`, "llm_generation", { 
          prompt: context.prompt.slice(0, 100),
          taskType: context.taskType 
        })
      : null;

    try {
      let optimizedContext = context.prompt;
      let selectedModel = context.modelName || "default";
      let selectedEndpoint = "http://localhost:1234/v1";
      let cacheHit = false;
      let compressionApplied = false;
      let estimatedSpeedup = 1.0;
      const patterns: string[] = [];
      let quantizationType: string | undefined;
      let budgetAllocation = 1.0;
      let sessionId: string | undefined;
      let routingTier: string | undefined;
      let recommendedMaxTokens = 4096;
      let gpuLayers = 0;
      let batchSize = 512;
      let contextMultiplier = 1.0;
      const semanticContext: string[] = [];

      if (this.config.conversationCompression && context.messages && context.messages.length > 0) {
        if (conversationCompressorService.shouldCompress(context.messages)) {
          const compressed = conversationCompressorService.compressConversation(context.messages);
          if (compressed.compressionResult.compressionRatio < 0.8) {
            compressionApplied = true;
            optimizedContext = this.incorporateCompressedContext(optimizedContext, compressed.summary);
            logger.info("Conversation compressed", {
              ratio: compressed.compressionResult.compressionRatio,
              originalTokens: compressed.compressionResult.originalTokens,
              compressedTokens: compressed.compressionResult.compressedTokens,
            });
          }
        }
      }

      if (this.config.kvCaching && kvCacheService.isEnabled() && context.messages && context.messages.length > 0) {
        const cacheHitResult = kvCacheService.findCacheHit(
          context.projectId || "default",
          context.systemPrompt || "",
          context.messages.map(m => ({ role: m.role, content: m.content })),
          selectedModel
        );
        if (cacheHitResult && cacheHitResult.hit) {
          cacheHit = true;
          estimatedSpeedup *= 1.5;
          logger.info("KV cache hit", { 
            reusableTokens: cacheHitResult.reusableTokens,
            prefixLength: cacheHitResult.prefixLength
          });
        }
      }

      if (this.config.adaptiveRouting && modelRouterService.isEnabled()) {
        const taskAnalysis = modelRouterService.analyzeTask(context.prompt);
        const routingDecision = modelRouterService.routeTask(context.prompt);
        routingTier = routingDecision.tier;
        selectedModel = routingDecision.selectedModel;
        selectedEndpoint = routingDecision.selectedEndpoint;
        logger.info("Model routed", { 
          tier: routingDecision.tier, 
          selectedModel: routingDecision.selectedModel,
          complexity: taskAnalysis.complexity,
          reason: routingDecision.reason
        });
      }

      if (this.config.quantizationAware && selectedModel) {
        const quantLevel = quantizationDetectorService.detectQuantizationLevel(selectedModel);
        if (quantLevel !== "unknown") {
          quantizationType = quantLevel;
          const profile = quantizationDetectorService.getQuantizationProfile(quantLevel);
          contextMultiplier = profile.recommendedContextMultiplier;
          recommendedMaxTokens = Math.floor(4096 * contextMultiplier);
          logger.info("Quantization applied", { 
            type: quantLevel,
            contextMultiplier,
            adjustedMaxTokens: recommendedMaxTokens
          });
        }
      }

      if (this.config.speculativeDecoding && speculativeDecodingService.isEnabled()) {
        const optimalPair = speculativeDecodingService.selectOptimalPair(selectedModel);
        if (optimalPair) {
          const config = speculativeDecodingService.getConfig();
          estimatedSpeedup *= 1 + (config.maxDraftTokens * 0.05);
          logger.info("Speculative decoding configured", { 
            draftModel: optimalPair.draft.model,
            verifyModel: optimalPair.primary.model,
            maxDraftTokens: config.maxDraftTokens
          });
        }
      }

      if (this.config.hardwareOptimization) {
        const hwProfile = hardwareOptimizerService.getHardwareProfile();
        if (hwProfile) {
          const optimConfig = hardwareOptimizerService.getOptimizationConfig(7);
          gpuLayers = optimConfig.gpuLayers;
          batchSize = optimConfig.batchSize;
          recommendedMaxTokens = Math.min(recommendedMaxTokens, optimConfig.contextLength);
          logger.info("Hardware optimization applied", { 
            gpuLayers,
            batchSize,
            threads: optimConfig.threads,
            contextLength: optimConfig.contextLength,
            platform: hwProfile.platform
          });
        }
      }

      if (this.config.localEmbeddings && localEmbeddingService.isEnabled()) {
        try {
          const embedding = await localEmbeddingService.getEmbedding(context.prompt);
          if (embedding.length > 0) {
            const matchedPatterns = patternLibraryService.findPatterns(context.prompt);
            for (const match of matchedPatterns) {
              semanticContext.push(match.pattern.code || match.pattern.name);
            }
            if (semanticContext.length > 0) {
              optimizedContext = this.incorporateSemanticContext(optimizedContext, semanticContext);
              logger.info("Semantic context enriched", { 
                contextCount: semanticContext.length 
              });
            }
          }
        } catch (err) {
          logger.warn("Local embedding lookup failed, continuing without", { error: String(err) });
        }
      }

      if (this.config.streamingBudget && streamingBudgetService.isEnabled()) {
        const mappedTaskType = this.mapTaskTypeToStreamingCategory(context.taskType);
        const session = streamingBudgetService.startSession(
          `session_${Date.now()}`,
          mappedTaskType
        );
        sessionId = session.id;
        budgetAllocation = Math.min(session.maxTokens, recommendedMaxTokens) / 4096;
        logger.info("Streaming session started", { 
          sessionId,
          maxTokens: session.maxTokens
        });
      }

      if (this.config.patternLibrary) {
        const matchedPatterns = patternLibraryService.findPatterns(context.prompt);
        for (const match of matchedPatterns) {
          patterns.push(match.pattern.name);
        }
        if (patterns.length > 0) {
          logger.info("Relevant patterns found", { patterns });
        }
      }

      const hwProfile = hardwareOptimizerService.getHardwareProfile();
      const result: V2GenerationResult = {
        optimizedContext,
        selectedModel,
        selectedEndpoint,
        cacheHit,
        compressionApplied,
        estimatedSpeedup,
        patterns,
        sessionId,
        semanticContext: semanticContext.length > 0 ? semanticContext : undefined,
        metrics: {
          contextTokens: this.estimateTokens(optimizedContext),
          budgetAllocation,
          hardwareProfile: hwProfile?.platform || "unknown",
          quantizationType,
          routingTier,
          recommendedMaxTokens,
          gpuLayers,
          batchSize,
        },
      };

      if (requestId && this.config.performanceProfiling) {
        performanceProfilerService.endOperation(requestId, true);
      }

      return result;

    } catch (error) {
      if (requestId && this.config.performanceProfiling) {
        performanceProfilerService.endOperation(requestId, false, String(error));
      }
      throw error;
    }
  }

  async getEmbedding(text: string): Promise<number[]> {
    if (!this.config.localEmbeddings || !localEmbeddingService.isEnabled()) {
      return [];
    }
    return localEmbeddingService.getEmbedding(text);
  }

  recordGenerationComplete(sessionId: string): void {
    if (this.config.streamingBudget && sessionId) {
      streamingBudgetService.endSession(sessionId);
    }
  }

  storeContext(
    projectId: string,
    systemPrompt: string,
    messages: Array<{ role: string; content: string }>,
    modelName: string,
    taskType: string
  ): void {
    if (this.config.kvCaching && kvCacheService.isEnabled()) {
      kvCacheService.storeContext(
        projectId,
        systemPrompt,
        messages,
        modelName,
        taskType
      );
    }
  }

  recordPatternUsage(patternId: string, success: boolean): void {
    if (this.config.patternLibrary) {
      patternLibraryService.recordUsage(patternId, success);
    }
  }

  getPerformanceStats() {
    if (!this.config.performanceProfiling) return null;
    return performanceProfilerService.getStats();
  }

  getSystemStatus(): Record<string, unknown> {
    const profile = hardwareOptimizerService.getHardwareProfile();
    return {
      initialized: this.initialized,
      config: this.config,
      hardwareProfile: profile,
      embeddingsEnabled: localEmbeddingService.isEnabled(),
      kvCachingEnabled: kvCacheService.isEnabled(),
      routingEnabled: modelRouterService.isEnabled(),
      speculativeDecodingEnabled: speculativeDecodingService.isEnabled(),
      streamingBudgetEnabled: streamingBudgetService.isEnabled(),
      activeSessions: streamingBudgetService.getActiveSessions(),
    };
  }

  private incorporateCompressedContext(prompt: string, summary: string): string {
    if (!summary) return prompt;
    return `[Previous Context Summary]\n${summary}\n\n[Current Request]\n${prompt}`;
  }

  private incorporateSemanticContext(prompt: string, semanticPatterns: string[]): string {
    if (semanticPatterns.length === 0) return prompt;
    const patternContext = semanticPatterns.slice(0, 3).join("\n\n");
    return `[Relevant Patterns]\n${patternContext}\n\n[Current Request]\n${prompt}`;
  }

  private mapTaskTypeToStreamingCategory(taskType: string): string {
    const mapping: Record<string, string> = {
      plan: "planning",
      build: "coding",
      refine: "coding",
      review: "review",
    };
    return mapping[taskType] || "coding";
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 3.5);
  }
}

export const v2OrchestratorService = V2OrchestratorService.getInstance();
