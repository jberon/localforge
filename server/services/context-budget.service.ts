import { db as dbInstance } from "../db";
import { contextBudgets, projectFiles, estimateTokens, CONTEXT_LIMITS, CONTEXT_ALLOCATION } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import logger from "../lib/logger";
import { localModelOptimizerService } from "./local-model-optimizer.service";

export type TaskProfile = 
  | "planning"
  | "coding"
  | "debugging"
  | "refactoring"
  | "review"
  | "documentation";

interface AllocationProfile {
  systemPrompt: number;
  userMessage: number;
  codeContext: number;
  chatHistory: number;
  projectMemory: number;
  fewShotExamples: number;
  outputReserve: number;
}

export interface LocalModelAllocation {
  systemPrompt: number;
  userMessage: number;
  codeContext: number;
  chatHistory: number;
  projectMemory: number;
  fewShotExamples: number;
  outputReserve: number;
  total: number;
  available: number;
}

export interface TokenUsageReport {
  allocated: LocalModelAllocation;
  actual: {
    systemPrompt: number;
    userMessage: number;
    codeContext: number;
    chatHistory: number;
    projectMemory: number;
    fewShotExamples: number;
    total: number;
  };
  utilization: number;
  warnings: string[];
}

function getDb() {
  if (!dbInstance) {
    throw new Error("Database not initialized. Check DATABASE_URL environment variable.");
  }
  return dbInstance;
}

export interface ContextBudgetConfig {
  maxTokens: number;
  systemPromptTokens?: number;
  userMessageTokens?: number;
  reserveForOutput?: number;
}

export interface ContextSelection {
  files: { path: string; content: string; tokens: number; relevanceScore: number; reason: string }[];
  chatHistory: string[];
  totalTokens: number;
  breakdown: {
    systemPrompt: number;
    userMessage: number;
    codeContext: number;
    chatHistory: number;
    fileContents: number;
  };
  truncatedFiles: string[];
}

export class ContextBudgetService {
  async calculateBudget(
    projectId: string,
    prompt: string,
    config: ContextBudgetConfig,
    chatHistory: string[] = []
  ): Promise<ContextSelection> {
    const maxTokens = config.maxTokens || CONTEXT_LIMITS.medium;
    const systemPromptTokens = config.systemPromptTokens || Math.floor(maxTokens * CONTEXT_ALLOCATION.systemPrompt);
    const userMessageTokens = config.userMessageTokens || estimateTokens(prompt);
    const outputReserve = config.reserveForOutput || Math.floor(maxTokens * CONTEXT_ALLOCATION.outputBuffer);
    
    const availableForContext = maxTokens - systemPromptTokens - userMessageTokens - outputReserve;
    const codeContextBudget = Math.floor(availableForContext * (CONTEXT_ALLOCATION.codeContext / (CONTEXT_ALLOCATION.codeContext + CONTEXT_ALLOCATION.chatHistory)));
    const chatHistoryBudget = availableForContext - codeContextBudget;

    const files = await this.selectRelevantFiles(projectId, prompt, codeContextBudget);
    const selectedChatHistory = this.selectChatHistory(chatHistory, chatHistoryBudget);
    const chatHistoryTokens = selectedChatHistory.reduce((sum, msg) => sum + estimateTokens(msg), 0);
    const codeContextTokens = files.reduce((sum, f) => sum + f.tokens, 0);
    
    const selection: ContextSelection = {
      files,
      chatHistory: selectedChatHistory,
      totalTokens: systemPromptTokens + userMessageTokens + codeContextTokens + chatHistoryTokens,
      breakdown: {
        systemPrompt: systemPromptTokens,
        userMessage: userMessageTokens,
        codeContext: codeContextTokens,
        chatHistory: chatHistoryTokens,
        fileContents: codeContextTokens,
      },
      truncatedFiles: [],
    };

    return selection;
  }

