import { BaseService } from "../lib/base-service";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
}

export interface CompressionResult {
  originalMessages: number;
  compressedMessages: number;
  originalTokens: number;
  compressedTokens: number;
  compressionRatio: number;
  preservedCriticalInfo: string[];
}

export interface CompressedConversation {
  messages: Message[];
  summary: string;
  keyPoints: string[];
  compressionResult: CompressionResult;
}

export interface CompressionConfig {
  enabled: boolean;
  maxMessages: number;
  maxTokens: number;
  preserveRecentCount: number;
  summaryMaxTokens: number;
  compressionThreshold: number;
  preserveCodeBlocks: boolean;
  preserveUserPreferences: boolean;
}

interface ConversationSegment {
  messages: Message[];
  importance: number;
  summary: string;
  codeBlocks: string[];
  decisions: string[];
}

class ConversationCompressorService extends BaseService {
  private static instance: ConversationCompressorService;
  private config: CompressionConfig;

  private constructor() {
    super("ConversationCompressorService");
    this.config = {
      enabled: true,
      maxMessages: 50,
      maxTokens: 8192,
      preserveRecentCount: 5,
      summaryMaxTokens: 500,
      compressionThreshold: 0.6,
      preserveCodeBlocks: true,
      preserveUserPreferences: true,
    };
    
    this.log("ConversationCompressorService initialized");
  }

  static getInstance(): ConversationCompressorService {
    if (!ConversationCompressorService.instance) {
      ConversationCompressorService.instance = new ConversationCompressorService();
    }
    return ConversationCompressorService.instance;
  }

  configure(config: Partial<CompressionConfig>): void {
    this.config = { ...this.config, ...config };
    this.log("ConversationCompressorService configured", { config: this.config });
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  shouldCompress(messages: Message[]): boolean {
    if (!this.config.enabled) return false;
    
    if (messages.length > this.config.maxMessages) return true;
    
    const totalTokens = this.estimateTotalTokens(messages);
    if (totalTokens > this.config.maxTokens) return true;
    
    return false;
  }

  compressConversation(messages: Message[]): CompressedConversation {
    const originalTokens = this.estimateTotalTokens(messages);
    
    if (!this.shouldCompress(messages)) {
      return {
        messages,
        summary: "",
        keyPoints: [],
        compressionResult: {
          originalMessages: messages.length,
          compressedMessages: messages.length,
          originalTokens,
          compressedTokens: originalTokens,
          compressionRatio: 1.0,
          preservedCriticalInfo: [],
        },
      };
    }

    const recentMessages = messages.slice(-this.config.preserveRecentCount);
    const olderMessages = messages.slice(0, -this.config.preserveRecentCount);

    const segments = this.segmentConversation(olderMessages);
    const summaries = segments.map(s => this.summarizeSegment(s));
    
    const combinedSummary = this.combineSummaries(summaries);
    const keyPoints = this.extractKeyPoints(segments);
    const preservedInfo = this.extractCriticalInfo(olderMessages);

    const summaryMessage: Message = {
      role: "system",
      content: this.formatSummaryMessage(combinedSummary, keyPoints, preservedInfo),
    };

    const compressedMessages = [summaryMessage, ...recentMessages];
    const compressedTokens = this.estimateTotalTokens(compressedMessages);

    this.log("Conversation compressed", {
      originalMessages: messages.length,
      compressedMessages: compressedMessages.length,
      originalTokens,
      compressedTokens,
      compressionRatio: compressedTokens / originalTokens,
    });

    return {
      messages: compressedMessages,
      summary: combinedSummary,
      keyPoints,
      compressionResult: {
        originalMessages: messages.length,
        compressedMessages: compressedMessages.length,
        originalTokens,
        compressedTokens,
        compressionRatio: compressedTokens / originalTokens,
        preservedCriticalInfo: preservedInfo,
      },
    };
  }

  private estimateTotalTokens(messages: Message[]): number {
    return messages.reduce((sum, m) => sum + this.estimateTokens(m.content), 0);
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 3.5);
  }

