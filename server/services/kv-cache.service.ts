import { BaseService, ManagedMap } from "../lib/base-service";
import * as crypto from "crypto";

export interface CacheEntry {
  id: string;
  projectId: string;
  contextHash: string;
  systemPromptHash: string;
  cacheData: string;
  tokenCount: number;
  createdAt: number;
  lastUsedAt: number;
  hitCount: number;
  modelName: string;
  taskType: string;
}

export interface CacheHitResult {
  hit: boolean;
  entry?: CacheEntry;
  prefixLength?: number;
  reusableTokens?: number;
  timeSavedMs?: number;
}

export interface CacheStats {
  totalEntries: number;
  totalTokensCached: number;
  hitRate: number;
  totalHits: number;
  totalMisses: number;
  avgTimeSavedMs: number;
  memoryUsageMB: number;
}

export interface CacheConfig {
  maxEntries: number;
  maxTokensPerEntry: number;
  maxTotalTokens: number;
  ttlMs: number;
  minReuseThreshold: number;
  enabled: boolean;
}

interface ConversationContext {
  messages: Array<{ role: string; content: string }>;
  systemPrompt: string;
  projectId: string;
}

class KVCacheService extends BaseService {
  private static instance: KVCacheService;
  private cache: ManagedMap<string, CacheEntry>;
  private contextIndex: ManagedMap<string, Set<string>>;
  private stats = {
    hits: 0,
    misses: 0,
    totalTimeSavedMs: 0,
  };
  private config: CacheConfig;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    super("KVCacheService");
    this.cache = this.createManagedMap<string, CacheEntry>({ maxSize: 1000, strategy: "lru" });
    this.contextIndex = this.createManagedMap<string, Set<string>>({ maxSize: 200, strategy: "lru" });
    this.config = {
      maxEntries: 100,
      maxTokensPerEntry: 8192,
      maxTotalTokens: 500000,
      ttlMs: 30 * 60 * 1000,
      minReuseThreshold: 0.5,
      enabled: true,
    };
    
