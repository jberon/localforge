import logger from "../lib/logger";
import { BaseService, ManagedMap } from "../lib/base-service";

interface CacheEntry {
  response: string;
  tokensUsed: number;
  createdAt: number;
  expiresAt: number;
  hits: number;
}

interface PendingRequest {
  resolve: (value: string) => void;
  reject: (error: Error) => void;
  addedAt: number;
}

interface BatchRequest {
  id: string;
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
}

interface BatchResult {
  id: string;
  success: boolean;
  response?: string;
  error?: string;
  tokensUsed?: number;
}

export class LLMCacheService extends BaseService {
  private static instance: LLMCacheService;
  private cache: ManagedMap<string, CacheEntry>;
  private pendingRequests: ManagedMap<string, PendingRequest[]>;
  private requestQueue: BatchRequest[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private stats = {
    hits: 0,
    misses: 0,
    deduplicated: 0,
    batched: 0,
  };

  private readonly MAX_CACHE_SIZE = 1000;
  private readonly DEFAULT_TTL_MS = 1000 * 60 * 60;
  private readonly BATCH_DELAY_MS = 50;
  private readonly MAX_BATCH_SIZE = 5;

  private constructor() {
    super("LLMCacheService");
    this.cache = this.createManagedMap<string, CacheEntry>({ maxSize: 1000, strategy: "lru" });
    this.pendingRequests = this.createManagedMap<string, PendingRequest[]>({ maxSize: 200, strategy: "lru" });
  }

  static getInstance(): LLMCacheService {
    if (!LLMCacheService.instance) {
      LLMCacheService.instance = new LLMCacheService();
    }
    return LLMCacheService.instance;
  }

  generateCacheKey(prompt: string, systemPrompt?: string, temperature?: number): string {
    const normalizedPrompt = prompt.trim().toLowerCase();
    const keyContent = `${systemPrompt || ""}_${normalizedPrompt}_${temperature || 0.7}`;
    
    let hash = 0;
    for (let i = 0; i < keyContent.length; i++) {
      const char = keyContent.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  get(prompt: string, systemPrompt?: string, temperature?: number): string | null {
    const key = this.generateCacheKey(prompt, systemPrompt, temperature);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    entry.hits++;
    this.stats.hits++;
    logger.debug("LLM cache hit", { key, hits: entry.hits });
    return entry.response;
  }

  set(
    prompt: string,
    response: string,
    tokensUsed: number,
    systemPrompt?: string,
    temperature?: number,
    ttlMs?: number
  ): void {
    const key = this.generateCacheKey(prompt, systemPrompt, temperature);
    
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.evictOldest();
    }

    this.cache.set(key, {
      response,
      tokensUsed,
      createdAt: Date.now(),
      expiresAt: Date.now() + (ttlMs || this.DEFAULT_TTL_MS),
      hits: 0,
    });
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    const entries = this.cache.entries();
    for (const [key, entry] of entries) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  async deduplicate<T>(
    key: string,
    executor: () => Promise<T>
  ): Promise<T> {
    const pendingList = this.pendingRequests.get(key);
    
    if (pendingList && pendingList.length > 0) {
      this.stats.deduplicated++;
      logger.debug("Request deduplicated", { key, pendingCount: pendingList.length });
      
      return new Promise((resolve, reject) => {
        pendingList.push({ 
          resolve: resolve as (value: string) => void, 
          reject, 
          addedAt: Date.now() 
        });
      }) as Promise<T>;
    }

    this.pendingRequests.set(key, []);

    try {
      const result = await executor();
      
      const pending = this.pendingRequests.get(key) || [];
      for (const p of pending) {
        p.resolve(result as unknown as string);
      }
      
      return result;
    } catch (error) {
      const pending = this.pendingRequests.get(key) || [];
      for (const p of pending) {
        p.reject(error instanceof Error ? error : new Error(String(error)));
      }
      throw error;
    } finally {
      this.pendingRequests.delete(key);
    }
  }

  queueForBatch(request: BatchRequest): Promise<BatchResult> {
    return new Promise((resolve) => {
      this.requestQueue.push(request);
      this.stats.batched++;

      if (this.requestQueue.length >= this.MAX_BATCH_SIZE) {
        if (this.batchTimeout) {
          clearTimeout(this.batchTimeout);
          this.batchTimeout = null;
        }
        this.processBatch().then((results) => {
          const result = results.find(r => r.id === request.id);
          resolve(result || { id: request.id, success: false, error: "Not found in batch results" });
        });
      } else if (!this.batchTimeout) {
        this.batchTimeout = setTimeout(() => {
          this.batchTimeout = null;
          this.processBatch();
        }, this.BATCH_DELAY_MS);
      }
    });
  }

  private async processBatch(): Promise<BatchResult[]> {
    const batch = this.requestQueue.splice(0, this.MAX_BATCH_SIZE);
    
    if (batch.length === 0) {
      return [];
    }

    this.log("Processing LLM batch", { batchSize: batch.length });

    const results: BatchResult[] = batch.map(req => ({
      id: req.id,
      success: false,
      error: "Batch processing not implemented - use individual requests",
    }));

    return results;
  }

  getStats(): {
    hits: number;
    misses: number;
    hitRate: number;
    deduplicated: number;
    batched: number;
    cacheSize: number;
    pendingRequests: number;
  } {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      cacheSize: this.cache.size,
      pendingRequests: this.pendingRequests.size,
    };
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
    this.cache.clear();
    this.pendingRequests.clear();
    this.requestQueue = [];
    this.stats = { hits: 0, misses: 0, deduplicated: 0, batched: 0 };
    this.log("LLMCacheService shut down");
  }

  clearCache(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, deduplicated: 0, batched: 0 };
    this.log("LLM cache cleared");
  }

  getCacheEntries(): Array<{
    key: string;
    tokensUsed: number;
    hits: number;
    createdAt: number;
    expiresAt: number;
  }> {
    return this.cache.entries().map(([key, entry]) => ({
      key,
      tokensUsed: entry.tokensUsed,
      hits: entry.hits,
      createdAt: entry.createdAt,
      expiresAt: entry.expiresAt,
    }));
  }
}

export const llmCacheService = LLMCacheService.getInstance();