  private segmentConversation(messages: Message[]): ConversationSegment[] {
    const segments: ConversationSegment[] = [];
    let currentSegment: Message[] = [];
    let segmentStart = 0;

    for (let i = 0; i < messages.length; i++) {
      currentSegment.push(messages[i]);

      const isTopicChange = this.detectTopicChange(messages, i);
      const isSegmentComplete = currentSegment.length >= 6 || i === messages.length - 1;

      if ((isTopicChange && currentSegment.length >= 2) || isSegmentComplete) {
        const segment = this.createSegment(currentSegment);
        segments.push(segment);
        currentSegment = [];
        segmentStart = i + 1;
      }
    }

    if (currentSegment.length > 0) {
      segments.push(this.createSegment(currentSegment));
    }

    return segments;
  }

  private detectTopicChange(messages: Message[], index: number): boolean {
    if (index === 0 || index >= messages.length - 1) return false;

    const current = messages[index].content.toLowerCase();
    const next = messages[index + 1].content.toLowerCase();

    const topicStarters = [
      /^(now|next|let's|can you|please|i want to|switch to)/,
      /^(actually|instead|forget|different)/,
      /^(new |another |also |additionally)/,
    ];

    for (const pattern of topicStarters) {
      if (pattern.test(next)) return true;
    }

    const currentKeywords = this.extractKeywords(current);
    const nextKeywords = this.extractKeywords(next);
    const overlap = currentKeywords.filter(k => nextKeywords.includes(k)).length;
    const similarity = overlap / Math.max(currentKeywords.length, nextKeywords.length, 1);

    return similarity < 0.2;
  }

  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      "the", "a", "an", "is", "are", "was", "were", "be", "been",
      "being", "have", "has", "had", "do", "does", "did", "will",
      "would", "could", "should", "may", "might", "must", "shall",
      "can", "need", "to", "of", "in", "for", "on", "with", "at",
      "by", "from", "as", "into", "through", "during", "before",
      "after", "above", "below", "between", "under", "again",
      "further", "then", "once", "here", "there", "when", "where",
      "why", "how", "all", "each", "few", "more", "most", "other",
      "some", "such", "no", "nor", "not", "only", "own", "same",
      "so", "than", "too", "very", "just", "and", "but", "if",
      "or", "because", "until", "while", "although", "though",
      "this", "that", "these", "those", "i", "you", "he", "she",
      "it", "we", "they", "me", "him", "her", "us", "them", "my",
      "your", "his", "its", "our", "their", "what", "which", "who"
    ]);

    return text
      .split(/\s+/)
      .map(w => w.replace(/[^a-z0-9]/g, ""))
      .filter(w => w.length > 2 && !stopWords.has(w));
  }

  private createSegment(messages: Message[]): ConversationSegment {
    const content = messages.map(m => m.content).join("\n");
    
    const importance = this.calculateImportance(messages);
    const codeBlocks = this.extractCodeBlocks(content);
    const decisions = this.extractDecisions(messages);
    const summary = this.quickSummarize(messages);

    return {
      messages,
      importance,
      summary,
      codeBlocks,
      decisions,
    };
  }

  private calculateImportance(messages: Message[]): number {
    let score = 0;

    for (const message of messages) {
      const content = message.content.toLowerCase();

      if (content.includes("```")) score += 2;
      if (content.match(/error|bug|fix|issue/)) score += 1;
      if (content.match(/create|build|implement|add/)) score += 1.5;
      if (content.match(/important|critical|must|required/)) score += 2;
      if (content.match(/prefer|always|never|style/)) score += 1.5;
      if (content.match(/database|api|auth|security/)) score += 1;
      if (message.role === "user") score += 0.5;
    }

    return score / messages.length;
  }

  private extractCodeBlocks(content: string): string[] {
    const codeBlockRegex = /```[\s\S]*?```/g;
    const matches = content.match(codeBlockRegex) || [];
    
    return matches.map(block => {
      const lines = block.split("\n");
      if (lines.length <= 10) return block;
      
      const header = lines.slice(0, 3).join("\n");
      const footer = lines.slice(-2).join("\n");
      return `${header}\n// ... (${lines.length - 5} lines)\n${footer}`;
    });
  }

  private extractDecisions(messages: Message[]): string[] {
    const decisions: string[] = [];
    const decisionPatterns = [
      /(?:let's|we'll|i'll|going to|decided to|will use|chose|picked)\s+([^.!?]+)/gi,
      /(?:prefer|want|need|should|must)\s+([^.!?]+)/gi,
    ];

    for (const message of messages) {
      for (const pattern of decisionPatterns) {
        const matches = Array.from(message.content.matchAll(pattern));
        for (const match of matches) {
          if (match[1] && match[1].length > 10 && match[1].length < 100) {
            decisions.push(match[1].trim());
          }
        }
      }
    }

    return decisions.slice(0, 5);
  }

  private quickSummarize(messages: Message[]): string {
    const userMessages = messages.filter(m => m.role === "user");
    const assistantMessages = messages.filter(m => m.role === "assistant");

    if (userMessages.length === 0) {
      return "System interaction";
    }

    const firstRequest = userMessages[0].content.slice(0, 100);
    const lastResponse = assistantMessages.length > 0 
      ? assistantMessages[assistantMessages.length - 1].content.slice(0, 100)
      : "";

    return `User: ${firstRequest}... → Response: ${lastResponse}...`;
  }

  private summarizeSegment(segment: ConversationSegment): string {
    let summary = segment.summary;

    if (segment.decisions.length > 0) {
      summary += `\nDecisions: ${segment.decisions.slice(0, 2).join("; ")}`;
    }

    if (this.config.preserveCodeBlocks && segment.codeBlocks.length > 0) {
      summary += `\nCode: ${segment.codeBlocks.length} block(s)`;
    }

    return summary;
  }

  private combineSummaries(summaries: string[]): string {
    const maxLength = this.config.summaryMaxTokens * 3;
    let combined = summaries.join("\n---\n");
    
    if (combined.length > maxLength) {
      combined = combined.slice(0, maxLength) + "...";
    }
    
    return combined;
  }

  private extractKeyPoints(segments: ConversationSegment[]): string[] {
    const keyPoints: string[] = [];

    segments.sort((a, b) => b.importance - a.importance);

    for (const segment of segments.slice(0, 5)) {
      keyPoints.push(...segment.decisions.slice(0, 2));
    }

    return Array.from(new Set(keyPoints)).slice(0, 10);
  }

  private extractCriticalInfo(messages: Message[]): string[] {
    const critical: string[] = [];

    for (const message of messages) {
      const content = message.content;

      if (this.config.preserveUserPreferences && message.role === "user") {
        const prefPatterns = [
          /(?:i prefer|always use|never use|my style|i like|i want)\s+([^.!?]+)/gi,
        ];
        
        for (const pattern of prefPatterns) {
          const matches = Array.from(content.matchAll(pattern));
          for (const match of matches) {
            if (match[1]) {
              critical.push(`Preference: ${match[1].trim()}`);
            }
          }
        }
      }

      if (content.match(/api[- ]?key|password|secret|token|credential/i)) {
        critical.push("Security-related discussion occurred");
      }

      if (content.match(/database|schema|migration|table/i)) {
        critical.push("Database design discussed");
      }
    }

    return Array.from(new Set(critical)).slice(0, 5);
  }

  private formatSummaryMessage(
    summary: string,
    keyPoints: string[],
    preservedInfo: string[]
  ): string {
    let message = "## Previous Conversation Summary\n\n";
    
    message += summary + "\n\n";
    
    if (keyPoints.length > 0) {
      message += "### Key Decisions Made:\n";
      message += keyPoints.map(p => `- ${p}`).join("\n") + "\n\n";
    }
    
    if (preservedInfo.length > 0) {
      message += "### Important Context:\n";
      message += preservedInfo.map(p => `- ${p}`).join("\n") + "\n";
    }
    
    return message;
  }

  compressIncrementally(
    existingCompression: CompressedConversation,
    newMessages: Message[]
  ): CompressedConversation {
    const allMessages = [
      ...existingCompression.messages,
      ...newMessages,
    ];
    
    return this.compressConversation(allMessages);
  }

  destroy(): void {
    this.log("ConversationCompressorService destroyed");
  }
}

export const conversationCompressorService = ConversationCompressorService.getInstance();
