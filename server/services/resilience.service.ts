import logger from "../lib/logger";

export type CircuitState = "closed" | "open" | "half-open";

interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  successThreshold: number;
}

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
}

interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: number | null;
  lastStateChange: number;
}

export class ResilienceService {
  private static instance: ResilienceService;
  
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private readonly maxCircuitBreakers = 200;
  private readonly circuitBreakerTTLMs = 10 * 60 * 1000;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private defaultCircuitConfig: CircuitBreakerConfig = {
    failureThreshold: 3,
    recoveryTimeout: 30000,
    successThreshold: 2,
  };
  private defaultRetryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    jitterFactor: 0.3,
  };

  private constructor() {
    this.cleanupTimer = setInterval(() => this.evictStaleCircuitBreakers(), 60000);
  }

  private evictStaleCircuitBreakers(): void {
    const now = Date.now();
    for (const [key, cb] of Array.from(this.circuitBreakers.entries())) {
      if (cb.state === "closed" && now - cb.lastStateChange > this.circuitBreakerTTLMs) {
        this.circuitBreakers.delete(key);
      }
    }
    if (this.circuitBreakers.size > this.maxCircuitBreakers) {
      const entries = Array.from(this.circuitBreakers.entries())
        .sort((a, b) => a[1].lastStateChange - b[1].lastStateChange);
      const toRemove = entries.slice(0, entries.length - this.maxCircuitBreakers);
      for (const [key] of toRemove) {
        this.circuitBreakers.delete(key);
      }
    }
    for (const [key, bh] of Array.from(this.bulkheads.entries())) {
      if (bh.active === 0 && bh.queued === 0 && bh.waiters.length === 0 && now - bh.lastUsed > this.circuitBreakerTTLMs) {
        this.bulkheads.delete(key);
      }
    }
  }

  static getInstance(): ResilienceService {
    if (!ResilienceService.instance) {
      ResilienceService.instance = new ResilienceService();
    }
    return ResilienceService.instance;
  }

  private getCircuitBreaker(key: string): CircuitBreakerState {
    if (!this.circuitBreakers.has(key)) {
      this.circuitBreakers.set(key, {
        state: "closed",
        failures: 0,
        successes: 0,
        lastFailure: null,
        lastStateChange: Date.now(),
      });
    }
    return this.circuitBreakers.get(key)!;
  }

  canExecute(key: string, config?: Partial<CircuitBreakerConfig>): boolean {
    const cb = this.getCircuitBreaker(key);
    const cfg = { ...this.defaultCircuitConfig, ...config };

    if (cb.state === "closed") {
      return true;
    }

    if (cb.state === "open") {
      // Check if recovery timeout has passed
      if (Date.now() - cb.lastStateChange >= cfg.recoveryTimeout) {
        cb.state = "half-open";
        cb.lastStateChange = Date.now();
        cb.successes = 0;
        logger.info("Circuit breaker transitioning to half-open", { key });
        return true;
      }
      return false;
    }

    // half-open state: allow limited requests
    return true;
  }

  recordSuccess(key: string, config?: Partial<CircuitBreakerConfig>): void {
    const cb = this.getCircuitBreaker(key);
    const cfg = { ...this.defaultCircuitConfig, ...config };

    if (cb.state === "half-open") {
      cb.successes++;
      if (cb.successes >= cfg.successThreshold) {
        cb.state = "closed";
        cb.failures = 0;
        cb.successes = 0;
        cb.lastStateChange = Date.now();
        logger.info("Circuit breaker closed after recovery", { key });
      }
    } else {
      // Reset failure count on success in closed state
      cb.failures = 0;
    }
  }

  recordFailure(key: string, error: Error, config?: Partial<CircuitBreakerConfig>): void {
    const cb = this.getCircuitBreaker(key);
    const cfg = { ...this.defaultCircuitConfig, ...config };

    cb.failures++;
    cb.lastFailure = Date.now();

    if (cb.state === "half-open") {
      // Any failure in half-open returns to open
      cb.state = "open";
      cb.lastStateChange = Date.now();
      logger.warn("Circuit breaker reopened after half-open failure", { key, error: error.message });
    } else if (cb.state === "closed" && cb.failures >= cfg.failureThreshold) {
      cb.state = "open";
      cb.lastStateChange = Date.now();
      logger.warn("Circuit breaker opened due to failures", { key, failures: cb.failures });
    }
  }

  getCircuitState(key: string): CircuitState {
    return this.getCircuitBreaker(key).state;
  }

  resetCircuit(key: string): void {
    this.circuitBreakers.set(key, {
      state: "closed",
      failures: 0,
      successes: 0,
      lastFailure: null,
      lastStateChange: Date.now(),
    });
    logger.info("Circuit breaker reset", { key });
  }

  calculateBackoff(attempt: number, config?: Partial<RetryConfig>): number {
    const cfg = { ...this.defaultRetryConfig, ...config };
    
    // Exponential backoff with jitter
    const exponentialDelay = cfg.baseDelayMs * Math.pow(2, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, cfg.maxDelayMs);
    
    // Add jitter to prevent thundering herd
    const jitter = cappedDelay * cfg.jitterFactor * (Math.random() * 2 - 1);
    const finalDelay = Math.max(0, cappedDelay + jitter);
    
    return Math.round(finalDelay);
  }

  async withRetry<T>(
    operation: () => Promise<T>,
    options?: {
      key?: string;
      retryConfig?: Partial<RetryConfig>;
      circuitConfig?: Partial<CircuitBreakerConfig>;
      onRetry?: (attempt: number, error: Error, delay: number) => void;
      shouldRetry?: (error: Error) => boolean;
    }
  ): Promise<T> {
    const key = options?.key || "default";
    const retryConfig = { ...this.defaultRetryConfig, ...options?.retryConfig };
    const shouldRetry = options?.shouldRetry || this.isRetryableError;

    let lastError: Error = new Error("Operation failed");

    for (let attempt = 1; attempt <= retryConfig.maxRetries + 1; attempt++) {
      // Check circuit breaker
      if (!this.canExecute(key, options?.circuitConfig)) {
        throw new Error(`Circuit breaker open for ${key}`);
      }

      try {
        const result = await operation();
        this.recordSuccess(key, options?.circuitConfig);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        this.recordFailure(key, lastError, options?.circuitConfig);

        // Check if we should retry
        if (attempt > retryConfig.maxRetries || !shouldRetry(lastError)) {
          throw lastError;
        }

        // Calculate backoff
        const delay = this.calculateBackoff(attempt, retryConfig);
        
        if (options?.onRetry) {
          options.onRetry(attempt, lastError, delay);
        } else {
          logger.debug("Retrying operation", { key, attempt, delay, error: lastError.message });
        }

        // Wait before retrying
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    // Non-retryable errors
    if (message.includes("invalid api key") ||
        message.includes("authentication") ||
        message.includes("authorization") ||
        message.includes("not found") ||
        message.includes("bad request")) {
      return false;
    }

    // Retryable errors
    if (message.includes("timeout") ||
        message.includes("connection") ||
        message.includes("econnrefused") ||
        message.includes("econnreset") ||
        message.includes("rate limit") ||
        message.includes("503") ||
        message.includes("502") ||
        message.includes("429")) {
      return true;
    }

    // Default to retryable for unknown errors
    return true;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async withTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    timeoutMessage?: string
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(timeoutMessage || `Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      operation()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  async withBulkhead<T>(
    operation: () => Promise<T>,
    options: {
      key: string;
      maxConcurrent: number;
      maxQueue: number;
      timeoutMs?: number;
    }
  ): Promise<T> {
    // Bulkhead pattern implementation
    // Limits concurrent executions to prevent resource exhaustion
    const { key, maxConcurrent, maxQueue, timeoutMs = 60000 } = options;
    
    const bulkhead = this.getBulkhead(key, maxConcurrent, maxQueue);
    
    if (bulkhead.active >= maxConcurrent && bulkhead.queued >= maxQueue) {
      throw new Error(`Bulkhead ${key} is full (active: ${bulkhead.active}, queued: ${bulkhead.queued})`);
    }

    if (bulkhead.active >= maxConcurrent) {
      bulkhead.queued++;
      await this.waitForSlot(key, timeoutMs);
      bulkhead.queued--;
    }

    bulkhead.active++;
    try {
      return await operation();
    } finally {
      bulkhead.active--;
      this.notifySlotAvailable(key);
    }
  }

  private bulkheads: Map<string, { active: number; queued: number; waiters: Array<() => void>; lastUsed: number }> = new Map();

  private getBulkhead(key: string, _maxConcurrent: number, _maxQueue: number) {
    if (!this.bulkheads.has(key)) {
      this.bulkheads.set(key, { active: 0, queued: 0, waiters: [], lastUsed: Date.now() });
    }
    const bh = this.bulkheads.get(key)!;
    bh.lastUsed = Date.now();
    return bh;
  }

  private waitForSlot(key: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const bulkhead = this.bulkheads.get(key)!;
      const timer = setTimeout(() => {
        const idx = bulkhead.waiters.indexOf(resolve);
        if (idx !== -1) bulkhead.waiters.splice(idx, 1);
        reject(new Error(`Bulkhead ${key} wait timeout`));
      }, timeoutMs);

      bulkhead.waiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private notifySlotAvailable(key: string): void {
    const bulkhead = this.bulkheads.get(key);
    if (bulkhead && bulkhead.waiters.length > 0) {
      const waiter = bulkhead.waiters.shift();
      if (waiter) waiter();
    }
  }

  getStats(): {
    circuitBreakers: Record<string, CircuitBreakerState>;
    bulkheads: Record<string, { active: number; queued: number }>;
  } {
    const circuits: Record<string, CircuitBreakerState> = {};
    this.circuitBreakers.forEach((value, key) => {
      circuits[key] = { ...value };
    });

    const bulkheads: Record<string, { active: number; queued: number }> = {};
    this.bulkheads.forEach((value, key) => {
      bulkheads[key] = { active: value.active, queued: value.queued };
    });

    return { circuitBreakers: circuits, bulkheads };
  }
}

export const resilienceService = ResilienceService.getInstance();
