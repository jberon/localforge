import { logger } from "../lib/logger";
import { storage } from "../storage";

export interface FileMetadata {
  path: string;
  purpose: string;
  type: FileType;
  dependencies: string[];
  exports: string[];
  lastModified: number;
  contentHash: string;
  linesOfCode: number;
  complexity: "low" | "medium" | "high";
}

export type FileType = 
  | "component"
  | "page"
  | "api_route"
  | "model"
  | "service"
  | "utility"
  | "config"
  | "style"
  | "test"
  | "type"
  | "unknown";

export interface ArchitecturalDecision {
  id: string;
  projectId: string;
  category: DecisionCategory;
  title: string;
  description: string;
  rationale: string;
  alternatives: string[];
  consequences: string[];
  createdAt: number;
  status: "active" | "superseded" | "deprecated";
  supersededBy?: string;
}

export type DecisionCategory =
  | "framework"
  | "architecture"
  | "database"
  | "api_design"
  | "ui_pattern"
  | "security"
  | "performance"
  | "testing"
  | "deployment";

export interface ChangeRecord {
  id: string;
  projectId: string;
  timestamp: number;
  type: ChangeType;
  files: string[];
  description: string;
  prompt?: string;
  agentType?: string;
  metrics: {
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
    tokensUsed: number;
  };
}

export type ChangeType =
  | "creation"
  | "modification"
  | "deletion"
  | "refactor"
  | "bugfix"
  | "feature"
  | "optimization";

export interface ProjectContext {
  id: string;
  projectId: string;
  files: Map<string, FileMetadata>;
  decisions: ArchitecturalDecision[];
  changes: ChangeRecord[];
  patterns: PatternUsage[];
  conventions: CodingConvention[];
  lastUpdated: number;
}

export interface PatternUsage {
  pattern: string;
  category: string;
  frequency: number;
  files: string[];
  lastUsed: number;
}

export interface CodingConvention {
  name: string;
  description: string;
  examples: string[];
  enforcedSince: number;
}

class ProjectMemoryService {
  private static instance: ProjectMemoryService;
  private projectContexts: Map<string, ProjectContext> = new Map();
  private maxChangesPerProject = 100;

  private constructor() {
    logger.info("ProjectMemoryService initialized");
  }

  static getInstance(): ProjectMemoryService {
    if (!ProjectMemoryService.instance) {
      ProjectMemoryService.instance = new ProjectMemoryService();
    }
    return ProjectMemoryService.instance;
  }

  async initializeProject(projectId: string): Promise<ProjectContext> {
    let context = this.projectContexts.get(projectId);
    if (!context) {
      context = {
        id: this.generateId(),
        projectId,
        files: new Map(),
        decisions: [],
        changes: [],
        patterns: [],
        conventions: this.getDefaultConventions(),
        lastUpdated: Date.now()
      };
      this.projectContexts.set(projectId, context);
      logger.info("Project memory initialized", { projectId });
    }
    return context;
  }

  private getDefaultConventions(): CodingConvention[] {
    return [
      {
        name: "TypeScript Strict",
        description: "Use strict TypeScript with proper typing",
        examples: ["const fn = (param: string): number => { ... }"],
        enforcedSince: Date.now()
      },
      {
        name: "Functional Components",
        description: "Use React functional components with hooks",
        examples: ["export function MyComponent() { ... }"],
        enforcedSince: Date.now()
      },
      {
        name: "Named Exports",
        description: "Prefer named exports over default exports",
        examples: ["export { MyComponent };"],
        enforcedSince: Date.now()
      }
    ];
  }

  async recordFileMetadata(
    projectId: string,
    path: string,
    metadata: Partial<FileMetadata>
  ): Promise<void> {
    const context = await this.getOrCreateContext(projectId);
    const existing = context.files.get(path);
    
    const updated: FileMetadata = {
      path,
      purpose: metadata.purpose || existing?.purpose || "Unknown",
      type: metadata.type || existing?.type || this.inferFileType(path),
      dependencies: metadata.dependencies || existing?.dependencies || [],
      exports: metadata.exports || existing?.exports || [],
      lastModified: Date.now(),
      contentHash: metadata.contentHash || existing?.contentHash || "",
      linesOfCode: metadata.linesOfCode || existing?.linesOfCode || 0,
      complexity: metadata.complexity || existing?.complexity || "low"
    };

    context.files.set(path, updated);
    context.lastUpdated = Date.now();
    
    logger.debug("File metadata recorded", { projectId, path, type: updated.type });
  }

