import { BaseService } from "../lib/base-service";

interface FileNode {
  path: string;
  imports: string[];
  exports: string[];
  importedBy: string[];
  depth: number;
}

interface DependencyGraph {
  nodes: Map<string, FileNode>;
  entryPoints: string[];
}

interface ContextSelection {
  primaryFile: string;
  contextFiles: { path: string; relevance: number; reason: string }[];
  totalTokenEstimate: number;
}

const IMPORT_PATTERNS = [
  /import\s+(?:[\w{},\s*]+)\s+from\s+['"]([^'"]+)['"]/g,
  /import\s+['"]([^'"]+)['"]/g,
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /from\s+['"]([^'"]+)['"]/g,
];

const EXPORT_PATTERNS = [
  /export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/g,
  /export\s*\{([^}]+)\}/g,
  /module\.exports\s*=\s*(\w+)/g,
  /exports\.(\w+)\s*=/g,
];

class DependencyGraphService extends BaseService {
  private static instance: DependencyGraphService;
  private graphs: Map<string, DependencyGraph> = new Map();
  private readonly MAX_GRAPHS = 50;

  private constructor() {
    super("DependencyGraphService");
  }

  static getInstance(): DependencyGraphService {
    if (!DependencyGraphService.instance) {
      DependencyGraphService.instance = new DependencyGraphService();
    }
    return DependencyGraphService.instance;
  }

  buildGraph(projectId: string, files: { path: string; content: string }[]): DependencyGraph {
    const nodes = new Map<string, FileNode>();

    for (const file of files) {
      const imports = this.extractImports(file.content, file.path, files);
      const exports = this.extractExports(file.content);

      nodes.set(file.path, {
        path: file.path,
        imports,
        exports,
        importedBy: [],
        depth: 0,
      });
    }

    for (const [path, node] of nodes) {
      for (const imp of node.imports) {
        const target = nodes.get(imp);
        if (target) {
          target.importedBy.push(path);
        }
      }
    }

    const entryPoints = Array.from(nodes.values())
      .filter(n => n.importedBy.length === 0)
      .map(n => n.path);

    this.calculateDepths(nodes, entryPoints);

    const graph: DependencyGraph = { nodes, entryPoints };

    if (this.graphs.size >= this.MAX_GRAPHS) {
      const oldest = this.graphs.keys().next().value;
      if (oldest) this.graphs.delete(oldest);
    }
    this.graphs.set(projectId, graph);

    this.log("Dependency graph built", {
      projectId,
      fileCount: files.length,
      entryPoints: entryPoints.length,
    });

    return graph;
  }

  getContextForRefinement(
    projectId: string,
    targetFile: string,
    files: { path: string; content: string }[],
    maxContextTokens: number = 4000
  ): ContextSelection {
    let graph = this.graphs.get(projectId);
    if (!graph) {
      graph = this.buildGraph(projectId, files);
    }

    const contextFiles: { path: string; relevance: number; reason: string }[] = [];
    const targetNode = graph.nodes.get(targetFile);

    if (!targetNode) {
      return {
        primaryFile: targetFile,
        contextFiles: [],
        totalTokenEstimate: 0,
      };
    }

    for (const imp of targetNode.imports) {
      const impNode = graph.nodes.get(imp);
      if (impNode) {
        contextFiles.push({
          path: imp,
          relevance: 0.9,
          reason: `Imported by ${targetFile}`,
        });
      }
    }

    for (const dep of targetNode.importedBy) {
      contextFiles.push({
        path: dep,
        relevance: 0.7,
        reason: `Imports ${targetFile}`,
      });
    }

    for (const imp of targetNode.imports) {
      const impNode = graph.nodes.get(imp);
      if (impNode) {
        for (const secondLevel of impNode.imports) {
          if (secondLevel !== targetFile && !contextFiles.some(c => c.path === secondLevel)) {
            contextFiles.push({
              path: secondLevel,
              relevance: 0.4,
              reason: `Transitively imported via ${imp}`,
            });
          }
        }
      }
    }

    const sharedFile = files.find(f =>
      f.path.includes("schema") || f.path.includes("types") || f.path.includes("shared")
    );
    if (sharedFile && sharedFile.path !== targetFile && !contextFiles.some(c => c.path === sharedFile.path)) {
      contextFiles.push({
        path: sharedFile.path,
        relevance: 0.8,
        reason: "Shared types/schema file",
      });
    }

    contextFiles.sort((a, b) => b.relevance - a.relevance);

    let totalTokens = 0;
    const filtered = contextFiles.filter(cf => {
      const file = files.find(f => f.path === cf.path);
      if (!file) return false;
      const tokens = Math.ceil(file.content.length / 4);
      if (totalTokens + tokens > maxContextTokens) return false;
      totalTokens += tokens;
      return true;
    });

    return {
      primaryFile: targetFile,
      contextFiles: filtered,
      totalTokenEstimate: totalTokens,
    };
  }

