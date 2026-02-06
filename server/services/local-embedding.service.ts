import { BaseService, ManagedMap } from "../lib/base-service";
import { getLLMConfig } from "../llm-client";

export interface EmbeddingResult {
  text: string;
  embedding: number[];
  tokenCount: number;
}

export interface SimilarityResult {
  text: string;
  similarity: number;
  index: number;
}

export interface SemanticSearchResult {
  matches: SimilarityResult[];
  queryEmbedding: number[];
  searchTimeMs: number;
}

export interface EmbeddingConfig {
  model: string;
  endpoint: string;
  dimensions: number;
  maxBatchSize: number;
  cacheEnabled: boolean;
  enabled: boolean;
}

interface CachedEmbedding {
  embedding: number[];
  createdAt: number;
}

class LocalEmbeddingService extends BaseService {
  private static instance: LocalEmbeddingService;
  private config: EmbeddingConfig;
  private embeddingCache: ManagedMap<string, CachedEmbedding>;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private cacheMaxSize = 10000;
  private cacheTTLMs = 60 * 60 * 1000;

  private constructor() {
    super("LocalEmbeddingService");
    const llmConfig = getLLMConfig();
    this.config = {
      model: "nomic-embed-text",
      endpoint: llmConfig.defaultEndpoint,
      dimensions: 768,
      maxBatchSize: 32,
      cacheEnabled: true,
      enabled: true,
    };
    this.embeddingCache = this.createManagedMap<string, CachedEmbedding>({ maxSize: 1000, strategy: "lru" });
    
    this.startCacheCleanup();
  }

  static getInstance(): LocalEmbeddingService {
    if (!LocalEmbeddingService.instance) {
      LocalEmbeddingService.instance = new LocalEmbeddingService();
    }
    return LocalEmbeddingService.instance;
  }

  configure(config: Partial<EmbeddingConfig>): void {
    this.config = { ...this.config, ...config };
    this.log("LocalEmbeddingService configured", { config: this.config });
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  private hashText(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  async getEmbedding(text: string): Promise<number[]> {
    if (!this.config.enabled) {
      return this.generateFallbackEmbedding(text);
    }

    const cacheKey = this.hashText(text);
    if (this.config.cacheEnabled) {
      const cached = this.embeddingCache.get(cacheKey);
      if (cached && Date.now() - cached.createdAt < this.cacheTTLMs) {
        return cached.embedding;
      }
    }

    try {
      const embedding = await this.callEmbeddingAPI(text);
      
      if (this.config.cacheEnabled) {
        this.enforceCache();
        this.embeddingCache.set(cacheKey, {
          embedding,
          createdAt: Date.now(),
        });
      }
      
      return embedding;
    } catch (error) {
      this.logWarn("Embedding API failed, using fallback", { error });
      return this.generateFallbackEmbedding(text);
    }
  }

  private async callEmbeddingAPI(text: string): Promise<number[]> {
    const response = await fetch(`${this.config.endpoint}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.config.model,
        input: text.slice(0, 8192),
      }),
    });

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data?.[0]?.embedding || this.generateFallbackEmbedding(text);
  }

  async getBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.config.enabled) {
      return texts.map(t => this.generateFallbackEmbedding(t));
    }

    const results: number[][] = [];
    const uncachedIndices: number[] = [];
    const uncachedTexts: string[] = [];

    for (let i = 0; i < texts.length; i++) {
      const cacheKey = this.hashText(texts[i]);
      const cached = this.embeddingCache.get(cacheKey);
      
      if (cached && Date.now() - cached.createdAt < this.cacheTTLMs) {
        results[i] = cached.embedding;
      } else {
        uncachedIndices.push(i);
        uncachedTexts.push(texts[i]);
      }
    }

    if (uncachedTexts.length > 0) {
      const batchResults = await this.callBatchEmbeddingAPI(uncachedTexts);
      
      for (let j = 0; j < uncachedIndices.length; j++) {
        const index = uncachedIndices[j];
        const embedding = batchResults[j];
        results[index] = embedding;
        
        if (this.config.cacheEnabled) {
          const cacheKey = this.hashText(texts[index]);
          this.embeddingCache.set(cacheKey, {
            embedding,
            createdAt: Date.now(),
          });
        }
      }
    }

    return results;
  }

  private async callBatchEmbeddingAPI(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    
    for (let i = 0; i < texts.length; i += this.config.maxBatchSize) {
      const batch = texts.slice(i, i + this.config.maxBatchSize);
      
      try {
        const response = await fetch(`${this.config.endpoint}/embeddings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: this.config.model,
            input: batch.map(t => t.slice(0, 8192)),
          }),
        });

        if (!response.ok) {
          throw new Error(`Batch embedding error: ${response.status}`);
        }

        const data = await response.json();
        const embeddings = data.data?.map((d: any) => d.embedding) || [];
        
