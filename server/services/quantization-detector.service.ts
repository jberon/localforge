import { logger } from "../lib/logger";
import { BaseService, ManagedMap } from "../lib/base-service";
import { checkConnection, getLLMConfig } from "../llm-client";

export type QuantizationLevel = 
  | "f16"    // Full 16-bit floating point
  | "f32"    // Full 32-bit floating point  
  | "q8_0"   // 8-bit quantization
  | "q6_k"   // 6-bit K-quant
  | "q5_k_m" // 5-bit K-quant medium
  | "q5_k_s" // 5-bit K-quant small
  | "q5_0"   // 5-bit basic
  | "q4_k_m" // 4-bit K-quant medium
  | "q4_k_s" // 4-bit K-quant small
  | "q4_0"   // 4-bit basic
  | "q3_k_m" // 3-bit K-quant medium
  | "q3_k_s" // 3-bit K-quant small
  | "q2_k"   // 2-bit K-quant
  | "iq4_xs" // iQuant 4-bit extra small
  | "iq3_xxs" // iQuant 3-bit extra extra small
  | "unknown";

export interface QuantizationProfile {
  level: QuantizationLevel;
  bitsPerWeight: number;
  memoryReductionFactor: number;
  qualityRetention: number;
  speedMultiplier: number;
  recommendedContextMultiplier: number;
  description: string;
}

export interface ModelQuantizationInfo {
  modelName: string;
  detectedLevel: QuantizationLevel;
  profile: QuantizationProfile;
  estimatedVRAMMB: number;
  effectiveContextWindow: number;
  baseContextWindow: number;
  canExtendContext: boolean;
}

export interface ContextAdjustment {
  originalContext: number;
  adjustedContext: number;
  maxSafeContext: number;
  memoryHeadroom: number;
  recommendation: string;
}

