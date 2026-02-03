import logger from "../lib/logger";
import { LLMCacheService } from "./llm-cache.service";
import { resilienceService } from "./resilience.service";

// M4 Pro optimized defaults (14-core CPU, 20-core GPU, 48GB unified memory)
const M4_PRO_DEFAULTS = {
  maxConcurrentRequests: 2, // Limit to avoid GPU memory contention
  maxContextLength: 65536, // 64K context for very large applications
  gpuLayers: -1, // All layers on GPU (Metal acceleration)
  batchSize: 1024, // Optimized for M4 Pro GPU
  threads: 10, // Leave 4 cores for system on 14-core CPU
  memoryBudgetMB: 40960, // 40GB for models (leave 8GB for system)
  modelWeightsBudgetMB: 32768, // 32GB for model weights
  contextBufferMB: 8192, // 8GB for context buffer
};

export interface ModelCapabilities {
  id: string;
  name: string;
  role: "planner" | "builder" | "general";
  maxContextLength: number;
  optimalTemperature: number;
  strengths: string[];
  estimatedVRAM_MB: number;
  tokensPerSecond: number; // Estimated throughput on M4 Pro
}

export interface ModelRoutingPolicy {
  taskType: "plan" | "build" | "refine" | "fix" | "question";
  preferredRole: "planner" | "builder" | "general";
  temperatureOverride?: number;
  maxTokensOverride?: number;
}

export interface ResourceStatus {
  gpuMemoryUsedMB: number;
  gpuMemoryTotalMB: number;
  activeRequests: number;
  queuedRequests: number;
  estimatedWaitMs: number;
}

export interface LLMExecutionResult {
  response: string;
  tokensUsed: number;
}

export class ModelProviderService {
  private static instance: ModelProviderService;
  
  private modelRegistry: Map<string, ModelCapabilities> = new Map();
  private routingPolicies: ModelRoutingPolicy[] = [];
  private cacheService: LLMCacheService;
  
  // Resource tracking for M4 Pro
  private resourceStatus: ResourceStatus = {
    gpuMemoryUsedMB: 0,
    gpuMemoryTotalMB: M4_PRO_DEFAULTS.memoryBudgetMB,
    activeRequests: 0,
    queuedRequests: 0,
    estimatedWaitMs: 0,
  };
  
  // Hot-swapping state
  private hotSwapEnabled = true;
  private hotSwapThreshold = 0.8; // 80% memory usage triggers hot-swap
  private hotSwapHistory: Array<{ from: string; to: string; reason: string; timestamp: number }> = [];
  
  // Concurrency tracking
  private readonly maxConcurrentRequests = M4_PRO_DEFAULTS.maxConcurrentRequests;

  private constructor() {
    this.cacheService = new LLMCacheService();
    this.initializeDefaultModels();
    this.initializeDefaultPolicies();
  }

  static getInstance(): ModelProviderService {
    if (!ModelProviderService.instance) {
      ModelProviderService.instance = new ModelProviderService();
    }
    return ModelProviderService.instance;
  }

  private initializeDefaultModels(): void {
    // Recommended planner model for M4 Pro
    this.registerModel({
      id: "ministral-3-14b",
      name: "Ministral 3 14B Reasoning",
      role: "planner",
      maxContextLength: 32768,
      optimalTemperature: 0.2,
      strengths: ["multi-step reasoning", "task decomposition", "architecture design", "low hallucination"],
      estimatedVRAM_MB: 14000,
      tokensPerSecond: 45,
    });

    // Recommended builder model for M4 Pro
    this.registerModel({
      id: "qwen3-coder-30b",
      name: "Qwen3 Coder 30B",
      role: "builder",
      maxContextLength: 65536,
      optimalTemperature: 0.5,
      strengths: ["code generation", "multi-file projects", "API integration", "production-ready output"],
      estimatedVRAM_MB: 30000,
      tokensPerSecond: 25,
    });

    // Lighter alternative builder
    this.registerModel({
      id: "qwen2.5-coder-14b",
      name: "Qwen2.5 Coder 14B",
      role: "builder",
      maxContextLength: 32768,
      optimalTemperature: 0.5,
      strengths: ["code generation", "faster inference", "lower memory"],
      estimatedVRAM_MB: 14000,
      tokensPerSecond: 55,
    });

    // General purpose fallback
    this.registerModel({
      id: "llama-3.2-8b",
      name: "Llama 3.2 8B",
      role: "general",
      maxContextLength: 8192,
      optimalTemperature: 0.7,
      strengths: ["general tasks", "fast inference", "low memory"],
      estimatedVRAM_MB: 8000,
      tokensPerSecond: 80,
    });
  }

