export const M4_PRO_OPTIMIZED = {
  memory: {
    maxModelSizeMB: 24576,
    contextReservedMB: 8192,
    systemReservedMB: 4096,
    totalAvailableMB: 36864,
    llmPoolSizeMB: 28672,
    appReservedMB: 4096,
  },
  lmStudio: {
    gpuLayers: -1,
    contextLength: 32768,
    batchSize: 1024,
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
    unifiedMemoryGB: 36,
    memoryBandwidthGBps: 273,
    ssdSpeedGBps: 4.0,
    architecture: "Apple Silicon M4 Pro",
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
    requestTimeoutMs: 120000,
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
    maxParallelTasks: 3,
    enableStreamingOptimization: true,
    enableMemoryPressureMonitoring: true,
    memoryPressureThresholdPercent: 80,
    enableGCHints: true,
    gcIntervalMs: 30000,
    enableCaching: true,
    cacheMaxSizeMB: 384,
    cacheTTLMs: 300000,
  },
  concurrency: {
    maxConcurrentBuilds: 1,
    maxConcurrentValidations: 3,
    maxConcurrentDeployments: 1,
    taskQueueStrategy: "priority" as const,
    workerPoolSize: 6,
  },
} as const;

export function getOptimalConfig(availableMemoryGB: number = 36) {
  if (availableMemoryGB >= 48) {
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
  } else if (availableMemoryGB >= 36) {
    return M4_PRO_OPTIMIZED;
  } else if (availableMemoryGB >= 24) {
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