  private selectChatHistory(messages: string[], maxTokens: number): string[] {
    const selected: string[] = [];
    let totalTokens = 0;
    
    for (let i = messages.length - 1; i >= 0; i--) {
      const msgTokens = estimateTokens(messages[i]);
      if (totalTokens + msgTokens > maxTokens) break;
      selected.unshift(messages[i]);
      totalTokens += msgTokens;
    }
    
    return selected;
  }

  async selectRelevantFiles(
    projectId: string,
    prompt: string,
    maxTokens: number
  ): Promise<{ path: string; content: string; tokens: number; relevanceScore: number; reason: string }[]> {
    const allFiles = await getDb()
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.projectId, projectId))
      .orderBy(desc(projectFiles.updatedAt));

    const promptLower = prompt.toLowerCase();
    const keywords = this.extractKeywords(promptLower);
    
    const scoredFiles = allFiles.map((file) => {
      let score = 0;
      const reasons: string[] = [];

      if (file.path.includes("index") || file.path.includes("main") || file.path.includes("app")) {
        score += 30;
        reasons.push("entry point");
      }

      if (file.path.includes("schema") || file.path.includes("types") || file.path.includes("model")) {
        score += 25;
        reasons.push("data model");
      }

      for (const keyword of keywords) {
        if (file.path.toLowerCase().includes(keyword)) {
          score += 20;
          reasons.push(`path matches "${keyword}"`);
        }
        if (file.content.toLowerCase().includes(keyword)) {
          score += 10;
          reasons.push(`content contains "${keyword}"`);
        }
      }

      const recency = Date.now() - (file.updatedAt || 0);
      const recencyScore = Math.max(0, 15 - Math.floor(recency / (1000 * 60 * 60 * 24)));
      score += recencyScore;
      if (recencyScore > 10) reasons.push("recently modified");

      return {
        path: file.path,
        content: file.content,
        tokens: estimateTokens(file.content),
        relevanceScore: score,
        reason: reasons.length > 0 ? reasons.join(", ") : "general context",
      };
    });

    scoredFiles.sort((a, b) => b.relevanceScore - a.relevanceScore);

    const selected: typeof scoredFiles = [];
    let totalTokens = 0;

    for (const file of scoredFiles) {
      if (totalTokens + file.tokens > maxTokens) continue;
      selected.push(file);
      totalTokens += file.tokens;
    }

    return selected;
  }

  private extractKeywords(prompt: string): string[] {
    const stopWords = new Set([
      "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
      "have", "has", "had", "do", "does", "did", "will", "would", "could",
      "should", "may", "might", "must", "can", "and", "or", "but", "if",
      "then", "else", "when", "where", "why", "how", "what", "which", "who",
      "this", "that", "these", "those", "with", "from", "for", "to", "of",
      "in", "on", "at", "by", "as", "it", "its", "my", "your", "our", "their",
      "i", "you", "we", "they", "he", "she", "me", "us", "them", "him", "her",
      "add", "create", "make", "build", "update", "change", "modify", "fix",
      "please", "want", "need", "like", "would"
    ]);

    const words = prompt.split(/\s+/)
      .map(w => w.replace(/[^a-z0-9]/g, ""))
      .filter(w => w.length > 2 && !stopWords.has(w));

    return Array.from(new Set(words));
  }

  async saveBudget(
    projectId: string,
    selection: ContextSelection,
    configMaxTokens?: number,
    chunkId?: string
  ): Promise<string> {
    const maxTokens = configMaxTokens || Math.floor(selection.totalTokens * (1 + CONTEXT_ALLOCATION.outputBuffer));
    const id = uuidv4();
    const now = Date.now();

    await getDb().insert(contextBudgets).values({
      id,
      projectId,
      chunkId: chunkId || null,
      maxTokens,
      usedTokens: selection.totalTokens,
      breakdown: selection.breakdown,
      selectedFiles: selection.files.map(f => ({
        path: f.path,
        tokens: f.tokens,
        relevanceScore: f.relevanceScore,
        reason: f.reason,
      })),
      truncatedFiles: selection.truncatedFiles,
      createdAt: now,
    });

    logger.info("Context budget saved", { id, projectId, usedTokens: selection.totalTokens });
    return id;
  }

  getModelContextLimit(modelName: string): number {
    const modelLower = modelName.toLowerCase();
    
    if (modelLower.includes("128k") || modelLower.includes("gpt-4o")) {
      return CONTEXT_LIMITS.xlarge;
    }
    if (modelLower.includes("64k") || modelLower.includes("claude")) {
      return CONTEXT_LIMITS.large;
    }
    if (modelLower.includes("32k") || modelLower.includes("qwen") || modelLower.includes("ministral")) {
      return CONTEXT_LIMITS.medium;
    }
    return CONTEXT_LIMITS.small;
  }

  formatContextForPrompt(selection: ContextSelection): string {
    if (selection.files.length === 0) {
      return "";
    }

    const sections: string[] = [];
    sections.push("## Current Project Files\n");

    for (const file of selection.files) {
      sections.push(`### ${file.path}`);
      sections.push("```");
      sections.push(file.content);
      sections.push("```\n");
    }

    return sections.join("\n");
  }

  // ============================================================================
  // LOCAL MODEL OPTIMIZATION METHODS
  // Dynamic token budgeting for small context windows (8K-32K tokens)
  // ============================================================================

  private allocationProfiles: Map<TaskProfile, AllocationProfile> = new Map([
    ["planning", {
      systemPrompt: 0.10,
      userMessage: 0.20,
      codeContext: 0.25,
      chatHistory: 0.20,
      projectMemory: 0.10,
      fewShotExamples: 0.00,
      outputReserve: 0.15
    }],
    ["coding", {
      systemPrompt: 0.08,
      userMessage: 0.12,
      codeContext: 0.40,
      chatHistory: 0.10,
      projectMemory: 0.05,
      fewShotExamples: 0.05,
      outputReserve: 0.20
    }],
    ["debugging", {
      systemPrompt: 0.08,
      userMessage: 0.15,
      codeContext: 0.35,
      chatHistory: 0.15,
      projectMemory: 0.10,
      fewShotExamples: 0.02,
      outputReserve: 0.15
    }],
    ["refactoring", {
      systemPrompt: 0.08,
      userMessage: 0.10,
      codeContext: 0.45,
      chatHistory: 0.08,
      projectMemory: 0.07,
      fewShotExamples: 0.02,
      outputReserve: 0.20
    }],
    ["review", {
      systemPrompt: 0.08,
      userMessage: 0.10,
      codeContext: 0.50,
      chatHistory: 0.10,
      projectMemory: 0.05,
      fewShotExamples: 0.02,
      outputReserve: 0.15
    }],
    ["documentation", {
      systemPrompt: 0.10,
      userMessage: 0.15,
      codeContext: 0.30,
      chatHistory: 0.15,
      projectMemory: 0.10,
      fewShotExamples: 0.00,
      outputReserve: 0.20
    }]
  ]);

  detectModelContextSize(modelName: string): number {
    const profile = localModelOptimizerService.getModelProfile(modelName);
    return profile.contextWindow;
  }

  calculateLocalModelAllocation(
    modelName: string,
    taskProfile: TaskProfile
  ): LocalModelAllocation {
    const contextSize = this.detectModelContextSize(modelName);
    const profile = this.allocationProfiles.get(taskProfile) || this.allocationProfiles.get("coding")!;

    const outputReserve = Math.floor(contextSize * profile.outputReserve);
    const available = contextSize - outputReserve;

    return {
      systemPrompt: Math.floor(available * profile.systemPrompt),
      userMessage: Math.floor(available * profile.userMessage),
      codeContext: Math.floor(available * profile.codeContext),
      chatHistory: Math.floor(available * profile.chatHistory),
      projectMemory: Math.floor(available * profile.projectMemory),
      fewShotExamples: Math.floor(available * profile.fewShotExamples),
      outputReserve,
      total: contextSize,
      available
    };
  }

  calculateAdaptiveAllocation(
    modelName: string,
    taskProfile: TaskProfile,
    actualUsage: {
      systemPromptTokens?: number;
      userMessageTokens?: number;
      projectMemoryTokens?: number;
    }
  ): LocalModelAllocation {
    const base = this.calculateLocalModelAllocation(modelName, taskProfile);
    let unusedTokens = 0;
    const allocation = { ...base };

    if (actualUsage.systemPromptTokens !== undefined) {
      const saved = base.systemPrompt - actualUsage.systemPromptTokens;
      if (saved > 0) {
        unusedTokens += saved;
        allocation.systemPrompt = actualUsage.systemPromptTokens;
      }
    }

    if (actualUsage.userMessageTokens !== undefined) {
      const saved = base.userMessage - actualUsage.userMessageTokens;
      if (saved > 0) {
        unusedTokens += saved;
        allocation.userMessage = actualUsage.userMessageTokens;
      }
    }

    if (actualUsage.projectMemoryTokens !== undefined) {
      const saved = base.projectMemory - actualUsage.projectMemoryTokens;
      if (saved > 0) {
        unusedTokens += saved;
        allocation.projectMemory = actualUsage.projectMemoryTokens;
      }
    }

    if (unusedTokens > 0) {
      allocation.codeContext += Math.floor(unusedTokens * 0.6);
      allocation.chatHistory += Math.floor(unusedTokens * 0.3);
      allocation.fewShotExamples += Math.floor(unusedTokens * 0.1);

      logger.debug("Adaptive allocation redistributed tokens", { unusedTokens });
    }

    return allocation;
  }

  validateAndReport(
    allocation: LocalModelAllocation,
    actual: {
      systemPrompt: number;
      userMessage: number;
      codeContext: number;
      chatHistory: number;
      projectMemory: number;
      fewShotExamples: number;
    }
  ): TokenUsageReport {
    const warnings: string[] = [];
    const actualTotal = 
      actual.systemPrompt + 
      actual.userMessage + 
      actual.codeContext + 
      actual.chatHistory + 
      actual.projectMemory + 
      actual.fewShotExamples;

    if (actual.systemPrompt > allocation.systemPrompt) {
      warnings.push(`System prompt exceeds budget by ${actual.systemPrompt - allocation.systemPrompt} tokens`);
    }
    if (actual.codeContext > allocation.codeContext) {
      warnings.push(`Code context exceeds budget by ${actual.codeContext - allocation.codeContext} tokens`);
    }
    if (actualTotal > allocation.available) {
      warnings.push(`Total usage (${actualTotal}) exceeds available budget (${allocation.available})`);
    }

    const utilization = actualTotal / allocation.available;
    if (utilization < 0.5) {
      warnings.push(`Low context utilization (${(utilization * 100).toFixed(1)}%)`);
    }

    return {
      allocated: allocation,
      actual: { ...actual, total: actualTotal },
      utilization,
      warnings
    };
  }

  getOptimalProfileForTask(prompt: string): TaskProfile {
    const lower = prompt.toLowerCase();

    if (lower.match(/plan|design|architect|think|strategy/)) return "planning";
    if (lower.match(/fix|bug|error|debug|issue|crash|fail/)) return "debugging";
    if (lower.match(/refactor|clean|improve|optimize|simplify/)) return "refactoring";
    if (lower.match(/review|check|analyze|evaluate|assess/)) return "review";
    if (lower.match(/document|readme|comment|jsdoc|explain/)) return "documentation";

    return "coding";
  }

  fitContentToBudget(
    content: string,
    budget: number,
    preserveStart: number = 0.3,
    preserveEnd: number = 0.2
  ): string {
    const tokens = estimateTokens(content);
    if (tokens <= budget) return content;

    const ratio = budget / tokens;
    const targetLength = Math.floor(content.length * ratio);
    const startChars = Math.floor(targetLength * preserveStart);
    const endChars = Math.floor(targetLength * preserveEnd);

    const start = content.slice(0, startChars);
    const end = content.slice(-endChars);
    
    return `${start}\n\n... [${tokens - budget} tokens truncated] ...\n\n${end}`;
  }
}

export const contextBudgetService = new ContextBudgetService();
