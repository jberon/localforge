import os from "os";

interface DetectedHardware {
  totalMemoryGB: number;
  cpuCores: number;
  platform: string;
  arch: string;
  isAppleSilicon: boolean;
  freeMemoryGB: number;
}

function detectHardware(): DetectedHardware {
  const totalMemoryGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
  const freeMemoryGB = Math.round(os.freemem() / (1024 * 1024 * 1024));
  const cpuCores = os.cpus().length;
  const platform = os.platform();
  const arch = os.arch();
  const isAppleSilicon = platform === "darwin" && arch === "arm64";

  return { totalMemoryGB, cpuCores, platform, arch, isAppleSilicon, freeMemoryGB };
}

export const detectedHardware = detectHardware();

export const M4_PRO_OPTIMIZED = {
  memory: {
    maxModelSizeMB: 24576,
    contextReservedMB: 8192,
    systemReservedMB: 4096,
    totalAvailableMB: detectedHardware.totalMemoryGB * 1024,
    llmPoolSizeMB: Math.round(detectedHardware.totalMemoryGB * 0.75) * 1024,
    appReservedMB: 4096,
  },
  lmStudio: {
    gpuLayers: -1,
    contextLength: 32768,
    batchSize: 1024,
    threads: Math.max(4, Math.floor(detectedHardware.cpuCores * 0.75)),
    flashAttention: true,
    memoryMap: true,
    keepInMemory: true,
    gpuOffloadPercent: detectedHardware.isAppleSilicon ? 100 : 80,
  },
  hardware: {
    cpuCores: detectedHardware.cpuCores,
    performanceCores: Math.ceil(detectedHardware.cpuCores * 0.7),
    efficiencyCores: Math.floor(detectedHardware.cpuCores * 0.3),
    gpuCores: detectedHardware.isAppleSilicon ? 20 : 0,
    neuralEngineCores: detectedHardware.isAppleSilicon ? 16 : 0,
    unifiedMemoryGB: detectedHardware.totalMemoryGB,
    memoryBandwidthGBps: detectedHardware.isAppleSilicon ? 273 : 50,
    ssdSpeedGBps: 4.0,
    architecture: detectedHardware.isAppleSilicon
      ? `Apple Silicon (${detectedHardware.arch})`
      : `${os.platform()} ${detectedHardware.arch}`,
  },
  recommended: {
    plannerModel: "Ministral 3 14B Reasoning",
    builderModel: "Qwen3 Coder 30B",
    plannerMemoryGB: 12,
    builderMemoryGB: 20,
    plannerTemperature: 0.25,
    builderTemperature: 0.3,
    plannerContextLength: 32768,
    builderContextLength: 32768,
  },
  connection: {
    maxQueueSize: 20,
    requestTimeoutMs: 300000,
    streamChunkSize: 1024,
    throttleMs: 50,
    maxRetries: 3,
    retryDelayMs: 1000,
    maxConcurrentRequests: 1,
    connectionPoolSize: 3,
    keepAliveMs: 60000,
  },
  circuitBreaker: {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 30000,
    halfOpenMaxRequests: 1,
  },
  performance: {
    enableParallelGeneration: true,
    maxParallelTasks: Math.max(1, Math.floor(detectedHardware.cpuCores / 4)),
    enableStreamingOptimization: true,
    enableMemoryPressureMonitoring: true,
    memoryPressureThresholdPercent: 80,
    enableGCHints: true,
    gcIntervalMs: 30000,
    enableCaching: true,
    cacheMaxSizeMB: Math.min(512, Math.round(detectedHardware.totalMemoryGB * 10)),
    cacheTTLMs: 300000,
  },
  concurrency: {
    maxConcurrentBuilds: 1,
    maxConcurrentValidations: Math.max(1, Math.floor(detectedHardware.cpuCores / 4)),
    maxConcurrentDeployments: 1,
    taskQueueStrategy: "priority" as const,
    workerPoolSize: Math.max(2, Math.floor(detectedHardware.cpuCores / 2)),
  },
} as const;

export function getOptimalConfig(availableMemoryGB?: number) {
  const memGB = availableMemoryGB ?? detectedHardware.totalMemoryGB;

  if (memGB >= 48) {
    return {
      ...M4_PRO_OPTIMIZED,
      memory: {
        ...M4_PRO_OPTIMIZED.memory,
        totalAvailableMB: 49152,
        llmPoolSizeMB: 36864,
        maxModelSizeMB: 32768,
        contextReservedMB: 16384,
      },
      lmStudio: {
        ...M4_PRO_OPTIMIZED.lmStudio,
        contextLength: 65536,
        batchSize: 2048,
      },
      recommended: {
        ...M4_PRO_OPTIMIZED.recommended,
        builderMemoryGB: 24,
        builderContextLength: 65536,
      },
    };
  } else if (memGB >= 36) {
    return M4_PRO_OPTIMIZED;
  } else if (memGB >= 24) {
    return {
      ...M4_PRO_OPTIMIZED,
      recommended: {
        ...M4_PRO_OPTIMIZED.recommended,
        builderModel: "Qwen2.5 Coder 14B",
        builderMemoryGB: 12,
        plannerContextLength: 16384,
        builderContextLength: 16384,
      },
      lmStudio: {
        ...M4_PRO_OPTIMIZED.lmStudio,
        contextLength: 16384,
        batchSize: 512,
      },
    };
  } else if (memGB >= 16) {
    return {
      ...M4_PRO_OPTIMIZED,
      recommended: {
        plannerModel: "Qwen2.5 Coder 7B",
        builderModel: "Qwen2.5 Coder 14B",
        plannerMemoryGB: 6,
        builderMemoryGB: 10,
        plannerTemperature: 0.3,
        builderTemperature: 0.35,
        plannerContextLength: 16384,
        builderContextLength: 16384,
      },
      lmStudio: {
        ...M4_PRO_OPTIMIZED.lmStudio,
        contextLength: 16384,
        batchSize: 512,
      },
    };
  } else {
    return {
      ...M4_PRO_OPTIMIZED,
      recommended: {
        plannerModel: "Qwen2.5 Coder 7B",
        builderModel: "Qwen2.5 Coder 7B",
        plannerMemoryGB: 6,
        builderMemoryGB: 6,
        plannerTemperature: 0.3,
        builderTemperature: 0.4,
        plannerContextLength: 8192,
        builderContextLength: 8192,
      },
      lmStudio: {
        ...M4_PRO_OPTIMIZED.lmStudio,
        contextLength: 8192,
        batchSize: 256,
      },
    };
  }
}

export type M4ProConfig = typeof M4_PRO_OPTIMIZED;
