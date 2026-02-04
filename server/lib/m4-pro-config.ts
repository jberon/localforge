export const M4_PRO_OPTIMIZED = {
  memory: {
    maxModelSizeMB: 32768,
    contextReservedMB: 16384,
    systemReservedMB: 8192,
    totalAvailableMB: 49152,
    llmPoolSizeMB: 36864,
    appReservedMB: 4096,
  },
  lmStudio: {
    gpuLayers: -1,
    contextLength: 65536,
    batchSize: 2048,
    threads: 12,
    flashAttention: true,
    memoryMap: true,
    keepInMemory: true,
    gpuOffloadPercent: 100,
  },
  hardware: {
    cpuCores: 14,
    performanceCores: 10,
    efficiencyCores: 4,
    gpuCores: 20,
    neuralEngineCores: 16,
    unifiedMemoryGB: 48,
    memoryBandwidthGBps: 273,
    ssdSpeedGBps: 4.0,
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
    maxQueueSize: 30,
    requestTimeoutMs: 180000,
    streamChunkSize: 2048,
    throttleMs: 25,
    maxRetries: 5,
    retryDelayMs: 500,
    maxConcurrentRequests: 3,
    connectionPoolSize: 5,
    keepAliveMs: 60000,
  },
  circuitBreaker: {
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 45000,
    halfOpenMaxRequests: 2,
  },
  performance: {
    enableParallelGeneration: true,
    maxParallelTasks: 4,
    enableStreamingOptimization: true,
    enableMemoryPressureMonitoring: true,
    memoryPressureThresholdPercent: 85,
    enableGCHints: true,
    gcIntervalMs: 30000,
    enableCaching: true,
    cacheMaxSizeMB: 512,
    cacheTTLMs: 300000,
  },
  concurrency: {
    maxConcurrentBuilds: 2,
    maxConcurrentValidations: 4,
    maxConcurrentDeployments: 1,
    taskQueueStrategy: "priority",
    workerPoolSize: 8,
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
