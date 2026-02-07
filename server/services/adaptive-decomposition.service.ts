import { BaseService, ManagedMap } from "../lib/base-service";

interface DecompositionStrategy {
  id: string;
  stepCount: number;
  stepGranularity: 'coarse' | 'medium' | 'fine';
  mergeThreshold: number;
  splitThreshold: number;
  parallelizable: boolean;
}

interface StrategyOutcome {
  id: string;
  strategyId: string;
  model: string;
  taskType: string;
  promptComplexity: number;
  stepCount: number;
  qualityScore: number;
  completionRate: number;
  totalDurationMs: number;
  tokensUsed: number;
  errorsEncountered: number;
  timestamp: number;
}

interface ModelStrategyProfile {
  model: string;
  taskType: string;
  preferredStepCount: number;
  preferredGranularity: 'coarse' | 'medium' | 'fine';
  optimalMergeThreshold: number;
  optimalSplitThreshold: number;
  confidenceLevel: number;
  sampleCount: number;
  avgQualityScore: number;
  lastUpdated: number;
}

class AdaptiveDecompositionService extends BaseService {
  private static instance: AdaptiveDecompositionService;

  private outcomes: ManagedMap<string, StrategyOutcome>;
  private profiles: ManagedMap<string, ModelStrategyProfile>;
  private outcomeCounter: number = 0;

  private constructor() {
    super("AdaptiveDecompositionService");
    this.outcomes = this.createManagedMap<string, StrategyOutcome>({ maxSize: 5000, strategy: "lru" });
    this.profiles = this.createManagedMap<string, ModelStrategyProfile>({ maxSize: 500, strategy: "lru" });
    this.log("Adaptive decomposition service ready");
  }

  static getInstance(): AdaptiveDecompositionService {
    if (!AdaptiveDecompositionService.instance) {
      AdaptiveDecompositionService.instance = new AdaptiveDecompositionService();
    }
    return AdaptiveDecompositionService.instance;
  }

  getOptimalStrategy(model: string, taskType: string, promptComplexity: number): DecompositionStrategy {
    const profileKey = `${model}::${taskType}`;
    const profile = this.profiles.get(profileKey);

    if (profile && profile.confidenceLevel > 0.3) {
      this.log("Using learned strategy profile", { model, taskType, confidence: profile.confidenceLevel });

      let stepCount = profile.preferredStepCount;
      let splitThreshold = profile.optimalSplitThreshold;

      if (this.isSmallModel(model)) {
        splitThreshold = Math.round(splitThreshold * 0.7);
        stepCount += 1;
      }

      return {
        id: `strategy-${model}-${taskType}-learned`,
        stepCount,
        stepGranularity: profile.preferredGranularity,
        mergeThreshold: profile.optimalMergeThreshold,
        splitThreshold,
        parallelizable: stepCount > 2,
      };
    }

    let stepCount: number;
    let granularity: 'coarse' | 'medium' | 'fine';
    let mergeThreshold: number;
    let splitThreshold: number;

    if (promptComplexity < 5) {
      stepCount = 1;
      granularity = 'coarse';
      mergeThreshold = 2000;
      splitThreshold = 8000;
    } else if (promptComplexity <= 12) {
      stepCount = 3;
      granularity = 'medium';
      mergeThreshold = 1500;
      splitThreshold = 6000;
    } else {
      stepCount = 5;
      granularity = 'fine';
      mergeThreshold = 1000;
      splitThreshold = 4000;
    }

    if (this.isSmallModel(model)) {
      splitThreshold = Math.round(splitThreshold * 0.7);
      stepCount += 1;
    }

    this.log("Using default strategy", { model, taskType, promptComplexity, stepCount, granularity });

    return {
      id: `strategy-${model}-${taskType}-default`,
      stepCount,
      stepGranularity: granularity,
      mergeThreshold,
      splitThreshold,
      parallelizable: stepCount > 2,
    };
  }

  recordOutcome(outcome: Omit<StrategyOutcome, 'id' | 'timestamp'>): void {
    this.outcomeCounter++;
    const id = `outcome-${this.outcomeCounter}-${Date.now()}`;
    const fullOutcome: StrategyOutcome = {
      ...outcome,
      id,
      timestamp: Date.now(),
    };

    this.outcomes.set(id, fullOutcome);

    this.log("Outcome recorded", {
      id,
      model: outcome.model,
      taskType: outcome.taskType,
      qualityScore: outcome.qualityScore,
      completionRate: outcome.completionRate,
    });

    this.recalculateProfile(outcome.model, outcome.taskType);
  }

