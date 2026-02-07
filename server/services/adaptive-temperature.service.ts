import { BaseService, ManagedMap } from "../lib/base-service";

type TaskType = "code-generation" | "planning" | "refactoring" | "bug-fix" | "documentation" | "design" | "discussion" | "question-answering";

interface QualitySignal {
  taskType: TaskType;
  model: string;
  temperature: number;
  success: boolean;
  syntaxErrors: number;
  outputLength: number;
  timestamp: number;
  retryCount: number;
}

interface TemperatureProfile {
  model: string;
  taskType: TaskType;
  optimalTemperature: number;
  confidence: number;
  sampleCount: number;
  recentSuccessRate: number;
  lastUpdated: number;
  temperatureHistory: Array<{ temp: number; successRate: number }>;
}

interface TemperatureRecommendation {
  temperature: number;
  confidence: number;
  reasoning: string;
  basedOnSamples: number;
  fallback: boolean;
}

const DEFAULT_TEMPERATURES: Record<TaskType, number> = {
  "code-generation": 0.2,
  "planning": 0.5,
  "refactoring": 0.15,
  "bug-fix": 0.1,
  "documentation": 0.5,
  "design": 0.7,
  "discussion": 0.6,
  "question-answering": 0.3,
};

const CODE_TASKS: TaskType[] = ["code-generation", "refactoring", "bug-fix"];

class AdaptiveTemperatureService extends BaseService {
  private static instance: AdaptiveTemperatureService | undefined;
  private profiles: ManagedMap<string, TemperatureProfile>;
  private signals: ManagedMap<string, QualitySignal>;
  private signalCounter: number = 0;

  private constructor() {
    super("AdaptiveTemperatureService");
    this.profiles = this.createManagedMap<string, TemperatureProfile>({ maxSize: 500, strategy: "lru" });
    this.signals = this.createManagedMap<string, QualitySignal>({ maxSize: 1000, strategy: "fifo" });
  }

  static getInstance(): AdaptiveTemperatureService {
    if (!AdaptiveTemperatureService.instance) {
      AdaptiveTemperatureService.instance = new AdaptiveTemperatureService();
    }
    return AdaptiveTemperatureService.instance;
  }

  destroy(): void {
    this.profiles.clear();
    this.signals.clear();
    this.signalCounter = 0;
    AdaptiveTemperatureService.instance = undefined;
    this.log("AdaptiveTemperatureService destroyed");
  }

  recordOutcome(signal: QualitySignal): void {
    const signalKey = `signal_${this.signalCounter++}`;
    this.signals.set(signalKey, signal);

    const profileKey = `${signal.model}::${signal.taskType}`;
    this.updateProfile(profileKey, signal);

    this.log("Recorded quality signal", {
      model: signal.model,
      taskType: signal.taskType,
      temperature: signal.temperature,
      success: signal.success,
    });
  }

  getRecommendedTemperature(model: string, taskType: TaskType): TemperatureRecommendation {
    const key = `${model}::${taskType}`;
    const profile = this.profiles.get(key);
    const defaultTemp = DEFAULT_TEMPERATURES[taskType];

    if (!profile) {
      return {
        temperature: defaultTemp,
        confidence: 0,
        reasoning: `No data for ${model} on ${taskType}, using default temperature`,
        basedOnSamples: 0,
        fallback: true,
      };
    }

    if (profile.sampleCount >= 5) {
      return {
        temperature: profile.optimalTemperature,
        confidence: profile.confidence,
        reasoning: `Learned optimal temperature from ${profile.sampleCount} samples with ${Math.round(profile.recentSuccessRate * 100)}% success rate`,
        basedOnSamples: profile.sampleCount,
        fallback: false,
      };
    }

    const blendWeight = profile.sampleCount / 5;
    const blendedTemp = profile.optimalTemperature * blendWeight + defaultTemp * (1 - blendWeight);

    return {
      temperature: Math.round(blendedTemp * 1000) / 1000,
      confidence: profile.confidence * blendWeight,
      reasoning: `Blending learned temperature (${profile.sampleCount} samples) with default for ${taskType}`,
      basedOnSamples: profile.sampleCount,
      fallback: true,
    };
  }

