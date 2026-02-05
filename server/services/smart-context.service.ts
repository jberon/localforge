import logger from "../lib/logger";
import { contextPruningService, Message } from "./context-pruning.service";

export interface ConversationMemory {
  projectId: string;
  keyDecisions: string[];
  userPreferences: Record<string, string>;
  filesMentioned: string[];
  errorsEncountered: string[];
  successfulPatterns: string[];
  lastUpdated: Date;
}

export interface SemanticChunk {
  type: "decision" | "preference" | "error" | "success" | "requirement" | "context";
  content: string;
  importance: number;
  timestamp: Date;
  source: "user" | "assistant";
}

export interface SmartSummary {
  overview: string;
  keyPoints: string[];
  decisions: string[];
  openQuestions: string[];
  technicalContext: string[];
}

class SmartContextService {
  private static instance: SmartContextService;
  private projectMemories: Map<string, ConversationMemory> = new Map();
  private semanticChunks: Map<string, SemanticChunk[]> = new Map();

  private constructor() {
    logger.info("SmartContextService initialized");
  }

  static getInstance(): SmartContextService {
    if (!SmartContextService.instance) {
      SmartContextService.instance = new SmartContextService();
    }
    return SmartContextService.instance;
  }

  extractSemanticChunks(messages: Message[]): SemanticChunk[] {
    const chunks: SemanticChunk[] = [];

    for (const msg of messages) {
      const content = msg.content;
      const timestamp = new Date(msg.timestamp || Date.now());
      const source = msg.role === "user" ? "user" : "assistant";

      const decisions = this.extractDecisions(content);
      for (const decision of decisions) {
        chunks.push({
          type: "decision",
          content: decision,
          importance: 0.9,
          timestamp,
          source
        });
      }

      const preferences = this.extractPreferences(content);
      for (const pref of preferences) {
        chunks.push({
          type: "preference",
          content: pref,
          importance: 0.8,
          timestamp,
          source
        });
      }

      const errors = this.extractErrors(content);
      for (const error of errors) {
        chunks.push({
          type: "error",
          content: error,
          importance: 0.85,
          timestamp,
          source
        });
      }

      const requirements = this.extractRequirements(content);
      for (const req of requirements) {
        chunks.push({
          type: "requirement",
          content: req,
          importance: 0.95,
          timestamp,
          source
        });
      }

      const technicalContext = this.extractTechnicalContext(content);
      for (const ctx of technicalContext) {
        chunks.push({
          type: "context",
          content: ctx,
          importance: 0.7,
          timestamp,
          source
        });
      }
    }

    return chunks.sort((a, b) => b.importance - a.importance);
  }

