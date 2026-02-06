import { BaseService, ManagedMap } from "../lib/base-service";

export interface StreamingMetrics {
  tokenCount: number;
  elapsedMs: number;
  tokensPerSecond: number;
  estimatedRemainingTokens: number;
  qualityScore: number;
  shouldContinue: boolean;
  warnings: string[];
}

export interface StreamingConfig {
  enabled: boolean;
  maxTokens: number;
  targetTokens: number;
  minTokens: number;
  qualityThreshold: number;
  repetitionThreshold: number;
  maxRepetitionWindow: number;
  adaptiveAdjustment: boolean;
  earlyStopOnCompletion: boolean;
}

export interface StreamingBudget {
  allocated: number;
  used: number;
  remaining: number;
  adjustmentFactor: number;
  recommendation: "continue" | "wrap-up" | "stop";
}

export interface QualitySignals {
  repetitionScore: number;
  completionLikelihood: number;
  coherenceScore: number;
  structureScore: number;
}

class StreamingBudgetService extends BaseService {
  private static instance: StreamingBudgetService;
  private config: StreamingConfig;
  private activeStreams: ManagedMap<string, StreamingSession>;
  private readonly maxActiveStreams = 50;
  private readonly sessionTimeoutMs = 5 * 60 * 1000;
  private sessionStartTimes: ManagedMap<string, number>;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    super("StreamingBudgetService");
    this.config = {
      enabled: true,
      maxTokens: 8192,
      targetTokens: 4096,
      minTokens: 256,
      qualityThreshold: 0.7,
      repetitionThreshold: 0.3,
      maxRepetitionWindow: 100,
      adaptiveAdjustment: true,
      earlyStopOnCompletion: true,
    };
    this.activeStreams = this.createManagedMap<string, StreamingSession>({ maxSize: 50, strategy: "lru" });
    this.sessionStartTimes = this.createManagedMap<string, number>({ maxSize: 50, strategy: "lru" });
    
    this.cleanupTimer = setInterval(() => this.evictStaleSessions(), 30000);
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.activeStreams.clear();
    this.sessionStartTimes.clear();
    this.log("StreamingBudgetService shut down");
  }

  private evictStaleSessions(): void {
    const now = Date.now();
    for (const [id, startTime] of this.sessionStartTimes.entries()) {
      if (now - startTime > this.sessionTimeoutMs) {
        this.activeStreams.delete(id);
        this.sessionStartTimes.delete(id);
        this.logWarn("Evicted stale streaming session", { sessionId: id, ageMs: now - startTime });
      }
    }
  }

  static getInstance(): StreamingBudgetService {
    if (!StreamingBudgetService.instance) {
      StreamingBudgetService.instance = new StreamingBudgetService();
    }
    return StreamingBudgetService.instance;
  }

  configure(config: Partial<StreamingConfig>): void {
    this.config = { ...this.config, ...config };
    this.log("StreamingBudgetService configured", { config: this.config });
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  startSession(sessionId: string, taskType: string, maxTokens?: number): StreamingSession {
    if (this.activeStreams.size >= this.maxActiveStreams) {
      this.evictStaleSessions();
      if (this.activeStreams.size >= this.maxActiveStreams) {
        const oldest = this.sessionStartTimes.entries()
          .sort((a, b) => a[1] - b[1])[0];
        if (oldest) {
          this.activeStreams.delete(oldest[0]);
          this.sessionStartTimes.delete(oldest[0]);
          this.logWarn("Evicted oldest session to make room", { evictedId: oldest[0] });
        }
      }
    }

    const session = new StreamingSession(
      sessionId,
      taskType,
      maxTokens || this.config.maxTokens,
      this.config
    );
    
    this.activeStreams.set(sessionId, session);
    this.sessionStartTimes.set(sessionId, Date.now());
    
    this.log("Streaming session started", { sessionId, taskType, maxTokens: session.maxTokens });
    
    return session;
  }

  getSession(sessionId: string): StreamingSession | undefined {
    return this.activeStreams.get(sessionId);
  }

  endSession(sessionId: string): StreamingMetrics | null {
    const session = this.activeStreams.get(sessionId);
    if (!session) return null;
    
    const metrics = session.getMetrics();
    this.activeStreams.delete(sessionId);
    this.sessionStartTimes.delete(sessionId);
    
    this.log("Streaming session ended", {
      sessionId,
      tokenCount: metrics.tokenCount,
      qualityScore: metrics.qualityScore,
    });
    
    return metrics;
  }

  processChunk(sessionId: string, chunk: string): StreamingBudget {
    const session = this.activeStreams.get(sessionId);
    if (!session) {
      return {
        allocated: this.config.maxTokens,
        used: 0,
        remaining: this.config.maxTokens,
        adjustmentFactor: 1.0,
        recommendation: "continue",
      };
    }
    
    return session.processChunk(chunk);
  }

  getActiveSessions(): number {
    return this.activeStreams.size;
  }
}