  private recalculateProfile(model: string, taskType: string): void {
    const relevantOutcomes: StrategyOutcome[] = [];
    const now = Date.now();

    this.outcomes.forEach((outcome) => {
      if (outcome.model === model && outcome.taskType === taskType) {
        relevantOutcomes.push(outcome);
      }
    });

    if (relevantOutcomes.length === 0) {
      return;
    }

    const DAY_MS = 86400000;
    const DECAY_RATE = 0.15;

    let totalWeight = 0;
    let weightedQualitySum = 0;
    let weightedStepCountSum = 0;
    let weightedMergeThresholdSum = 0;
    let weightedSplitThresholdSum = 0;

    const granularityCounts: Record<'coarse' | 'medium' | 'fine', number> = {
      coarse: 0,
      medium: 0,
      fine: 0,
    };

    for (const outcome of relevantOutcomes) {
      const ageDays = (now - outcome.timestamp) / DAY_MS;
      const weight = Math.exp(-ageDays * DECAY_RATE);

      totalWeight += weight;
      weightedQualitySum += outcome.qualityScore * weight;
      weightedStepCountSum += outcome.stepCount * weight;

      const isSuccessful = outcome.qualityScore >= 50 && outcome.completionRate >= 0.5;
      if (isSuccessful) {
        weightedMergeThresholdSum += outcome.tokensUsed * 0.25 * weight;
        weightedSplitThresholdSum += outcome.tokensUsed * 0.75 * weight;
      }

      const granularity = this.inferGranularity(outcome.stepCount, outcome.promptComplexity);
      granularityCounts[granularity] += weight;
    }

    if (totalWeight === 0) {
      return;
    }

    const avgQuality = weightedQualitySum / totalWeight;
    const avgStepCount = Math.round(weightedStepCountSum / totalWeight);

    let bestGranularity: 'coarse' | 'medium' | 'fine' = 'medium';
    let bestGranularityWeight = 0;
    for (const g of ['coarse', 'medium', 'fine'] as const) {
      if (granularityCounts[g] > bestGranularityWeight) {
        bestGranularityWeight = granularityCounts[g];
        bestGranularity = g;
      }
    }

    const successfulOutcomes = relevantOutcomes.filter(
      (o) => o.qualityScore >= 50 && o.completionRate >= 0.5
    );

    let optimalMerge = 1500;
    let optimalSplit = 6000;

    if (successfulOutcomes.length > 0) {
      let successWeight = 0;
      let mergeSum = 0;
      let splitSum = 0;

      for (const outcome of successfulOutcomes) {
        const ageDays = (now - outcome.timestamp) / DAY_MS;
        const weight = Math.exp(-ageDays * DECAY_RATE);
        successWeight += weight;
        mergeSum += outcome.tokensUsed * 0.25 * weight;
        splitSum += outcome.tokensUsed * 0.75 * weight;
      }

      if (successWeight > 0) {
        optimalMerge = Math.round(mergeSum / successWeight);
        optimalSplit = Math.round(splitSum / successWeight);
      }
    }

    const sampleCount = relevantOutcomes.length;
    const confidenceLevel = Math.min(1, sampleCount / 8);

    const profileKey = `${model}::${taskType}`;
    const profile: ModelStrategyProfile = {
      model,
      taskType,
      preferredStepCount: avgStepCount,
      preferredGranularity: bestGranularity,
      optimalMergeThreshold: optimalMerge,
      optimalSplitThreshold: optimalSplit,
      confidenceLevel,
      sampleCount,
      avgQualityScore: Math.round(avgQuality * 100) / 100,
      lastUpdated: now,
    };

    this.profiles.set(profileKey, profile);

    this.log("Profile recalculated", {
      model,
      taskType,
      sampleCount,
      confidenceLevel,
      avgQualityScore: profile.avgQualityScore,
      preferredStepCount: avgStepCount,
      preferredGranularity: bestGranularity,
    });
  }

  getModelProfile(model: string, taskType: string): ModelStrategyProfile | null {
    const profileKey = `${model}::${taskType}`;
    return this.profiles.get(profileKey) ?? null;
  }

  getAllProfiles(): ModelStrategyProfile[] {
    const allProfiles = this.profiles.values();
    return allProfiles.sort((a, b) => b.avgQualityScore - a.avgQualityScore);
  }

