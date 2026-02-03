type CircuitState = "closed" | "open" | "half-open";

interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 30000,
};

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  getState(): CircuitState {
    return this.state;
  }

  isAvailable(): boolean {
    if (this.state === "closed") return true;
    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime >= this.config.timeout) {
        this.transitionTo("half-open");
        return true;
      }
      return false;
    }
    return true;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.isAvailable()) {
      throw new CircuitOpenError(
        `Circuit is open. Retry after ${Math.ceil((this.config.timeout - (Date.now() - this.lastFailureTime)) / 1000)}s`
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.state === "half-open") {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.transitionTo("closed");
      }
    }
  }

  private onFailure(): void {
    this.lastFailureTime = Date.now();
    this.failures++;
    this.successes = 0;

    if (this.state === "half-open" || this.failures >= this.config.failureThreshold) {
      this.transitionTo("open");
    }
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state !== newState) {
      const oldState = this.state;
      this.state = newState;
      if (newState === "closed") {
        this.failures = 0;
        this.successes = 0;
      }
      this.config.onStateChange?.(oldState, newState);
    }
  }

  reset(): void {
    this.state = "closed";
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = 0;
  }

  getStats(): {
    state: CircuitState;
    failures: number;
    successes: number;
    lastFailureTime: number;
    timeout: number;
  } {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      timeout: this.config.timeout,
    };
  }
}

export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitOpenError";
  }
}

export const llmCircuitBreaker = new CircuitBreaker({
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 30000,
  onStateChange: (from, to) => {
    console.log(`[CircuitBreaker] LLM connection state: ${from} → ${to}`);
  },
});
