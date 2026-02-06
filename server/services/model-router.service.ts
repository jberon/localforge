import { logger } from "../lib/logger";
import { BaseService, ManagedMap } from "../lib/base-service";
import { localModelOptimizerService } from "./local-model-optimizer.service";

export interface ModelTier {
  id: string;
  name: string;
  model: string;
  endpoint: string;
  sizeGB: number;
  speedTier: "fast" | "balanced" | "powerful";
  capabilities: string[];
  maxContextLength: number;
  avgTokensPerSecond: number;
}

export interface RoutingDecision {
  selectedModel: string;
  selectedEndpoint: string;
  tier: "fast" | "balanced" | "powerful";
  reason: string;
  confidence: number;
  alternativeModels: string[];
}

export interface TaskAnalysis {
  complexity: "simple" | "moderate" | "complex";
  taskType: "format" | "complete" | "generate" | "refactor" | "debug" | "explain" | "plan";
  estimatedTokens: number;
  features: string[];
  contextRequired: "minimal" | "standard" | "extensive";
}

export interface RoutingConfig {
  enabled: boolean;
  fastModel: string;
  balancedModel: string;
  powerfulModel: string;
  fastEndpoint: string;
  balancedEndpoint: string;
  powerfulEndpoint: string;
  autoRouting: boolean;
  complexityThresholds: {
    simpleMaxTokens: number;
    moderateMaxTokens: number;
  };
}

class ModelRouterService extends BaseService {
  private static instance: ModelRouterService;
  private config: RoutingConfig;
  private modelTiers: ManagedMap<string, ModelTier>;
  private routingHistory: Array<{ task: string; tier: string; success: boolean; timestamp: number }> = [];
  private outcomeHistory: ManagedMap<string, { taskId: string; model: string; success: boolean; durationMs: number; timestamp: number }>;
  private outcomeTTL = 30 * 60 * 1000;
  private evictionInterval: ReturnType<typeof setInterval> | null = null;

  private static readonly CLOUD_MODELS: Record<"fast" | "balanced" | "powerful", string[]> = {
    fast: ["gpt-4o-mini", "gemini-2.0-flash"],
    balanced: ["gpt-4o", "claude-sonnet-4"],
    powerful: ["o3-mini", "claude-opus-4"],
  };

  private constructor() {
    super("ModelRouterService");
    this.config = {
      enabled: true,
      fastModel: "qwen2.5-coder-7b",
      balancedModel: "qwen2.5-coder-14b",
      powerfulModel: "qwen3-coder-30b",
      fastEndpoint: "http://localhost:1234/v1",
      balancedEndpoint: "http://localhost:1234/v1",
      powerfulEndpoint: "http://localhost:1234/v1",
      autoRouting: true,
      complexityThresholds: {
        simpleMaxTokens: 200,
        moderateMaxTokens: 1000,
      },
    };
    
    this.modelTiers = this.createManagedMap<string, ModelTier>({ maxSize: 200, strategy: "lru" });
    this.outcomeHistory = this.createManagedMap<string, { taskId: string; model: string; success: boolean; durationMs: number; timestamp: number }>({ maxSize: 500, strategy: "lru" });
    this.initializeModelTiers();
    this.evictionInterval = setInterval(() => this.evictExpiredOutcomes(), this.outcomeTTL);
  }

  static getInstance(): ModelRouterService {
    if (!ModelRouterService.instance) {
      ModelRouterService.instance = new ModelRouterService();
    }
    return ModelRouterService.instance;
  }

  private initializeModelTiers(): void {
    const tiers: ModelTier[] = [
      {
        id: "fast-qwen-7b",
        name: "Qwen 2.5 Coder 7B",
        model: "qwen2.5-coder-7b",
        endpoint: this.config.fastEndpoint,
        sizeGB: 4,
        speedTier: "fast",
        capabilities: ["format", "complete", "simple-generate"],
        maxContextLength: 32768,
        avgTokensPerSecond: 60,
      },
      {
        id: "balanced-qwen-14b",
        name: "Qwen 2.5 Coder 14B",
        model: "qwen2.5-coder-14b",
        endpoint: this.config.balancedEndpoint,
        sizeGB: 8,
        speedTier: "balanced",
        capabilities: ["format", "complete", "generate", "refactor", "debug"],
        maxContextLength: 32768,
        avgTokensPerSecond: 35,
      },
      {
        id: "powerful-qwen-30b",
        name: "Qwen 3 Coder 30B",
        model: "qwen3-coder-30b",
        endpoint: this.config.powerfulEndpoint,
        sizeGB: 18,
        speedTier: "powerful",
        capabilities: ["format", "complete", "generate", "refactor", "debug", "plan", "explain", "complex-architecture"],
        maxContextLength: 32768,
        avgTokensPerSecond: 20,
      },
      {
        id: "fast-llama-3b",
        name: "Llama 3.2 3B",
        model: "llama-3.2-3b",
        endpoint: this.config.fastEndpoint,
        sizeGB: 2,
        speedTier: "fast",
        capabilities: ["format", "complete", "simple-explain"],
        maxContextLength: 8192,
        avgTokensPerSecond: 80,
      },
      {
        id: "balanced-ministral-8b",
        name: "Ministral 8B",
        model: "ministral-8b",
        endpoint: this.config.balancedEndpoint,
        sizeGB: 5,
        speedTier: "balanced",
        capabilities: ["plan", "explain", "refactor", "debug"],
        maxContextLength: 32768,
        avgTokensPerSecond: 45,
      },
    ];

    for (const tier of tiers) {
      this.modelTiers.set(tier.id, tier);
    }
  }

