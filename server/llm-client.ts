import OpenAI from "openai";
import { llmCircuitBreaker, CircuitOpenError } from "./lib/circuit-breaker";

interface LLMClientConfig {
  endpoint: string;
  model?: string;
  temperature?: number;
}

interface StreamOptions {
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  maxTokens?: number;
  onChunk?: (chunk: string) => void;
  signal?: AbortSignal; // Support request cancellation
  throttleMs?: number; // Optional chunk throttling interval (prevents UI flooding)
}

// SSE Chunk Throttler - prevents UI flooding on large outputs
class ChunkThrottler {
  private buffer: string = "";
  private lastFlush: number = 0;
  private readonly intervalMs: number;
  private readonly onFlush: (chunk: string) => void;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(intervalMs: number, onFlush: (chunk: string) => void) {
    this.intervalMs = intervalMs;
    this.onFlush = onFlush;
  }

  add(chunk: string): void {
    this.buffer += chunk;
    const now = Date.now();
    
    if (now - this.lastFlush >= this.intervalMs) {
      this.flush();
    } else if (!this.flushTimer) {
      // Schedule a flush for remaining buffer
      this.flushTimer = setTimeout(() => this.flush(), this.intervalMs);
    }
  }

  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.buffer) {
      this.onFlush(this.buffer);
      this.buffer = "";
      this.lastFlush = Date.now();
    }
  }

  destroy(): void {
    this.flush();
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

// ============================================================================
// M4 PRO CONFIGURATION - Tunable via environment variables
// ============================================================================
// These settings are optimized for MacBook Pro M4 Pro (14-core CPU, 20-core GPU, 48GB RAM)
// Adjust via environment variables without code changes

const LLM_CONFIG = {
  // SSE throttle interval (default 50ms = 20 updates/sec max to prevent UI flooding)
  throttleMs: parseInt(process.env.LLM_THROTTLE_MS || "50", 10),
  
  // Max concurrent LLM requests (LM Studio handles one at a time)
  maxConcurrent: parseInt(process.env.LLM_MAX_CONCURRENT || "1", 10),
  
  // Max queue size before rejecting new requests
  maxQueueSize: parseInt(process.env.LLM_MAX_QUEUE_SIZE || "20", 10),
  
  // Request timeout in milliseconds (2 minutes default for large generations)
  requestTimeoutMs: parseInt(process.env.LLM_REQUEST_TIMEOUT_MS || "120000", 10),
  
  // Chunk size for streaming responses (1KB default)
  streamChunkSize: parseInt(process.env.LLM_STREAM_CHUNK_SIZE || "1024", 10),
  
  // Default endpoint for LM Studio
  defaultEndpoint: process.env.LLM_DEFAULT_ENDPOINT || "http://localhost:1234/v1",
  
  // API key for local LM Studio
  apiKey: process.env.LLM_API_KEY || "lm-studio",
} as const;

// Export config for external access (debugging, UI display)
export function getLLMConfig() {
  return { ...LLM_CONFIG };
}

// Legacy constants for backward compatibility
const DEFAULT_THROTTLE_MS = LLM_CONFIG.throttleMs;
const DEFAULT_ENDPOINT = LLM_CONFIG.defaultEndpoint;
const LOCAL_API_KEY = LLM_CONFIG.apiKey;

const clientCache = new Map<string, OpenAI>();

// Request queue for enforcing concurrency limits (M4 Pro optimization)
interface QueuedRequest<T> {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

class RequestQueue {
  private queue: QueuedRequest<unknown>[] = [];
  private activeRequests = 0;
  private readonly maxConcurrent: number;
  private readonly maxQueueSize: number;

  constructor(maxConcurrent = LLM_CONFIG.maxConcurrent, maxQueueSize = LLM_CONFIG.maxQueueSize) {
    this.maxConcurrent = maxConcurrent;
    this.maxQueueSize = maxQueueSize;
  }

  async enqueue<T>(execute: () => Promise<T>): Promise<T> {
    // Check if queue is full
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error(`LLM request queue full (${this.maxQueueSize} pending). Please wait.`);
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        execute: execute as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.activeRequests >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const request = this.queue.shift();
    if (!request) return;

    this.activeRequests++;

    try {
      const result = await request.execute();
      request.resolve(result);
    } catch (error) {
      request.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.activeRequests--;
      this.processQueue();
    }
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  get activeCount(): number {
    return this.activeRequests;
  }
}

// Singleton request queue for LLM requests (enforces single concurrent request for LM Studio)
// Configuration via environment: LLM_MAX_CONCURRENT, LLM_MAX_QUEUE_SIZE
const llmRequestQueue = new RequestQueue(
  LLM_CONFIG.maxConcurrent,  // Default 1: LM Studio handles one request at a time
  LLM_CONFIG.maxQueueSize    // Default 20: Queue up to 20 requests for multi-panel actions
);

// Connection health state
interface ConnectionHealth {
  isHealthy: boolean;
  lastCheck: number;
  consecutiveFailures: number;
  lastError?: string;
}

const connectionHealth: ConnectionHealth = {
  isHealthy: false,
  lastCheck: 0,
  consecutiveFailures: 0,
};

export function getConnectionHealth(): ConnectionHealth {
  return { ...connectionHealth };
}

export function updateConnectionHealth(success: boolean, error?: string): void {
  connectionHealth.lastCheck = Date.now();
  if (success) {
    connectionHealth.isHealthy = true;
    connectionHealth.consecutiveFailures = 0;
    connectionHealth.lastError = undefined;
  } else {
    connectionHealth.consecutiveFailures++;
    connectionHealth.isHealthy = false;
    connectionHealth.lastError = error;
  }
}

export function createLLMClient(config: LLMClientConfig): OpenAI {
  const endpoint = config.endpoint || DEFAULT_ENDPOINT;
  
  if (clientCache.has(endpoint)) {
    return clientCache.get(endpoint)!;
  }

  const client = new OpenAI({
    baseURL: endpoint,
    apiKey: LOCAL_API_KEY,
    timeout: 120000,
    maxRetries: 2,
  });

  clientCache.set(endpoint, client);
  return client;
}

export async function streamCompletion(
  config: LLMClientConfig,
  options: StreamOptions
): Promise<string> {
  // Check circuit breaker before queuing
  if (!llmCircuitBreaker.isAvailable()) {
    const stats = llmCircuitBreaker.getStats();
    throw new CircuitOpenError(
      `LLM connection circuit is open. Retry in ${Math.ceil((stats.timeout - (Date.now() - stats.lastFailureTime)) / 1000)}s`
    );
  }

  // Queue the request to enforce concurrency limits (M4 Pro optimization)
  return llmRequestQueue.enqueue(async () => {
    return llmCircuitBreaker.execute(async () => {
      const client = createLLMClient(config);
      const startTime = Date.now();
    
      // Use provided maxTokens or default to fullStack limit (optimized for 48GB M4 Pro)
      const maxTokens = options.maxTokens || LLM_DEFAULTS.maxTokens.fullStack;
      
      const stream = await client.chat.completions.create({
        model: config.model || "local-model",
        messages: [
          { role: "system", content: options.systemPrompt },
          ...options.messages,
        ],
        temperature: config.temperature ?? 0.7,
        max_tokens: maxTokens,
        stream: true,
      });

      let fullContent = "";
      let tokenCount = 0;
      
      // Use throttled callback if provided to prevent UI flooding
      const throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
      const throttler = options.onChunk 
        ? new ChunkThrottler(throttleMs, options.onChunk)
        : null;

      try {
        for await (const chunk of stream) {
          // Check for cancellation
          if (options.signal?.aborted) {
            stream.controller?.abort();
            throw new Error("Request cancelled");
          }
          
          const delta = chunk.choices[0]?.delta?.content || "";
          if (delta) {
            fullContent += delta;
            tokenCount++;
            throttler?.add(delta);
          }
        }
      } finally {
        // Ensure remaining buffer is flushed
        throttler?.destroy();
        
        // Update performance telemetry
        const durationMs = Date.now() - startTime;
        const estimatedTokens = Math.ceil(fullContent.length / 4);
        updateTelemetry(durationMs, estimatedTokens);
      }

      return fullContent;
    });
  });
}

export async function generateCompletion(
  config: LLMClientConfig,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = LLM_DEFAULTS.maxTokens.quickApp
): Promise<string> {
  // Check circuit breaker before queuing
  if (!llmCircuitBreaker.isAvailable()) {
    const stats = llmCircuitBreaker.getStats();
    throw new CircuitOpenError(
      `LLM connection circuit is open. Retry in ${Math.ceil((stats.timeout - (Date.now() - stats.lastFailureTime)) / 1000)}s`
    );
  }

  // Queue the request to enforce concurrency limits (M4 Pro optimization)
  return llmRequestQueue.enqueue(async () => {
    return llmCircuitBreaker.execute(async () => {
      const client = createLLMClient(config);
      const startTime = Date.now();

      const response = await client.chat.completions.create({
        model: config.model || "local-model",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: config.temperature ?? 0.7,
        max_tokens: maxTokens,
      });

      const content = response.choices[0]?.message?.content || "";
      
      // Update performance telemetry
      const durationMs = Date.now() - startTime;
      const tokenCount = response.usage?.completion_tokens || Math.ceil(content.length / 4);
      updateTelemetry(durationMs, tokenCount);
      
      return content;
    });
  });
}

// Export queue status for monitoring
export function getLLMQueueStatus(): { pending: number; active: number } {
  return {
    pending: llmRequestQueue.pendingCount,
    active: llmRequestQueue.activeCount,
  };
}

// Extended queue telemetry for client-side backpressure handling
export function getExtendedQueueTelemetry(): {
  pending: number;
  active: number;
  maxQueueSize: number;
  utilizationPercent: number;
  isOverloaded: boolean;
} {
  const pending = llmRequestQueue.pendingCount;
  const maxSize = M4_PRO_CONFIG.concurrency.requestQueueSize;
  return {
    pending,
    active: llmRequestQueue.activeCount,
    maxQueueSize: maxSize,
    utilizationPercent: Math.round((pending / maxSize) * 100),
    isOverloaded: pending >= maxSize * 0.8, // 80% threshold
  };
}

// Runtime performance telemetry
interface PerformanceTelemetry {
  requestCount: number;
  totalTokens: number;
  totalDurationMs: number;
  avgTokensPerSecond: number;
  lastRequestMs: number;
  lastTokensPerSecond: number;
  warnings: string[];
}

const telemetry: PerformanceTelemetry = {
  requestCount: 0,
  totalTokens: 0,
  totalDurationMs: 0,
  avgTokensPerSecond: 0,
  lastRequestMs: 0,
  lastTokensPerSecond: 0,
  warnings: [],
};

export function updateTelemetry(durationMs: number, tokenCount: number): void {
  telemetry.requestCount++;
  telemetry.totalTokens += tokenCount;
  telemetry.totalDurationMs += durationMs;
  telemetry.lastRequestMs = durationMs;
  
  // Calculate tokens per second
  const tokensPerSecond = durationMs > 0 ? (tokenCount / durationMs) * 1000 : 0;
  telemetry.lastTokensPerSecond = tokensPerSecond;
  telemetry.avgTokensPerSecond = telemetry.totalDurationMs > 0 
    ? (telemetry.totalTokens / telemetry.totalDurationMs) * 1000 
    : 0;
  
  // Check performance thresholds
  telemetry.warnings = [];
  if (durationMs > M4_PRO_CONFIG.thresholds.warningLatencyMs) {
    telemetry.warnings.push(`Request took ${(durationMs / 1000).toFixed(1)}s (threshold: ${M4_PRO_CONFIG.thresholds.warningLatencyMs / 1000}s)`);
  }
  if (tokensPerSecond < M4_PRO_CONFIG.thresholds.minTokensPerSecond && tokenCount > 100) {
    telemetry.warnings.push(`Token rate ${tokensPerSecond.toFixed(1)}/s below minimum ${M4_PRO_CONFIG.thresholds.minTokensPerSecond}/s`);
  }
}

export function getTelemetry(): PerformanceTelemetry {
  return { ...telemetry };
}

export function resetTelemetry(): void {
  telemetry.requestCount = 0;
  telemetry.totalTokens = 0;
  telemetry.totalDurationMs = 0;
  telemetry.avgTokensPerSecond = 0;
  telemetry.lastRequestMs = 0;
  telemetry.lastTokensPerSecond = 0;
  telemetry.warnings = [];
}

// Extended queue status for backpressure UX
interface ExtendedQueueStatus {
  pending: number;
  active: number;
  maxQueueSize: number;
  utilizationPercent: number;
  isOverloaded: boolean;
  isFull: boolean;
}

function getFullQueueStatus(): ExtendedQueueStatus {
  const extended = getExtendedQueueTelemetry();
  return {
    ...getLLMQueueStatus(),
    maxQueueSize: extended.maxQueueSize,
    utilizationPercent: extended.utilizationPercent,
    isOverloaded: extended.isOverloaded,
    isFull: extended.pending >= extended.maxQueueSize,
  };
}

export async function checkConnection(endpoint: string): Promise<{
  connected: boolean;
  models?: string[];
  error?: string;
  telemetry?: PerformanceTelemetry;
  health?: ConnectionHealth;
  queueStatus?: ExtendedQueueStatus;
}> {
  try {
    const client = createLLMClient({ endpoint });
    const models = await client.models.list();
    const modelIds = models.data?.map((m) => m.id) || [];
    
    updateConnectionHealth(true);
    
    return {
      connected: true,
      models: modelIds,
      telemetry: getTelemetry(),
      health: getConnectionHealth(),
      queueStatus: getFullQueueStatus(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    
    // Provide more helpful error messages
    let friendlyError = message;
    if (message.includes("ECONNREFUSED") || message.includes("fetch failed")) {
      friendlyError = "LM Studio is not running. Please start LM Studio and load a model.";
    } else if (message.includes("No models loaded")) {
      friendlyError = "LM Studio is running but no model is loaded. Please load a model in LM Studio.";
    } else if (message.includes("timeout")) {
      friendlyError = "Connection timed out. LM Studio may be busy or unresponsive.";
    }
    
    updateConnectionHealth(false, friendlyError);
    
    return {
      connected: false,
      error: friendlyError,
      health: getConnectionHealth(),
      queueStatus: getFullQueueStatus(),
    };
  }
}

export function clearClientCache(): void {
  clientCache.clear();
}

// Export circuit breaker for monitoring and control
export function getCircuitBreakerStatus(): {
  state: "closed" | "open" | "half-open";
  failures: number;
  lastFailureTime: number;
  isAvailable: boolean;
} {
  const stats = llmCircuitBreaker.getStats();
  return {
    state: stats.state,
    failures: stats.failures,
    lastFailureTime: stats.lastFailureTime,
    isAvailable: llmCircuitBreaker.isAvailable(),
  };
}

export function resetCircuitBreaker(): void {
  llmCircuitBreaker.reset();
}

export { CircuitOpenError } from "./lib/circuit-breaker";

// M4 Pro Performance Configuration
// MacBook Pro M4 Pro: 14-core CPU, 20-core GPU, 16-core Neural Engine, 48GB unified memory
export const M4_PRO_CONFIG = {
  // Memory allocation for LLM processing (optimized for 48GB)
  memory: {
    maxModelSizeMB: 32768,         // 32GB for model weights (fits 30B+ models)
    maxContextMB: 12288,           // 12GB for model context
    reservedSystemMB: 4096,        // 4GB for system + app overhead
  },
  // Concurrency limits to prevent memory pressure
  concurrency: {
    maxParallelRequests: 1,        // LM Studio handles one request at a time
    requestQueueSize: 20,          // Queue up to 20 requests (increased for multi-panel UX)
    streamingChunkSize: 1024,      // Optimal chunk size for streaming
  },
  // Recommended LM Studio settings for best performance on M4 Pro
  lmStudioSettings: {
    gpuLayers: -1,                 // Use all GPU layers (Metal acceleration)
    contextLength: 65536,          // 64K context for very large apps
    batchSize: 1024,               // Larger batch size for M4 Pro GPU
    threads: 10,                   // Leave 4 cores for system (14-core CPU)
    flashAttention: true,          // Enable flash attention if supported
    mmap: true,                    // Memory-mapped file loading
  },
  // Performance monitoring thresholds
  thresholds: {
    warningLatencyMs: 30000,       // Warn if request takes > 30s
    errorLatencyMs: 120000,        // Error if request takes > 2min
    minTokensPerSecond: 15,        // Minimum acceptable speed for M4 Pro
    targetTokensPerSecond: 30,     // Target speed for optimal experience
  },
  // Circuit breaker configuration
  circuitBreaker: {
    failureThreshold: 3,           // Open after 3 consecutive failures
    successThreshold: 2,           // Close after 2 consecutive successes
    timeout: 30000,                // Retry after 30 seconds
  },
} as const;

// Optimized for Mac M4 Pro with 48GB unified memory
// These higher limits take advantage of larger local models (32B+ params)
export const LLM_DEFAULTS = {
  temperature: {
    planner: 0.2,      // Lower for structured, deterministic planning
    builder: 0.4,      // Slightly lower for more consistent code generation
    creative: 0.7,     // Keep higher for exploratory features
    deterministic: 0.1,// Near-zero for precise, repeatable outputs
    refine: 0.3,       // Low temp for careful code modifications
  },
  maxTokens: {
    quickApp: 8192,    // 2x increase - single component apps
    fullStack: 16384,  // 2x increase - complete applications
    production: 32768, // 2x increase - enterprise-grade apps
    plan: 4096,        // 2x increase - detailed planning
    analysis: 2048,    // For intent detection and analysis
  },
  // Recommended models for 48GB M4 Pro (sorted by capability)
  recommendedModels: {
    coding: [
      "qwen2.5-coder-32b-instruct",    // Best balance of speed/quality
      "deepseek-coder-v2-lite-instruct", // Fast, excellent for code
      "codellama-34b-instruct",         // Strong code generation
    ],
    general: [
      "qwen2.5-32b-instruct",          // Excellent all-around
      "llama-3.1-70b-instruct-q4",     // High quality, fits in 48GB
      "mistral-large-instruct-2407",   // Good reasoning
    ],
    fast: [
      "qwen2.5-coder-7b-instruct",     // Very fast, good quality
      "deepseek-coder-6.7b-instruct",  // Lightweight, responsive
      "codellama-7b-instruct",         // Quick iterations
    ],
  },
  // Context window recommendations based on model size
  contextWindows: {
    "7b": 8192,
    "13b": 16384,
    "32b": 32768,
    "70b": 16384,  // Lower due to memory constraints
  },
} as const;