class StreamingSession {
  readonly id: string;
  readonly taskType: string;
  readonly maxTokens: number;
  private config: StreamingConfig;
  
  private content: string = "";
  private tokenCount: number = 0;
  private startTime: number = Date.now();
  private recentContent: string = "";
  private ngrams: Map<string, number> = new Map();
  private completionPatterns: RegExp[] = [
    /```\s*$/,
    /\}\s*$/,
    /;\s*$/,
    /\.\s*$/,
    /return\s+[^;]+;\s*$/,
    /export\s+(default\s+)?/,
  ];

  constructor(id: string, taskType: string, maxTokens: number, config: StreamingConfig) {
    this.id = id;
    this.taskType = taskType;
    this.maxTokens = maxTokens;
    this.config = config;
  }

  processChunk(chunk: string): StreamingBudget {
    this.content += chunk;
    this.tokenCount += this.estimateTokens(chunk);
    this.updateRecentContent(chunk);
    this.updateNgrams(chunk);

    const qualitySignals = this.analyzeQuality();
    const adjustmentFactor = this.calculateAdjustment(qualitySignals);
    const effectiveMax = Math.floor(this.maxTokens * adjustmentFactor);
    const remaining = Math.max(0, effectiveMax - this.tokenCount);

    let recommendation: "continue" | "wrap-up" | "stop" = "continue";
    
    if (remaining <= 0) {
      recommendation = "stop";
    } else if (remaining < this.config.minTokens) {
      recommendation = "wrap-up";
    } else if (this.config.earlyStopOnCompletion && this.detectCompletion()) {
      recommendation = "stop";
    } else if (qualitySignals.repetitionScore > this.config.repetitionThreshold) {
      recommendation = "stop";
    }

    return {
      allocated: this.maxTokens,
      used: this.tokenCount,
      remaining,
      adjustmentFactor,
      recommendation,
    };
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 3.5);
  }

  private updateRecentContent(chunk: string): void {
    this.recentContent += chunk;
    if (this.recentContent.length > 500) {
      this.recentContent = this.recentContent.slice(-500);
    }
  }

  private updateNgrams(chunk: string): void {
    const words = chunk.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const ngramSize = 3;
    
    for (let i = 0; i <= words.length - ngramSize; i++) {
      const ngram = words.slice(i, i + ngramSize).join(" ");
      const count = this.ngrams.get(ngram) || 0;
      this.ngrams.set(ngram, count + 1);
    }

    if (this.ngrams.size > 1000) {
      const entries = Array.from(this.ngrams.entries());
      entries.sort((a, b) => b[1] - a[1]);
      this.ngrams = new Map(entries.slice(0, 500));
    }
  }

  private analyzeQuality(): QualitySignals {
    return {
      repetitionScore: this.calculateRepetitionScore(),
      completionLikelihood: this.calculateCompletionLikelihood(),
      coherenceScore: this.calculateCoherenceScore(),
      structureScore: this.calculateStructureScore(),
    };
  }

  private calculateRepetitionScore(): number {
    if (this.ngrams.size === 0) return 0;
    
    let totalRepetitions = 0;
    let maxRepetition = 0;
    
    for (const count of Array.from(this.ngrams.values())) {
      if (count > 1) {
        totalRepetitions += count - 1;
        maxRepetition = Math.max(maxRepetition, count);
      }
    }
    
    const avgRepetition = totalRepetitions / this.ngrams.size;
    return Math.min(1, avgRepetition / 5);
  }

  private calculateCompletionLikelihood(): number {
    const recent = this.recentContent.slice(-100);
    let score = 0;
    
    for (const pattern of this.completionPatterns) {
      if (pattern.test(recent)) {
        score += 0.2;
      }
    }
    
    const hasClosingBrace = (recent.match(/\}/g) || []).length;
    const hasOpeningBrace = (recent.match(/\{/g) || []).length;
    if (hasClosingBrace > hasOpeningBrace) {
      score += 0.1;
    }
    
    return Math.min(1, score);
  }

  private calculateCoherenceScore(): number {
    if (this.recentContent.length < 50) return 1;
    
    const sentences = this.recentContent.split(/[.!?]+/).filter(s => s.trim());
    if (sentences.length < 2) return 1;
    
    const avgLength = sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length;
    const variance = sentences.reduce((sum, s) => sum + Math.pow(s.length - avgLength, 2), 0) / sentences.length;
    const stdDev = Math.sqrt(variance);
    
    const coherenceScore = 1 - Math.min(1, stdDev / avgLength);
    return coherenceScore;
  }

  private calculateStructureScore(): number {
    const content = this.content;
    let score = 1;
    
    const openBraces = (content.match(/\{/g) || []).length;
    const closeBraces = (content.match(/\}/g) || []).length;
    const braceDiff = Math.abs(openBraces - closeBraces);
    score -= Math.min(0.3, braceDiff * 0.05);
    
    const openParens = (content.match(/\(/g) || []).length;
    const closeParens = (content.match(/\)/g) || []).length;
    const parenDiff = Math.abs(openParens - closeParens);
    score -= Math.min(0.2, parenDiff * 0.05);
    
    return Math.max(0, score);
  }

  private calculateAdjustment(signals: QualitySignals): number {
    if (!this.config.adaptiveAdjustment) return 1.0;
    
    let adjustment = 1.0;
    
    if (signals.repetitionScore > 0.2) {
      adjustment *= 0.8;
    }
    
    if (signals.coherenceScore < 0.5) {
      adjustment *= 0.9;
    }
    
    if (signals.structureScore < 0.7) {
      adjustment *= 0.95;
    }
    
    if (signals.completionLikelihood > 0.5 && this.tokenCount > this.config.minTokens) {
      adjustment *= 0.9;
    }
    
    return Math.max(0.5, Math.min(1.2, adjustment));
  }

  private detectCompletion(): boolean {
    if (this.tokenCount < this.config.minTokens) return false;
    
    const recent = this.recentContent.slice(-50);
    
    if (this.taskType === "coding") {
      if (/\}\s*$/.test(recent) || /;\s*$/.test(recent)) {
        const openBraces = (this.content.match(/\{/g) || []).length;
        const closeBraces = (this.content.match(/\}/g) || []).length;
        if (openBraces === closeBraces) {
          return true;
        }
      }
    }
    
    if (/```\s*$/.test(recent) && this.content.includes("```")) {
      const codeBlocks = this.content.split("```").length - 1;
      if (codeBlocks % 2 === 0) {
        return true;
      }
    }
    
    return false;
  }

  getMetrics(): StreamingMetrics {
    const elapsedMs = Date.now() - this.startTime;
    const tokensPerSecond = elapsedMs > 0 ? (this.tokenCount / elapsedMs) * 1000 : 0;
    const qualitySignals = this.analyzeQuality();
    
    const warnings: string[] = [];
    if (qualitySignals.repetitionScore > 0.3) {
      warnings.push("High repetition detected");
    }
    if (qualitySignals.structureScore < 0.7) {
      warnings.push("Incomplete structure detected");
    }
    
    return {
      tokenCount: this.tokenCount,
      elapsedMs,
      tokensPerSecond: Math.round(tokensPerSecond * 10) / 10,
      estimatedRemainingTokens: Math.max(0, this.maxTokens - this.tokenCount),
      qualityScore: (qualitySignals.coherenceScore + qualitySignals.structureScore) / 2,
      shouldContinue: this.tokenCount < this.maxTokens && qualitySignals.repetitionScore < 0.5,
      warnings,
    };
  }

  getContent(): string {
    return this.content;
  }
}

export const streamingBudgetService = StreamingBudgetService.getInstance();