  private extractDecisions(content: string): string[] {
    const decisions: string[] = [];
    const patterns = [
      /(?:decided|choosing|going with|using|picked|selected)\s+(.+?)(?:\.|$)/gi,
      /(?:let's|we'll|I'll|will)\s+(.+?)(?:\.|$)/gi,
      /(?:approach|solution|strategy)(?:\s+is|\:)\s*(.+?)(?:\.|$)/gi
    ];

    for (const pattern of patterns) {
      const matches = Array.from(content.matchAll(pattern));
      for (const match of matches) {
        if (match[1] && match[1].length > 10 && match[1].length < 200) {
          decisions.push(match[1].trim());
        }
      }
    }

    return Array.from(new Set(decisions));
  }

  private extractPreferences(content: string): string[] {
    const preferences: string[] = [];
    const patterns = [
      /(?:prefer|like|want|need)\s+(.+?)(?:\.|$)/gi,
      /(?:should|must|always|never)\s+(.+?)(?:\.|$)/gi,
      /(?:style|convention|pattern)(?:\s+is|\:)\s*(.+?)(?:\.|$)/gi
    ];

    for (const pattern of patterns) {
      const matches = Array.from(content.matchAll(pattern));
      for (const match of matches) {
        if (match[1] && match[1].length > 5 && match[1].length < 150) {
          preferences.push(match[1].trim());
        }
      }
    }

    return Array.from(new Set(preferences));
  }

  private extractErrors(content: string): string[] {
    const errors: string[] = [];
    const patterns = [
      /(?:error|Error|ERROR)(?:\:|\s)+(.+?)(?:\n|$)/g,
      /(?:failed|Failed|FAILED)(?:\:|\s)+(.+?)(?:\n|$)/g,
      /(?:TypeError|SyntaxError|ReferenceError|RuntimeError)(?:\:|\s)+(.+?)(?:\n|$)/g,
      /(?:bug|issue|problem)(?:\:|\s+is|\s+was)?\s*(.+?)(?:\.|$)/gi
    ];

    for (const pattern of patterns) {
      const matches = Array.from(content.matchAll(pattern));
      for (const match of matches) {
        if (match[1] && match[1].length > 10 && match[1].length < 300) {
          errors.push(match[1].trim());
        }
      }
    }

    return Array.from(new Set(errors));
  }

  private extractRequirements(content: string): string[] {
    const requirements: string[] = [];
    const patterns = [
      /(?:need|require|must have|should have|want)\s+(.+?)(?:\.|$)/gi,
      /(?:feature|functionality|capability)(?:\:|\s+for)?\s*(.+?)(?:\.|$)/gi,
      /(?:build|create|implement|add)\s+(?:a\s+)?(.+?)(?:\.|$)/gi
    ];

    for (const pattern of patterns) {
      const matches = Array.from(content.matchAll(pattern));
      for (const match of matches) {
        if (match[1] && match[1].length > 10 && match[1].length < 200) {
          requirements.push(match[1].trim());
        }
      }
    }

    return Array.from(new Set(requirements));
  }

  private extractTechnicalContext(content: string): string[] {
    const context: string[] = [];

    const filePaths = content.match(/[\w\-./]+\.(ts|tsx|js|jsx|json|md|css|html)/g);
    if (filePaths) {
      context.push(...filePaths.map(f => `File: ${f}`));
    }

    const componentNames = content.match(/(?:component|function|class)\s+(\w+)/gi);
    if (componentNames) {
      context.push(...componentNames.map(c => c.trim()));
    }

    const packages = content.match(/(?:import|require).*?['"]([^'"]+)['"]/g);
    if (packages) {
      context.push(...packages.slice(0, 10));
    }

    return Array.from(new Set(context));
  }

  updateProjectMemory(projectId: string, messages: Message[]): ConversationMemory {
    const chunks = this.extractSemanticChunks(messages);
    this.semanticChunks.set(projectId, chunks);

    const existingMemory = this.projectMemories.get(projectId) || {
      projectId,
      keyDecisions: [],
      userPreferences: {},
      filesMentioned: [],
      errorsEncountered: [],
      successfulPatterns: [],
      lastUpdated: new Date()
    };

    for (const chunk of chunks) {
      switch (chunk.type) {
        case "decision":
          if (!existingMemory.keyDecisions.includes(chunk.content)) {
            existingMemory.keyDecisions.push(chunk.content);
            existingMemory.keyDecisions = existingMemory.keyDecisions.slice(-20);
          }
          break;
        case "preference":
          const key = chunk.content.split(" ")[0] || "general";
          existingMemory.userPreferences[key] = chunk.content;
          break;
        case "error":
          if (!existingMemory.errorsEncountered.includes(chunk.content)) {
            existingMemory.errorsEncountered.push(chunk.content);
            existingMemory.errorsEncountered = existingMemory.errorsEncountered.slice(-10);
          }
          break;
        case "context":
          if (chunk.content.startsWith("File:")) {
            const file = chunk.content.replace("File: ", "");
            if (!existingMemory.filesMentioned.includes(file)) {
              existingMemory.filesMentioned.push(file);
              existingMemory.filesMentioned = existingMemory.filesMentioned.slice(-30);
            }
          }
          break;
      }
    }

    existingMemory.lastUpdated = new Date();
    this.projectMemories.set(projectId, existingMemory);

    logger.info("Project memory updated", {
      projectId,
      decisions: existingMemory.keyDecisions.length,
      preferences: Object.keys(existingMemory.userPreferences).length,
      errors: existingMemory.errorsEncountered.length
    });

    return existingMemory;
  }

  getProjectMemory(projectId: string): ConversationMemory | null {
    return this.projectMemories.get(projectId) || null;
  }

  generateSmartSummary(messages: Message[]): SmartSummary {
    const chunks = this.extractSemanticChunks(messages);

    const decisions = chunks
      .filter(c => c.type === "decision")
      .map(c => c.content)
      .slice(0, 5);

    const requirements = chunks
      .filter(c => c.type === "requirement")
      .map(c => c.content)
      .slice(0, 5);

    const errors = chunks
      .filter(c => c.type === "error")
      .map(c => c.content)
      .slice(0, 3);

    const technicalContext = chunks
      .filter(c => c.type === "context")
      .map(c => c.content)
      .slice(0, 10);

    const overview = this.generateOverview(messages, chunks);
    const keyPoints = [...requirements, ...decisions.slice(0, 3)];
    const openQuestions = this.extractOpenQuestions(messages);

    return {
      overview,
      keyPoints,
      decisions,
      openQuestions,
      technicalContext
    };
  }

  private generateOverview(messages: Message[], chunks: SemanticChunk[]): string {
    const userMessages = messages.filter(m => m.role === "user");
    const mainTopics = new Set<string>();

    for (const msg of userMessages.slice(-5)) {
      const words = msg.content.toLowerCase().split(/\s+/);
      const significantWords = words.filter(w => 
        w.length > 5 && 
        !["should", "would", "could", "about", "there", "where", "which"].includes(w)
      );
      significantWords.slice(0, 3).forEach(w => mainTopics.add(w));
    }

    const requirementCount = chunks.filter(c => c.type === "requirement").length;
    const decisionCount = chunks.filter(c => c.type === "decision").length;
    const errorCount = chunks.filter(c => c.type === "error").length;
    const topicsArray = Array.from(mainTopics);

    return `Conversation covering: ${topicsArray.slice(0, 5).join(", ")}. ` +
           `${requirementCount} requirements identified, ${decisionCount} decisions made` +
           (errorCount > 0 ? `, ${errorCount} issues addressed.` : ".");
  }

  private extractOpenQuestions(messages: Message[]): string[] {
    const questions: string[] = [];
    
    for (const msg of messages.slice(-5)) {
      const questionMatches = msg.content.match(/[^.!?]*\?/g);
      if (questionMatches) {
        for (const q of questionMatches) {
          if (q.length > 10 && q.length < 200) {
            questions.push(q.trim());
          }
        }
      }
    }

    return questions.slice(-5);
  }

  formatMemoryForPrompt(memory: ConversationMemory): string {
    const parts: string[] = [];

    if (memory.keyDecisions.length > 0) {
      parts.push("## Key Decisions Made");
      parts.push(memory.keyDecisions.slice(-5).map(d => `- ${d}`).join("\n"));
    }

    if (Object.keys(memory.userPreferences).length > 0) {
      parts.push("\n## User Preferences");
      parts.push(Object.entries(memory.userPreferences).slice(0, 10)
        .map(([k, v]) => `- ${v}`).join("\n"));
    }

    if (memory.errorsEncountered.length > 0) {
      parts.push("\n## Previous Errors to Avoid");
      parts.push(memory.errorsEncountered.slice(-5).map(e => `- ${e}`).join("\n"));
    }

    if (memory.filesMentioned.length > 0) {
      parts.push("\n## Files in Context");
      parts.push(memory.filesMentioned.slice(-10).map(f => `- ${f}`).join("\n"));
    }

    return parts.join("\n");
  }

  async createContextAwareSummary(
    messages: Message[],
    projectId: string,
    maxTokens: number = 2000
  ): Promise<string> {
    const memory = this.updateProjectMemory(projectId, messages);
    const summary = this.generateSmartSummary(messages);
    
    const parts: string[] = [];
    
    parts.push("## Conversation Summary");
    parts.push(summary.overview);
    
    if (summary.keyPoints.length > 0) {
      parts.push("\n### Key Points");
      parts.push(summary.keyPoints.map(p => `- ${p}`).join("\n"));
    }

    if (summary.decisions.length > 0) {
      parts.push("\n### Decisions");
      parts.push(summary.decisions.map(d => `- ${d}`).join("\n"));
    }

    if (summary.openQuestions.length > 0) {
      parts.push("\n### Open Questions");
      parts.push(summary.openQuestions.map(q => `- ${q}`).join("\n"));
    }

    if (summary.technicalContext.length > 0) {
      parts.push("\n### Technical Context");
      parts.push(summary.technicalContext.slice(0, 5).map(c => `- ${c}`).join("\n"));
    }

    let result = parts.join("\n");
    const estimatedTokens = contextPruningService.estimateTokens(result);

    if (estimatedTokens > maxTokens) {
      const ratio = maxTokens / estimatedTokens;
      const charLimit = Math.floor(result.length * ratio * 0.9);
      result = result.substring(0, charLimit) + "\n[...summary truncated]";
    }

    return result;
  }

  clearProjectMemory(projectId: string): void {
    this.projectMemories.delete(projectId);
    this.semanticChunks.delete(projectId);
    logger.info("Project memory cleared", { projectId });
  }

  getStats(): {
    projectCount: number;
    totalChunks: number;
    memoryByProject: Record<string, number>;
  } {
    const memoryByProject: Record<string, number> = {};
    
    const entries = Array.from(this.projectMemories.entries());
    for (const [id, memory] of entries) {
      memoryByProject[id] = 
        memory.keyDecisions.length +
        Object.keys(memory.userPreferences).length +
        memory.errorsEncountered.length +
        memory.filesMentioned.length;
    }

    return {
      projectCount: this.projectMemories.size,
      totalChunks: Array.from(this.semanticChunks.values())
        .reduce((sum, chunks) => sum + chunks.length, 0),
      memoryByProject
    };
  }
}

export const smartContextService = SmartContextService.getInstance();
