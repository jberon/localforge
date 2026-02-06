import { BaseService, ManagedMap } from "../lib/base-service";

interface FileInfo {
  path: string;
  content: string;
}

interface ContextFile {
  path: string;
  content: string;
  relevanceScore: number;
  reason: string;
}

interface InjectionResult {
  injectedFiles: ContextFile[];
  totalTokensEstimate: number;
  pruningApplied: boolean;
  contextSummary: string;
}

interface DependencyGraph {
  nodes: Map<string, Set<string>>;
  reverseNodes: Map<string, Set<string>>;
}

class AutoContextInjectionService extends BaseService {
  private static instance: AutoContextInjectionService;
  private dependencyGraphs: ManagedMap<string, DependencyGraph>;
  private graphLastAccess: ManagedMap<string, number>;
  private readonly maxGraphs = 50;
  private readonly graphTTLMs = 30 * 60 * 1000;
  private maxContextTokens: number = 32000;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    super("AutoContextInjectionService");
    this.dependencyGraphs = this.createManagedMap<string, DependencyGraph>({ maxSize: 50, strategy: "lru" });
    this.graphLastAccess = this.createManagedMap<string, number>({ maxSize: 50, strategy: "lru" });
    this.cleanupTimer = setInterval(() => this.evictStaleGraphs(), 60000);
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.dependencyGraphs.clear();
    this.graphLastAccess.clear();
    this.log("AutoContextInjectionService shut down");
  }

  private evictStaleGraphs(): void {
    const now = Date.now();
    for (const [projectId, lastAccess] of this.graphLastAccess.entries()) {
      if (now - lastAccess > this.graphTTLMs) {
        this.dependencyGraphs.delete(projectId);
        this.graphLastAccess.delete(projectId);
      }
    }
    if (this.dependencyGraphs.size > this.maxGraphs) {
      const entries = this.graphLastAccess.entries()
        .sort((a, b) => a[1] - b[1]);
      const toRemove = entries.slice(0, entries.length - this.maxGraphs);
      for (const [projectId] of toRemove) {
        this.dependencyGraphs.delete(projectId);
        this.graphLastAccess.delete(projectId);
      }
    }
  }

  static getInstance(): AutoContextInjectionService {
    if (!AutoContextInjectionService.instance) {
      AutoContextInjectionService.instance = new AutoContextInjectionService();
    }
    return AutoContextInjectionService.instance;
  }

  buildDependencyGraph(projectId: string, files: FileInfo[]): void {
    this.log("Building dependency graph", { projectId, fileCount: files.length });

    const graph: DependencyGraph = {
      nodes: new Map(),
      reverseNodes: new Map()
    };

    for (const file of files) {
      const imports = this.extractImports(file.content, file.path);
      graph.nodes.set(file.path, new Set(imports));

      for (const imp of imports) {
        const existing = graph.reverseNodes.get(imp) || new Set();
        existing.add(file.path);
        graph.reverseNodes.set(imp, existing);
      }
    }

    this.dependencyGraphs.set(projectId, graph);
    this.graphLastAccess.set(projectId, Date.now());
    this.log("Dependency graph built", { 
      projectId, 
      nodeCount: graph.nodes.size 
    });
  }

  private extractImports(content: string, currentPath: string): string[] {
    const imports: string[] = [];
    const currentDir = currentPath.substring(0, currentPath.lastIndexOf("/"));

    const patterns = [
      /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const importPath = match[1];
        
        if (importPath.startsWith(".")) {
          const resolvedPath = this.resolvePath(currentDir, importPath);
          imports.push(resolvedPath);
        }
      }
    }

    return imports;
  }

  private resolvePath(currentDir: string, relativePath: string): string {
    const parts = currentDir.split("/").filter(p => p);
    const relParts = relativePath.split("/");

    for (const part of relParts) {
      if (part === "..") {
        parts.pop();
      } else if (part !== ".") {
        parts.push(part);
      }
    }

    let resolved = parts.join("/");
    
    if (!resolved.match(/\.(ts|tsx|js|jsx)$/)) {
      resolved += ".ts";
    }

    return resolved;
  }

  injectContext(
    projectId: string,
    targetFile: string,
    files: FileInfo[],
    maxTokens?: number
  ): InjectionResult {
    const limit = maxTokens || this.maxContextTokens;
    const graph = this.dependencyGraphs.get(projectId);
    
    const relevantFiles: ContextFile[] = [];
    let totalTokens = 0;

    const targetContent = files.find(f => f.path === targetFile)?.content || "";
    const targetTokens = this.estimateTokens(targetContent);
    totalTokens += targetTokens;

    if (graph) {
      const directDeps = graph.nodes.get(targetFile) || new Set();
      for (const dep of Array.from(directDeps)) {
        const file = files.find(f => 
          f.path === dep || 
          f.path === dep.replace(/\.ts$/, ".tsx") ||
          f.path.includes(dep.replace(/^.*\//, ""))
        );
        if (file) {
          const tokens = this.estimateTokens(file.content);
          if (totalTokens + tokens <= limit) {
            relevantFiles.push({
              path: file.path,
              content: file.content,
              relevanceScore: 0.9,
              reason: "Direct import dependency"
            });
            totalTokens += tokens;
          }
        }
      }

      const dependents = graph.reverseNodes.get(targetFile) || new Set();
      for (const dep of Array.from(dependents)) {
        const file = files.find(f => f.path === dep);
        if (file && totalTokens + this.estimateTokens(file.content) <= limit * 0.8) {
          const tokens = this.estimateTokens(file.content);
          relevantFiles.push({
            path: file.path,
            content: file.content,
            relevanceScore: 0.7,
            reason: "File that imports this module"
          });
          totalTokens += tokens;
        }
      }
    }

    const sharedTypes = this.findSharedTypes(targetContent, files);
    for (const file of sharedTypes) {
      if (!relevantFiles.find(f => f.path === file.path)) {
        const tokens = this.estimateTokens(file.content);
        if (totalTokens + tokens <= limit) {
          relevantFiles.push({
            path: file.path,
            content: file.content,
            relevanceScore: 0.8,
            reason: "Shared type definitions"
          });
          totalTokens += tokens;
        }
      }
    }

    const schemaFile = files.find(f => f.path.includes("schema.ts") || f.path.includes("types.ts"));
    if (schemaFile && !relevantFiles.find(f => f.path === schemaFile.path)) {
      const tokens = this.estimateTokens(schemaFile.content);
      if (totalTokens + tokens <= limit) {
        relevantFiles.push({
          path: schemaFile.path,
          content: schemaFile.content,
          relevanceScore: 0.85,
          reason: "Core schema/types file"
        });
        totalTokens += tokens;
      }
    }

    relevantFiles.sort((a, b) => b.relevanceScore - a.relevanceScore);

    const pruningApplied = totalTokens > limit * 0.9;

    this.log("Context injected", {
      projectId,
      targetFile,
      injectedCount: relevantFiles.length,
      totalTokens,
      pruningApplied
    });

    return {
      injectedFiles: relevantFiles,
      totalTokensEstimate: totalTokens,
      pruningApplied,
      contextSummary: this.generateContextSummary(relevantFiles)
    };
  }

  private findSharedTypes(content: string, files: FileInfo[]): FileInfo[] {
    const typeRefs = new Set<string>();
    
    const typePatterns = [
      /:\s*(\w+)(?:\[\])?(?:\s*[,;=)])/g,
      /<(\w+)(?:,\s*\w+)*>/g,
      /as\s+(\w+)/g
    ];

    for (const pattern of typePatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const typeName = match[1];
        if (typeName[0] === typeName[0].toUpperCase() && typeName.length > 1) {
          typeRefs.add(typeName);
        }
      }
    }

    return files.filter(file => {
      if (!file.path.includes("types") && !file.path.includes("schema") && !file.path.includes("interfaces")) {
        return false;
      }
      
      return Array.from(typeRefs).some(type => 
        file.content.includes(`type ${type}`) || 
        file.content.includes(`interface ${type}`) ||
        file.content.includes(`export { ${type}`)
      );
    });
  }

  private estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }

  private generateContextSummary(files: ContextFile[]): string {
    if (files.length === 0) return "No additional context injected.";
    
    const reasons = new Map<string, number>();
    for (const file of files) {
      reasons.set(file.reason, (reasons.get(file.reason) || 0) + 1);
    }

    const summary = Array.from(reasons.entries())
      .map(([reason, count]) => `${count} file(s): ${reason}`)
      .join("; ");

    return `Injected ${files.length} relevant files. ${summary}`;
  }

  getRelatedFiles(
    projectId: string,
    filePath: string,
    depth: number = 2
  ): string[] {
    const graph = this.dependencyGraphs.get(projectId);
    if (!graph) return [];

    const visited = new Set<string>();
    const queue: Array<{ path: string; level: number }> = [{ path: filePath, level: 0 }];

    while (queue.length > 0) {
      const { path, level } = queue.shift()!;
      
      if (visited.has(path) || level > depth) continue;
      visited.add(path);

      const deps = graph.nodes.get(path) || new Set();
      const dependents = graph.reverseNodes.get(path) || new Set();

      for (const dep of Array.from(deps)) {
        if (!visited.has(dep)) {
          queue.push({ path: dep, level: level + 1 });
        }
      }
      
      for (const dep of Array.from(dependents)) {
        if (!visited.has(dep)) {
          queue.push({ path: dep, level: level + 1 });
        }
      }
    }

    visited.delete(filePath);
    return Array.from(visited);
  }

  setMaxContextTokens(tokens: number): void {
    this.maxContextTokens = tokens;
    this.log("Max context tokens updated", { tokens });
  }

  clearGraph(projectId: string): void {
    this.dependencyGraphs.delete(projectId);
    this.log("Dependency graph cleared", { projectId });
  }
}

export const autoContextInjectionService = AutoContextInjectionService.getInstance();
