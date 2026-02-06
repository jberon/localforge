import { BaseService } from "../lib/base-service";
import * as os from "os";

export interface HardwareProfile {
  platform: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  physicalCores: number;
  totalMemoryGB: number;
  freeMemoryGB: number;
  gpuType: "apple-silicon" | "nvidia" | "amd" | "integrated" | "unknown";
  neuralEngine: boolean;
  unifiedMemory: boolean;
  recommendedGPULayers: number;
  recommendedThreads: number;
  recommendedBatchSize: number;
  recommendedContextLength: number;
}

export interface OptimizationConfig {
  gpuLayers: number;
  threads: number;
  batchSize: number;
  contextLength: number;
  flashAttention: boolean;
  mmap: boolean;
  kvCacheType: "f16" | "q8_0" | "q4_0";
  tensorSplit: number[];
  mainGpu: number;
  lowVram: boolean;
}

export interface ModelLoadConfig {
  modelPath: string;
  optimization: OptimizationConfig;
  estimatedVRAMMB: number;
  estimatedLoadTimeS: number;
}

interface AppleSiliconProfile {
  chip: string;
  gpuCores: number;
  neuralEngineCores: number;
  memoryBandwidthGBps: number;
  maxUnifiedMemoryGB: number;
}

const APPLE_SILICON_PROFILES: Record<string, AppleSiliconProfile> = {
  "m1": { chip: "M1", gpuCores: 8, neuralEngineCores: 16, memoryBandwidthGBps: 68, maxUnifiedMemoryGB: 16 },
  "m1-pro": { chip: "M1 Pro", gpuCores: 16, neuralEngineCores: 16, memoryBandwidthGBps: 200, maxUnifiedMemoryGB: 32 },
  "m1-max": { chip: "M1 Max", gpuCores: 32, neuralEngineCores: 16, memoryBandwidthGBps: 400, maxUnifiedMemoryGB: 64 },
  "m1-ultra": { chip: "M1 Ultra", gpuCores: 64, neuralEngineCores: 32, memoryBandwidthGBps: 800, maxUnifiedMemoryGB: 128 },
  "m2": { chip: "M2", gpuCores: 10, neuralEngineCores: 16, memoryBandwidthGBps: 100, maxUnifiedMemoryGB: 24 },
  "m2-pro": { chip: "M2 Pro", gpuCores: 19, neuralEngineCores: 16, memoryBandwidthGBps: 200, maxUnifiedMemoryGB: 32 },
  "m2-max": { chip: "M2 Max", gpuCores: 38, neuralEngineCores: 16, memoryBandwidthGBps: 400, maxUnifiedMemoryGB: 96 },
  "m2-ultra": { chip: "M2 Ultra", gpuCores: 76, neuralEngineCores: 32, memoryBandwidthGBps: 800, maxUnifiedMemoryGB: 192 },
  "m3": { chip: "M3", gpuCores: 10, neuralEngineCores: 16, memoryBandwidthGBps: 100, maxUnifiedMemoryGB: 24 },
  "m3-pro": { chip: "M3 Pro", gpuCores: 18, neuralEngineCores: 16, memoryBandwidthGBps: 150, maxUnifiedMemoryGB: 36 },
  "m3-max": { chip: "M3 Max", gpuCores: 40, neuralEngineCores: 16, memoryBandwidthGBps: 400, maxUnifiedMemoryGB: 128 },
  "m4": { chip: "M4", gpuCores: 10, neuralEngineCores: 16, memoryBandwidthGBps: 120, maxUnifiedMemoryGB: 32 },
  "m4-pro": { chip: "M4 Pro", gpuCores: 20, neuralEngineCores: 16, memoryBandwidthGBps: 273, maxUnifiedMemoryGB: 64 },
  "m4-max": { chip: "M4 Max", gpuCores: 40, neuralEngineCores: 16, memoryBandwidthGBps: 546, maxUnifiedMemoryGB: 128 },
};