  private updateProfile(key: string, signal: QualitySignal): void {
    const existing = this.profiles.get(key);
    const decayFactor = 0.9;

    if (!existing) {
      const successRate = signal.success ? 1 : 0;
      this.profiles.set(key, {
        model: signal.model,
        taskType: signal.taskType,
        optimalTemperature: signal.temperature,
        confidence: 0.1,
        sampleCount: 1,
        recentSuccessRate: successRate,
        lastUpdated: signal.timestamp,
        temperatureHistory: [{ temp: signal.temperature, successRate }],
      });
      return;
    }

    const newSampleCount = existing.sampleCount + 1;
    const decayedSuccessRate = existing.recentSuccessRate * decayFactor + (signal.success ? 1 : 0) * (1 - decayFactor);

    let newOptimalTemp = existing.optimalTemperature * decayFactor + signal.temperature * (1 - decayFactor);

    if (signal.success) {
      newOptimalTemp = existing.optimalTemperature * decayFactor + signal.temperature * (1 - decayFactor);
    }

    if (decayedSuccessRate < 0.5 && newSampleCount >= 5) {
      const isCodeTask = CODE_TASKS.includes(signal.taskType);
      if (isCodeTask) {
        newOptimalTemp = Math.max(0, newOptimalTemp - 0.05);
      } else {
        newOptimalTemp = Math.min(1, newOptimalTemp + 0.05);
      }
    }

    newOptimalTemp = Math.round(newOptimalTemp * 1000) / 1000;

    const newConfidence = Math.min(1, 0.1 + (newSampleCount / 20) * 0.9);

    const history = [...existing.temperatureHistory, { temp: signal.temperature, successRate: decayedSuccessRate }];
    if (history.length > 10) {
      history.splice(0, history.length - 10);
    }

    this.profiles.set(key, {
      model: signal.model,
      taskType: signal.taskType,
      optimalTemperature: newOptimalTemp,
      confidence: Math.round(newConfidence * 1000) / 1000,
      sampleCount: newSampleCount,
      recentSuccessRate: Math.round(decayedSuccessRate * 1000) / 1000,
      lastUpdated: signal.timestamp,
      temperatureHistory: history,
    });
  }

  getProfiles(): TemperatureProfile[] {
    return this.profiles.values();
  }

  getModelStats(model: string): { taskProfiles: Record<TaskType, TemperatureProfile | null>; overallSuccessRate: number } {
    const allTaskTypes: TaskType[] = ["code-generation", "planning", "refactoring", "bug-fix", "documentation", "design", "discussion", "question-answering"];
    const taskProfiles = {} as Record<TaskType, TemperatureProfile | null>;
    let totalSuccess = 0;
    let totalSamples = 0;

    for (const taskType of allTaskTypes) {
      const key = `${model}::${taskType}`;
      const profile = this.profiles.get(key) || null;
      taskProfiles[taskType] = profile;
      if (profile) {
        totalSuccess += profile.recentSuccessRate * profile.sampleCount;
        totalSamples += profile.sampleCount;
      }
    }

    return {
      taskProfiles,
      overallSuccessRate: totalSamples > 0 ? Math.round((totalSuccess / totalSamples) * 1000) / 1000 : 0,
    };
  }

  resetModel(model: string): void {
    const keysToDelete: string[] = [];
    for (const key of this.profiles.keys()) {
      if (key.startsWith(`${model}::`)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.profiles.delete(key);
    }
    this.log("Reset model data", { model, profilesRemoved: keysToDelete.length });
  }

  getStats(): { totalSignals: number; uniqueModels: number; profileCount: number; averageConfidence: number } {
    const profiles = this.profiles.values();
    const models = new Set<string>();
    let totalConfidence = 0;

    for (const profile of profiles) {
      models.add(profile.model);
      totalConfidence += profile.confidence;
    }

    return {
      totalSignals: this.signals.size,
      uniqueModels: models.size,
      profileCount: profiles.length,
      averageConfidence: profiles.length > 0 ? Math.round((totalConfidence / profiles.length) * 1000) / 1000 : 0,
    };
  }
}

export const adaptiveTemperatureService = AdaptiveTemperatureService.getInstance();
