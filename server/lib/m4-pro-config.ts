export const M4_PRO_OPTIMIZED = {
  memory: {
    maxModelSizeMB: 32768,
    contextReservedMB: 12288,
    systemReservedMB: 4096,
    totalAvailableMB: 49152,
  },
  lmStudio: {
    gpuLayers: -1,
    contextLength: 65536,
    batchSize: 1024,
    threads: 10,
    flashAttention: true,
    memoryMap: true,
  },
  hardware: {
    cpuCores: 14,
    gpuCores: 20,
    unifiedMemoryGB: 48,
    architecture: "Apple Silicon M4 Pro",
  },
  recommended: {
    plannerModel: "Ministral 3 14B Reasoning",
    builderModel: "Qwen3 Coder 30B",
    plannerMemoryGB: 12,
    builderMemoryGB: 24,
    plannerTemperature: 0.25,
    builderTemperature: 0.3,
    plannerContextLength: 32768,
    builderContextLength: 65536,
  },
  connection: {
    maxQueueSize: 20,
    requestTimeoutMs: 120000,
    streamChunkSize: 1024,
    throttleMs: 50,
    maxRetries: 3,
    retryDelayMs: 1000,
  },
  circuitBreaker: {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 30000,
  },
} as const;

export function getOptimalConfig(availableMemoryGB: number = 48) {
  if (availableMemoryGB >= 48) {
    return {
      ...M4_PRO_OPTIMIZED,
      recommended: {
        ...M4_PRO_OPTIMIZED.recommended,
        builderModel: "Qwen3 Coder 30B",
        builderMemoryGB: 24,
      },
    };
  } else if (availableMemoryGB >= 32) {
    return {
      ...M4_PRO_OPTIMIZED,
      recommended: {
        ...M4_PRO_OPTIMIZED.recommended,
        builderModel: "Qwen2.5 Coder 14B",
        builderMemoryGB: 12,
      },
      lmStudio: {
        ...M4_PRO_OPTIMIZED.lmStudio,
        contextLength: 32768,
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
        plannerContextLength: 16384,
        builderContextLength: 16384,
      },
      lmStudio: {
        ...M4_PRO_OPTIMIZED.lmStudio,
        contextLength: 16384,
        batchSize: 512,
      },
    };
  }
}

export type M4ProConfig = typeof M4_PRO_OPTIMIZED;