class HardwareOptimizerService extends BaseService {
  private static instance: HardwareOptimizerService;
  private profile: HardwareProfile | null = null;
  private appleSiliconProfile: AppleSiliconProfile | null = null;
  private forceM4ProProfile: boolean = false;

  private constructor() {
    super("HardwareOptimizerService");
    this.forceM4ProProfile = process.env.FORCE_M4_PRO_PROFILE === "true";
    this.detectHardware();
    this.log("Hardware detection complete", {
      profile: this.profile,
      forceM4Pro: this.forceM4ProProfile,
    });
  }

  static getInstance(): HardwareOptimizerService {
    if (!HardwareOptimizerService.instance) {
      HardwareOptimizerService.instance = new HardwareOptimizerService();
    }
    return HardwareOptimizerService.instance;
  }

  private detectHardware(): void {
    if (this.forceM4ProProfile) {
      this.applyM4ProOverride();
      return;
    }

    const platform = os.platform();
    const arch = os.arch();
    const cpus = os.cpus();
    const cpuModel = cpus[0]?.model || "Unknown";
    const totalMemoryGB = Math.round(os.totalmem() / (1024 * 1024 * 1024) * 10) / 10;
    const freeMemoryGB = Math.round(os.freemem() / (1024 * 1024 * 1024) * 10) / 10;

    let gpuType: HardwareProfile["gpuType"] = "unknown";
    let neuralEngine = false;
    let unifiedMemory = false;

    if (platform === "darwin" && arch === "arm64") {
      gpuType = "apple-silicon";
      neuralEngine = true;
      unifiedMemory = true;
      this.detectAppleSiliconChip(cpuModel, totalMemoryGB);
    } else if (platform === "linux" || platform === "win32") {
      gpuType = this.detectDiscreteGPU();
    }

    const physicalCores = this.estimatePhysicalCores(cpus.length);
    
    this.profile = {
      platform,
      arch,
      cpuModel,
      cpuCores: cpus.length,
      physicalCores,
      totalMemoryGB,
      freeMemoryGB,
      gpuType,
      neuralEngine,
      unifiedMemory,
      recommendedGPULayers: this.calculateRecommendedGPULayers(gpuType, totalMemoryGB),
      recommendedThreads: this.calculateRecommendedThreads(physicalCores),
      recommendedBatchSize: this.calculateRecommendedBatchSize(gpuType, totalMemoryGB),
      recommendedContextLength: this.calculateRecommendedContextLength(totalMemoryGB),
    };
  }

  private applyM4ProOverride(): void {
    this.appleSiliconProfile = APPLE_SILICON_PROFILES["m4-pro"];
    const m4Pro = this.appleSiliconProfile;
    const totalMemoryGB = 48;
    const freeMemoryGB = 40;

    this.profile = {
      platform: "darwin",
      arch: "arm64",
      cpuModel: "Apple M4 Pro (simulated)",
      cpuCores: 14,
      physicalCores: 14,
      totalMemoryGB,
      freeMemoryGB,
      gpuType: "apple-silicon",
      neuralEngine: true,
      unifiedMemory: true,
      recommendedGPULayers: -1,
      recommendedThreads: 12,
      recommendedBatchSize: this.calculateRecommendedBatchSize("apple-silicon", totalMemoryGB),
      recommendedContextLength: this.calculateRecommendedContextLength(totalMemoryGB),
    };

    this.log("M4 Pro profile override applied", {
      chip: m4Pro.chip,
      gpuCores: m4Pro.gpuCores,
      neuralEngineCores: m4Pro.neuralEngineCores,
      memoryBandwidthGBps: m4Pro.memoryBandwidthGBps,
      totalMemoryGB,
    });
  }

  private detectAppleSiliconChip(cpuModel: string, memoryGB: number): void {
    const model = cpuModel.toLowerCase();

    let chipKey: string | null = null;

    const directMatch = this.matchChipFromModelString(model);
    if (directMatch) {
      chipKey = directMatch;
    } else {
      chipKey = this.inferChipFromMemory(model, memoryGB);
    }

    this.appleSiliconProfile = APPLE_SILICON_PROFILES[chipKey] || null;
    this.log("Apple Silicon chip detected", { cpuModel, chipKey, memoryGB, method: directMatch ? "model-string" : "memory-heuristic" });
  }

