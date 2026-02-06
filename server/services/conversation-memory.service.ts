import { BaseService, ManagedMap } from "../lib/base-service";

export interface ProjectState {
  projectId: string;
  filesCreated: string[];
  componentsBuilt: string[];
  apiEndpoints: string[];
  decisionsLog: Array<{ decision: string; reasoning: string; timestamp: number }>;
  currentPhase: "planning" | "building" | "refining" | "debugging";
  techStack: string[];
  lastUpdated: number;
}

export interface MemoryEntry {
  role: "user" | "assistant";
  summary: string;
  keyEntities: string[];
  actionsTaken: string[];
  timestamp: number;
  originalTokens: number;
  compressedTokens: number;
}

export interface CompressedHistory {
  projectState: ProjectState;
  entries: MemoryEntry[];
  totalOriginalTokens: number;
  totalCompressedTokens: number;
  compressionRatio: number;
}

export interface CompressionConfig {
  maxEntries: number;
  maxTokensPerEntry: number;
  preserveRecentCount: number;
  extractEntities: boolean;
  trackDecisions: boolean;
}

const DEFAULT_CONFIG: CompressionConfig = {
  maxEntries: 20,
  maxTokensPerEntry: 200,
  preserveRecentCount: 3,
  extractEntities: true,
  trackDecisions: true,
};

export class ConversationMemoryService extends BaseService {
  private static instance: ConversationMemoryService;
  private projectStates: ManagedMap<string, ProjectState>;
  private compressionCache: ManagedMap<string, CompressedHistory>;
  private totalCompressions: number = 0;
  private compressionRatioSum: number = 0;

  private constructor() {
    super("ConversationMemoryService");
    this.projectStates = this.createManagedMap<string, ProjectState>({ maxSize: 100, strategy: "lru" });
    this.compressionCache = this.createManagedMap<string, CompressedHistory>({ maxSize: 50, strategy: "lru" });
  }

  static getInstance(): ConversationMemoryService {
    if (!ConversationMemoryService.instance) {
      ConversationMemoryService.instance = new ConversationMemoryService();
    }
    return ConversationMemoryService.instance;
  }

  destroy(): void {
    this.projectStates.clear();
    this.compressionCache.clear();
    this.log("ConversationMemoryService shutting down");
  }

  compressHistory(
    projectId: string,
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
    config?: Partial<CompressionConfig>
  ): CompressedHistory {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    const existingState = this.projectStates.get(projectId);
    const projectState = this.extractProjectState(messages, existingState);
    if (!projectState.projectId) {
      projectState.projectId = projectId;
    }
    this.projectStates.set(projectId, projectState);

    const nonSystemMessages = messages.filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        m.role === "user" || m.role === "assistant"
    );

    const recentMessages = nonSystemMessages.slice(-mergedConfig.preserveRecentCount);
    const olderMessages = nonSystemMessages.slice(0, -mergedConfig.preserveRecentCount);

    const entries: MemoryEntry[] = [];

    for (const msg of olderMessages) {
      const entry = this.compressMessage(msg, { ...mergedConfig, maxTokensPerEntry: Math.floor(mergedConfig.maxTokensPerEntry * 0.5) });
      entries.push(entry);
    }

    for (const msg of recentMessages) {
      const entry = this.compressMessage(msg, mergedConfig);
      entries.push(entry);
    }

    const trimmedEntries = entries.slice(-mergedConfig.maxEntries);

    const totalOriginalTokens = trimmedEntries.reduce((sum, e) => sum + e.originalTokens, 0);
    const totalCompressedTokens = trimmedEntries.reduce((sum, e) => sum + e.compressedTokens, 0);
    const compressionRatio = totalCompressedTokens > 0 ? totalOriginalTokens / totalCompressedTokens : 1;

    this.totalCompressions++;
    this.compressionRatioSum += compressionRatio;

    const compressed: CompressedHistory = {
      projectState,
      entries: trimmedEntries,
      totalOriginalTokens,
      totalCompressedTokens,
      compressionRatio,
    };

    this.compressionCache.set(projectId, compressed);