  private inferFileType(path: string): FileType {
    const lowerPath = path.toLowerCase();
    
    if (lowerPath.includes("/pages/") || lowerPath.includes("/routes/")) return "page";
    if (lowerPath.includes("/components/")) return "component";
    if (lowerPath.includes("/api/") || lowerPath.includes("/routes.ts")) return "api_route";
    if (lowerPath.includes("/models/") || lowerPath.includes("schema")) return "model";
    if (lowerPath.includes("/services/")) return "service";
    if (lowerPath.includes("/utils/") || lowerPath.includes("/lib/")) return "utility";
    if (lowerPath.includes("/types/") || lowerPath.endsWith(".d.ts")) return "type";
    if (lowerPath.includes(".test.") || lowerPath.includes(".spec.")) return "test";
    if (lowerPath.includes(".css") || lowerPath.includes(".scss")) return "style";
    if (lowerPath.includes("config") || lowerPath.includes(".json")) return "config";
    
    return "unknown";
  }

  async recordDecision(
    projectId: string,
    decision: Omit<ArchitecturalDecision, "id" | "projectId" | "createdAt" | "status">
  ): Promise<ArchitecturalDecision> {
    const context = await this.getOrCreateContext(projectId);
    
    const newDecision: ArchitecturalDecision = {
      id: this.generateId(),
      projectId,
      ...decision,
      createdAt: Date.now(),
      status: "active"
    };

    context.decisions.push(newDecision);
    context.lastUpdated = Date.now();
    
    logger.info("Architectural decision recorded", { 
      projectId, 
      category: decision.category, 
      title: decision.title 
    });

    return newDecision;
  }

  async recordChange(
    projectId: string,
    change: Omit<ChangeRecord, "id" | "projectId" | "timestamp">
  ): Promise<ChangeRecord> {
    const context = await this.getOrCreateContext(projectId);
    
    const newChange: ChangeRecord = {
      id: this.generateId(),
      projectId,
      timestamp: Date.now(),
      ...change
    };

    context.changes.push(newChange);
    
    if (context.changes.length > this.maxChangesPerProject) {
      context.changes = context.changes.slice(-this.maxChangesPerProject);
    }
    
    context.lastUpdated = Date.now();
    
    logger.debug("Change recorded", { 
      projectId, 
      type: change.type, 
      filesChanged: change.files.length 
    });

    return newChange;
  }

  async recordPatternUsage(
    projectId: string,
    pattern: string,
    category: string,
    files: string[]
  ): Promise<void> {
    const context = await this.getOrCreateContext(projectId);
    
    const existing = context.patterns.find(p => p.pattern === pattern);
    if (existing) {
      existing.frequency++;
      const allFiles = [...existing.files, ...files];
      existing.files = allFiles.filter((f, i) => allFiles.indexOf(f) === i);
      existing.lastUsed = Date.now();
    } else {
      context.patterns.push({
        pattern,
        category,
        frequency: 1,
        files,
        lastUsed: Date.now()
      });
    }
    
    context.lastUpdated = Date.now();
  }

