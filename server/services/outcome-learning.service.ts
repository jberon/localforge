import { BaseService, ManagedMap } from "../lib/base-service";

interface GenerationOutcome {
  id: string;
  model: string;
  taskType: "format" | "complete" | "generate" | "refactor" | "debug" | "explain" | "plan";
  tier: "fast" | "balanced" | "powerful";
  qualityScore: number;
  testsPassed: boolean | null;
  userAccepted: boolean | null;
  durationMs: number;
  tokensUsed: number;
  errorCount: number;
  refinementsNeeded: number;
  timestamp: number;
}

interface ModelScore {
  model: string;
  weightedScore: number;
  qualityAvg: number;
  successRate: number;
  speedScore: number;
  sampleCount: number;
  confidence: number;
  lastUpdated: number;
}

interface TaskTypeModelScore {
  taskType: string;
  model: string;
  score: ModelScore;
}

type OutcomeInput = Omit<GenerationOutcome, "id" | "timestamp">;

class OutcomeLearningService extends BaseService {
  private static instance: OutcomeLearningService;
  private outcomes: ManagedMap<string, GenerationOutcome>;
  private taskModelScores: ManagedMap<string, TaskTypeModelScore>;

  private constructor() {
    super("OutcomeLearningService");
    this.outcomes = this.createManagedMap<string, GenerationOutcome>({ maxSize: 1000, strategy: "lru" });
    this.taskModelScores = this.createManagedMap<string, TaskTypeModelScore>({ maxSize: 500, strategy: "lru" });
  }

  static getInstance(): OutcomeLearningService {
    if (!OutcomeLearningService.instance) {
      OutcomeLearningService.instance = new OutcomeLearningService();
    }
    return OutcomeLearningService.instance;
  }