  buildRefinementContext(
    projectId: string,
    targetFile: string,
    files: { path: string; content: string }[],
    userMessage: string,
    maxContextTokens: number = 4000
  ): string {
    const selection = this.getContextForRefinement(projectId, targetFile, files, maxContextTokens);

    if (selection.contextFiles.length === 0) return "";

    const parts: string[] = [
      "\n## Related Files Context",
      "These files are related to the file being modified. Use them to understand imports, types, and dependencies:\n",
    ];

    for (const cf of selection.contextFiles) {
      const file = files.find(f => f.path === cf.path);
      if (!file) continue;

      const ext = cf.path.split(".").pop() || "tsx";
      parts.push(`### ${cf.path} (${cf.reason})\n\`\`\`${ext}\n${file.content}\n\`\`\`\n`);
    }

    return parts.join("\n");
  }

  invalidateGraph(projectId: string): void {
    this.graphs.delete(projectId);
  }

  getGraph(projectId: string): DependencyGraph | undefined {
    return this.graphs.get(projectId);
  }

  private extractImports(content: string, currentPath: string, allFiles: { path: string; content: string }[]): string[] {
    const imports: Set<string> = new Set();

    for (const pattern of IMPORT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(content)) !== null) {
        const importPath = match[1];
        if (!importPath) continue;

        if (importPath.startsWith(".")) {
          const resolved = this.resolveRelativePath(currentPath, importPath, allFiles);
          if (resolved) imports.add(resolved);
        }
      }
    }

    return Array.from(imports);
  }

  private extractExports(content: string): string[] {
    const exports: Set<string> = new Set();

    for (const pattern of EXPORT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(content)) !== null) {
        if (match[1]) {
          const names = match[1].split(",").map(s => s.trim().split(" as ")[0].trim()).filter(Boolean);
          names.forEach(n => exports.add(n));
        }
      }
    }

    return Array.from(exports);
  }

  private resolveRelativePath(fromPath: string, importPath: string, allFiles: { path: string; content: string }[]): string | null {
    const fromDir = fromPath.split("/").slice(0, -1).join("/");
    let resolved = importPath;

    if (importPath.startsWith("./")) {
      resolved = fromDir ? `${fromDir}/${importPath.slice(2)}` : importPath.slice(2);
    } else if (importPath.startsWith("../")) {
      const parts = fromDir.split("/");
      const impParts = importPath.split("/");
      let idx = 0;
      while (impParts[idx] === "..") {
        parts.pop();
        idx++;
      }
      resolved = [...parts, ...impParts.slice(idx)].join("/");
    }

    const extensions = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"];
    for (const ext of extensions) {
      const candidate = resolved + ext;
      if (allFiles.some(f => f.path === candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private calculateDepths(nodes: Map<string, FileNode>, entryPoints: string[]): void {
    const visited = new Set<string>();
    const queue: { path: string; depth: number }[] = entryPoints.map(p => ({ path: p, depth: 0 }));

    while (queue.length > 0) {
      const { path, depth } = queue.shift()!;
      if (visited.has(path)) continue;
      visited.add(path);

      const node = nodes.get(path);
      if (node) {
        node.depth = depth;
        for (const imp of node.imports) {
          if (!visited.has(imp)) {
            queue.push({ path: imp, depth: depth + 1 });
          }
        }
      }
    }
  }

  destroy(): void {
    this.graphs.clear();
    this.log("DependencyGraphService destroyed");
  }
}

export const dependencyGraphService = DependencyGraphService.getInstance();
