import { db as dbInstance } from "../db";
import { contextBudgets, projectFiles, estimateTokens, CONTEXT_LIMITS, CONTEXT_ALLOCATION } from "@shared/schema";
import { eq, desc, asc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import logger from "../lib/logger";

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
}

export const contextBudgetService = new ContextBudgetService();