const QUANTIZATION_PROFILES: Record<QuantizationLevel, QuantizationProfile> = {
  f32: {
    level: "f32",
    bitsPerWeight: 32,
    memoryReductionFactor: 1.0,
    qualityRetention: 1.0,
    speedMultiplier: 0.5,
    recommendedContextMultiplier: 0.5,
    description: "Full 32-bit precision - highest quality, most memory",
  },
  f16: {
    level: "f16",
    bitsPerWeight: 16,
    memoryReductionFactor: 2.0,
    qualityRetention: 0.99,
    speedMultiplier: 1.0,
    recommendedContextMultiplier: 1.0,
    description: "16-bit precision - excellent quality, baseline memory",
  },
  q8_0: {
    level: "q8_0",
    bitsPerWeight: 8,
    memoryReductionFactor: 4.0,
    qualityRetention: 0.98,
    speedMultiplier: 1.2,
    recommendedContextMultiplier: 1.5,
    description: "8-bit quantization - near-lossless, good memory savings",
  },
  q6_k: {
    level: "q6_k",
    bitsPerWeight: 6,
    memoryReductionFactor: 5.3,
    qualityRetention: 0.96,
    speedMultiplier: 1.3,
    recommendedContextMultiplier: 1.8,
    description: "6-bit K-quant - excellent balance of quality and size",
  },
  q5_k_m: {
    level: "q5_k_m",
    bitsPerWeight: 5,
    memoryReductionFactor: 6.4,
    qualityRetention: 0.94,
    speedMultiplier: 1.4,
    recommendedContextMultiplier: 2.0,
    description: "5-bit K-quant medium - very good quality, significant savings",
  },
  q5_k_s: {
    level: "q5_k_s",
    bitsPerWeight: 5,
    memoryReductionFactor: 6.4,
    qualityRetention: 0.93,
    speedMultiplier: 1.5,
    recommendedContextMultiplier: 2.0,
    description: "5-bit K-quant small - good quality, significant savings",
  },
  q5_0: {
    level: "q5_0",
    bitsPerWeight: 5,
    memoryReductionFactor: 6.4,
    qualityRetention: 0.92,
    speedMultiplier: 1.5,
    recommendedContextMultiplier: 2.0,
    description: "5-bit basic quantization - good balance",
  },
  q4_k_m: {
    level: "q4_k_m",
    bitsPerWeight: 4,
    memoryReductionFactor: 8.0,
    qualityRetention: 0.90,
    speedMultiplier: 1.6,
    recommendedContextMultiplier: 2.5,
    description: "4-bit K-quant medium - recommended for most use cases",
  },
  q4_k_s: {
    level: "q4_k_s",
    bitsPerWeight: 4,
    memoryReductionFactor: 8.0,
    qualityRetention: 0.88,
    speedMultiplier: 1.7,
    recommendedContextMultiplier: 2.5,
    description: "4-bit K-quant small - faster, slightly lower quality",
  },
  q4_0: {
    level: "q4_0",
    bitsPerWeight: 4,
    memoryReductionFactor: 8.0,
    qualityRetention: 0.85,
    speedMultiplier: 1.8,
    recommendedContextMultiplier: 2.5,
    description: "4-bit basic quantization - fast but lower quality",
  },
  q3_k_m: {
    level: "q3_k_m",
    bitsPerWeight: 3,
    memoryReductionFactor: 10.7,
    qualityRetention: 0.80,
    speedMultiplier: 1.9,
    recommendedContextMultiplier: 3.0,
    description: "3-bit K-quant medium - aggressive compression",
  },
  q3_k_s: {
    level: "q3_k_s",
    bitsPerWeight: 3,
    memoryReductionFactor: 10.7,
    qualityRetention: 0.75,
    speedMultiplier: 2.0,
    recommendedContextMultiplier: 3.0,
    description: "3-bit K-quant small - very aggressive compression",
  },
  q2_k: {
    level: "q2_k",
    bitsPerWeight: 2,
    memoryReductionFactor: 16.0,
    qualityRetention: 0.60,
    speedMultiplier: 2.2,
    recommendedContextMultiplier: 4.0,
    description: "2-bit K-quant - extreme compression, significant quality loss",
  },
  iq4_xs: {
    level: "iq4_xs",
    bitsPerWeight: 4,
    memoryReductionFactor: 8.5,
    qualityRetention: 0.89,
    speedMultiplier: 1.7,
    recommendedContextMultiplier: 2.5,
    description: "iQuant 4-bit extra small - optimized 4-bit",
  },
  iq3_xxs: {
    level: "iq3_xxs",
    bitsPerWeight: 3,
    memoryReductionFactor: 12.0,
    qualityRetention: 0.70,
    speedMultiplier: 2.1,
    recommendedContextMultiplier: 3.5,
    description: "iQuant 3-bit extra extra small - highly compressed",
  },
  unknown: {
    level: "unknown",
    bitsPerWeight: 16,
    memoryReductionFactor: 1.0,
    qualityRetention: 1.0,
    speedMultiplier: 1.0,
    recommendedContextMultiplier: 1.0,
    description: "Unknown quantization - using conservative defaults",
  },
};

const MODEL_SIZE_PATTERNS: Array<{ pattern: RegExp; parametersBillion: number }> = [
  { pattern: /(\d+)[bB](?![a-zA-Z])/, parametersBillion: 0 },
  { pattern: /(\d+\.?\d*)-?[bB](?![a-zA-Z])/, parametersBillion: 0 },
  { pattern: /7[bB]|7\.?[0-9]?[bB]/i, parametersBillion: 7 },
  { pattern: /8[bB]|8\.?[0-9]?[bB]/i, parametersBillion: 8 },
  { pattern: /13[bB]|13\.?[0-9]?[bB]/i, parametersBillion: 13 },
  { pattern: /14[bB]|14\.?[0-9]?[bB]/i, parametersBillion: 14 },
  { pattern: /30[bB]|30\.?[0-9]?[bB]/i, parametersBillion: 30 },
  { pattern: /32[bB]|32\.?[0-9]?[bB]/i, parametersBillion: 32 },
  { pattern: /33[bB]|33\.?[0-9]?[bB]/i, parametersBillion: 33 },
  { pattern: /70[bB]|70\.?[0-9]?[bB]/i, parametersBillion: 70 },
];

class QuantizationDetectorService extends BaseService {
  private static instance: QuantizationDetectorService;
  private modelCache: ManagedMap<string, ModelQuantizationInfo>;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private systemMemoryMB: number = 48 * 1024;
  private reservedMemoryMB: number = 8 * 1024;

