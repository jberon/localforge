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
}

export const projectMemoryService = ProjectMemoryService.getInstance();