  private initializeDefaultPolicies(): void {
    this.routingPolicies = [
      { taskType: "plan", preferredRole: "planner", temperatureOverride: 0.2 },
      { taskType: "build", preferredRole: "builder", temperatureOverride: 0.5 },
      { taskType: "refine", preferredRole: "builder", temperatureOverride: 0.4 },
      { taskType: "fix", preferredRole: "builder", temperatureOverride: 0.3 },
      { taskType: "question", preferredRole: "general", temperatureOverride: 0.7 },
    ];
  }

  registerModel(capabilities: ModelCapabilities): void {
    this.modelRegistry.set(capabilities.id, capabilities);
    logger.info("Model registered", { modelId: capabilities.id, role: capabilities.role });
  }

  getModel(modelId: string): ModelCapabilities | undefined {
    return this.modelRegistry.get(modelId);
  }

  getModelsForRole(role: "planner" | "builder" | "general"): ModelCapabilities[] {
    return Array.from(this.modelRegistry.values()).filter(m => m.role === role);
  }

  selectModel(taskType: string, preferredModelId?: string): ModelCapabilities | null {
    // If specific model requested, use it
    if (preferredModelId) {
      const model = this.modelRegistry.get(preferredModelId);
      if (model) return model;
    }

    // Find policy for task type
    const policy = this.routingPolicies.find(p => p.taskType === taskType);
    if (!policy) {
      // Default to general role
      const generalModels = this.getModelsForRole("general");
      return generalModels[0] || null;
    }

    // Get models for preferred role
    const candidates = this.getModelsForRole(policy.preferredRole);
    if (candidates.length === 0) {
      // Fallback to any available model
      const allModels = Array.from(this.modelRegistry.values());
      return allModels[0] || null;
    }

    // Select best candidate based on current resource availability
    return this.selectOptimalModel(candidates);
  }

  private selectOptimalModel(candidates: ModelCapabilities[]): ModelCapabilities {
    const availableMemory = this.resourceStatus.gpuMemoryTotalMB - this.resourceStatus.gpuMemoryUsedMB;
    const memoryUsageRatio = this.resourceStatus.gpuMemoryUsedMB / this.resourceStatus.gpuMemoryTotalMB;
    
    // Hot-swap: if memory pressure is high, prefer smaller/faster models
    if (this.hotSwapEnabled && memoryUsageRatio >= this.hotSwapThreshold) {
      const preferredModel = this.selectForHotSwap(candidates, availableMemory);
      if (preferredModel) {
        logger.info("Hot-swap activated: selecting lighter model", {
          selectedModel: preferredModel.id,
          memoryUsage: `${(memoryUsageRatio * 100).toFixed(1)}%`,
        });
        return preferredModel;
      }
    }
    
    const viableCandidates = candidates.filter(m => m.estimatedVRAM_MB <= availableMemory);
    
    if (viableCandidates.length === 0) {
      // No model fits in available memory, pick smallest
      const smallest = candidates.reduce((a, b) => a.estimatedVRAM_MB < b.estimatedVRAM_MB ? a : b);
      this.recordHotSwap(candidates[0]?.id || "unknown", smallest.id, "memory_constraint");
      return smallest;
    }

    // Pick the one with best throughput among viable options
    return viableCandidates.reduce((a, b) => a.tokensPerSecond > b.tokensPerSecond ? a : b);
  }

