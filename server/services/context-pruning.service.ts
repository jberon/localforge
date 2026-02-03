import logger from "../lib/logger";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
  tokenCount?: number;
}

export interface PruningResult {
  messages: Message[];
  prunedCount: number;
  summarizedCount: number;
  originalTokens: number;
  finalTokens: number;
  compressionRatio: number;
}

export interface PruningConfig {
  maxTokens: number;
  reserveTokens: number;
  summarizationThreshold: number;
  preserveRecentMessages: number;
  preserveSystemMessages: boolean;
}

const DEFAULT_CONFIG: PruningConfig = {
  maxTokens: 32000,
  reserveTokens: 4000,
  summarizationThreshold: 0.8,
  preserveRecentMessages: 4,
  preserveSystemMessages: true,
};

export class ContextPruningService {
  private static instance: ContextPruningService;

  private constructor() {}

  static getInstance(): ContextPruningService {
    if (!ContextPruningService.instance) {
      ContextPruningService.instance = new ContextPruningService();
    }
    return ContextPruningService.instance;
  }

  estimateTokens(text: string): number {
    if (!text) return 0;
    const words = text.split(/\s+/).length;
    const chars = text.length;
    return Math.ceil(Math.max(words * 1.3, chars / 4));
  }

  calculateTotalTokens(messages: Message[]): number {
    return messages.reduce((total, msg) => {
      return total + (msg.tokenCount || this.estimateTokens(msg.content));
    }, 0);
  }

  needsPruning(messages: Message[], config: Partial<PruningConfig> = {}): boolean {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    const totalTokens = this.calculateTotalTokens(messages);
    const threshold = mergedConfig.maxTokens * mergedConfig.summarizationThreshold;
    return totalTokens > threshold;
  }

  async pruneContext(
    messages: Message[],
    config: Partial<PruningConfig> = {},
    summarizer?: (messages: Message[]) => Promise<string>
  ): Promise<PruningResult> {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    const originalTokens = this.calculateTotalTokens(messages);
    
    logger.info("Starting context pruning", { 
      messageCount: messages.length, 
      originalTokens,
      maxTokens: mergedConfig.maxTokens,
    });

    if (!this.needsPruning(messages, config)) {
      return {
        messages,
        prunedCount: 0,
        summarizedCount: 0,
        originalTokens,
        finalTokens: originalTokens,
        compressionRatio: 1,
      };
    }

    const targetTokens = mergedConfig.maxTokens - mergedConfig.reserveTokens;
    
    // Separate messages by type
    const systemMessages = mergedConfig.preserveSystemMessages 
      ? messages.filter(m => m.role === "system")
      : [];
    
    const conversationMessages = messages.filter(m => m.role !== "system");
    
    // Always preserve recent messages
    const recentMessages = conversationMessages.slice(-mergedConfig.preserveRecentMessages);
    const olderMessages = conversationMessages.slice(0, -mergedConfig.preserveRecentMessages);

    // Calculate tokens for preserved content
    const systemTokens = this.calculateTotalTokens(systemMessages);
    const recentTokens = this.calculateTotalTokens(recentMessages);
    const availableForOlder = targetTokens - systemTokens - recentTokens;

    let prunedMessages: Message[] = [];
    let prunedCount = 0;
    let summarizedCount = 0;

    if (availableForOlder <= 0) {
      // No room for older messages, just keep system + recent
      prunedMessages = [...systemMessages, ...recentMessages];
      prunedCount = olderMessages.length;
    } else if (olderMessages.length > 0) {
      // Try to summarize older messages if summarizer is provided
      if (summarizer && olderMessages.length >= 3) {
        try {
          const summary = await summarizer(olderMessages);
          const summaryTokens = this.estimateTokens(summary);
          
          if (summaryTokens <= availableForOlder) {
            const summaryMessage: Message = {
              role: "assistant",
              content: `[Previous conversation summary]\n${summary}`,
              tokenCount: summaryTokens,
              timestamp: Date.now(),
            };
            prunedMessages = [...systemMessages, summaryMessage, ...recentMessages];
            summarizedCount = olderMessages.length;
          } else {
            // Summary too large, just truncate
            prunedMessages = this.truncateOlderMessages(
              systemMessages,
              olderMessages,
              recentMessages,
              availableForOlder
            );
            prunedCount = olderMessages.length - (prunedMessages.length - systemMessages.length - recentMessages.length);
          }
        } catch (error) {
          logger.warn("Summarization failed, falling back to truncation", { error });
          prunedMessages = this.truncateOlderMessages(
            systemMessages,
            olderMessages,
            recentMessages,
            availableForOlder
          );
          prunedCount = olderMessages.length - (prunedMessages.length - systemMessages.length - recentMessages.length);
        }
      } else {
        // No summarizer or too few messages, just truncate
        prunedMessages = this.truncateOlderMessages(
          systemMessages,
          olderMessages,
          recentMessages,
          availableForOlder
        );
        prunedCount = olderMessages.length - (prunedMessages.length - systemMessages.length - recentMessages.length);
      }
    } else {
      prunedMessages = [...systemMessages, ...recentMessages];
    }

    // Apply code block compression to all messages
    const compressedMessages = prunedMessages.map(msg => ({
      ...msg,
      content: this.compressCodeBlocks(msg.content),
      tokenCount: undefined, // Will be recalculated
    }));

    const finalTokens = this.calculateTotalTokens(compressedMessages);
    
    logger.info("Context pruning completed", {
      prunedCount,
      summarizedCount,
      originalTokens,
      finalTokens,
      compressionRatio: originalTokens / finalTokens,
    });

    return {
      messages: compressedMessages,
      prunedCount,
      summarizedCount,
      originalTokens,
      finalTokens,
      compressionRatio: originalTokens / Math.max(1, finalTokens),
    };
  }