  private matchChipFromModelString(model: string): string | null {
    const generations = ["m4", "m3", "m2", "m1"];
    for (const gen of generations) {
      if (!model.includes(gen)) continue;
      if (model.includes(`${gen} ultra`) || model.includes(`${gen}-ultra`)) return `${gen}-ultra`;
      if (model.includes(`${gen} max`) || model.includes(`${gen}-max`)) return `${gen}-max`;
      if (model.includes(`${gen} pro`) || model.includes(`${gen}-pro`)) return `${gen}-pro`;
      return gen;
    }
    return null;
  }

  private inferChipFromMemory(model: string, memoryGB: number): string {
    if (model.includes("m4")) {
      if (memoryGB > 64) return "m4-max";
      if (memoryGB > 32) return "m4-pro";
      return "m4";
    }
    if (model.includes("m3")) {
      if (memoryGB > 96) return "m3-max";
      if (memoryGB > 24) return "m3-pro";
      return "m3";
    }
    if (model.includes("m2")) {
      if (memoryGB > 128) return "m2-ultra";
      if (memoryGB > 64) return "m2-max";
      if (memoryGB > 24) return "m2-pro";
      return "m2";
    }
    if (model.includes("m1")) {
      if (memoryGB > 96) return "m1-ultra";
      if (memoryGB > 32) return "m1-max";
      if (memoryGB > 16) return "m1-pro";
      return "m1";
    }
    return "m1";
  }

  private detectDiscreteGPU(): HardwareProfile["gpuType"] {
    return "unknown";
  }

  private estimatePhysicalCores(logicalCores: number): number {
    if (this.profile?.gpuType === "apple-silicon") {
      return logicalCores;
    }
    return Math.ceil(logicalCores / 2);
  }

  private calculateRecommendedGPULayers(gpuType: string, memoryGB: number): number {
    if (gpuType === "apple-silicon") {
      return -1;
    }
    
    if (gpuType === "nvidia") {
      if (memoryGB >= 24) return 99;
      if (memoryGB >= 16) return 50;
      if (memoryGB >= 8) return 30;
      return 20;
    }
    
    return 0;
  }

  private calculateRecommendedThreads(physicalCores: number): number {
    const reservedForSystem = 2;
    return Math.max(1, physicalCores - reservedForSystem);
  }

  private calculateRecommendedBatchSize(gpuType: string, memoryGB: number): number {
    if (gpuType === "apple-silicon") {
      if (memoryGB >= 64) return 2048;
      if (memoryGB >= 32) return 1024;
      if (memoryGB >= 16) return 512;
      return 256;
    }
    
    return 512;
  }

  private calculateRecommendedContextLength(memoryGB: number): number {
    if (memoryGB >= 64) return 131072;
    if (memoryGB >= 48) return 65536;
    if (memoryGB >= 32) return 32768;
    if (memoryGB >= 16) return 16384;
    return 8192;
  }

  getHardwareProfile(): HardwareProfile | null {
    return this.profile;
  }

  getAppleSiliconProfile(): AppleSiliconProfile | null {
    return this.appleSiliconProfile;
  }

  getOptimizationConfig(modelSizeGB: number, quantLevel: string = "q4_k_m"): OptimizationConfig {
    if (!this.profile) {
      return this.getDefaultConfig();
    }

    const config: OptimizationConfig = {
      gpuLayers: this.profile.recommendedGPULayers,
      threads: this.profile.recommendedThreads,
      batchSize: this.profile.recommendedBatchSize,
      contextLength: this.profile.recommendedContextLength,
      flashAttention: true,
      mmap: true,
      kvCacheType: "f16",
      tensorSplit: [],
      mainGpu: 0,
      lowVram: false,
    };

    const availableMemory = this.profile.freeMemoryGB;
    if (modelSizeGB > availableMemory * 0.8) {
      config.lowVram = true;
      config.contextLength = Math.floor(config.contextLength / 2);
      config.batchSize = Math.floor(config.batchSize / 2);
      config.kvCacheType = "q4_0";
    }

    if (this.profile.gpuType === "apple-silicon" && this.appleSiliconProfile) {
      config.flashAttention = true;
      
      if (this.appleSiliconProfile.memoryBandwidthGBps >= 400) {
        config.batchSize = Math.min(config.batchSize * 2, 4096);
      }
    }

    return config;
  }

