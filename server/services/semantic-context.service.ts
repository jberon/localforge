import { BaseService, ManagedMap } from "../lib/base-service";

interface CodeChunk {
  id: string;
  projectId: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  type: 'function' | 'component' | 'class' | 'interface' | 'hook' | 'route' | 'block';
  exports: string[];
  imports: string[];
}

interface EmbeddingEntry {
  chunkId: string;
  embedding: number[];
  norm: number;
}

interface ProjectIndex {
  projectId: string;
  chunks: Map<string, CodeChunk>;
  embeddings: Map<string, EmbeddingEntry>;
  lastIndexed: number;
  totalChunks: number;
  totalFiles: number;
}

interface RetrievalResult {
  chunk: CodeChunk;
  similarity: number;
  reason: string;
}

const CHUNK_PATTERNS = {
  function: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
  component: /(?:export\s+)?(?:default\s+)?(?:function|const)\s+(\w+).*(?:=>|{)\s*(?:return\s+)?[(<]/,
  class: /(?:export\s+)?class\s+(\w+)/,
  interface: /(?:export\s+)?(?:interface|type)\s+(\w+)/,
  route: /(?:app|router)\.(\w+)\s*\(/,
};

const EMBEDDING_DIM = 256;
const LM_STUDIO_URL = "http://localhost:1234/v1/embeddings";
const LM_STUDIO_TIMEOUT = 5000;

class SemanticContextService extends BaseService {
  private static instance: SemanticContextService;
  private indices: ManagedMap<string, ProjectIndex>;

  private constructor() {
    super("SemanticContextService");
    this.indices = this.createManagedMap<string, ProjectIndex>({ maxSize: 50, strategy: "lru" });
  }

  static getInstance(): SemanticContextService {
    if (!SemanticContextService.instance) {
      SemanticContextService.instance = new SemanticContextService();
    }
    return SemanticContextService.instance;
  }

  async indexProject(projectId: string, files: Array<{ path: string; content: string }>): Promise<void> {
    this.log("Indexing project", { projectId, fileCount: files.length });

    const chunks: Map<string, CodeChunk> = new Map();
    const allChunks: CodeChunk[] = [];

    for (const file of files) {
      const fileChunks = this.chunkFile(file.path, file.content);
      for (const chunk of fileChunks) {
        chunk.projectId = projectId;
        chunks.set(chunk.id, chunk);
        allChunks.push(chunk);
      }
    }

    if (allChunks.length === 0) {
      this.logWarn("No chunks extracted from project files", { projectId });
      return;
    }

    const texts = allChunks.map(chunk => this.buildChunkText(chunk));
    const rawEmbeddings = await this.generateEmbeddings(texts);

    const embeddings: Map<string, EmbeddingEntry> = new Map();
    for (let i = 0; i < allChunks.length; i++) {
      const embedding = rawEmbeddings[i];
      const norm = this.computeNorm(embedding);
      embeddings.set(allChunks[i].id, {
        chunkId: allChunks[i].id,
        embedding,
        norm,
      });
    }

    const index: ProjectIndex = {
      projectId,
      chunks,
      embeddings,
      lastIndexed: Date.now(),
      totalChunks: allChunks.length,
      totalFiles: files.length,
    };

    this.indices.set(projectId, index);
    this.log("Project indexed", { projectId, totalChunks: allChunks.length, totalFiles: files.length });
  }

  private chunkFile(filePath: string, content: string): CodeChunk[] {
    const lines = content.split("\n");
    const chunks: CodeChunk[] = [];
    const imports = this.extractImports(content);
    const exports = this.extractExports(content);

    const boundaries: Array<{ startLine: number; type: CodeChunk["type"]; name: string }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (CHUNK_PATTERNS.class.test(line)) {
        const match = line.match(CHUNK_PATTERNS.class);
        boundaries.push({ startLine: i, type: "class", name: match ? match[1] : "unknown" });
      } else if (CHUNK_PATTERNS.interface.test(line)) {
        const match = line.match(CHUNK_PATTERNS.interface);
        boundaries.push({ startLine: i, type: "interface", name: match ? match[1] : "unknown" });
      } else if (CHUNK_PATTERNS.route.test(line)) {
        const match = line.match(CHUNK_PATTERNS.route);
        boundaries.push({ startLine: i, type: "route", name: match ? match[1] : "unknown" });
      } else if (CHUNK_PATTERNS.component.test(line)) {
        const match = line.match(CHUNK_PATTERNS.component);
        const name = match ? match[1] : "unknown";
        const isHook = name.startsWith("use") && name.length > 3 && name[3] === name[3].toUpperCase();
        boundaries.push({ startLine: i, type: isHook ? "hook" : "component", name });
      } else if (CHUNK_PATTERNS.function.test(line)) {
        const match = line.match(CHUNK_PATTERNS.function);
        const name = match ? match[1] : "unknown";
        const isHook = name.startsWith("use") && name.length > 3 && name[3] === name[3].toUpperCase();
        boundaries.push({ startLine: i, type: isHook ? "hook" : "function", name });
      }
    }

    if (boundaries.length === 0) {
      const blockSize = 50;
      for (let start = 0; start < lines.length; start += blockSize) {
        const end = Math.min(start + blockSize, lines.length);
        const chunkLines = lines.slice(start, end);
        if (chunkLines.join("").trim().length === 0) continue;

        chunks.push({
          id: `${filePath}:${start + 1}-${end}`,
          projectId: "",
          filePath,
          content: chunkLines.join("\n"),
          startLine: start + 1,
          endLine: end,
          type: "block",
          exports: this.filterRelevantExports(exports, chunkLines.join("\n")),
          imports: this.filterRelevantImports(imports, chunkLines.join("\n")),
        });
      }
      return chunks;
    }

    for (let i = 0; i < boundaries.length; i++) {
      const boundary = boundaries[i];
      const startLine = boundary.startLine;
      const nextStart = i + 1 < boundaries.length ? boundaries[i + 1].startLine : lines.length;

      let endLine = Math.min(startLine + 200, nextStart);
      endLine = Math.max(endLine, Math.min(startLine + 20, nextStart));

      const chunkContent = lines.slice(startLine, endLine).join("\n");

      chunks.push({
        id: `${filePath}:${startLine + 1}-${endLine}`,
        projectId: "",
        filePath,
        content: chunkContent,
        startLine: startLine + 1,
        endLine,
        type: boundary.type,
        exports: this.filterRelevantExports(exports, chunkContent),
        imports: this.filterRelevantImports(imports, chunkContent),
      });
    }

    return chunks;
  }

  private extractImports(content: string): string[] {
    const result: string[] = [];
    const pattern = /import\s+(?:\{[^}]*\}|[^;'"]+)\s+from\s+['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      result.push(match[1]);
    }
    return result;
  }

  private extractExports(content: string): string[] {
    const result: string[] = [];
    const patterns = [
      /export\s+(?:default\s+)?(?:function|class|const|let|var|type|interface)\s+(\w+)/g,
      /export\s+\{([^}]+)\}/g,
    ];
    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1]) {
          if (match[1].includes(",")) {
            result.push(...match[1].split(",").map(s => s.trim().split(/\s+/)[0]));
          } else {
            result.push(match[1]);
          }
        }
      }
    }
    return Array.from(new Set(result));
  }

  private filterRelevantExports(allExports: string[], chunkContent: string): string[] {
    return allExports.filter(exp => chunkContent.includes(exp));
  }

  private filterRelevantImports(allImports: string[], chunkContent: string): string[] {
    return allImports.filter(imp => chunkContent.includes(imp));
  }

  private buildChunkText(chunk: CodeChunk): string {
    const parts: string[] = [];
    parts.push(`file: ${chunk.filePath}`);
    parts.push(`type: ${chunk.type}`);
    if (chunk.exports.length > 0) {
      parts.push(`exports: ${chunk.exports.join(", ")}`);
    }
    if (chunk.imports.length > 0) {
      parts.push(`imports: ${chunk.imports.join(", ")}`);
    }
    parts.push(chunk.content);
    return parts.join("\n");
  }

  private async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const embeddings = await this.callLmStudio(texts);
      if (embeddings) {
        this.log("Generated embeddings via LM Studio", { count: texts.length });
        return embeddings;
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logWarn("LM Studio unavailable, using TF-IDF fallback", { error: errorMessage });
    }

    return texts.map(text => this.tfidfEmbedding(text));
  }

  private async callLmStudio(texts: string[]): Promise<number[][] | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LM_STUDIO_TIMEOUT);

    try {
      const response = await fetch(LM_STUDIO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: texts, model: "text-embedding" }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        data: Array<{ embedding: number[] }>;
      };

      if (!data.data || !Array.isArray(data.data)) {
        return null;
      }

      return data.data.map(entry => entry.embedding);
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private tfidfEmbedding(text: string): number[] {
    const vector = new Array<number>(EMBEDDING_DIM).fill(0);
    const words = text.toLowerCase().split(/[^a-z0-9_]+/).filter(w => w.length > 1);
    const totalWords = words.length;

    if (totalWords === 0) return vector;

    const freq: Map<string, number> = new Map();
    for (const word of words) {
      freq.set(word, (freq.get(word) || 0) + 1);
    }

    for (const [word, count] of Array.from(freq.entries())) {
      const hash = this.hashWord(word);
      const position = hash % EMBEDDING_DIM;
      const tf = count / totalWords;
      vector[position] += tf;
    }

    return vector;
  }

  private hashWord(word: string): number {
    let hash = 5381;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) + hash + word.charCodeAt(i)) >>> 0;
    }
    return hash;
  }

  private computeNorm(vector: number[]): number {
    let sum = 0;
    for (let i = 0; i < vector.length; i++) {
      sum += vector[i] * vector[i];
    }
    return Math.sqrt(sum);
  }

  private cosineSimilarity(a: number[], b: number[], normA: number, normB: number): number {
    if (normA === 0 || normB === 0) return 0;

    let dot = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
    }

    return dot / (normA * normB);
  }

  async retrieve(projectId: string, query: string, topK: number = 10): Promise<RetrievalResult[]> {
    const index = this.indices.get(projectId);
    if (!index) {
      this.logWarn("No index found for project", { projectId });
      return [];
    }

    const queryEmbeddings = await this.generateEmbeddings([query]);
    const queryEmbedding = queryEmbeddings[0];
    const queryNorm = this.computeNorm(queryEmbedding);

    const scored: Array<{ chunkId: string; similarity: number }> = [];

    for (const [chunkId, entry] of Array.from(index.embeddings.entries())) {
      const similarity = this.cosineSimilarity(queryEmbedding, entry.embedding, queryNorm, entry.norm);
      scored.push({ chunkId, similarity });
    }

    scored.sort((a, b) => b.similarity - a.similarity);

    const results: RetrievalResult[] = [];
    const topResults = scored.slice(0, topK);

    for (const item of topResults) {
      const chunk = index.chunks.get(item.chunkId);
      if (!chunk) continue;

      results.push({
        chunk,
        similarity: item.similarity,
        reason: `${chunk.type} in ${chunk.filePath} (lines ${chunk.startLine}-${chunk.endLine}), similarity: ${item.similarity.toFixed(4)}`,
      });
    }

    this.log("Retrieved context", { projectId, query: query.slice(0, 80), results: results.length });
    return results;
  }

  async getContextForGeneration(projectId: string, prompt: string, maxTokens: number = 4000): Promise<string> {
    const results = await this.retrieve(projectId, prompt);

    if (results.length === 0) {
      return "";
    }

    const parts: string[] = [];
    let tokenEstimate = 0;

    for (const result of results) {
      const entry = `// Relevant context from ${result.chunk.filePath} (lines ${result.chunk.startLine}-${result.chunk.endLine}):\n${result.chunk.content}\n`;
      const entryTokens = Math.ceil(entry.length / 4);

      if (tokenEstimate + entryTokens > maxTokens) break;

      parts.push(entry);
      tokenEstimate += entryTokens;
    }

    return parts.join("\n");
  }

  invalidateProject(projectId: string): void {
    const deleted = this.indices.delete(projectId);
    if (deleted) {
      this.log("Project index invalidated", { projectId });
    }
  }

  getIndexStats(projectId: string): { totalChunks: number; totalFiles: number; lastIndexed: number; embeddingDim: number } | null {
    const index = this.indices.get(projectId);
    if (!index) return null;

    return {
      totalChunks: index.totalChunks,
      totalFiles: index.totalFiles,
      lastIndexed: index.lastIndexed,
      embeddingDim: EMBEDDING_DIM,
    };
  }

  destroy(): void {
    this.indices.clear();
    this.log("SemanticContextService destroyed");
  }
}

export const semanticContextService = SemanticContextService.getInstance();