    this.startCleanupInterval();
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.cache.clear();
    this.contextIndex.clear();
    this.log("KVCacheService shut down");
  }

  static getInstance(): KVCacheService {
    if (!KVCacheService.instance) {
      KVCacheService.instance = new KVCacheService();
    }
    return KVCacheService.instance;
  }

  configure(config: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...config };
    this.log("KVCacheService configured", { config: this.config });
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  private generateHash(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
  }

  private generateCacheKey(
    projectId: string,
    contextHash: string,
    systemPromptHash: string,
    modelName: string
  ): string {
    return `${projectId}:${modelName}:${systemPromptHash}:${contextHash}`;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 3.5);
  }

  private serializeContext(context: ConversationContext): string {
    return JSON.stringify({
      messages: context.messages.map(m => `${m.role}:${m.content.slice(0, 500)}`),
      systemPrompt: context.systemPrompt.slice(0, 1000),
    });
  }

  findCacheHit(
    projectId: string,
    systemPrompt: string,
    messages: Array<{ role: string; content: string }>,
    modelName: string
  ): CacheHitResult {
    if (!this.config.enabled) {
      this.stats.misses++;
      return { hit: false };
    }

    const systemPromptHash = this.generateHash(systemPrompt);
    const contextHash = this.generateHash(JSON.stringify(messages));
    const cacheKey = this.generateCacheKey(projectId, contextHash, systemPromptHash, modelName);

    const exactMatch = this.cache.get(cacheKey);
    if (exactMatch && Date.now() - exactMatch.createdAt < this.config.ttlMs) {
      exactMatch.lastUsedAt = Date.now();
      exactMatch.hitCount++;
      this.stats.hits++;

      const timeSavedMs = this.estimateTimeSaved(exactMatch.tokenCount);
      this.stats.totalTimeSavedMs += timeSavedMs;

      this.log("KV cache hit (exact)", {
        projectId,
        tokensCached: exactMatch.tokenCount,
        timeSavedMs,
      });

      return {
        hit: true,
        entry: exactMatch,
        prefixLength: exactMatch.tokenCount,
        reusableTokens: exactMatch.tokenCount,
        timeSavedMs,
      };
    }

    const prefixMatch = this.findPrefixMatch(projectId, systemPromptHash, messages, modelName);
    if (prefixMatch) {
      this.stats.hits++;
      return prefixMatch;
    }

    this.stats.misses++;
    return { hit: false };
  }

  private findPrefixMatch(
    projectId: string,
    systemPromptHash: string,
    messages: Array<{ role: string; content: string }>,
    modelName: string
  ): CacheHitResult | null {
    const projectEntries = this.contextIndex.get(projectId);
    if (!projectEntries) return null;

    let bestMatch: CacheHitResult | null = null;
    let maxPrefixLength = 0;

    for (const cacheKey of Array.from(projectEntries)) {
      const entry = this.cache.get(cacheKey);
      if (!entry) continue;
      if (entry.systemPromptHash !== systemPromptHash) continue;
      if (entry.modelName !== modelName) continue;
      if (Date.now() - entry.createdAt >= this.config.ttlMs) continue;

      const prefixLength = this.calculatePrefixOverlap(entry, messages);
      if (prefixLength > maxPrefixLength && prefixLength >= this.config.minReuseThreshold * entry.tokenCount) {
        maxPrefixLength = prefixLength;
        entry.lastUsedAt = Date.now();
        entry.hitCount++;

        const timeSavedMs = this.estimateTimeSaved(prefixLength);
        this.stats.totalTimeSavedMs += timeSavedMs;

        bestMatch = {
          hit: true,
          entry,
          prefixLength,
          reusableTokens: prefixLength,
          timeSavedMs,
        };
      }
    }

    if (bestMatch) {
      this.log("KV cache hit (prefix)", {
        projectId,
        prefixLength: maxPrefixLength,
        timeSavedMs: bestMatch.timeSavedMs,
      });
    }

    return bestMatch;
  }

  private calculatePrefixOverlap(
    entry: CacheEntry,
    messages: Array<{ role: string; content: string }>
  ): number {
    try {
      const cachedData = JSON.parse(entry.cacheData);
      const cachedMessages = cachedData.messages || [];
      
      let overlapTokens = 0;
      const minLength = Math.min(cachedMessages.length, messages.length);
      
      for (let i = 0; i < minLength; i++) {
        const cached = cachedMessages[i];
        const current = `${messages[i].role}:${messages[i].content.slice(0, 500)}`;
        
        if (cached === current) {
          overlapTokens += this.estimateTokens(messages[i].content);
        } else {
          break;
        }
      }
      
      return overlapTokens;
    } catch {
      return 0;
    }
  }

  private estimateTimeSaved(tokenCount: number): number {
    const tokensPerSecond = 30;
    return Math.floor((tokenCount / tokensPerSecond) * 1000);
  }

  storeContext(
    projectId: string,
    systemPrompt: string,
    messages: Array<{ role: string; content: string }>,
    modelName: string,
    taskType: string
  ): string {
    if (!this.config.enabled) return "";

    this.enforceCapacity();

    const systemPromptHash = this.generateHash(systemPrompt);
    const contextHash = this.generateHash(JSON.stringify(messages));
    const cacheKey = this.generateCacheKey(projectId, contextHash, systemPromptHash, modelName);

    const context: ConversationContext = {
      messages,
      systemPrompt,
      projectId,
    };

    const tokenCount = this.estimateTokens(systemPrompt) + 
      messages.reduce((sum, m) => sum + this.estimateTokens(m.content), 0);

    if (tokenCount > this.config.maxTokensPerEntry) {
      this.logWarn("Context too large for cache", { tokenCount, max: this.config.maxTokensPerEntry });
      return "";
    }

    const entry: CacheEntry = {
      id: cacheKey,
      projectId,
      contextHash,
      systemPromptHash,
      cacheData: this.serializeContext(context),
      tokenCount,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      hitCount: 0,
      modelName,
      taskType,
    };

    this.cache.set(cacheKey, entry);

    if (!this.contextIndex.has(projectId)) {
      this.contextIndex.set(projectId, new Set());
    }
    this.contextIndex.get(projectId)!.add(cacheKey);

    this.log("Context cached", { projectId, tokenCount, cacheKey: cacheKey.slice(0, 20) });

    return cacheKey;
  }

  invalidateProject(projectId: string): number {
    const projectEntries = this.contextIndex.get(projectId);
    if (!projectEntries) return 0;

    let count = 0;
    for (const cacheKey of Array.from(projectEntries)) {
      if (this.cache.delete(cacheKey)) {
        count++;
      }
    }

    this.contextIndex.delete(projectId);
    this.log("Project cache invalidated", { projectId, entriesRemoved: count });

    return count;
  }

  invalidateEntry(cacheKey: string): boolean {
    const entry = this.cache.get(cacheKey);
    if (!entry) return false;

    const projectEntries = this.contextIndex.get(entry.projectId);
    if (projectEntries) {
      projectEntries.delete(cacheKey);
    }

    return this.cache.delete(cacheKey);
  }

  private enforceCapacity(): void {
    if (this.cache.size < this.config.maxEntries) {
      let totalTokens = 0;
      for (const entry of this.cache.values()) {
        totalTokens += entry.tokenCount;
      }
      if (totalTokens < this.config.maxTotalTokens) return;
    }

    const entries = this.cache.entries()
      .sort((a, b) => {
        const scoreA = this.calculateEvictionScore(a[1]);
        const scoreB = this.calculateEvictionScore(b[1]);
        return scoreA - scoreB;
      });

    const toRemove = Math.max(1, Math.floor(this.cache.size * 0.2));
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      this.invalidateEntry(entries[i][0]);
    }

    this.log("Cache eviction completed", { removed: toRemove, remaining: this.cache.size });
  }

  private calculateEvictionScore(entry: CacheEntry): number {
    const age = Date.now() - entry.createdAt;
    const recency = Date.now() - entry.lastUsedAt;
    const frequency = entry.hitCount;
    const size = entry.tokenCount;

    return (frequency * 1000) / (recency + 1) - (age / 60000) - (size / 1000);
  }

  private startCleanupInterval(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, 5 * 60 * 1000);
  }

  private cleanupExpired(): void {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.createdAt >= this.config.ttlMs) {
        this.invalidateEntry(key);
        removed++;
      }
    }

    if (removed > 0) {
      this.log("Expired cache entries cleaned", { removed });
    }
  }

  getStats(): CacheStats {
    let totalTokens = 0;
    let memoryBytes = 0;

    for (const entry of this.cache.values()) {
      totalTokens += entry.tokenCount;
      memoryBytes += entry.cacheData.length * 2;
    }

    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    const avgTimeSaved = this.stats.hits > 0 ? this.stats.totalTimeSavedMs / this.stats.hits : 0;

    return {
      totalEntries: this.cache.size,
      totalTokensCached: totalTokens,
      hitRate,
      totalHits: this.stats.hits,
      totalMisses: this.stats.misses,
      avgTimeSavedMs: Math.round(avgTimeSaved),
      memoryUsageMB: Math.round(memoryBytes / (1024 * 1024) * 100) / 100,
    };
  }

  getProjectEntries(projectId: string): CacheEntry[] {
    const projectKeys = this.contextIndex.get(projectId);
    if (!projectKeys) return [];

    const entries: CacheEntry[] = [];
    for (const key of Array.from(projectKeys)) {
      const entry = this.cache.get(key);
      if (entry) entries.push(entry);
    }

    return entries;
  }

  clearAll(): void {
    this.cache.clear();
    this.contextIndex.clear();
    this.stats = { hits: 0, misses: 0, totalTimeSavedMs: 0 };
    this.log("KV cache cleared");
  }

  resetStats(): void {
    this.stats = { hits: 0, misses: 0, totalTimeSavedMs: 0 };
  }
}

export const kvCacheService = KVCacheService.getInstance();