  private truncateOlderMessages(
    systemMessages: Message[],
    olderMessages: Message[],
    recentMessages: Message[],
    availableTokens: number
  ): Message[] {
    const result: Message[] = [...systemMessages];
    let usedTokens = 0;

    // Add older messages from most recent backwards until we run out of tokens
    for (let i = olderMessages.length - 1; i >= 0; i--) {
      const msg = olderMessages[i];
      const msgTokens = msg.tokenCount || this.estimateTokens(msg.content);
      
      if (usedTokens + msgTokens <= availableTokens) {
        result.push(msg);
        usedTokens += msgTokens;
      } else {
        // Try to add a truncated version of this message
        const remainingTokens = availableTokens - usedTokens;
        if (remainingTokens > 100) {
          const truncatedContent = this.truncateContent(msg.content, remainingTokens);
          result.push({
            ...msg,
            content: truncatedContent + "\n[...truncated]",
            tokenCount: remainingTokens,
          });
        }
        break;
      }
    }

    // Sort result by original order (system first, then chronological)
    const systemPart = result.filter(m => m.role === "system");
    const conversationPart = result.filter(m => m.role !== "system");
    
    return [...systemPart, ...conversationPart, ...recentMessages];
  }

  private truncateContent(content: string, targetTokens: number): string {
    const estimatedChars = targetTokens * 4;
    if (content.length <= estimatedChars) {
      return content;
    }
    return content.substring(0, estimatedChars);
  }

  createSummaryPrompt(messages: Message[]): string {
    const conversation = messages
      .map(m => `${m.role.toUpperCase()}: ${m.content.substring(0, 500)}${m.content.length > 500 ? "..." : ""}`)
      .join("\n\n");

    return `Summarize the key points from this conversation in a concise paragraph. Focus on:
- Main topics discussed
- Key decisions or conclusions
- Important context for continuing the conversation

Conversation:
${conversation}

Summary:`;
  }

  compressCodeBlocks(content: string): string {
    const codeBlockPattern = /```[\s\S]*?```/g;
    let compressed = content;
    let match;
    
    while ((match = codeBlockPattern.exec(content)) !== null) {
      const codeBlock = match[0];
      const lines = codeBlock.split("\n");
      
      if (lines.length > 20) {
        // Compress long code blocks
        const language = lines[0].replace("```", "").trim();
        const firstLines = lines.slice(1, 6).join("\n");
        const lastLines = lines.slice(-5, -1).join("\n");
        const compressed_block = `\`\`\`${language}\n${firstLines}\n... (${lines.length - 10} lines omitted) ...\n${lastLines}\n\`\`\``;
        compressed = compressed.replace(codeBlock, compressed_block);
      }
    }
    
    return compressed;
  }

  extractKeyContent(messages: Message[]): string[] {
    const keyContent: string[] = [];
    
    for (const msg of messages) {
      // Extract file paths
      const filePaths = msg.content.match(/(?:\/[\w\-./]+\.(ts|tsx|js|jsx|json|md|css|html))/g);
      if (filePaths) {
        keyContent.push(...filePaths);
      }
      
      // Extract function/component names
      const functionNames = msg.content.match(/(?:function|const|class|interface|type)\s+(\w+)/g);
      if (functionNames) {
        keyContent.push(...functionNames);
      }
      
      // Extract error messages
      const errors = msg.content.match(/(?:error|Error|ERROR):\s*[^\n]+/g);
      if (errors) {
        keyContent.push(...errors);
      }
    }
    
    return Array.from(new Set(keyContent));
  }
}

export const contextPruningService = ContextPruningService.getInstance();