  private selectForHotSwap(candidates: ModelCapabilities[], availableMemory: number): ModelCapabilities | null {
    // Sort by VRAM (ascending) then by throughput (descending)
    const sorted = [...candidates].sort((a, b) => {
      // First priority: fits in available memory
      const aFits = a.estimatedVRAM_MB <= availableMemory;
      const bFits = b.estimatedVRAM_MB <= availableMemory;
      if (aFits !== bFits) return aFits ? -1 : 1;
      
      // Second priority: lower memory usage
      if (a.estimatedVRAM_MB !== b.estimatedVRAM_MB) {
        return a.estimatedVRAM_MB - b.estimatedVRAM_MB;
      }
      
      // Third priority: higher throughput
      return b.tokensPerSecond - a.tokensPerSecond;
    });
    
    return sorted[0] || null;
  }

  private recordHotSwap(from: string, to: string, reason: string): void {
    this.hotSwapHistory.push({
      from,
      to,
      reason,
      timestamp: Date.now(),
    });
    
    // Keep only last 100 entries
    if (this.hotSwapHistory.length > 100) {
      this.hotSwapHistory = this.hotSwapHistory.slice(-100);
    }
    
    logger.info("Model hot-swap recorded", { from, to, reason });
  }

  setHotSwapEnabled(enabled: boolean): void {
    this.hotSwapEnabled = enabled;
    logger.info("Hot-swap setting changed", { enabled });
  }

  setHotSwapThreshold(threshold: number): void {
    if (threshold >= 0 && threshold <= 1) {
      this.hotSwapThreshold = threshold;
      logger.info("Hot-swap threshold changed", { threshold });
    }
  }

  getHotSwapHistory(): Array<{ from: string; to: string; reason: string; timestamp: number }> {
    return [...this.hotSwapHistory];
  }

  isHotSwapEnabled(): boolean {
    return this.hotSwapEnabled;
  }

  getHotSwapThreshold(): number {
    return this.hotSwapThreshold;
  }

  getMemoryPressure(): { usage: number; threshold: number; isHighPressure: boolean } {
    const usage = this.resourceStatus.gpuMemoryUsedMB / this.resourceStatus.gpuMemoryTotalMB;
    return {
      usage,
      threshold: this.hotSwapThreshold,
      isHighPressure: usage >= this.hotSwapThreshold,
    };
  }

  getOptimalTemperature(taskType: string): number {
    const policy = this.routingPolicies.find(p => p.taskType === taskType);
    return policy?.temperatureOverride ?? 0.7;
  }

  /**
   * Execute an LLM request with caching, resilience, and resource tracking
   * @param taskType - Type of task (plan/build/refine/fix/question)
   * @param prompt - The user prompt
   * @param executor - Function that actually calls the LLM
   * @param options - Additional options
   */
  async executeWithResilience<T extends LLMExecutionResult>(
    taskType: string,
    prompt: string,
    executor: () => Promise<T>,
    options?: {
      systemPrompt?: string;
      temperature?: number;
      skipCache?: boolean;
      circuitKey?: string;
    }
  ): Promise<T> {
    const circuitKey = options?.circuitKey || `llm-${taskType}`;
    const temperature = options?.temperature ?? this.getOptimalTemperature(taskType);

    // Check cache first (unless skipped)
    if (!options?.skipCache) {
      const cachedResponse = this.cacheService.get(prompt, options?.systemPrompt, temperature);
      if (cachedResponse) {
        logger.debug("Request served from cache", { taskType });
        return { response: cachedResponse, tokensUsed: 0 } as T;
      }
    }

    // Track resource usage
    const model = this.selectModel(taskType);
    if (model) {
      this.resourceStatus.gpuMemoryUsedMB += model.estimatedVRAM_MB;
    }
    this.resourceStatus.activeRequests++;

    try {
      // Execute with resilience (retry, circuit breaker, bulkhead)
      const result = await resilienceService.withRetry(
        () => resilienceService.withBulkhead(
          () => resilienceService.withTimeout(executor, 120000, `LLM ${taskType} request timed out`),
          {
            key: `llm-bulkhead`,
            maxConcurrent: this.maxConcurrentRequests,
            maxQueue: 10,
            timeoutMs: 300000, // 5 minute queue timeout
          }
        ),
        {
          key: circuitKey,
          retryConfig: {
            maxRetries: 2,
            baseDelayMs: 2000,
            maxDelayMs: 30000,
            jitterFactor: 0.3,
          },
          circuitConfig: {
            failureThreshold: 3,
            recoveryTimeout: 30000,
            successThreshold: 2,
          },
          onRetry: (attempt, error, delay) => {
            logger.warn("LLM request retry", { taskType, attempt, delay, error: error.message });
          },
        }
      );

      // Cache successful response
      if (!options?.skipCache && result.response) {
        this.cacheService.set(
          prompt,
          result.response,
          result.tokensUsed,
          options?.systemPrompt,
          temperature
        );
      }

      return result;

    } finally {
      // Release resources
      if (model) {
        this.resourceStatus.gpuMemoryUsedMB -= model.estimatedVRAM_MB;
      }
      this.resourceStatus.activeRequests--;
      this.updateEstimatedWait();
    }
  }