  recordOutcome(outcome: OutcomeInput): void {
    const id = `outcome-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const fullOutcome: GenerationOutcome = {
      ...outcome,
      id,
      timestamp: Date.now(),
    };
    this.outcomes.set(id, fullOutcome);
    this.log("Outcome recorded", { id, model: outcome.model, taskType: outcome.taskType, qualityScore: outcome.qualityScore });
    this.recalculateScores(outcome.model, outcome.taskType);
  }

  recalculateScores(model: string, taskType: string): void {
    const relevant: GenerationOutcome[] = [];
    for (const outcome of this.outcomes.values()) {
      if (outcome.model === model && outcome.taskType === taskType) {
        relevant.push(outcome);
      }
    }

    if (relevant.length === 0) {
      return;
    }

    const now = Date.now();

    const weights: number[] = relevant.map((o) => {
      const ageDays = (now - o.timestamp) / 86400000;
      return Math.exp(-ageDays * 0.1);
    });

    const totalWeight = weights.reduce((a, b) => a + b, 0);

    let qualitySum = 0;
    let successSum = 0;
    let errorSum = 0;
    let refinementSum = 0;

    const durations: number[] = relevant.map((o) => o.durationMs);
    durations.sort((a, b) => a - b);
    const median = durations[Math.floor(durations.length / 2)];

    let speedSum = 0;

    for (let i = 0; i < relevant.length; i++) {
      const o = relevant[i];
      const w = weights[i];

      qualitySum += w * (o.qualityScore / 100);

      const isSuccess = o.userAccepted === true || (o.testsPassed === true && o.qualityScore > 60);
      successSum += w * (isSuccess ? 1 : 0);

      const speedVal = median > 0 ? Math.min(1, median / Math.max(1, o.durationMs)) : 1;
      speedSum += w * speedVal;

      errorSum += w * (o.errorCount / 10);
      refinementSum += w * (o.refinementsNeeded / 5);
    }

    const qualityAvg = totalWeight > 0 ? qualitySum / totalWeight : 0;
    const successRate = totalWeight > 0 ? successSum / totalWeight : 0;
    const speedScore = totalWeight > 0 ? speedSum / totalWeight : 0;
    const errorAvg = totalWeight > 0 ? errorSum / totalWeight : 0;
    const refinementAvg = totalWeight > 0 ? refinementSum / totalWeight : 0;

    const errorComponent = 1 - Math.min(1, errorAvg);
    const refinementComponent = 1 - Math.min(1, refinementAvg);

    const weightedScore =
      0.35 * qualityAvg +
      0.25 * successRate +
      0.15 * speedScore +
      0.15 * errorComponent +
      0.10 * refinementComponent;

    const confidence = Math.min(1, relevant.length / 10);

    const scoreKey = `${taskType}::${model}`;
    const modelScore: ModelScore = {
      model,
      weightedScore,
      qualityAvg,
      successRate,
      speedScore,
      sampleCount: relevant.length,
      confidence,
      lastUpdated: now,
    };

    this.taskModelScores.set(scoreKey, { taskType, model, score: modelScore });
    this.log("Scores recalculated", { model, taskType, weightedScore: weightedScore.toFixed(3), confidence: confidence.toFixed(2), samples: relevant.length });
  }

  getBestModel(
    taskType: string,
    candidates: string[]
  ): { model: string; score: number; confidence: number; reason: string } | null {
    let bestModel: string | null = null;
    let bestEffective = -1;
    let bestScore = 0;
    let bestConfidence = 0;

    for (const model of candidates) {
      const key = `${taskType}::${model}`;
      const entry = this.taskModelScores.get(key);
      if (!entry) continue;

      const s = entry.score;
      const effectiveScore = s.weightedScore * s.confidence + (1 - s.confidence) * 0.5;

      if (effectiveScore > bestEffective) {
        bestEffective = effectiveScore;
        bestModel = model;
        bestScore = s.weightedScore;
        bestConfidence = s.confidence;
      }
    }

    if (!bestModel) {
      return null;
    }

    return {
      model: bestModel,
      score: bestScore,
      confidence: bestConfidence,
      reason: `Best model for ${taskType}: ${bestModel} (score=${bestScore.toFixed(3)}, confidence=${bestConfidence.toFixed(2)}, effective=${bestEffective.toFixed(3)})`,
    };
  }

  getModelRecommendation(
    taskType: string,
    currentTier: "fast" | "balanced" | "powerful"
  ): { shouldUpgrade: boolean; shouldDowngrade: boolean; reason: string } {
    const tierOrder: Array<"fast" | "balanced" | "powerful"> = ["fast", "balanced", "powerful"];
    const currentIndex = tierOrder.indexOf(currentTier);

    let currentScore: ModelScore | null = null;
    for (const entry of this.taskModelScores.values()) {
      if (entry.taskType === taskType && entry.score.model.includes(currentTier)) {
        currentScore = entry.score;
        break;
      }
    }

    if (!currentScore) {
      for (const entry of this.taskModelScores.values()) {
        if (entry.taskType === taskType) {
          const inferredTier = this.inferTierFromModel(entry.model);
          if (inferredTier === currentTier) {
            currentScore = entry.score;
            break;
          }
        }
      }
    }

    const isUnderperforming = currentScore && currentScore.weightedScore < 0.4 && currentScore.confidence > 0.5;

    let fasterTierAdequate = false;
    let fasterTierName = "";
    if (currentIndex > 0) {
      for (const entry of this.taskModelScores.values()) {
        if (entry.taskType === taskType) {
          const entryTier = this.inferTierFromModel(entry.model);
          const entryIndex = tierOrder.indexOf(entryTier as "fast" | "balanced" | "powerful");
          if (entryIndex >= 0 && entryIndex < currentIndex && entry.score.weightedScore > 0.6 && entry.score.confidence > 0.3) {
            fasterTierAdequate = true;
            fasterTierName = entryTier;
            break;
          }
        }
      }
    }

    if (isUnderperforming && currentIndex < tierOrder.length - 1) {
      return {
        shouldUpgrade: true,
        shouldDowngrade: false,
        reason: `Current ${currentTier} tier is underperforming for ${taskType} (score=${currentScore!.weightedScore.toFixed(3)}). Consider upgrading to ${tierOrder[currentIndex + 1]}.`,
      };
    }

    if (fasterTierAdequate) {
      return {
        shouldUpgrade: false,
        shouldDowngrade: true,
        reason: `Faster ${fasterTierName} tier performs adequately for ${taskType}. Consider downgrading from ${currentTier} to save resources.`,
      };
    }

    return {
      shouldUpgrade: false,
      shouldDowngrade: false,
      reason: `Current ${currentTier} tier is performing adequately for ${taskType}.`,
    };
  }

  getLeaderboard(): Array<{ model: string; taskType: string; score: number; confidence: number; sampleCount: number }> {
    const entries: Array<{ model: string; taskType: string; score: number; confidence: number; sampleCount: number }> = [];

    for (const entry of this.taskModelScores.values()) {
      entries.push({
        model: entry.model,
        taskType: entry.taskType,
        score: entry.score.weightedScore,
        confidence: entry.score.confidence,
        sampleCount: entry.score.sampleCount,
      });
    }

    entries.sort((a, b) => b.score - a.score);
    return entries;
  }

  getInsights(): {
    topPerformers: Record<string, string>;
    weakSpots: Array<{ model: string; taskType: string; issue: string }>;
    recommendations: string[];
  } {
    const topPerformers: Record<string, string> = {};
    const weakSpots: Array<{ model: string; taskType: string; issue: string }> = [];
    const recommendations: string[] = [];

    const byTaskType = new Map<string, TaskTypeModelScore[]>();
    for (const entry of this.taskModelScores.values()) {
      const list = byTaskType.get(entry.taskType) || [];
      list.push(entry);
      byTaskType.set(entry.taskType, list);
    }

    for (const [taskType, entries] of Array.from(byTaskType.entries())) {
      let bestEntry: TaskTypeModelScore | null = null;
      let bestScore = -1;

      for (const entry of entries) {
        if (entry.score.weightedScore > bestScore) {
          bestScore = entry.score.weightedScore;
          bestEntry = entry;
        }
      }

      if (bestEntry) {
        topPerformers[taskType] = bestEntry.model;
      }

      for (const entry of entries) {
        if (entry.score.weightedScore < 0.4 && entry.score.confidence > 0.5) {
          weakSpots.push({
            model: entry.model,
            taskType: entry.taskType,
            issue: `Low performance score (${entry.score.weightedScore.toFixed(3)}) with high confidence (${entry.score.confidence.toFixed(2)})`,
          });
        }
      }
    }

    if (weakSpots.length > 0) {
      recommendations.push(`${weakSpots.length} model-task combinations are underperforming. Consider switching models or upgrading tiers.`);
    }

    const taskTypes = Array.from(byTaskType.keys());
    if (taskTypes.length > 0) {
      for (const [taskType, entries] of Array.from(byTaskType.entries())) {
        const highConfidence = entries.filter((e) => e.score.confidence > 0.5);
        if (highConfidence.length >= 2) {
          const sorted = highConfidence.sort((a, b) => b.score.weightedScore - a.score.weightedScore);
          const best = sorted[0];
          const worst = sorted[sorted.length - 1];
          if (best.score.weightedScore - worst.score.weightedScore > 0.2) {
            recommendations.push(`For ${taskType} tasks, ${best.model} significantly outperforms ${worst.model}. Consider consolidating to ${best.model}.`);
          }
        }
      }
    }

    if (this.outcomes.size < 10) {
      recommendations.push("Limited outcome data available. More samples will improve recommendation accuracy.");
    }

    return { topPerformers, weakSpots, recommendations };
  }

  private inferTierFromModel(model: string): string {
    const lower = model.toLowerCase();
    if (lower.includes("3b") || lower.includes("7b") || lower.includes("mini") || lower.includes("flash")) return "fast";
    if (lower.includes("14b") || lower.includes("8b")) return "balanced";
    if (lower.includes("30b") || lower.includes("70b") || lower.includes("opus") || lower.includes("o3")) return "powerful";
    return "balanced";
  }

  destroy(): void {
    this.outcomes.clear();
    this.taskModelScores.clear();
    this.log("OutcomeLearningService destroyed");
  }
}

export const outcomeLearningService = OutcomeLearningService.getInstance();