    return compressed;
  }

  extractProjectState(
    messages: Array<{ role: string; content: string }>,
    existingState?: ProjectState
  ): ProjectState {
    const state: ProjectState = existingState
      ? { ...existingState, lastUpdated: Date.now() }
      : {
          projectId: "",
          filesCreated: [],
          componentsBuilt: [],
          apiEndpoints: [],
          decisionsLog: [],
          currentPhase: "planning",
          techStack: [],
          lastUpdated: Date.now(),
        };

    const allContent = messages.map((m) => m.content).join("\n");

    const filePatterns = [
      /\/src\/[\w\-./]+/g,
      /created file\s+(\S+)/gi,
      /updated file\s+(\S+)/gi,
    ];
    for (const pattern of filePatterns) {
      const matches = allContent.match(pattern);
      if (matches) {
        for (const match of matches) {
          const cleaned = match.replace(/^(created|updated)\s+file\s+/i, "").trim();
          if (!state.filesCreated.includes(cleaned)) {
            state.filesCreated.push(cleaned);
          }
        }
      }
    }

    const componentPatterns = [
      /function\s+([A-Z]\w+)/g,
      /const\s+([A-Z]\w+)/g,
    ];
    for (const pattern of componentPatterns) {
      let match;
      while ((match = pattern.exec(allContent)) !== null) {
        const name = match[1];
        if (!state.componentsBuilt.includes(name)) {
          state.componentsBuilt.push(name);
        }
      }
    }

    const endpointPattern = /(GET|POST|PUT|DELETE|PATCH)\s+(\/api\/[\w\-./]+)/gi;
    let endpointMatch;
    while ((endpointMatch = endpointPattern.exec(allContent)) !== null) {
      const endpoint = `${endpointMatch[1].toUpperCase()} ${endpointMatch[2]}`;
      if (!state.apiEndpoints.includes(endpoint)) {
        state.apiEndpoints.push(endpoint);
      }
    }

    const decisionPattern = /(?:decided|chose|using|switched to|went with)\s+(.+?)(?:\.|$)/gim;
    let decisionMatch;
    while ((decisionMatch = decisionPattern.exec(allContent)) !== null) {
      state.decisionsLog.push({
        decision: decisionMatch[0].trim(),
        reasoning: decisionMatch[1].trim(),
        timestamp: Date.now(),
      });
    }

    const knownTech = [
      "React", "Express", "Tailwind", "TypeScript", "JavaScript",
      "Node.js", "Next.js", "Vite", "PostgreSQL", "MongoDB",
      "Redis", "Docker", "GraphQL", "REST", "Prisma", "Drizzle",
      "Vue", "Angular", "Svelte", "Flask", "Django", "FastAPI",
      "TailwindCSS", "Bootstrap", "Material UI", "Chakra UI",
    ];
    for (const tech of knownTech) {
      if (allContent.toLowerCase().includes(tech.toLowerCase()) && !state.techStack.includes(tech)) {
        state.techStack.push(tech);
      }
    }

    const lowerContent = allContent.toLowerCase();
    if (lowerContent.includes("fixing") || lowerContent.includes("debugging") || lowerContent.includes("error")) {
      state.currentPhase = "debugging";
    } else if (lowerContent.includes("refactoring") || lowerContent.includes("improving")) {
      state.currentPhase = "refining";
    } else if (lowerContent.includes("building") || lowerContent.includes("implementing")) {
      state.currentPhase = "building";
    } else if (lowerContent.includes("planning") || lowerContent.includes("plan")) {
      state.currentPhase = "planning";
    }

    return state;
  }

  compressMessage(
    message: { role: "user" | "assistant"; content: string },
    config: CompressionConfig
  ): MemoryEntry {
    const originalTokens = Math.ceil(message.content.length / 4);

    const keyEntities: string[] = [];
    if (config.extractEntities) {
      const fileNames = message.content.match(/[\w\-]+\.(ts|tsx|js|jsx|json|css|html|py|go|rs)/g);
      if (fileNames) keyEntities.push(...fileNames);

      const componentNames = message.content.match(/(?:function|const|class)\s+([A-Z]\w+)/g);
      if (componentNames) {
        keyEntities.push(...componentNames.map((c) => c.replace(/^(function|const|class)\s+/, "")));
      }

      const functionNames = message.content.match(/(?:function|const|let|var)\s+([a-z]\w+)\s*(?:\(|=\s*(?:\(|async))/g);
      if (functionNames) {
        keyEntities.push(...functionNames.map((f) => f.replace(/^(function|const|let|var)\s+/, "").replace(/\s*[=(].*/, "")));
      }

      const libraryNames = message.content.match(/(?:import|require|from)\s+['"]([^'"]+)['"]/g);
      if (libraryNames) {
        keyEntities.push(...libraryNames.map((l) => l.replace(/^(import|require|from)\s+['"]/, "").replace(/['"]$/, "")));
      }
    }

    const actionsTaken: string[] = [];
    const actionPattern = /(created|updated|deleted|fixed|added|removed)\s+(\S+(?:\s+\S+)?)/gi;
    let actionMatch;
    while ((actionMatch = actionPattern.exec(message.content)) !== null) {
      actionsTaken.push(actionMatch[0].trim());
    }

    const summary = this.generateSummary(message.content, config.maxTokensPerEntry);
    const compressedTokens = Math.ceil(summary.length / 4);

    return {
      role: message.role,
      summary,
      keyEntities: Array.from(new Set(keyEntities)),
      actionsTaken: Array.from(new Set(actionsTaken)),
      timestamp: Date.now(),
      originalTokens,
      compressedTokens,
    };
  }

  buildContextPrompt(compressed: CompressedHistory): string {
    const { projectState, entries } = compressed;

    const decisionsText = projectState.decisionsLog
      .slice(-5)
      .map((d) => `- ${d.decision}`)
      .join("\n");

    let prompt = `[Project Context]
Phase: ${projectState.currentPhase}
Files: ${projectState.filesCreated.join(", ") || "none"}
Components: ${projectState.componentsBuilt.join(", ") || "none"}
API Endpoints: ${projectState.apiEndpoints.join(", ") || "none"}
Tech Stack: ${projectState.techStack.join(", ") || "none"}
Key Decisions:
${decisionsText || "- none"}

[Conversation Summary]`;

    entries.forEach((entry, index) => {
      prompt += `\n${index + 1}. [${entry.role}] ${entry.summary}`;
    });

    return prompt;
  }

  getProjectState(projectId: string): ProjectState | undefined {
    return this.projectStates.get(projectId);
  }

  updateProjectState(projectId: string, updates: Partial<ProjectState>): void {
    const existing = this.projectStates.get(projectId);
    if (existing) {
      this.projectStates.set(projectId, { ...existing, ...updates, lastUpdated: Date.now() });
    } else {
      this.projectStates.set(projectId, {
        projectId,
        filesCreated: [],
        componentsBuilt: [],
        apiEndpoints: [],
        decisionsLog: [],
        currentPhase: "planning",
        techStack: [],
        lastUpdated: Date.now(),
        ...updates,
      });
    }
  }

  getStats(): { totalCompressions: number; averageCompressionRatio: number; projectsTracked: number } {
    return {
      totalCompressions: this.totalCompressions,
      averageCompressionRatio: this.totalCompressions > 0 ? this.compressionRatioSum / this.totalCompressions : 0,
      projectsTracked: this.projectStates.size,
    };
  }

  private generateSummary(content: string, maxTokens: number): string {
    const maxChars = maxTokens * 4;
    const sentences = content.split(/(?<=[.!?])\s+/);

    if (sentences.length === 0) return content.substring(0, maxChars);

    let summary = sentences[0];

    const decisionSentences = sentences.filter((s) =>
      /decided|chose|using|switched|went with|because|therefore/i.test(s)
    );
    for (const ds of decisionSentences) {
      if (summary.length + ds.length + 2 <= maxChars) {
        summary += " " + ds;
      }
    }

    if (sentences.length > 1) {
      const lastSentence = sentences[sentences.length - 1];
      if (summary.length + lastSentence.length + 2 <= maxChars && !summary.includes(lastSentence)) {
        summary += " " + lastSentence;
      }
    }

    if (summary.length > maxChars) {
      summary = summary.substring(0, maxChars);
    }

    return summary;
  }
}

export const conversationMemoryService = ConversationMemoryService.getInstance();
