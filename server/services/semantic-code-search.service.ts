import { logger } from "../lib/logger";

interface CodeChunk {
  id: string;
  projectId: string;
  filePath: string;
  content: string;
  type: "function" | "component" | "class" | "hook" | "utility" | "type" | "constant";
  name: string;
  embedding?: number[];
  metadata: {
    imports: string[];
    exports: string[];
    dependencies: string[];
    lineStart: number;
    lineEnd: number;
  };
}

interface SearchResult {
  chunk: CodeChunk;
  score: number;
  matchType: "exact" | "semantic" | "structural";
  highlights: string[];
}

interface CodeIndex {
  projectId: string;
  chunks: CodeChunk[];
  lastUpdated: number;
}

class SemanticCodeSearchService {
  private static instance: SemanticCodeSearchService;
  private indices: Map<string, CodeIndex> = new Map();
  private tokenWeights: Map<string, number> = new Map();
  private readonly MAX_INDICES = 100;

  private constructor() {
    this.initializeTokenWeights();
  }

  static getInstance(): SemanticCodeSearchService {
    if (!SemanticCodeSearchService.instance) {
      SemanticCodeSearchService.instance = new SemanticCodeSearchService();
    }
    return SemanticCodeSearchService.instance;
  }

  private initializeTokenWeights(): void {
    const highWeight = ["function", "class", "interface", "type", "export", "import"];
    const mediumWeight = ["const", "let", "var", "return", "async", "await"];
    const lowWeight = ["if", "else", "for", "while", "switch", "case"];

    highWeight.forEach(t => this.tokenWeights.set(t, 3.0));
    mediumWeight.forEach(t => this.tokenWeights.set(t, 2.0));
    lowWeight.forEach(t => this.tokenWeights.set(t, 1.0));
  }

  indexProject(projectId: string, files: Array<{ path: string; content: string }>): number {
    logger.info("Indexing project for semantic search", { projectId, fileCount: files.length });

    const chunks: CodeChunk[] = [];

    for (const file of files) {
      if (!this.isCodeFile(file.path)) continue;

      const extractedChunks = this.extractChunks(projectId, file.path, file.content);
      chunks.push(...extractedChunks);
    }

    for (const chunk of chunks) {
      chunk.embedding = this.computeEmbedding(chunk.content);
    }

    this.indices.set(projectId, {
      projectId,
      chunks,
      lastUpdated: Date.now()
    });

    if (this.indices.size > this.MAX_INDICES) {
      const oldest = Array.from(this.indices.entries())
        .sort((a, b) => a[1].lastUpdated - b[1].lastUpdated);
      const toRemove = oldest.slice(0, this.indices.size - this.MAX_INDICES);
      for (const [removeId] of toRemove) {
        this.indices.delete(removeId);
      }
    }

    logger.info("Project indexed", { projectId, chunkCount: chunks.length });
    return chunks.length;
  }

  private isCodeFile(path: string): boolean {
    const codeExtensions = [".ts", ".tsx", ".js", ".jsx", ".vue", ".svelte"];
    return codeExtensions.some(ext => path.endsWith(ext));
  }

  private extractChunks(projectId: string, filePath: string, content: string): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const lines = content.split("\n");

    const functionPattern = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
    const arrowPattern = /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g;
    const componentPattern = /(?:export\s+)?(?:const|function)\s+([A-Z]\w*)/g;
    const classPattern = /(?:export\s+)?class\s+(\w+)/g;
    const hookPattern = /(?:export\s+)?(?:const|function)\s+(use\w+)/g;
    const typePattern = /(?:export\s+)?(?:type|interface)\s+(\w+)/g;

    const patterns = [
      { regex: hookPattern, type: "hook" as const },
      { regex: componentPattern, type: "component" as const },
      { regex: functionPattern, type: "function" as const },
      { regex: arrowPattern, type: "function" as const },
      { regex: classPattern, type: "class" as const },
      { regex: typePattern, type: "type" as const }
    ];

    const processedNames = new Set<string>();

    for (const { regex, type } of patterns) {
      let match;
      const regexCopy = new RegExp(regex.source, regex.flags);
      
      while ((match = regexCopy.exec(content)) !== null) {
        const name = match[1];
        if (processedNames.has(name)) continue;
        processedNames.add(name);

        const startIndex = match.index;
        const lineStart = content.substring(0, startIndex).split("\n").length;
        
        const chunkContent = this.extractFullDefinition(content, startIndex);
        const lineEnd = lineStart + chunkContent.split("\n").length - 1;

        const imports = this.extractImports(content);
        const exports = this.extractExports(content);

        chunks.push({
          id: `${projectId}:${filePath}:${name}`,
          projectId,
          filePath,
          content: chunkContent,
          type,
          name,
          metadata: {
            imports,
            exports,
            dependencies: this.extractDependencies(chunkContent),
            lineStart,
            lineEnd
          }
        });
      }
    }

