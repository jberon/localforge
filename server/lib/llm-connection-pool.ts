import OpenAI from "openai";

interface PoolEntry {
  client: OpenAI;
  lastUsed: number;
  healthy: boolean;
  endpoint: string;
  createdAt: number;
}

export class LLMConnectionPool {
  private clients = new Map<string, PoolEntry>();
  private readonly maxAge: number;
  private readonly cleanupInterval: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(maxAgeMs: number = 300000, cleanupIntervalMs: number = 60000) {
    this.maxAge = maxAgeMs;
    this.cleanupInterval = cleanupIntervalMs;
    this.startCleanup();
  }

  get(endpoint: string, apiKey: string = "lm-studio"): OpenAI {
    const key = `${endpoint}:${apiKey}`;
    const entry = this.clients.get(key);

    if (entry && entry.healthy && Date.now() - entry.lastUsed < this.maxAge) {
      entry.lastUsed = Date.now();
      return entry.client;
    }

    if (entry && !entry.healthy) {
      this.clients.delete(key);
    }

    return this.createNew(endpoint, apiKey, key);
  }

  private createNew(endpoint: string, apiKey: string, key: string): OpenAI {
    const client = new OpenAI({
      baseURL: endpoint,
      apiKey,
      timeout: 120000,
      maxRetries: 2,
    });

    const entry: PoolEntry = {
      client,
      lastUsed: Date.now(),
      healthy: true,
      endpoint,
      createdAt: Date.now(),
    };

    this.clients.set(key, entry);
    return client;
  }

  markUnhealthy(endpoint: string, apiKey: string = "lm-studio"): void {
    const key = `${endpoint}:${apiKey}`;
    const entry = this.clients.get(key);
    if (entry) {
      entry.healthy = false;
    }
  }

  markHealthy(endpoint: string, apiKey: string = "lm-studio"): void {
    const key = `${endpoint}:${apiKey}`;
    const entry = this.clients.get(key);
    if (entry) {
      entry.healthy = true;
      entry.lastUsed = Date.now();
    }
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);
  }

  cleanup(): void {
    const now = Date.now();
    const entries = Array.from(this.clients.entries());
    for (const [key, entry] of entries) {
      if (!entry.healthy || now - entry.lastUsed > this.maxAge) {
        this.clients.delete(key);
      }
    }
  }

  getStats(): {
    totalConnections: number;
    healthyConnections: number;
    unhealthyConnections: number;
    oldestConnectionAge: number;
  } {
    const now = Date.now();
    let healthyCount = 0;
    let oldestAge = 0;

    const values = Array.from(this.clients.values());
    for (const entry of values) {
      if (entry.healthy) healthyCount++;
      const age = now - entry.createdAt;
      if (age > oldestAge) oldestAge = age;
    }

    return {
      totalConnections: this.clients.size,
      healthyConnections: healthyCount,
      unhealthyConnections: this.clients.size - healthyCount,
      oldestConnectionAge: oldestAge,
    };
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clients.clear();
  }
}

export const llmConnectionPool = new LLMConnectionPool();