  async getProjectSummary(projectId: string): Promise<{
    fileCount: number;
    fileTypes: Record<FileType, number>;
    recentChanges: ChangeRecord[];
    activeDecisions: ArchitecturalDecision[];
    topPatterns: PatternUsage[];
  }> {
    const context = await this.getOrCreateContext(projectId);
    
    const fileTypes: Record<FileType, number> = {
      component: 0,
      page: 0,
      api_route: 0,
      model: 0,
      service: 0,
      utility: 0,
      config: 0,
      style: 0,
      test: 0,
      type: 0,
      unknown: 0
    };

    context.files.forEach((file) => {
      fileTypes[file.type]++;
    });

    return {
      fileCount: context.files.size,
      fileTypes,
      recentChanges: context.changes.slice(-10),
      activeDecisions: context.decisions.filter(d => d.status === "active"),
      topPatterns: [...context.patterns]
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 5)
    };
  }

  async getFilePurposes(projectId: string): Promise<Map<string, string>> {
    const context = await this.getOrCreateContext(projectId);
    const purposes = new Map<string, string>();
    
    context.files.forEach((metadata, path) => {
      purposes.set(path, metadata.purpose);
    });
    
    return purposes;
  }

  async getRelatedFiles(projectId: string, filePath: string): Promise<string[]> {
    const context = await this.getOrCreateContext(projectId);
    const fileMetadata = context.files.get(filePath);
    
    if (!fileMetadata) return [];
    
    const related = new Set<string>();
    
    fileMetadata.dependencies.forEach(dep => related.add(dep));
    
    context.files.forEach((metadata, path) => {
      if (metadata.dependencies.includes(filePath)) {
        related.add(path);
      }
    });
    
    return Array.from(related);
  }

  async getContextForGeneration(projectId: string): Promise<{
    summary: string;
    conventions: CodingConvention[];
    recentDecisions: ArchitecturalDecision[];
    fileStructure: string;
  }> {
    const context = await this.getOrCreateContext(projectId);
    const summary = await this.getProjectSummary(projectId);
    
    const paths: string[] = [];
    context.files.forEach((_, p) => paths.push(p));
    const fileStructure = paths
      .sort()
      .map(p => {
        const meta = context.files.get(p)!;
        return `- ${p} (${meta.type}): ${meta.purpose}`;
      })
      .join("\n");

    return {
      summary: `Project has ${summary.fileCount} files across ${Object.entries(summary.fileTypes)
        .filter(([, count]) => count > 0)
        .map(([type, count]) => `${count} ${type}s`)
        .join(", ")}`,
      conventions: context.conventions,
      recentDecisions: context.decisions
        .filter(d => d.status === "active")
        .slice(-5),
      fileStructure: fileStructure || "No files tracked yet"
    };
  }

  async supersededDecision(
    projectId: string,
    decisionId: string,
    newDecisionId: string
  ): Promise<void> {
    const context = await this.getOrCreateContext(projectId);
    const decision = context.decisions.find(d => d.id === decisionId);
    
    if (decision) {
      decision.status = "superseded";
      decision.supersededBy = newDecisionId;
      context.lastUpdated = Date.now();
      logger.info("Decision superseded", { projectId, decisionId, newDecisionId });
    }
  }

  private async getOrCreateContext(projectId: string): Promise<ProjectContext> {
    let context = this.projectContexts.get(projectId);
    if (!context) {
      context = await this.initializeProject(projectId);
    }
    return context;
  }

  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  clearProjectMemory(projectId: string): void {
    this.projectContexts.delete(projectId);
    logger.info("Project memory cleared", { projectId });
  }

  // ============================================================================
  // ENHANCED: DEPENDENCY GRAPH & SMART DIFFING
  // ============================================================================

  /**
   * Build a dependency graph for the project
   */
  async buildDependencyGraph(projectId: string): Promise<{
    nodes: Array<{ id: string; type: FileType; purpose: string }>;
    edges: Array<{ from: string; to: string }>;
    orphans: string[];
    cycles: string[][];
  }> {
    const context = await this.getOrCreateContext(projectId);
    const nodes: Array<{ id: string; type: FileType; purpose: string }> = [];
    const edges: Array<{ from: string; to: string }> = [];
    const allPaths = new Set<string>();
    const referencedPaths = new Set<string>();

    context.files.forEach((metadata, path) => {
      nodes.push({
        id: path,
        type: metadata.type,
        purpose: metadata.purpose
      });
      allPaths.add(path);

      metadata.dependencies.forEach(dep => {
        edges.push({ from: path, to: dep });
        referencedPaths.add(dep);
      });
    });

    const orphans = Array.from(allPaths).filter(p => {
      const meta = context.files.get(p);
      return meta?.dependencies.length === 0 && !referencedPaths.has(p);
    });

    const cycles = this.detectCycles(edges);

    logger.info("Dependency graph built", {
      projectId,
      nodes: nodes.length,
      edges: edges.length,
      orphans: orphans.length,
      cycles: cycles.length
    });

    return { nodes, edges, orphans, cycles };
  }

  private detectCycles(edges: Array<{ from: string; to: string }>): string[][] {
    const graph = new Map<string, string[]>();
    
    edges.forEach(e => {
      const deps = graph.get(e.from) || [];
      deps.push(e.to);
      graph.set(e.from, deps);
    });

    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const currentPath: string[] = [];

    const dfs = (node: string): void => {
      visited.add(node);
      recursionStack.add(node);
      currentPath.push(node);

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor);
        } else if (recursionStack.has(neighbor)) {
          const cycleStart = currentPath.indexOf(neighbor);
          if (cycleStart !== -1) {
            cycles.push(currentPath.slice(cycleStart).concat(neighbor));
          }
        }
      }

      currentPath.pop();
      recursionStack.delete(node);
    };

    graph.forEach((_, node) => {
      if (!visited.has(node)) {
        dfs(node);
      }
    });

    return cycles;
  }

  /**
   * Smart diff: Compute minimal changes needed
   */
  computeSmartDiff(
    oldContent: string,
    newContent: string
  ): {
    changeType: "none" | "minor" | "significant" | "rewrite";
    changeRatio: number;
    changedLines: { added: number; removed: number; modified: number };
    hunks: Array<{ start: number; end: number; type: "add" | "remove" | "modify" }>;
  } {
    const oldLines = oldContent.split("\n");
    const newLines = newContent.split("\n");
    
    let added = 0;
    let removed = 0;
    let modified = 0;
    const hunks: Array<{ start: number; end: number; type: "add" | "remove" | "modify" }> = [];

    const oldSet = new Set(oldLines);
    const newSet = new Set(newLines);

    oldLines.forEach((line, i) => {
      if (!newSet.has(line)) {
        removed++;
        hunks.push({ start: i + 1, end: i + 1, type: "remove" });
      }
    });

    newLines.forEach((line, i) => {
      if (!oldSet.has(line)) {
        added++;
        hunks.push({ start: i + 1, end: i + 1, type: "add" });
      }
    });

    const maxLines = Math.max(oldLines.length, newLines.length);
    const changeRatio = maxLines > 0 ? (added + removed) / maxLines : 0;

    let changeType: "none" | "minor" | "significant" | "rewrite";
    if (changeRatio === 0) changeType = "none";
    else if (changeRatio < 0.1) changeType = "minor";
    else if (changeRatio < 0.5) changeType = "significant";
    else changeType = "rewrite";

    return {
      changeType,
      changeRatio,
      changedLines: { added, removed, modified },
      hunks: this.mergeHunks(hunks)
    };
  }

  private mergeHunks(
    hunks: Array<{ start: number; end: number; type: "add" | "remove" | "modify" }>
  ): Array<{ start: number; end: number; type: "add" | "remove" | "modify" }> {
    if (hunks.length === 0) return [];
    
    const sorted = [...hunks].sort((a, b) => a.start - b.start);
    const merged: typeof hunks = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i];
      const last = merged[merged.length - 1];

      if (current.start <= last.end + 3 && current.type === last.type) {
        last.end = Math.max(last.end, current.end);
      } else {
        merged.push(current);
      }
    }

    return merged;
  }

  /**
   * Get impact analysis for a file change
   */
  async getChangeImpact(
    projectId: string,
    filePath: string
  ): Promise<{
    directDependents: string[];
    transitiveDependents: string[];
    impactLevel: "low" | "medium" | "high" | "critical";
    recommendations: string[];
  }> {
    const context = await this.getOrCreateContext(projectId);
    const directDependents: string[] = [];
    const transitiveDependents = new Set<string>();

    context.files.forEach((metadata, path) => {
      if (metadata.dependencies.includes(filePath)) {
        directDependents.push(path);
      }
    });

    const queue = [...directDependents];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (transitiveDependents.has(current)) continue;
      transitiveDependents.add(current);

      context.files.forEach((metadata, path) => {
        if (metadata.dependencies.includes(current) && !transitiveDependents.has(path)) {
          queue.push(path);
        }
      });
    }

    const fileMetadata = context.files.get(filePath);
    const totalDependents = directDependents.length + transitiveDependents.size;

    let impactLevel: "low" | "medium" | "high" | "critical";
    if (totalDependents === 0) impactLevel = "low";
    else if (totalDependents <= 3) impactLevel = "medium";
    else if (totalDependents <= 10) impactLevel = "high";
    else impactLevel = "critical";

    if (fileMetadata?.type === "type" || fileMetadata?.type === "model") {
      impactLevel = impactLevel === "low" ? "medium" : impactLevel === "medium" ? "high" : "critical";
    }

    const recommendations: string[] = [];
    if (impactLevel === "high" || impactLevel === "critical") {
      recommendations.push("Consider making changes incrementally and testing after each step");
      recommendations.push(`This change may affect ${totalDependents} files`);
    }
    if (fileMetadata?.type === "type") {
      recommendations.push("Type changes may require updates to all dependent files");
    }
    if (directDependents.length > 5) {
      recommendations.push("Consider extracting shared logic into smaller modules");
    }

    return {
      directDependents,
      transitiveDependents: Array.from(transitiveDependents),
      impactLevel,
      recommendations
    };
  }

  /**
   * Get file hierarchy for display
   */
  getFileHierarchy(projectId: string): {
    tree: Record<string, any>;
    stats: { files: number; folders: number; maxDepth: number };
  } | null {
    const context = this.projectContexts.get(projectId);
    if (!context) return null;

    const tree: Record<string, any> = {};
    let folders = new Set<string>();
    let maxDepth = 0;

    context.files.forEach((_, filePath) => {
      const parts = filePath.split("/");
      let current = tree;
      
      for (let i = 0; i < parts.length - 1; i++) {
        const folderPath = parts.slice(0, i + 1).join("/");
        folders.add(folderPath);
        
        if (!current[parts[i]]) {
          current[parts[i]] = {};
        }
        current = current[parts[i]];
      }
      
      const fileName = parts[parts.length - 1];
      current[fileName] = null;
      maxDepth = Math.max(maxDepth, parts.length);
    });

    return {
      tree,
      stats: {
        files: context.files.size,
        folders: folders.size,
        maxDepth
      }
    };
  }
}

export const projectMemoryService = ProjectMemoryService.getInstance();