  /**
   * Check if a cached response exists for the given request
   */
  getCachedResponse(prompt: string, systemPrompt?: string, temperature?: number): string | null {
    return this.cacheService.get(prompt, systemPrompt, temperature);
  }

  /**
   * Manually cache a response (useful for streaming completions)
   */
  cacheResponse(prompt: string, response: string, tokensUsed: number, systemPrompt?: string, temperature?: number): void {
    this.cacheService.set(prompt, response, tokensUsed, systemPrompt, temperature);
  }

  /**
   * Check if circuit breaker allows requests
   */
  canExecute(taskType: string): boolean {
    const circuitKey = `llm-${taskType}`;
    return resilienceService.canExecute(circuitKey);
  }

  /**
   * Get circuit breaker state for a task type
   */
  getCircuitState(taskType: string): string {
    const circuitKey = `llm-${taskType}`;
    return resilienceService.getCircuitState(circuitKey);
  }

  private updateEstimatedWait(): void {
    const avgProcessingTime = 30000; // 30 seconds average per request
    this.resourceStatus.estimatedWaitMs = 
      this.resourceStatus.queuedRequests * avgProcessingTime / this.maxConcurrentRequests;
  }

  incrementQueueCount(): void {
    this.resourceStatus.queuedRequests++;
    this.updateEstimatedWait();
  }

  decrementQueueCount(): void {
    this.resourceStatus.queuedRequests = Math.max(0, this.resourceStatus.queuedRequests - 1);
    this.updateEstimatedWait();
  }

  getResourceStatus(): ResourceStatus {
    return { ...this.resourceStatus };
  }

  getCacheStats() {
    return this.cacheService.getStats();
  }

  clearCache(): void {
    this.cacheService.clearCache();
  }

  getM4ProRecommendations(): Record<string, any> {
    return {
      hardware: {
        cpu: "Apple M4 Pro (14-core)",
        gpu: "20-core GPU with Metal acceleration",
        memory: "48GB unified memory",
      },
      lmStudioSettings: {
        gpuLayers: M4_PRO_DEFAULTS.gpuLayers,
        contextLength: M4_PRO_DEFAULTS.maxContextLength,
        batchSize: M4_PRO_DEFAULTS.batchSize,
        threads: M4_PRO_DEFAULTS.threads,
        flashAttention: true,
        mmap: true,
      },
      recommendedModels: {
        planner: {
          model: "Ministral 3 14B Reasoning",
          temperature: 0.2,
          role: "System architect, strategist, planner",
        },
        builder: {
          model: "Qwen3 Coder 30B",
          temperature: 0.5,
          role: "Code generator, implementer",
        },
      },
      memoryAllocation: {
        modelWeights: "32GB",
        contextBuffer: "12GB",
        systemReserve: "4GB",
      },
      performanceTips: [
        "Enable Flash Attention for faster attention computation",
        "Use memory mapping (mmap) for efficient model loading",
        "Set threads to 10 to leave headroom for system tasks",
        "Batch size of 1024 optimized for M4 Pro GPU",
      ],
    };
  }
}

export const modelProviderService = ModelProviderService.getInstance();