  private constructor() {
    super("QuantizationDetectorService");
    this.modelCache = this.createManagedMap<string, ModelQuantizationInfo>({ maxSize: 1000, strategy: "lru" });
    this.detectSystemMemory();
  }

  static getInstance(): QuantizationDetectorService {
    if (!QuantizationDetectorService.instance) {
      QuantizationDetectorService.instance = new QuantizationDetectorService();
    }
    return QuantizationDetectorService.instance;
  }

  private detectSystemMemory(): void {
    try {
      const os = require("os");
      this.systemMemoryMB = Math.floor(os.totalmem() / (1024 * 1024));
      this.reservedMemoryMB = Math.floor(this.systemMemoryMB * 0.2);
    } catch (e) {
      this.systemMemoryMB = 48 * 1024;
      this.reservedMemoryMB = 8 * 1024;
    }
  }

  detectQuantizationLevel(modelName: string): QuantizationLevel {
    const name = modelName.toLowerCase();

    if (name.includes("f32") || name.includes("fp32")) return "f32";
    if (name.includes("f16") || name.includes("fp16")) return "f16";
    if (name.includes("q8_0") || name.includes("q8-0") || name.includes("-q8")) return "q8_0";
    if (name.includes("q6_k") || name.includes("q6-k") || name.includes("-q6k")) return "q6_k";
    if (name.includes("q5_k_m") || name.includes("q5-k-m") || name.includes("-q5km")) return "q5_k_m";
    if (name.includes("q5_k_s") || name.includes("q5-k-s") || name.includes("-q5ks")) return "q5_k_s";
    if (name.includes("q5_0") || name.includes("q5-0") || name.includes("-q5")) return "q5_0";
    if (name.includes("q4_k_m") || name.includes("q4-k-m") || name.includes("-q4km")) return "q4_k_m";
    if (name.includes("q4_k_s") || name.includes("q4-k-s") || name.includes("-q4ks")) return "q4_k_s";
    if (name.includes("q4_0") || name.includes("q4-0") || name.includes("-q4")) return "q4_0";
    if (name.includes("q3_k_m") || name.includes("q3-k-m") || name.includes("-q3km")) return "q3_k_m";
    if (name.includes("q3_k_s") || name.includes("q3-k-s") || name.includes("-q3ks")) return "q3_k_s";
    if (name.includes("q2_k") || name.includes("q2-k") || name.includes("-q2k")) return "q2_k";
    if (name.includes("iq4_xs") || name.includes("iq4-xs") || name.includes("-iq4xs")) return "iq4_xs";
    if (name.includes("iq3_xxs") || name.includes("iq3-xxs") || name.includes("-iq3xxs")) return "iq3_xxs";

    if (name.includes("gguf")) {
      if (name.includes("-q4")) return "q4_k_m";
      if (name.includes("-q5")) return "q5_k_m";
      if (name.includes("-q8")) return "q8_0";
    }

    return "unknown";
  }

  detectModelSize(modelName: string): number {
    const name = modelName.toLowerCase();
    
    const match = name.match(/(\d+\.?\d*)[bB]/);
    if (match) {
      return parseFloat(match[1]);
    }

    for (const { pattern, parametersBillion } of MODEL_SIZE_PATTERNS) {
      if (pattern.test(name) && parametersBillion > 0) {
        return parametersBillion;
      }
    }

    if (name.includes("large") || name.includes("xl")) return 13;
    if (name.includes("medium") || name.includes("base")) return 7;
    if (name.includes("small") || name.includes("mini")) return 3;

    return 7;
  }

  getQuantizationProfile(level: QuantizationLevel): QuantizationProfile {
    return QUANTIZATION_PROFILES[level];
  }

  estimateVRAMUsage(modelName: string): number {
    const sizeBillion = this.detectModelSize(modelName);
    const quantLevel = this.detectQuantizationLevel(modelName);
    const profile = this.getQuantizationProfile(quantLevel);

    const baseMemoryGB = sizeBillion * 2;
    const quantizedMemoryGB = baseMemoryGB / profile.memoryReductionFactor;
    const overheadGB = quantizedMemoryGB * 0.1;

    return Math.ceil((quantizedMemoryGB + overheadGB) * 1024);
  }