  configure(config: Partial<RoutingConfig>): void {
    this.config = { ...this.config, ...config };
    this.log("ModelRouterService configured", { config: this.config });
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  analyzeTask(prompt: string, context?: string): TaskAnalysis {
    const fullText = `${prompt} ${context || ""}`.toLowerCase();
    const tokenEstimate = Math.ceil(fullText.length / 3.5);

    const features: string[] = [];
    let taskType: TaskAnalysis["taskType"] = "generate";
    let complexity: TaskAnalysis["complexity"] = "moderate";
    let contextRequired: TaskAnalysis["contextRequired"] = "standard";

    if (fullText.match(/format|indent|prettier|lint|style/)) {
      taskType = "format";
      features.push("formatting");
      complexity = "simple";
      contextRequired = "minimal";
    } else if (fullText.match(/complete|finish|continue|add to/)) {
      taskType = "complete";
      features.push("completion");
      complexity = "simple";
      contextRequired = "standard";
    } else if (fullText.match(/fix|bug|error|debug|issue|problem/)) {
      taskType = "debug";
      features.push("debugging");
      complexity = "moderate";
      contextRequired = "extensive";
    } else if (fullText.match(/refactor|improve|optimize|clean|simplify/)) {
      taskType = "refactor";
      features.push("refactoring");
      complexity = "moderate";
      contextRequired = "extensive";
    } else if (fullText.match(/explain|what|how|why|describe/)) {
      taskType = "explain";
      features.push("explanation");
      complexity = "moderate";
      contextRequired = "standard";
    } else if (fullText.match(/plan|design|architect|structure|strategy/)) {
      taskType = "plan";
      features.push("planning");
      complexity = "complex";
      contextRequired = "extensive";
    } else if (fullText.match(/build|create|generate|implement|make|develop/)) {
      taskType = "generate";
      features.push("generation");
    }

    if (fullText.match(/api|backend|database|server|endpoint/)) {
      features.push("backend");
      complexity = complexity === "simple" ? "moderate" : complexity;
    }
    if (fullText.match(/react|component|ui|frontend|interface|view/)) {
      features.push("frontend");
    }
    if (fullText.match(/test|testing|spec|coverage/)) {
      features.push("testing");
    }
    if (fullText.match(/type|typescript|interface|schema/)) {
      features.push("typing");
    }
    if (fullText.match(/auth|security|permission|role/)) {
      features.push("security");
      complexity = "complex";
    }
    if (fullText.match(/full[- ]?stack|entire|complete app|whole/)) {
      features.push("full-stack");
      complexity = "complex";
      contextRequired = "extensive";
    }

    if (tokenEstimate > this.config.complexityThresholds.moderateMaxTokens) {
      complexity = "complex";
    } else if (tokenEstimate <= this.config.complexityThresholds.simpleMaxTokens) {
      complexity = complexity === "complex" ? "moderate" : complexity;
    }

    return {
      complexity,
      taskType,
      estimatedTokens: tokenEstimate,
      features,
      contextRequired,
    };
  }

  routeTask(prompt: string, context?: string): RoutingDecision {
    if (!this.config.enabled || !this.config.autoRouting) {
      return this.getDefaultRouting();
    }

    const analysis = this.analyzeTask(prompt, context);
    return this.selectModelForTask(analysis);
  }

  private selectModelForTask(analysis: TaskAnalysis): RoutingDecision {
    let tier: "fast" | "balanced" | "powerful";
    let reason: string;
    let confidence: number;

    switch (analysis.complexity) {
      case "simple":
        tier = "fast";
        reason = `Simple ${analysis.taskType} task - using fast model for speed`;
        confidence = 0.9;
        break;
      case "moderate":
        tier = "balanced";
        reason = `Moderate ${analysis.taskType} task - using balanced model`;
        confidence = 0.85;
        break;
      case "complex":
        tier = "powerful";
        reason = `Complex ${analysis.taskType} task with ${analysis.features.join(", ")} - using powerful model`;
        confidence = 0.8;
        break;
      default:
        tier = "balanced";
        reason = "Default routing to balanced model";
        confidence = 0.7;
    }

    if (analysis.taskType === "plan" || analysis.features.includes("full-stack")) {
      tier = "powerful";
      reason = `${analysis.taskType} requires comprehensive understanding - using powerful model`;
      confidence = 0.95;
    }

    if (analysis.taskType === "format") {
      tier = "fast";
      reason = "Formatting task - using fast model";
      confidence = 0.95;
    }

    const selectedModel = this.getModelForTier(tier);
    const alternatives = this.getAlternativeModels(tier);

    return {
      selectedModel: selectedModel.model,
      selectedEndpoint: selectedModel.endpoint,
      tier,
      reason,
      confidence,
      alternativeModels: alternatives.map(m => m.model),
    };
  }

  private getModelForTier(tier: "fast" | "balanced" | "powerful"): ModelTier {
    switch (tier) {
      case "fast":
        return {
          id: "fast",
          name: "Fast Model",
          model: this.config.fastModel,
          endpoint: this.config.fastEndpoint,
          sizeGB: 4,
          speedTier: "fast",
          capabilities: [],
          maxContextLength: 32768,
          avgTokensPerSecond: 60,
        };
      case "balanced":
        return {
          id: "balanced",
          name: "Balanced Model",
          model: this.config.balancedModel,
          endpoint: this.config.balancedEndpoint,
          sizeGB: 8,
          speedTier: "balanced",
          capabilities: [],
          maxContextLength: 32768,
          avgTokensPerSecond: 35,
        };
      case "powerful":
        return {
          id: "powerful",
          name: "Powerful Model",
          model: this.config.powerfulModel,
          endpoint: this.config.powerfulEndpoint,
          sizeGB: 18,
          speedTier: "powerful",
          capabilities: [],
          maxContextLength: 32768,
          avgTokensPerSecond: 20,
        };
    }
  }

  private getAlternativeModels(tier: "fast" | "balanced" | "powerful"): ModelTier[] {
    const alternatives: ModelTier[] = [];
    
    for (const modelTier of this.modelTiers.values()) {
      if (modelTier.speedTier === tier) {
        alternatives.push(modelTier);
      }
    }
    
    return alternatives.slice(0, 2);
  }

  private getDefaultRouting(): RoutingDecision {
    return {
      selectedModel: this.config.balancedModel,
      selectedEndpoint: this.config.balancedEndpoint,
      tier: "balanced",
      reason: "Default routing (auto-routing disabled)",
      confidence: 1.0,
      alternativeModels: [this.config.fastModel, this.config.powerfulModel],
    };
  }

  recordRoutingResult(task: string, tier: string, success: boolean): void {
    this.routingHistory.push({
      task: task.slice(0, 100),
      tier,
      success,
      timestamp: Date.now(),
    });

    if (this.routingHistory.length > 1000) {
      this.routingHistory = this.routingHistory.slice(-500);
    }
  }

  getRoutingStats(): {
    totalRoutes: number;
    successRate: number;
    tierDistribution: Record<string, number>;
  } {
    const totalRoutes = this.routingHistory.length;
    const successCount = this.routingHistory.filter(r => r.success).length;
    const successRate = totalRoutes > 0 ? successCount / totalRoutes : 0;

    const tierDistribution: Record<string, number> = {
      fast: 0,
      balanced: 0,
      powerful: 0,
    };

    for (const route of this.routingHistory) {
      if (tierDistribution[route.tier] !== undefined) {
        tierDistribution[route.tier]++;
      }
    }

    return {
      totalRoutes,
      successRate,
      tierDistribution,
    };
  }

  registerModelTier(tier: ModelTier): void {
    this.modelTiers.set(tier.id, tier);
    this.log("Model tier registered", { id: tier.id, name: tier.name });
  }

  getAvailableTiers(): ModelTier[] {
    return this.modelTiers.values();
  }

  getConfig(): RoutingConfig {
    return { ...this.config };
  }

  routeWithCloudFallback(
    prompt: string,
    context?: string,
    cloudProviders?: string[]
  ): RoutingDecision {
    const analysis = this.analyzeTask(prompt, context);
    const localDecision = this.selectModelForTask(analysis);

    const availableProviders = cloudProviders || ["openai", "anthropic", "google"];
    const isLocalUnavailable = !this.config.enabled;
    const isTaskTooComplex = analysis.complexity === "complex" && analysis.features.length >= 3;

    if (!isLocalUnavailable && !isTaskTooComplex) {
      return localDecision;
    }

    const tier = localDecision.tier;
    const cloudModels = ModelRouterService.CLOUD_MODELS[tier];

    const filteredCloudModels = cloudModels.filter((model) => {
      if (availableProviders.includes("openai") && (model.startsWith("gpt-") || model.startsWith("o3"))) return true;
      if (availableProviders.includes("anthropic") && model.startsWith("claude")) return true;
      if (availableProviders.includes("google") && model.startsWith("gemini")) return true;
      return false;
    });

    if (filteredCloudModels.length === 0) {
      return localDecision;
    }

    const bestCloud = this.pickBestModelByOutcome(filteredCloudModels) || filteredCloudModels[0];

    return {
      selectedModel: bestCloud,
      selectedEndpoint: "cloud",
      tier,
      reason: isLocalUnavailable
        ? `Local models unavailable - falling back to cloud model ${bestCloud} (${tier} tier)`
        : `Task too complex for local models (${analysis.features.join(", ")}) - using cloud model ${bestCloud}`,
      confidence: localDecision.confidence * 0.9,
      alternativeModels: filteredCloudModels.filter((m) => m !== bestCloud),
    };
  }

  getRoutingExplanation(decision: RoutingDecision): string {
    const tierLabel = decision.tier === "fast" ? "Fast" : decision.tier === "balanced" ? "Balanced" : "Powerful";
    const parts: string[] = [
      `Selected model: ${decision.selectedModel} (${tierLabel} tier)`,
      `Reason: ${decision.reason}`,
      `Confidence: ${Math.round(decision.confidence * 100)}%`,
    ];

    if (decision.selectedEndpoint === "cloud") {
      parts.push("Source: Cloud provider");
    } else {
      parts.push(`Endpoint: ${decision.selectedEndpoint}`);
    }

    if (decision.alternativeModels.length > 0) {
      parts.push(`Alternatives: ${decision.alternativeModels.join(", ")}`);
    }

    return parts.join(". ") + ".";
  }

  recordOutcome(taskId: string, model: string, success: boolean, durationMs: number): void {
    if (this.outcomeHistory.size >= 500) {
      const firstKey = this.outcomeHistory.keys()[0];
      if (firstKey) {
        this.outcomeHistory.delete(firstKey);
      }
    }

    this.outcomeHistory.set(`${taskId}-${Date.now()}`, {
      taskId,
      model,
      success,
      durationMs,
      timestamp: Date.now(),
    });
  }

  private evictExpiredOutcomes(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    for (const [key, entry] of this.outcomeHistory.entries()) {
      if (now - entry.timestamp > this.outcomeTTL) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.outcomeHistory.delete(key);
    }
  }

  private pickBestModelByOutcome(candidates: string[]): string | null {
    if (this.outcomeHistory.size === 0) return null;

    const stats = new Map<string, { successes: number; total: number; avgDuration: number }>();

    for (const entry of this.outcomeHistory.values()) {
      if (!candidates.includes(entry.model)) continue;
      const existing = stats.get(entry.model) || { successes: 0, total: 0, avgDuration: 0 };
      existing.total++;
      if (entry.success) existing.successes++;
      existing.avgDuration = (existing.avgDuration * (existing.total - 1) + entry.durationMs) / existing.total;
      stats.set(entry.model, existing);
    }

    if (stats.size === 0) return null;

    let bestModel: string | null = null;
    let bestScore = -1;

    for (const [model, s] of Array.from(stats.entries())) {
      const successRate = s.total > 0 ? s.successes / s.total : 0;
      const speedBonus = s.avgDuration > 0 ? Math.min(1, 5000 / s.avgDuration) * 0.1 : 0;
      const score = successRate + speedBonus;
      if (score > bestScore) {
        bestScore = score;
        bestModel = model;
      }
    }

    return bestModel;
  }

  destroy(): void {
    if (this.evictionInterval) {
      clearInterval(this.evictionInterval);
      this.evictionInterval = null;
    }
    this.modelTiers.clear();
    this.outcomeHistory.clear();
    this.routingHistory = [];
    this.log("ModelRouterService destroyed");
  }
}

export const modelRouterService = ModelRouterService.getInstance();