    return chunks;
  }

  private extractFullDefinition(content: string, startIndex: number): string {
    let braceCount = 0;
    let started = false;
    let endIndex = startIndex;

    for (let i = startIndex; i < content.length; i++) {
      const char = content[i];
      
      if (char === "{" || char === "(") {
        braceCount++;
        started = true;
      } else if (char === "}" || char === ")") {
        braceCount--;
      }

      if (started && braceCount === 0) {
        endIndex = i + 1;
        break;
      }

      if (i - startIndex > 5000) {
        endIndex = i;
        break;
      }
    }

    return content.substring(startIndex, endIndex);
  }

  private extractImports(content: string): string[] {
    const imports: string[] = [];
    const pattern = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      imports.push(match[1]);
    }
    return imports;
  }

  private extractExports(content: string): string[] {
    const exports: string[] = [];
    const pattern = /export\s+(?:const|function|class|type|interface)\s+(\w+)/g;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      exports.push(match[1]);
    }
    return exports;
  }

  private extractDependencies(content: string): string[] {
    const deps = new Set<string>();
    
    const callPattern = /(\w+)\s*\(/g;
    let match;
    while ((match = callPattern.exec(content)) !== null) {
      const name = match[1];
      if (!["if", "for", "while", "switch", "function", "return"].includes(name)) {
        deps.add(name);
      }
    }

    return Array.from(deps);
  }

  private computeEmbedding(content: string): number[] {
    const tokens = content.toLowerCase().split(/\W+/).filter(t => t.length > 1);
    const tokenCounts = new Map<string, number>();
    
    for (const token of tokens) {
      tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
    }

    const embedding: number[] = new Array(128).fill(0);
    
    for (const [token, count] of Array.from(tokenCounts.entries())) {
      const weight = this.tokenWeights.get(token) || 1.0;
      const hash = this.simpleHash(token);
      
      for (let i = 0; i < 4; i++) {
        const idx = (hash + i * 31) % 128;
        embedding[idx] += count * weight;
      }
    }

    const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude;
      }
    }

    return embedding;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  search(projectId: string, query: string, limit: number = 10): SearchResult[] {
    const index = this.indices.get(projectId);
    if (!index) {
      logger.warn("No index found for project", { projectId });
      return [];
    }

    const queryLower = query.toLowerCase();
    const queryEmbedding = this.computeEmbedding(query);
    const results: SearchResult[] = [];

    for (const chunk of index.chunks) {
      let score = 0;
      let matchType: "exact" | "semantic" | "structural" = "semantic";
      const highlights: string[] = [];

      if (chunk.name.toLowerCase().includes(queryLower)) {
        score += 10;
        matchType = "exact";
        highlights.push(`Name match: ${chunk.name}`);
      }

      if (chunk.content.toLowerCase().includes(queryLower)) {
        score += 5;
        if (matchType !== "exact") matchType = "exact";
        highlights.push("Content contains query");
      }

      if (chunk.embedding) {
        const similarity = this.cosineSimilarity(queryEmbedding, chunk.embedding);
        score += similarity * 3;
        if (similarity > 0.5) {
          highlights.push(`Semantic similarity: ${(similarity * 100).toFixed(0)}%`);
        }
      }

      const queryTokens = queryLower.split(/\W+/).filter(t => t.length > 1);
      const chunkTokens = new Set(chunk.content.toLowerCase().split(/\W+/));
      const tokenOverlap = queryTokens.filter(t => chunkTokens.has(t)).length;
      if (tokenOverlap > 0) {
        score += tokenOverlap * 0.5;
        highlights.push(`${tokenOverlap} token matches`);
      }

      if (score > 0.5) {
        results.push({ chunk, score, matchType, highlights });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
    return magnitude > 0 ? dotProduct / magnitude : 0;
  }

  findSimilar(projectId: string, code: string, limit: number = 5): SearchResult[] {
    const index = this.indices.get(projectId);
    if (!index) return [];

    const queryEmbedding = this.computeEmbedding(code);
    const results: SearchResult[] = [];

    for (const chunk of index.chunks) {
      if (!chunk.embedding) continue;

      const similarity = this.cosineSimilarity(queryEmbedding, chunk.embedding);
      
      if (similarity > 0.3) {
        results.push({
          chunk,
          score: similarity,
          matchType: "semantic",
          highlights: [`Similarity: ${(similarity * 100).toFixed(0)}%`]
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  getChunksByType(projectId: string, type: CodeChunk["type"]): CodeChunk[] {
    const index = this.indices.get(projectId);
    if (!index) return [];
    return index.chunks.filter(c => c.type === type);
  }

  getStats(projectId: string): { totalChunks: number; byType: Record<string, number> } | null {
    const index = this.indices.get(projectId);
    if (!index) return null;

    const byType: Record<string, number> = {};
    for (const chunk of index.chunks) {
      byType[chunk.type] = (byType[chunk.type] || 0) + 1;
    }

    return {
      totalChunks: index.chunks.length,
      byType
    };
  }

  clearIndex(projectId: string): void {
    this.indices.delete(projectId);
    logger.info("Index cleared", { projectId });
  }

  destroy(): void {
    this.indices.clear();
    this.tokenWeights.clear();
  }
}

export const semanticCodeSearchService = SemanticCodeSearchService.getInstance();