  private getDefaultConfig(): OptimizationConfig {
    return {
      gpuLayers: 0,
      threads: 4,
      batchSize: 512,
      contextLength: 8192,
      flashAttention: false,
      mmap: true,
      kvCacheType: "f16",
      tensorSplit: [],
      mainGpu: 0,
      lowVram: false,
    };
  }

  getModelLoadConfig(modelPath: string, modelSizeGB: number): ModelLoadConfig {
    const optimization = this.getOptimizationConfig(modelSizeGB);
    
    const estimatedVRAMMB = modelSizeGB * 1024;
    
    let estimatedLoadTimeS = modelSizeGB * 2;
    if (this.profile?.gpuType === "apple-silicon" && this.appleSiliconProfile) {
      const bandwidth = this.appleSiliconProfile.memoryBandwidthGBps;
      estimatedLoadTimeS = (modelSizeGB * 1024) / bandwidth;
    }

    return {
      modelPath,
      optimization,
      estimatedVRAMMB,
      estimatedLoadTimeS: Math.round(estimatedLoadTimeS),
    };
  }

  canFitModel(modelSizeGB: number, contextLength: number = 8192): boolean {
    if (!this.profile) return false;
    
    const kvCacheSizeGB = (contextLength * 2 * 4) / (1024 * 1024 * 1024);
    const totalRequired = modelSizeGB + kvCacheSizeGB + 2;
    
    return totalRequired <= this.profile.freeMemoryGB * 0.9;
  }

  getMaxModelSize(): number {
    if (!this.profile) return 4;
    
    const reservedGB = 4;
    const kvCacheGB = 2;
    return Math.floor((this.profile.freeMemoryGB - reservedGB - kvCacheGB) * 0.9);
  }

  formatLMStudioConfig(): Record<string, any> {
    if (!this.profile) return {};
    
    const config = this.getOptimizationConfig(8);
    
    return {
      n_gpu_layers: config.gpuLayers,
      n_threads: config.threads,
      n_batch: config.batchSize,
      n_ctx: config.contextLength,
      flash_attn: config.flashAttention,
      use_mmap: config.mmap,
      low_vram: config.lowVram,
    };
  }

  getPerformanceEstimate(modelSizeGB: number, contextLength: number): {
    tokensPerSecond: number;
    firstTokenLatencyMs: number;
    memoryUsageGB: number;
  } {
    if (!this.profile) {
      return { tokensPerSecond: 10, firstTokenLatencyMs: 1000, memoryUsageGB: modelSizeGB };
    }

    let baseTokensPerSecond = 20;
    
    if (this.profile.gpuType === "apple-silicon" && this.appleSiliconProfile) {
      const bandwidthFactor = this.appleSiliconProfile.memoryBandwidthGBps / 100;
      baseTokensPerSecond = 15 * bandwidthFactor;
    }

    const sizepenalty = Math.max(1, modelSizeGB / 10);
    const tokensPerSecond = Math.round(baseTokensPerSecond / sizepenalty);

    const firstTokenLatencyMs = Math.round((contextLength / 1000) * 50 * sizepenalty);

    const kvCacheGB = (contextLength * 2 * 4) / (1024 * 1024 * 1024);
    const memoryUsageGB = Math.round((modelSizeGB + kvCacheGB) * 10) / 10;

    return { tokensPerSecond, firstTokenLatencyMs, memoryUsageGB };
  }

  destroy(): void {
    this.profile = null;
    this.appleSiliconProfile = null;
    this.log("HardwareOptimizerService shutting down");
  }
}

export const hardwareOptimizerService = HardwareOptimizerService.getInstance();
