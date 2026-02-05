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

  // ============================================================================
  // SEMANTIC COMPRESSION FOR LOCAL MODELS
  // Optimized context selection for small context windows (8K-32K tokens)
  // ============================================================================

  /**
   * Score relevance of code/text to a query using keyword matching and structure analysis
   * Returns 0-1 relevance score
   */
  scoreRelevance(content: string, query: string): number {
    const queryTerms = this.extractKeyTerms(query.toLowerCase());
    const contentLower = content.toLowerCase();
    
    let score = 0;
    let maxScore = 0;
    
    for (const term of queryTerms) {
      maxScore += 1;
      if (contentLower.includes(term)) {
        score += 1;
        
        const regex = new RegExp(`\\b${this.escapeRegex(term)}\\b`, 'gi');
        const matches = contentLower.match(regex);
        if (matches && matches.length > 1) {
          score += Math.min(matches.length - 1, 2) * 0.1;
        }
      }
    }
    
    if (maxScore === 0) return 0;
    return Math.min(score / maxScore, 1);
  }

  private extractKeyTerms(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
      'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
      'into', 'through', 'during', 'before', 'after', 'above', 'below',
      'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where', 'why',
      'how', 'what', 'which', 'who', 'whom', 'this', 'that', 'these',
      'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'it', 'its'
    ]);
    
    return text
      .replace(/[^a-z0-9\s_-]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 2 && !stopWords.has(term))
      .slice(0, 20);
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Score code file relevance based on structure and dependencies
   */
  scoreCodeRelevance(
    code: string,
    query: string,
    activeFile?: string
  ): {
    score: number;
    factors: { name: string; contribution: number }[];
  } {
    const factors: { name: string; contribution: number }[] = [];
    let totalScore = 0;
    
    const keywordScore = this.scoreRelevance(code, query);
    factors.push({ name: 'keyword_match', contribution: keywordScore * 0.3 });
    totalScore += keywordScore * 0.3;
    
    const structureScore = this.scoreCodeStructure(code);
    factors.push({ name: 'structure_quality', contribution: structureScore * 0.2 });
    totalScore += structureScore * 0.2;
    
    if (activeFile) {
      const importScore = this.scoreImportRelevance(code, activeFile);
      factors.push({ name: 'import_relevance', contribution: importScore * 0.25 });
      totalScore += importScore * 0.25;
    }
    
    const recencyScore = 0.15;
    factors.push({ name: 'recency', contribution: recencyScore });
    totalScore += recencyScore;
    
    const exportScore = this.scoreExports(code);
    factors.push({ name: 'exports', contribution: exportScore * 0.1 });
    totalScore += exportScore * 0.1;
    
    return { score: Math.min(totalScore, 1), factors };
  }

  private scoreCodeStructure(code: string): number {
    let score = 0;
    
    if (code.match(/^(import|export)\s/m)) score += 0.2;
    if (code.match(/^(function|const|class|interface|type)\s/m)) score += 0.3;
    if (code.match(/\breturn\b/)) score += 0.2;
    if (code.match(/\basync\b|\bawait\b/)) score += 0.1;
    if (code.match(/\bexport\s+(default|const|function|class)/)) score += 0.2;
    
    return Math.min(score, 1);
  }

  private scoreImportRelevance(code: string, activeFile: string): number {
    const fileName = activeFile.split('/').pop()?.replace(/\.[^.]+$/, '') || '';
    
    if (code.includes(`from './${fileName}'`) || 
        code.includes(`from "./${fileName}"`) ||
        code.includes(`from '@/${fileName}'`)) {
      return 0.8;
    }
    
    if (code.includes(fileName)) {
      return 0.4;
    }
    
    return 0;
  }

  private scoreExports(code: string): number {
    const exportMatches = code.match(/export\s+(default\s+)?(function|const|class|interface|type)\s+\w+/g);
    if (!exportMatches) return 0;
    return Math.min(exportMatches.length * 0.2, 1);
  }

  /**
   * Select most relevant files for context given token budget
   */
  selectRelevantFiles(
    files: Array<{ path: string; content: string }>,
    query: string,
    tokenBudget: number,
    activeFile?: string
  ): Array<{ path: string; content: string; relevanceScore: number }> {
    const scored = files.map(file => {
      const { score } = this.scoreCodeRelevance(file.content, query, activeFile);
      
      let adjustedScore = score;
      if (activeFile && file.path === activeFile) {
        adjustedScore = 1.0;
      }
      
      return {
        ...file,
        relevanceScore: adjustedScore,
        estimatedTokens: this.estimateTokens(file.content)
      };
    });
    
    scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    const selected: Array<{ path: string; content: string; relevanceScore: number }> = [];
    let usedTokens = 0;
    
    for (const file of scored) {
      if (usedTokens + file.estimatedTokens <= tokenBudget) {
        selected.push({
          path: file.path,
          content: file.content,
          relevanceScore: file.relevanceScore
        });
        usedTokens += file.estimatedTokens;
      } else if (file.relevanceScore > 0.7) {
        const remainingTokens = tokenBudget - usedTokens;
        if (remainingTokens > 500) {
          const compressedContent = this.compressCode(file.content, remainingTokens);
          selected.push({
            path: file.path,
            content: compressedContent,
            relevanceScore: file.relevanceScore
          });
          break;
        }
      }
    }
    
    return selected;
  }

  /**
   * Compress code while preserving important structure
   */
  compressCode(code: string, maxTokens: number): string {
    const estimatedTokens = this.estimateTokens(code);
    if (estimatedTokens <= maxTokens) return code;
    
    const lines = code.split('\n');
    const scored: Array<{ line: string; priority: number; index: number }> = [];
    
    lines.forEach((line, index) => {
      let priority = this.getLinePriority(line, index, lines);
      scored.push({ line, priority, index });
    });
    
    const ratio = maxTokens / estimatedTokens;
    const targetLines = Math.floor(lines.length * ratio);
    
    const sorted = [...scored].sort((a, b) => b.priority - a.priority);
    const selectedIndices = new Set(
      sorted.slice(0, targetLines).map(s => s.index)
    );
    
    const result: string[] = [];
    let lastIncluded = -1;
    let gapCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
      if (selectedIndices.has(i)) {
        if (lastIncluded !== -1 && i - lastIncluded > 1) {
          if (gapCount < 5) {
            result.push('  // ... [compressed]');
            gapCount++;
          }
        }
        result.push(lines[i]);
        lastIncluded = i;
      }
    }
    
    return result.join('\n');
  }

  private getLinePriority(line: string, index: number, allLines: string[]): number {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('import ') || trimmed.startsWith('export ')) return 10;
    if (trimmed.match(/^(export\s+)?(function|const|class|interface|type)\s+\w+/)) return 9;
    if (trimmed.match(/^(async\s+)?function\s+\w+/)) return 9;
    if (trimmed.startsWith('return ')) return 7;
    if (trimmed.startsWith('throw ')) return 7;
    if (trimmed.match(/^(if|else|switch|case|default)\s*[({]/)) return 6;
    if (trimmed.match(/^(for|while|do)\s*[({]/)) return 5;
    if (trimmed.match(/^(try|catch|finally)\s*[({]/)) return 6;
    if (trimmed === '{' || trimmed === '}') return 4;
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return 1;
    if (trimmed === '') return 0;
    if (trimmed.includes('=')) return 3;
    if (trimmed.includes('(') && trimmed.includes(')')) return 4;
    
    return 2;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 3.5);
  }

  /**
   * Build optimized context for local LLM with small context window
   */
  buildOptimizedContext(
    projectId: string,
    query: string,
    files: Array<{ path: string; content: string }>,
    chatHistory: Message[],
    options: {
      contextWindow: number;
      activeFile?: string;
      recentErrors?: string[];
    }
  ): {
    selectedFiles: Array<{ path: string; content: string }>;
    summarizedHistory: string;
    relevantMemory: string;
    tokenUsage: { files: number; history: number; memory: number; total: number };
  } {
    const { contextWindow, activeFile, recentErrors } = options;
    
    const outputReserve = Math.floor(contextWindow * 0.25);
    const available = contextWindow - outputReserve;
    
    const fileBudget = Math.floor(available * 0.55);
    const historyBudget = Math.floor(available * 0.25);
    const memoryBudget = Math.floor(available * 0.20);
    
    const selectedFiles = this.selectRelevantFiles(files, query, fileBudget, activeFile);
    const fileTokens = selectedFiles.reduce(
      (sum, f) => sum + this.estimateTokens(f.content), 0
    );
    
    let summarizedHistory = this.summarizeConversation(chatHistory, historyBudget);
    const historyTokens = this.estimateTokens(summarizedHistory);
    
    const memory = this.getProjectMemory(projectId);
    let relevantMemory = '';
    
    if (memory) {
      const memoryParts: string[] = [];
      
      if (recentErrors && recentErrors.length > 0) {
        memoryParts.push(`Recent Errors:\n${recentErrors.slice(0, 3).map(e => `- ${e}`).join('\n')}`);
      }
      
      if (memory.keyDecisions.length > 0) {
        memoryParts.push(`Key Decisions:\n${memory.keyDecisions.slice(-3).map(d => `- ${d}`).join('\n')}`);
      }
      
      if (memory.successfulPatterns.length > 0) {
        memoryParts.push(`Preferred Patterns:\n${memory.successfulPatterns.slice(-2).map(p => `- ${p}`).join('\n')}`);
      }
      
      relevantMemory = memoryParts.join('\n\n');
      
      if (this.estimateTokens(relevantMemory) > memoryBudget) {
        const ratio = memoryBudget / this.estimateTokens(relevantMemory);
        relevantMemory = relevantMemory.slice(0, Math.floor(relevantMemory.length * ratio));
      }
    }
    const memoryTokens = this.estimateTokens(relevantMemory);
    
    return {
      selectedFiles: selectedFiles.map(f => ({ path: f.path, content: f.content })),
      summarizedHistory,
      relevantMemory,
      tokenUsage: {
        files: fileTokens,
        history: historyTokens,
        memory: memoryTokens,
        total: fileTokens + historyTokens + memoryTokens
      }
    };
  }
}

export const smartContextService = SmartContextService.getInstance();