        for (let j = 0; j < batch.length; j++) {
          results.push(embeddings[j] || this.generateFallbackEmbedding(batch[j]));
        }
      } catch (error) {
        this.logWarn("Batch embedding failed", { error, batchSize: batch.length });
        for (const text of batch) {
          results.push(this.generateFallbackEmbedding(text));
        }
      }
    }
    
    return results;
  }

  private generateFallbackEmbedding(text: string): number[] {
    const embedding = new Array(this.config.dimensions).fill(0);
    const words = text.toLowerCase().split(/\s+/);
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      for (let j = 0; j < word.length; j++) {
        const charCode = word.charCodeAt(j);
        const index = (charCode * (i + 1) * (j + 1)) % this.config.dimensions;
        embedding[index] += 1 / words.length;
      }
    }
    
    const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0)) || 1;
    return embedding.map(v => v / magnitude);
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let magA = 0;
    let magB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    
    const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  async semanticSearch(
    query: string,
    documents: string[],
    topK: number = 5
  ): Promise<SemanticSearchResult> {
    const startTime = Date.now();
    
    const queryEmbedding = await this.getEmbedding(query);
    const docEmbeddings = await this.getBatchEmbeddings(documents);
    
    const similarities: SimilarityResult[] = documents.map((text, index) => ({
      text,
      similarity: this.cosineSimilarity(queryEmbedding, docEmbeddings[index]),
      index,
    }));
    
    similarities.sort((a, b) => b.similarity - a.similarity);
    
    const matches = similarities.slice(0, topK);
    const searchTimeMs = Date.now() - startTime;
    
    this.log("Semantic search completed", {
      documents: documents.length,
      topK,
      searchTimeMs,
      topSimilarity: matches[0]?.similarity || 0,
    });
    
    return {
      matches,
      queryEmbedding,
      searchTimeMs,
    };
  }

  async findRelevantCode(
    query: string,
    codeFiles: Array<{ path: string; content: string }>,
    topK: number = 5
  ): Promise<Array<{ path: string; content: string; similarity: number }>> {
    const documents = codeFiles.map(f => `${f.path}\n${f.content.slice(0, 2000)}`);
    const result = await this.semanticSearch(query, documents, topK);
    
    return result.matches.map(match => ({
      path: codeFiles[match.index].path,
      content: codeFiles[match.index].content,
      similarity: match.similarity,
    }));
  }

  async clusterDocuments(
    documents: string[],
    numClusters: number = 3
  ): Promise<Map<number, string[]>> {
    const embeddings = await this.getBatchEmbeddings(documents);
    
    const centroids: number[][] = [];
    const step = Math.floor(documents.length / numClusters);
    for (let i = 0; i < numClusters; i++) {
      centroids.push([...embeddings[i * step]]);
    }
    
    const clusters = new Map<number, string[]>();
    for (let i = 0; i < numClusters; i++) {
      clusters.set(i, []);
    }
    
    for (let iter = 0; iter < 10; iter++) {
      for (let i = 0; i < numClusters; i++) {
        clusters.set(i, []);
      }
      
      for (let i = 0; i < documents.length; i++) {
        let bestCluster = 0;
        let bestSimilarity = -1;
        
        for (let j = 0; j < numClusters; j++) {
          const similarity = this.cosineSimilarity(embeddings[i], centroids[j]);
          if (similarity > bestSimilarity) {
            bestSimilarity = similarity;
            bestCluster = j;
          }
        }
        
        clusters.get(bestCluster)!.push(documents[i]);
      }
      
      for (let j = 0; j < numClusters; j++) {
        const clusterDocs = clusters.get(j)!;
        if (clusterDocs.length === 0) continue;
        
        const newCentroid = new Array(this.config.dimensions).fill(0);
        for (const doc of clusterDocs) {
          const docIndex = documents.indexOf(doc);
          for (let d = 0; d < this.config.dimensions; d++) {
            newCentroid[d] += embeddings[docIndex][d];
          }
        }
        for (let d = 0; d < this.config.dimensions; d++) {
          newCentroid[d] /= clusterDocs.length;
        }
        centroids[j] = newCentroid;
      }
    }
    
    return clusters;
  }

  private enforceCache(): void {
    if (this.embeddingCache.size < this.cacheMaxSize) return;
    
    const entries = this.embeddingCache.entries()
      .sort((a, b) => a[1].createdAt - b[1].createdAt);
    
    const toRemove = Math.floor(this.cacheMaxSize * 0.2);
    for (let i = 0; i < toRemove; i++) {
      this.embeddingCache.delete(entries[i][0]);
    }
  }

  private startCacheCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.embeddingCache.entries()) {
        if (now - value.createdAt >= this.cacheTTLMs) {
          this.embeddingCache.delete(key);
        }
      }
    }, 10 * 60 * 1000);
  }

  getCacheStats(): { size: number; maxSize: number; hitRate: number } {
    return {
      size: this.embeddingCache.size,
      maxSize: this.cacheMaxSize,
      hitRate: 0,
    };
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.embeddingCache.clear();
    this.log("LocalEmbeddingService shut down");
  }

  clearCache(): void {
    this.embeddingCache.clear();
  }
}

export const localEmbeddingService = LocalEmbeddingService.getInstance();
