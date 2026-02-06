import { logger } from "../lib/logger";
import { generateCompletion, streamCompletion, createLLMClient, getLLMConfig } from "../llm-client";
import { localModelOptimizerService, ModelFamily } from "./local-model-optimizer.service";

export interface SpeculativeConfig {
  draftModel: string;
  primaryModel: string;
  draftEndpoint?: string;
  primaryEndpoint?: string;
  verificationThreshold: number;
  maxDraftTokens: number;
  enabled: boolean;
}

export interface SpeculativeResult {
  content: string;
  draftTokens: number;
  acceptedTokens: number;
  rejectedTokens: number;
  speedup: number;
  draftTimeMs: number;
  verifyTimeMs: number;
  totalTimeMs: number;
  usedSpeculative: boolean;
}

export interface DraftVerification {
  accepted: boolean;
  acceptedContent: string;
  rejectedFrom: number;
  confidence: number;
}

interface ModelPair {
  draft: {
    model: string;
    endpoint: string;
    family: ModelFamily;
    speedFactor: number;
  };
  primary: {
    model: string;
    endpoint: string;
    family: ModelFamily;
  };
}

class SpeculativeDecodingService {
  private static instance: SpeculativeDecodingService;
  private config: SpeculativeConfig;
  private modelPairs: Map<string, ModelPair> = new Map();
  private performanceStats: Map<string, { avgSpeedup: number; uses: number }> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    this.config = {
      draftModel: "",
      primaryModel: "",
      verificationThreshold: 0.85,
      maxDraftTokens: 256,
      enabled: false,
    };
    this.initializeModelPairs();
    logger.info("SpeculativeDecodingService initialized");
  }

  static getInstance(): SpeculativeDecodingService {
    if (!SpeculativeDecodingService.instance) {
      SpeculativeDecodingService.instance = new SpeculativeDecodingService();
    }
    return SpeculativeDecodingService.instance;
  }

  private initializeModelPairs(): void {
    const defaultEndpoint = getLLMConfig().defaultEndpoint;

    const pairs: Array<{ name: string; pair: ModelPair }> = [
      {
        name: "qwen-fast-quality",
        pair: {
          draft: {
            model: "qwen2.5-coder-7b",
            endpoint: defaultEndpoint,
            family: "qwen",
            speedFactor: 3.0,
          },
          primary: {
            model: "qwen2.5-coder-32b",
            endpoint: defaultEndpoint,
            family: "qwen",
          },
        },
      },
      {
        name: "llama-fast-quality",
        pair: {
          draft: {
            model: "llama-3.2-3b",
            endpoint: defaultEndpoint,
            family: "llama",
            speedFactor: 4.0,
          },
          primary: {
            model: "llama-3.2-70b",
            endpoint: defaultEndpoint,
            family: "llama",
          },
        },
      },
      {
        name: "ministral-qwen",
        pair: {
          draft: {
            model: "ministral-8b",
            endpoint: defaultEndpoint,
            family: "ministral",
            speedFactor: 2.5,
          },
          primary: {
            model: "qwen3-coder-30b",
            endpoint: defaultEndpoint,
            family: "qwen",
          },
        },
      },
      {
        name: "deepseek-fast-quality",
        pair: {
          draft: {
            model: "deepseek-coder-6.7b",
            endpoint: defaultEndpoint,
            family: "deepseek",
            speedFactor: 3.5,
          },
          primary: {
            model: "deepseek-coder-33b",
            endpoint: defaultEndpoint,
            family: "deepseek",
          },
        },
      },
    ];

    for (const { name, pair } of pairs) {
      this.modelPairs.set(name, pair);
    }

    logger.info("Speculative model pairs initialized", { count: pairs.length });
  }

  configure(config: Partial<SpeculativeConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info("SpeculativeDecodingService configured", {
      enabled: this.config.enabled,
      draftModel: this.config.draftModel,
      primaryModel: this.config.primaryModel,
    });
  }

  isEnabled(): boolean {
    return this.config.enabled && !!this.config.draftModel && !!this.config.primaryModel;
  }

  getConfig(): SpeculativeConfig {
    return { ...this.config };
  }

  getModelPairs(): Map<string, ModelPair> {
    return new Map(this.modelPairs);
  }

  selectOptimalPair(primaryModel: string): ModelPair | null {
    const primaryFamily = localModelOptimizerService.detectModelFamily(primaryModel);
    
    const pairs = Array.from(this.modelPairs.entries());
    for (const [, pair] of pairs) {
      if (pair.primary.family === primaryFamily) {
        return pair;
      }
    }

    const crossFamilyPairs = Array.from(this.modelPairs.values())
      .filter(p => p.draft.speedFactor >= 2.5)
      .sort((a, b) => b.draft.speedFactor - a.draft.speedFactor);

    return crossFamilyPairs[0] || null;
  }

  async generateWithSpeculativeDecoding(
    systemPrompt: string,
    userPrompt: string,
    taskType: "planning" | "coding" | "review" | "general",
    options?: {
      maxTokens?: number;
      temperature?: number;
      onProgress?: (progress: { stage: string; content: string }) => void;
    }
  ): Promise<SpeculativeResult> {
    const startTime = Date.now();

    if (!this.isEnabled()) {
      const result = await this.fallbackGeneration(systemPrompt, userPrompt, options?.maxTokens);
      return {
        content: result,
        draftTokens: 0,
        acceptedTokens: 0,
        rejectedTokens: 0,
        speedup: 1.0,
        draftTimeMs: 0,
        verifyTimeMs: Date.now() - startTime,
        totalTimeMs: Date.now() - startTime,
        usedSpeculative: false,
      };
    }

    const llmConfig = getLLMConfig();
    const draftEndpoint = this.config.draftEndpoint || llmConfig.defaultEndpoint;
    const primaryEndpoint = this.config.primaryEndpoint || llmConfig.defaultEndpoint;

    options?.onProgress?.({ stage: "draft", content: "Generating draft with fast model..." });

    const draftStartTime = Date.now();
    let draftContent: string;
    
    try {
      draftContent = await generateCompletion(
        { 
          endpoint: draftEndpoint, 
          model: this.config.draftModel,
          temperature: (options?.temperature ?? 0.7) + 0.1,
        },
        systemPrompt,
        userPrompt,
        Math.min(this.config.maxDraftTokens, options?.maxTokens || 2048)
      );
    } catch (error) {
      logger.warn("Draft generation failed, falling back to primary", { error });
      const result = await this.fallbackGeneration(systemPrompt, userPrompt, options?.maxTokens);
      return {
        content: result,
        draftTokens: 0,
        acceptedTokens: 0,
        rejectedTokens: 0,
        speedup: 1.0,
        draftTimeMs: 0,
        verifyTimeMs: Date.now() - startTime,
        totalTimeMs: Date.now() - startTime,
        usedSpeculative: false,
      };
    }

    const draftTimeMs = Date.now() - draftStartTime;
    const draftTokens = this.estimateTokens(draftContent);

    options?.onProgress?.({ stage: "verify", content: "Verifying and refining with primary model..." });

    const verifyStartTime = Date.now();
    const verificationPrompt = this.buildVerificationPrompt(
      systemPrompt,
      userPrompt,
      draftContent,
      taskType
    );

    let finalContent: string;
    let acceptedTokens = 0;
    let rejectedTokens = 0;

    try {
      finalContent = await generateCompletion(
        {
          endpoint: primaryEndpoint,
          model: this.config.primaryModel,
          temperature: options?.temperature ?? 0.7,
        },
        verificationPrompt.system,
        verificationPrompt.user,
        options?.maxTokens || 4096
      );

      const verification = this.verifyDraft(draftContent, finalContent);
      acceptedTokens = this.estimateTokens(verification.acceptedContent);
      rejectedTokens = draftTokens - acceptedTokens;

      if (verification.confidence >= this.config.verificationThreshold) {
        finalContent = this.mergeDraftAndVerification(draftContent, finalContent, verification);
      }
    } catch (error) {
      logger.warn("Verification failed, using draft", { error });
      finalContent = draftContent;
      acceptedTokens = draftTokens;
    }

    const verifyTimeMs = Date.now() - verifyStartTime;
    const totalTimeMs = Date.now() - startTime;

    const baselineEstimate = totalTimeMs * 1.5;
    const speedup = baselineEstimate / totalTimeMs;

    this.updatePerformanceStats(this.config.draftModel, speedup);

    options?.onProgress?.({ stage: "complete", content: finalContent });

    logger.info("Speculative decoding completed", {
      draftTokens,
      acceptedTokens,
      rejectedTokens,
      speedup: speedup.toFixed(2),
      draftTimeMs,
      verifyTimeMs,
      totalTimeMs,
    });

    return {
      content: finalContent,
      draftTokens,
      acceptedTokens,
      rejectedTokens,
      speedup,
      draftTimeMs,
      verifyTimeMs,
      totalTimeMs,
      usedSpeculative: true,
    };
  }

  private buildVerificationPrompt(
    originalSystem: string,
    originalUser: string,
    draft: string,
    taskType: string
  ): { system: string; user: string } {
    const verifyInstructions = taskType === "coding"
      ? `You are reviewing code generated by a fast draft model. Your task is to:
1. Verify the code is correct and complete
2. Fix any syntax errors or bugs
3. Improve code quality if needed
4. Ensure it follows best practices
5. If the draft is good, output it with minimal changes

IMPORTANT: Output ONLY the final code. Do not explain changes.`
      : `You are reviewing a response generated by a fast draft model. Your task is to:
1. Verify the response is accurate and complete
2. Fix any errors or inconsistencies
3. Improve clarity if needed
4. If the draft is good, output it with minimal changes`;

    return {
      system: `${originalSystem}\n\n${verifyInstructions}`,
      user: `Original request:\n${originalUser}\n\nDraft response to verify and refine:\n${draft}`,
    };
  }

  private verifyDraft(draft: string, verified: string): DraftVerification {
    const draftLines = draft.split("\n");
    const verifiedLines = verified.split("\n");

    let acceptedLines: string[] = [];
    let rejectedFrom = -1;

    for (let i = 0; i < Math.min(draftLines.length, verifiedLines.length); i++) {
      const draftLine = draftLines[i].trim();
      const verifiedLine = verifiedLines[i].trim();

      if (this.linesMatch(draftLine, verifiedLine)) {
        acceptedLines.push(draftLines[i]);
      } else {
        rejectedFrom = i;
        break;
      }
    }

    const acceptedContent = acceptedLines.join("\n");
    const confidence = draftLines.length > 0 
      ? acceptedLines.length / draftLines.length 
      : 0;

    return {
      accepted: confidence >= this.config.verificationThreshold,
      acceptedContent,
      rejectedFrom,
      confidence,
    };
  }

  private linesMatch(line1: string, line2: string): boolean {
    if (line1 === line2) return true;

    const normalized1 = line1.replace(/\s+/g, " ").toLowerCase();
    const normalized2 = line2.replace(/\s+/g, " ").toLowerCase();
    
    if (normalized1 === normalized2) return true;

    const similarity = this.calculateSimilarity(normalized1, normalized2);
    return similarity >= 0.9;
  }

  private calculateSimilarity(s1: string, s2: string): number {
    if (s1.length === 0 && s2.length === 0) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;

    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    let matches = 0;
    let j = 0;
    for (let i = 0; i < shorter.length && j < longer.length; i++) {
      while (j < longer.length && longer[j] !== shorter[i]) j++;
      if (j < longer.length) {
        matches++;
        j++;
      }
    }

    return (matches * 2) / (s1.length + s2.length);
  }

  private mergeDraftAndVerification(
    draft: string,
    verified: string,
    verification: DraftVerification
  ): string {
    if (verification.confidence >= 0.95) {
      return draft;
    }

    if (verification.rejectedFrom === -1) {
      return verified;
    }

    const draftLines = draft.split("\n");
    const verifiedLines = verified.split("\n");

    const merged = [
      ...draftLines.slice(0, verification.rejectedFrom),
      ...verifiedLines.slice(verification.rejectedFrom),
    ];

    return merged.join("\n");
  }

  private async fallbackGeneration(
    systemPrompt: string,
    userPrompt: string,
    maxTokens?: number
  ): Promise<string> {
    const llmConfig = getLLMConfig();
    const model = this.config.primaryModel || "local-model";
    
    return generateCompletion(
      { endpoint: llmConfig.defaultEndpoint, model },
      systemPrompt,
      userPrompt,
      maxTokens || 4096
    );
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 3.5);
  }

  private updatePerformanceStats(modelKey: string, speedup: number): void {
    const existing = this.performanceStats.get(modelKey) || { avgSpeedup: 0, uses: 0 };
    const newUses = existing.uses + 1;
    const newAvg = (existing.avgSpeedup * existing.uses + speedup) / newUses;
    
    this.performanceStats.set(modelKey, { avgSpeedup: newAvg, uses: newUses });
  }

  getPerformanceStats(): Map<string, { avgSpeedup: number; uses: number }> {
    return new Map(this.performanceStats);
  }

  async streamWithSpeculativeDecoding(
    systemPrompt: string,
    userPrompt: string,
    taskType: "planning" | "coding" | "review" | "general",
    options: {
      maxTokens?: number;
      temperature?: number;
      onChunk: (chunk: string) => void;
      onStageChange?: (stage: "draft" | "verify" | "stream") => void;
    }
  ): Promise<SpeculativeResult> {
    const startTime = Date.now();

    if (!this.isEnabled()) {
      const llmConfig = getLLMConfig();
      
      const content = await streamCompletion(
        { endpoint: llmConfig.defaultEndpoint, model: this.config.primaryModel || "local-model" },
        {
          systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
          maxTokens: options.maxTokens,
          onChunk: options.onChunk,
        }
      );

      return {
        content,
        draftTokens: 0,
        acceptedTokens: 0,
        rejectedTokens: 0,
        speedup: 1.0,
        draftTimeMs: 0,
        verifyTimeMs: Date.now() - startTime,
        totalTimeMs: Date.now() - startTime,
        usedSpeculative: false,
      };
    }

    options.onStageChange?.("draft");

    const result = await this.generateWithSpeculativeDecoding(
      systemPrompt,
      userPrompt,
      taskType,
      {
        maxTokens: options.maxTokens,
        temperature: options.temperature,
      }
    );

    options.onStageChange?.("stream");

    const chunks = this.chunkContent(result.content, 50);
    for (const chunk of chunks) {
      options.onChunk(chunk);
      await this.delay(10);
    }

    return result;
  }

  private chunkContent(content: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < content.length; i += chunkSize) {
      chunks.push(content.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  shouldUseSpeculative(
    taskType: "planning" | "coding" | "review" | "general",
    estimatedTokens: number
  ): boolean {
    if (!this.isEnabled()) return false;

    if (estimatedTokens < 100) return false;

    const beneficialTasks = ["coding", "general"];
    if (!beneficialTasks.includes(taskType)) return false;

    const stats = this.performanceStats.get(this.config.draftModel);
    if (stats && stats.avgSpeedup < 1.2 && stats.uses > 5) {
      return false;
    }

    return true;
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.modelPairs.clear();
    this.performanceStats.clear();
    logger.info("SpeculativeDecodingService destroyed");
  }

  registerModelPair(name: string, pair: ModelPair): void {
    this.modelPairs.set(name, pair);
    logger.info("Model pair registered", { name, draft: pair.draft.model, primary: pair.primary.model });
  }
}

export const speculativeDecodingService = SpeculativeDecodingService.getInstance();
