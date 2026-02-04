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
  private estimationStats = { totalEstimated: 0, samples: 0, avgRatio: 0 };

  private constructor() {}

  static getInstance(): ContextPruningService {
    if (!ContextPruningService.instance) {
      ContextPruningService.instance = new ContextPruningService();
    }
    return ContextPruningService.instance;
  }

  /**
   * Enhanced token estimation using GPT-style BPE approximation.
   * More accurate than simple word/character counting.
   * 
   * Accuracy improvements:
   * - Code blocks tokenize differently (more tokens per character)
   * - URLs and paths are broken into many tokens
   * - Numbers and special characters count differently
   * - Whitespace is often merged with adjacent tokens
   */
  estimateTokens(text: string): number {
    if (!text) return 0;
    
    let totalTokens = 0;
    let remainingText = text;
    
    // Extract and count code blocks separately (higher token density)
    const codeBlockPattern = /```[\s\S]*?```/g;
    const codeBlocks = remainingText.match(codeBlockPattern) || [];
    for (const block of codeBlocks) {
      // Code has ~3.5 chars per token due to symbols and short identifiers
      totalTokens += Math.ceil(block.length / 3.5);
    }
    // Remove all code blocks at once
    remainingText = remainingText.replace(codeBlockPattern, ' ');
    
    // Count URLs (they tokenize into many pieces)
    const urlPattern = /https?:\/\/[^\s]+/g;
    const urls = remainingText.match(urlPattern) || [];
    for (const url of urls) {
      // URLs break into many tokens (~2.5 chars per token)
      totalTokens += Math.ceil(url.length / 2.5);
    }
    remainingText = remainingText.replace(urlPattern, ' ');
    
    // Count file paths (also tokenize densely)
    const pathPattern = /(?:\/[\w\-./]+)+/g;
    const paths = remainingText.match(pathPattern) || [];
    for (const path of paths) {
      totalTokens += Math.ceil(path.length / 3);
    }
    remainingText = remainingText.replace(pathPattern, ' ');
    
    // Count numbers (each number group is typically 1-2 tokens)
    const numbers = remainingText.match(/\d+/g) || [];
    for (const num of numbers) {
      // Numbers: 1-3 digits = 1 token, 4-6 = 2 tokens, etc.
      totalTokens += Math.ceil(num.length / 3);
    }
    remainingText = remainingText.replace(/\d+/g, ' ');
    
    // Count special characters/punctuation (before stripping them)
    // Most punctuation becomes 1 token, some pairs like () {} [] are 1 each
    const specialChars = remainingText.match(/[^a-zA-Z0-9\s]/g) || [];
    // Common symbols: each is roughly 0.5-1 tokens (average 0.7)
    totalTokens += Math.ceil(specialChars.length * 0.7);
    
    // Strip all non-alphanumeric chars before word processing
    const cleanText = remainingText.replace(/[^a-zA-Z\s]/g, ' ');
    
    // Count remaining words using improved BPE estimation
    const words = cleanText.split(/\s+/).filter(w => w.length > 0);
    for (const word of words) {
      if (word.length <= 4) {
        // Short words are usually 1 token
        totalTokens += 1;
      } else if (word.length <= 8) {
        // Medium words are 1-2 tokens
        totalTokens += 1.3;
      } else {
        // Long words are split by BPE (~4 chars per subtoken)
        totalTokens += Math.ceil(word.length / 4);
      }
    }
    
    // Add overhead for message structure (role tokens, delimiters)
    // This is model-dependent; 5 is a conservative average
    const overhead = 5;
    
    // Apply calibration factor if we have enough samples
    let calibrated = totalTokens + overhead;
    if (this.estimationStats.samples >= 10 && this.estimationStats.avgRatio > 0.5 && this.estimationStats.avgRatio < 2.0) {
      calibrated = calibrated * this.estimationStats.avgRatio;
    }
    
    return Math.ceil(calibrated);
  }

  /**
   * Get estimation statistics for accuracy tracking
   */
  getEstimationStats() {
    return { ...this.estimationStats };
  }

  /**
   * Validate estimation accuracy against actual token count from LLM
   * Call this with actual token counts from LLM responses to improve accuracy
   */
  recordActualTokens(text: string, actualTokens: number): void {
    const estimated = this.estimateTokens(text);
    const ratio = actualTokens / Math.max(1, estimated);
    
    this.estimationStats.samples++;
    this.estimationStats.totalEstimated += estimated;
    this.estimationStats.avgRatio = 
      (this.estimationStats.avgRatio * (this.estimationStats.samples - 1) + ratio) / this.estimationStats.samples;
    
    // Log if estimation is significantly off (>20% error)
    if (Math.abs(1 - ratio) > 0.2) {
      logger.debug("Token estimation variance", { 
        estimated, 
        actual: actualTokens, 
        ratio: ratio.toFixed(2),
        textLength: text.length 
      });
    }
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