  getRecommendation(model: string): { recommendations: string[]; weakTaskTypes: string[]; strongTaskTypes: string[] } {
    const modelProfiles: ModelStrategyProfile[] = [];

    this.profiles.forEach((profile) => {
      if (profile.model === model) {
        modelProfiles.push(profile);
      }
    });

    if (modelProfiles.length === 0) {
      return {
        recommendations: [`No data available for model "${model}". Run more tasks to build a profile.`],
        weakTaskTypes: [],
        strongTaskTypes: [],
      };
    }

    const STRONG_THRESHOLD = 70;
    const WEAK_THRESHOLD = 50;

    const strongTaskTypes: string[] = [];
    const weakTaskTypes: string[] = [];
    const recommendations: string[] = [];

    for (const profile of modelProfiles) {
      if (profile.avgQualityScore >= STRONG_THRESHOLD) {
        strongTaskTypes.push(profile.taskType);
      } else if (profile.avgQualityScore < WEAK_THRESHOLD) {
        weakTaskTypes.push(profile.taskType);
      }
    }

    if (strongTaskTypes.length > 0) {
      recommendations.push(
        `Model "${model}" excels at: ${strongTaskTypes.join(", ")}. Consider routing these task types to this model.`
      );
    }

    if (weakTaskTypes.length > 0) {
      recommendations.push(
        `Model "${model}" struggles with: ${weakTaskTypes.join(", ")}. Consider using a different model or finer decomposition for these tasks.`
      );
    }

    const lowConfidence = modelProfiles.filter((p) => p.confidenceLevel < 0.5);
    if (lowConfidence.length > 0) {
      recommendations.push(
        `Low confidence profiles for: ${lowConfidence.map((p) => p.taskType).join(", ")}. More data is needed for reliable tuning.`
      );
    }

    const avgStepCounts = modelProfiles.map((p) => p.preferredStepCount);
    const avgSteps = avgStepCounts.reduce((a, b) => a + b, 0) / avgStepCounts.length;
    if (avgSteps > 4) {
      recommendations.push(
        `Model "${model}" generally benefits from finer decomposition (avg ${avgSteps.toFixed(1)} steps). Consider increasing default step counts.`
      );
    } else if (avgSteps < 2) {
      recommendations.push(
        `Model "${model}" works well with coarser decomposition (avg ${avgSteps.toFixed(1)} steps). Fewer steps may reduce overhead.`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(`Model "${model}" performs adequately across ${modelProfiles.length} task types. No specific adjustments needed.`);
    }

    return { recommendations, weakTaskTypes, strongTaskTypes };
  }

  getDecompositionThresholds(): { decompositionThreshold: number; contextWindowSize: number; maxSteps: number } {
    const allOutcomes = this.outcomes.values();

    if (allOutcomes.length < 3) {
      return {
        decompositionThreshold: 8,
        contextWindowSize: 32768,
        maxSteps: 10,
      };
    }

    const successfulOutcomes = allOutcomes.filter(
      (o) => o.qualityScore >= 60 && o.completionRate >= 0.7
    );

    if (successfulOutcomes.length === 0) {
      return {
        decompositionThreshold: 8,
        contextWindowSize: 32768,
        maxSteps: 10,
      };
    }

    const complexities = successfulOutcomes.map((o) => o.promptComplexity);
    const avgComplexity = complexities.reduce((a, b) => a + b, 0) / complexities.length;
    const decompositionThreshold = Math.max(4, Math.min(15, Math.round(avgComplexity * 0.8)));

    const tokenUsages = successfulOutcomes.map((o) => o.tokensUsed);
    const avgTokens = tokenUsages.reduce((a, b) => a + b, 0) / tokenUsages.length;
    const contextWindowSize = Math.max(8192, Math.min(65536, Math.round(avgTokens * 2)));

    const stepCounts = successfulOutcomes.map((o) => o.stepCount);
    const maxObservedSteps = Math.max(...stepCounts);
    const maxSteps = Math.max(5, Math.min(20, maxObservedSteps + 2));

    this.log("Decomposition thresholds computed", {
      outcomeCount: allOutcomes.length,
      successfulCount: successfulOutcomes.length,
      decompositionThreshold,
      contextWindowSize,
      maxSteps,
    });

    return { decompositionThreshold, contextWindowSize, maxSteps };
  }

  private isSmallModel(model: string): boolean {
    const lower = model.toLowerCase();
    return lower.includes('3b') || lower.includes('7b');
  }

  private inferGranularity(stepCount: number, promptComplexity: number): 'coarse' | 'medium' | 'fine' {
    const ratio = stepCount / Math.max(1, promptComplexity);
    if (ratio < 0.3) return 'coarse';
    if (ratio < 0.6) return 'medium';
    return 'fine';
  }

  destroy(): void {
    this.outcomes.clear();
    this.profiles.clear();
    this.log("AdaptiveDecompositionService destroyed");
  }
}

export const adaptiveDecompositionService = AdaptiveDecompositionService.getInstance();