  getModelQuantizationInfo(modelName: string, baseContextWindow: number = 8192): ModelQuantizationInfo {
    const cached = this.modelCache.get(modelName);
    if (cached) return cached;

    const detectedLevel = this.detectQuantizationLevel(modelName);
    const profile = this.getQuantizationProfile(detectedLevel);
    const estimatedVRAMMB = this.estimateVRAMUsage(modelName);
    
    const effectiveContextWindow = Math.floor(
      baseContextWindow * profile.recommendedContextMultiplier
    );

    const availableMemory = this.systemMemoryMB - this.reservedMemoryMB;
    const canExtendContext = estimatedVRAMMB < availableMemory * 0.7;

    const info: ModelQuantizationInfo = {
      modelName,
      detectedLevel,
      profile,
      estimatedVRAMMB,
      effectiveContextWindow,
      baseContextWindow,
      canExtendContext,
    };

    this.modelCache.set(modelName, info);
    
    this.log("Model quantization detected", {
      model: modelName,
      level: detectedLevel,
      estimatedVRAMMB,
      effectiveContext: effectiveContextWindow,
    });

    return info;
  }

  calculateContextAdjustment(
    modelName: string,
    requestedContext: number,
    baseContextWindow: number = 8192
  ): ContextAdjustment {
    const info = this.getModelQuantizationInfo(modelName, baseContextWindow);
    const availableMemory = this.systemMemoryMB - this.reservedMemoryMB - info.estimatedVRAMMB;
    
    const contextMemoryPerToken = 2 / 1024;
    const maxContextFromMemory = Math.floor(availableMemory / contextMemoryPerToken);
    
    const maxSafeContext = Math.min(
      info.effectiveContextWindow,
      maxContextFromMemory,
      131072
    );

    const adjustedContext = Math.min(requestedContext, maxSafeContext);
    const memoryHeadroom = availableMemory - (adjustedContext * contextMemoryPerToken);

    let recommendation: string;
    if (adjustedContext >= requestedContext) {
      recommendation = `Full context available (${adjustedContext} tokens)`;
    } else if (adjustedContext >= requestedContext * 0.75) {
      recommendation = `Context reduced to ${adjustedContext} tokens (75%+ of requested)`;
    } else {
      recommendation = `Context significantly limited to ${adjustedContext} tokens. Consider using a more quantized model.`;
    }

    return {
      originalContext: requestedContext,
      adjustedContext,
      maxSafeContext,
      memoryHeadroom,
      recommendation,
    };
  }

  getOptimalQuantizationForTask(
    taskType: "planning" | "coding" | "review" | "general",
    modelSizeBillion: number
  ): QuantizationLevel {
    const availableMemoryGB = (this.systemMemoryMB - this.reservedMemoryMB) / 1024;
    
    const qualityNeeds: Record<string, number> = {
      coding: 0.90,
      review: 0.85,
      planning: 0.80,
      general: 0.75,
    };

    const minQuality = qualityNeeds[taskType] || 0.85;

    const levels = Object.entries(QUANTIZATION_PROFILES)
      .filter(([, profile]) => profile.qualityRetention >= minQuality)
      .sort((a, b) => b[1].memoryReductionFactor - a[1].memoryReductionFactor);

    for (const [level, profile] of levels) {
      const estimatedMemoryGB = (modelSizeBillion * 2) / profile.memoryReductionFactor * 1.1;
      if (estimatedMemoryGB <= availableMemoryGB * 0.8) {
        return level as QuantizationLevel;
      }
    }

    return "q4_k_m";
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.modelCache.clear();
    this.log("QuantizationDetectorService destroyed");
  }

  clearCache(): void {
    this.modelCache.clear();
  }

  getSystemInfo(): { systemMemoryMB: number; reservedMemoryMB: number; availableMemoryMB: number } {
    return {
      systemMemoryMB: this.systemMemoryMB,
      reservedMemoryMB: this.reservedMemoryMB,
      availableMemoryMB: this.systemMemoryMB - this.reservedMemoryMB,
    };
  }
}

export const quantizationDetectorService = QuantizationDetectorService.getInstance();
