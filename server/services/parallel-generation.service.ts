import { BaseService } from "../lib/base-service";

interface FileTask {
  filePath: string;
  description: string;
  dependencies: string[];
  priority: number;
  type: "component" | "api" | "util" | "config" | "style" | "test";
}

interface GenerationBatch {
  batchId: number;
  files: FileTask[];
  canParallelize: boolean;
}

interface DependencyGraph {
  nodes: Map<string, FileTask>;
  edges: Map<string, Set<string>>;
}

class ParallelGenerationService extends BaseService {
  private static instance: ParallelGenerationService;
  private maxConcurrency: number = 3;

  private constructor() {
    super("ParallelGenerationService");
  }

  static getInstance(): ParallelGenerationService {
    if (!ParallelGenerationService.instance) {
      ParallelGenerationService.instance = new ParallelGenerationService();
    }
    return ParallelGenerationService.instance;
  }

  setMaxConcurrency(value: number): void {
    this.maxConcurrency = Math.max(1, Math.min(value, 8));
    this.log("Max concurrency updated", { maxConcurrency: this.maxConcurrency });
  }

  analyzeFileDependencies(files: FileTask[]): DependencyGraph {
    const graph: DependencyGraph = {
      nodes: new Map(),
      edges: new Map(),
    };

    for (const file of files) {
      graph.nodes.set(file.filePath, file);
      graph.edges.set(file.filePath, new Set(file.dependencies));
    }

    return graph;
  }

  detectFileType(filePath: string): FileTask["type"] {
    const lower = filePath.toLowerCase();
    
    if (lower.includes(".test.") || lower.includes(".spec.") || lower.includes("__tests__") || lower.includes("/tests/") || lower.includes("/test/")) {
      return "test";
    }
    if (lower.endsWith(".css") || lower.endsWith(".scss") || lower.includes("styles")) {
      return "style";
    }
    if (lower.includes("config") || lower.endsWith(".json") || lower.endsWith(".env")) {
      return "config";
    }
    if (lower.includes("/utils/") || lower.includes("/lib/") || lower.includes("/helpers/")) {
      return "util";
    }
    if (lower.includes("/api/") || lower.includes("/routes") || lower.includes("server/")) {
      return "api";
    }
    if (lower.includes("/components/") || (lower.endsWith(".tsx") && !lower.includes("/pages/"))) {
      return "component";
    }
    
    return "component";
  }

  inferDependencies(filePath: string, allFiles: string[]): string[] {
    const deps: string[] = [];
    const fileType = this.detectFileType(filePath);
    
    for (const otherFile of allFiles) {
      if (otherFile === filePath) continue;
      
      const otherType = this.detectFileType(otherFile);
      
      if (fileType === "component" && otherType === "util") {
        deps.push(otherFile);
      }
      if (fileType === "component" && otherType === "api") {
        deps.push(otherFile);
      }
      if (fileType === "test") {
        const baseName = filePath.replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, "");
        if (otherFile.startsWith(baseName)) {
          deps.push(otherFile);
        }
      }
      if (fileType === "api" && otherType === "config") {
        deps.push(otherFile);
      }
    }
    
    return deps;
  }

  topologicalSort(graph: DependencyGraph): string[] {
    const visited = new Set<string>();
    const result: string[] = [];
    const temp = new Set<string>();

    const visit = (node: string): void => {
      if (temp.has(node)) {
        this.logWarn("Circular dependency detected", { node });
        return;
      }
      if (visited.has(node)) return;

      temp.add(node);
      
      const deps = graph.edges.get(node) || new Set();
      Array.from(deps).forEach((dep) => {
        if (graph.nodes.has(dep)) {
          visit(dep);
        }
      });
      
      temp.delete(node);
      visited.add(node);
      result.push(node);
    };

    Array.from(graph.nodes.keys()).forEach((node) => {
      if (!visited.has(node)) {
        visit(node);
      }
    });

    return result;
  }

  createBatches(files: FileTask[]): GenerationBatch[] {
    const graph = this.analyzeFileDependencies(files);
    const sortedFiles = this.topologicalSort(graph);
    const batches: GenerationBatch[] = [];
    
    const completed = new Set<string>();
    let batchId = 0;
    
    while (completed.size < files.length) {
      const currentBatch: FileTask[] = [];
      
      for (const filePath of sortedFiles) {
        if (completed.has(filePath)) continue;
        
        const file = graph.nodes.get(filePath);
        if (!file) continue;
        
        const allDepsCompleted = file.dependencies.every(dep => 
          completed.has(dep) || !graph.nodes.has(dep)
        );
        
        if (allDepsCompleted && currentBatch.length < this.maxConcurrency) {
          currentBatch.push(file);
        }
      }
      
      if (currentBatch.length === 0) {
        const remaining = sortedFiles.filter(f => !completed.has(f));
        if (remaining.length > 0) {
          const file = graph.nodes.get(remaining[0]);
          if (file) {
            currentBatch.push(file);
            this.logWarn("Breaking dependency cycle", { file: remaining[0] });
          }
        }
      }
      
      for (const file of currentBatch) {
        completed.add(file.filePath);
      }
      
      if (currentBatch.length > 0) {
        batches.push({
          batchId: batchId++,
          files: currentBatch,
          canParallelize: currentBatch.length > 1,
        });
      }
    }
    
    this.log("Created generation batches", {
      totalFiles: files.length,
      totalBatches: batches.length,
      parallelBatches: batches.filter(b => b.canParallelize).length,
    });
    
    return batches;
  }

  async executeInParallel<T>(
    tasks: Array<() => Promise<T>>,
    onProgress?: (completed: number, total: number) => void
  ): Promise<T[]> {
    const results: T[] = [];
    let completed = 0;
    
    const chunks: Array<Array<() => Promise<T>>> = [];
    for (let i = 0; i < tasks.length; i += this.maxConcurrency) {
      chunks.push(tasks.slice(i, i + this.maxConcurrency));
    }
    
    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(async (task) => {
          try {
            const result = await task();
            completed++;
            onProgress?.(completed, tasks.length);
            return result;
          } catch (error) {
            completed++;
            onProgress?.(completed, tasks.length);
            throw error;
          }
        })
      );
      results.push(...chunkResults);
    }
    
    return results;
  }

  estimateSpeedup(batches: GenerationBatch[]): number {
    const sequentialTime = batches.reduce((sum, batch) => sum + batch.files.length, 0);
    const parallelTime = batches.length;
    
    if (parallelTime === 0) return 1;
    
    return Math.round((sequentialTime / parallelTime) * 10) / 10;
  }

  prepareFileTasks(fileDescriptions: Array<{ path: string; description: string }>): FileTask[] {
    const allPaths = fileDescriptions.map(f => f.path);
    
    return fileDescriptions.map(file => ({
      filePath: file.path,
      description: file.description,
      dependencies: this.inferDependencies(file.path, allPaths),
      priority: this.calculatePriority(file.path),
      type: this.detectFileType(file.path),
    }));
  }

  private calculatePriority(filePath: string): number {
    const type = this.detectFileType(filePath);
    
    const priorities: Record<FileTask["type"], number> = {
      config: 1,
      util: 2,
      api: 3,
      component: 4,
      style: 5,
      test: 6,
    };
    
    return priorities[type] || 5;
  }

  destroy(): void {
    this.log("ParallelGenerationService destroyed");
  }
}

export const parallelGenerationService = ParallelGenerationService.getInstance();
