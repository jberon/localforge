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
import { parallelGenerationService } from "./parallel-generation.service";
import { liveSyntaxValidatorService } from "./live-syntax-validator.service";
import { codeStyleEnforcerService } from "./code-style-enforcer.service";
import { errorLearningService } from "./error-learning.service";
import { contextBudgetService } from "./context-budget.service";
import { closedLoopAutoFixService, type FixResult, type FixConfig, type FixStatistics } from "./closed-loop-autofix.service";

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
  parallelGeneration: boolean;
  liveSyntaxValidation: boolean;
  codeStyleEnforcement: boolean;
  errorLearning: boolean;
  m4OptimizedContext: boolean;
  closedLoopAutoFix: boolean;
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
      parallelGeneration: true,
      liveSyntaxValidation: true,
      codeStyleEnforcement: true,
      errorLearning: true,
      m4OptimizedContext: true,
      closedLoopAutoFix: true,
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

      let matchedPatterns: ReturnType<typeof patternLibraryService.findPatterns> = [];
      if (this.config.patternLibrary) {
        matchedPatterns = patternLibraryService.findPatterns(context.prompt);
        for (const match of matchedPatterns) {
          patterns.push(match.pattern.name);
        }
        if (patterns.length > 0) {
          logger.info("Relevant patterns found", { patterns });
        }
      }

      if (this.config.localEmbeddings && localEmbeddingService.isEnabled()) {
        try {
          const embedding = await localEmbeddingService.getEmbedding(context.prompt);
          if (embedding.length > 0) {
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

      if (this.config.closedLoopAutoFix) {
        const enhancement = closedLoopAutoFixService.enhancePreGeneration(
          optimizedContext,
          selectedModel,
          context.taskType,
          []
        );
        optimizedContext = enhancement.enhancedPrompt;
        logger.info("Closed-loop pre-generation enhancement applied", {
          preventionRules: enhancement.preventionRules.length,
          modelWarnings: enhancement.modelSpecificWarnings.length,
          injectedTokens: enhancement.totalInjectedTokens,
        });
      } else if (this.config.errorLearning) {
        const modelFamily = selectedModel.toLowerCase().includes("qwen") ? "qwen" :
                           selectedModel.toLowerCase().includes("ministral") ? "ministral" :
                           selectedModel.toLowerCase().includes("deepseek") ? "deepseek" :
                           selectedModel.toLowerCase().includes("llama") ? "llama" : undefined;
        const preventionPrompt = errorLearningService.getPreventionPrompt(modelFamily);
        if (preventionPrompt && preventionPrompt.length > 20) {
          optimizedContext = optimizedContext + "\n" + preventionPrompt;
          logger.info("Error prevention prompt injected", { 
            modelFamily,
            promptLength: preventionPrompt.length
          });
        }
      }

      if (this.config.m4OptimizedContext && selectedModel) {
        const taskProfile = this.mapTaskTypeToContextProfile(context.taskType);
        const m4Allocation = contextBudgetService.calculateM4OptimizedAllocation(selectedModel, taskProfile);
        const optimalTemp = contextBudgetService.getOptimalTemperature(selectedModel, taskProfile);
        const preset = contextBudgetService.getM4OptimizedPreset(selectedModel);
        
        if (preset) {
          recommendedMaxTokens = Math.min(m4Allocation.available, recommendedMaxTokens);
          gpuLayers = preset.gpuLayers;
          batchSize = preset.optimalBatchSize;
          
          logger.info("M4 optimization applied", {
            model: selectedModel,
            taskProfile,
            contextWindow: preset.contextWindow,
            temperature: optimalTemp,
            gpuLayers,
            batchSize,
          });
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

  // ============================================================================
  // V2.1 ENHANCED SERVICES - Better, Faster, Cleaner Code Generation
  // ============================================================================

  prepareParallelGeneration(
    files: Array<{ path: string; description: string }>
  ): {
    batches: Array<{ batchId: number; files: Array<{ filePath: string; description: string }>; canParallelize: boolean }>;
    estimatedSpeedup: number;
    totalFiles: number;
  } {
    if (!this.config.parallelGeneration) {
      return {
        batches: [{ batchId: 0, files: files.map(f => ({ filePath: f.path, description: f.description })), canParallelize: false }],
        estimatedSpeedup: 1,
        totalFiles: files.length,
      };
    }

    const tasks = parallelGenerationService.prepareFileTasks(files);
    const batches = parallelGenerationService.createBatches(tasks);
    const estimatedSpeedup = parallelGenerationService.estimateSpeedup(batches);

    logger.info("Parallel generation prepared", {
      totalFiles: files.length,
      batches: batches.length,
      estimatedSpeedup,
    });

    return {
      batches: batches.map(b => ({
        batchId: b.batchId,
        files: b.files.map(f => ({ filePath: f.filePath, description: f.description })),
        canParallelize: b.canParallelize,
      })),
      estimatedSpeedup,
      totalFiles: files.length,
    };
  }

  validateCodeStreaming(
    code: string,
    previousCode: string = ""
  ): {
    isValid: boolean;
    errors: Array<{ line: number; message: string; severity: string }>;
    warnings: Array<{ line: number; message: string }>;
    completionHints: string[];
  } {
    if (!this.config.liveSyntaxValidation) {
      return { isValid: true, errors: [], warnings: [], completionHints: [] };
    }

    const fullCode = previousCode + code;
    const result = liveSyntaxValidatorService.validateStreaming(fullCode);
    const hints = liveSyntaxValidatorService.getCompletionHints(fullCode);

    return {
      isValid: result.isValid,
      errors: result.errors.map(e => ({
        line: e.line,
        message: e.message,
        severity: e.severity,
      })),
      warnings: result.warnings.map(w => ({
        line: w.line,
        message: w.message,
      })),
      completionHints: hints,
    };
  }

  formatGeneratedCode(
    code: string,
    filePath?: string
  ): {
    formatted: string;
    changed: boolean;
    issues: string[];
  } {
    if (!this.config.codeStyleEnforcement) {
      return { formatted: code, changed: false, issues: [] };
    }

    const result = codeStyleEnforcerService.formatCode(code);

    if (result.changed) {
      logger.debug("Code formatted", { filePath, changed: true });
    }

    return result;
  }

  formatMultipleFiles(
    files: Array<{ path: string; content: string }>
  ): Array<{ path: string; formatted: string; changed: boolean }> {
    if (!this.config.codeStyleEnforcement) {
      return files.map(f => ({ path: f.path, formatted: f.content, changed: false }));
    }

    const results = codeStyleEnforcerService.formatMultipleFiles(files);

    const changedCount = results.filter(r => r.result.changed).length;
    if (changedCount > 0) {
      logger.info("Multiple files formatted", { total: files.length, changed: changedCount });
    }

    return results.map(r => ({
      path: r.path,
      formatted: r.result.formatted,
      changed: r.result.changed,
    }));
  }

  recordError(
    errorMessage: string,
    code: string,
    modelUsed?: string,
    filePath?: string
  ): void {
    if (!this.config.errorLearning) return;

    errorLearningService.recordError({
      errorMessage,
      code,
      filePath,
      wasFixed: false,
      modelUsed,
    });
  }

  recordErrorFixed(
    errorMessage: string,
    code: string,
    fixApplied: string,
    modelUsed?: string
  ): void {
    if (!this.config.errorLearning) return;

    errorLearningService.recordError({
      errorMessage,
      code,
      wasFixed: true,
      fixApplied,
      modelUsed,
    });
  }

  getErrorPreventionPrompt(modelFamily?: string): string {
    if (!this.config.errorLearning) return "";
    return errorLearningService.getPreventionPrompt(modelFamily);
  }

  getAutoFixSuggestion(errorMessage: string): string | null {
    if (!this.config.errorLearning) return null;
    return errorLearningService.getAutoFix(errorMessage);
  }

  getM4OptimizedAllocation(
    modelName: string,
    taskType: "plan" | "build" | "refine" | "review"
  ): {
    allocation: {
      systemPrompt: number;
      userMessage: number;
      codeContext: number;
      chatHistory: number;
      projectMemory: number;
      fewShotExamples: number;
      outputReserve: number;
      total: number;
      available: number;
    };
    optimalTemperature: number;
    preset: {
      contextWindow: number;
      optimalBatchSize: number;
      gpuLayers: number;
      notes: string;
    } | null;
  } {
    const taskProfile = this.mapTaskTypeToContextProfile(taskType);
    
    if (!this.config.m4OptimizedContext) {
      const baseAllocation = contextBudgetService.calculateLocalModelAllocation(modelName, taskProfile);
      return {
        allocation: baseAllocation,
        optimalTemperature: 0.2,
        preset: null,
      };
    }

    const allocation = contextBudgetService.calculateM4OptimizedAllocation(modelName, taskProfile);
    const optimalTemperature = contextBudgetService.getOptimalTemperature(modelName, taskProfile);
    const preset = contextBudgetService.getM4OptimizedPreset(modelName);

    logger.debug("M4 optimized allocation calculated", {
      modelName,
      taskType,
      contextWindow: preset?.contextWindow,
      temperature: optimalTemperature,
    });

    return {
      allocation,
      optimalTemperature,
      preset,
    };
  }

  private mapTaskTypeToContextProfile(taskType: "plan" | "build" | "refine" | "review"): "planning" | "coding" | "debugging" | "refactoring" | "review" | "documentation" {
    const mapping: Record<string, "planning" | "coding" | "debugging" | "refactoring" | "review" | "documentation"> = {
      plan: "planning",
      build: "coding",
      refine: "refactoring",
      review: "review",
    };
    return mapping[taskType] || "coding";
  }

  getErrorLearningStats(): {
    totalPatterns: number;
    learnedPatterns: number;
    totalErrors: number;
    topCategories: Array<{ category: string; count: number }>;
  } | null {
    if (!this.config.errorLearning) return null;
    return errorLearningService.getStats();
  }

  postGenerationValidateAndFix(
    code: string,
    filePath?: string,
    modelUsed?: string,
    fixConfig?: Partial<FixConfig>
  ): FixResult {
    if (!this.config.closedLoopAutoFix) {
      return {
        originalCode: code,
        finalCode: code,
        wasFixed: false,
        totalAttempts: 0,
        attempts: [],
        errorsFound: 0,
        errorsFixed: 0,
        warningsFound: 0,
        modelUsed,
        filePath,
        durationMs: 0,
      };
    }

    const result = closedLoopAutoFixService.validateAndFix(code, filePath, modelUsed, fixConfig);

    if (this.config.performanceProfiling) {
      const opId = performanceProfilerService.startOperation("autofix_postgen", "validation", {
        filePath,
        errorsFound: result.errorsFound,
        errorsFixed: result.errorsFixed,
      });
      performanceProfilerService.endOperation(opId, result.errorsFixed === result.errorsFound);
    }

    return result;
  }

  postGenerationValidateAndFixMultiple(
    files: Array<{ path: string; content: string }>,
    modelUsed?: string,
    fixConfig?: Partial<FixConfig>
  ): Array<{ path: string; result: FixResult }> {
    return files.map(file => ({
      path: file.path,
      result: this.postGenerationValidateAndFix(file.content, file.path, modelUsed, fixConfig),
    }));
  }

  getClosedLoopFixHistory(limit?: number): ReturnType<typeof closedLoopAutoFixService.getFixHistory> {
    return closedLoopAutoFixService.getFixHistory(limit);
  }

  getClosedLoopStatistics(): FixStatistics {
    return closedLoopAutoFixService.getStatistics();
  }

  configureClosedLoop(config: Partial<FixConfig>): void {
    closedLoopAutoFixService.configure(config);
  }

  getEnhancedSystemStatus(): Record<string, unknown> {
    const baseStatus = this.getSystemStatus();
    
    return {
      ...baseStatus,
      parallelGenerationEnabled: this.config.parallelGeneration,
      liveSyntaxValidationEnabled: this.config.liveSyntaxValidation,
      codeStyleEnforcementEnabled: this.config.codeStyleEnforcement,
      errorLearningEnabled: this.config.errorLearning,
      m4OptimizedContextEnabled: this.config.m4OptimizedContext,
      closedLoopAutoFixEnabled: this.config.closedLoopAutoFix,
      errorLearningStats: this.config.errorLearning ? errorLearningService.getStats() : null,
      closedLoopStats: this.config.closedLoopAutoFix ? closedLoopAutoFixService.getStatistics() : null,
    };
  }
}

export const v2OrchestratorService = V2OrchestratorService.getInstance();
