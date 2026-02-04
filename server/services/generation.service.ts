import { IStorage } from "../storage";
import { createLogger, CorrelationLogger } from "../lib/correlation-logger";
import { llmRequestDeduplicator } from "../lib/request-deduplicator";
import { llmConnectionPool } from "../lib/llm-connection-pool";
import { llmCircuitBreaker, CircuitOpenError } from "../lib/circuit-breaker";
import { parsePlanResponse, parseReviewResponse, type LLMPlanResponse, type LLMReviewResponse } from "../lib/llm-response-schemas";
import { generateCompletion, LLM_DEFAULTS } from "../llm-client";
import { buildPlanningPrompt, buildBuildingPrompt, buildReviewPrompt, type PlanningContext, type BuildContext, type ReviewContext } from "../prompts";
import { z } from "zod";
import { llmSettingsSchema, getOptimalTemperature } from "@shared/schema";

type LLMSettings = z.infer<typeof llmSettingsSchema>;

export interface GenerationResult {
  success: boolean;
  files: Array<{ path: string; content: string }>;
  summary: string;
  qualityScore: number;
  reviewSummary?: LLMReviewResponse;
  error?: string;
}

export interface GenerationProgress {
  phase: string;
  message: string;
  progress?: number;
}

export class GenerationService {
  private storage: IStorage;
  private settings: LLMSettings;
  private logger: CorrelationLogger;

  constructor(storage: IStorage, settings: LLMSettings, correlationId?: string) {
    this.storage = storage;
    this.settings = settings;
    this.logger = createLogger(correlationId);
  }

  async checkConnection(): Promise<{ connected: boolean; error?: string }> {
    const endpoint = this.settings.endpoint || "http://localhost:1234/v1";
    
    if (!llmCircuitBreaker.isAvailable()) {
      const stats = llmCircuitBreaker.getStats();
      return {
        connected: false,
        error: `Circuit breaker is ${stats.state}. Retry after ${Math.ceil((stats.timeout - (Date.now() - stats.lastFailureTime)) / 1000)}s`,
      };
    }

    try {
      const client = llmConnectionPool.get(endpoint);
      await client.models.list();
      llmConnectionPool.markHealthy(endpoint);
      return { connected: true };
    } catch (error) {
      llmConnectionPool.markUnhealthy(endpoint);
      return {
        connected: false,
        error: error instanceof Error ? error.message : "Connection failed",
      };
    }
  }

  async generatePlan(userRequest: string, options?: { appType?: string; templateGuidance?: string }): Promise<LLMPlanResponse | null> {
    const context: PlanningContext = {
      userRequest,
      appType: options?.appType,
      templateGuidance: options?.templateGuidance,
      qualityProfile: "demo",
    };

    const prompt = buildPlanningPrompt(context);
    const config = this.getPlannerConfig();

    this.logger.info("Generating plan", { userRequest: userRequest.slice(0, 100), model: config.model });

    try {
      const response = await llmRequestDeduplicator.dedupe(
        { type: "plan", request: userRequest },
        () => llmCircuitBreaker.execute(() =>
          generateCompletion(config, prompt, userRequest, LLM_DEFAULTS.maxTokens.plan)
        )
      );

      const result = parsePlanResponse(response);
      if (result.success && result.data) {
        this.logger.info("Plan generated successfully", { tasksCount: result.data.tasks.length });
        return result.data;
      }

      this.logger.warn("Failed to parse plan response", { error: result.error });
      return null;
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        this.logger.warn("Circuit breaker open, skipping plan generation");
      } else {
        this.logger.error("Plan generation failed", error instanceof Error ? error : new Error(String(error)));
      }
      return null;
    }
  }

  async generateFile(context: BuildContext): Promise<string | null> {
    const prompt = buildBuildingPrompt(context);
    const config = this.getBuilderConfig();

    this.logger.info("Generating file", { path: context.filePath, type: context.fileType });

    try {
      const response = await llmCircuitBreaker.execute(() =>
        generateCompletion(config, prompt, `Generate ${context.filePath}`, LLM_DEFAULTS.maxTokens.fullStack)
      );

      const cleaned = response
        .replace(/^```(?:tsx?|typescript|javascript)?\n?/gm, "")
        .replace(/```$/gm, "")
        .trim();

      this.logger.info("File generated", { path: context.filePath, size: cleaned.length });
      return cleaned;
    } catch (error) {
      this.logger.error("File generation failed", error instanceof Error ? error : new Error(String(error)), { path: context.filePath });
      return null;
    }
  }

  async generateReview(context: ReviewContext): Promise<LLMReviewResponse | null> {
    const prompt = buildReviewPrompt(context);
    const config = this.getPlannerConfig();

    this.logger.info("Generating review", { qualityProfile: context.qualityProfile });

    try {
      const response = await generateCompletion(
        config,
        "You are a Principal Engineer. Review code and output ONLY valid JSON.",
        prompt,
        LLM_DEFAULTS.maxTokens.plan
      );

      const result = parseReviewResponse(response);
      if (result.success && result.data) {
        this.logger.info("Review generated", { issuesCount: result.data.issues.length });
        return result.data;
      }

      this.logger.warn("Failed to parse review response", { error: result.error });
      return null;
    } catch (error) {
      this.logger.error("Review generation failed", error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  private getPlannerConfig() {
    const baseEndpoint = this.settings.endpoint || "http://localhost:1234/v1";
    const model = this.settings.useDualModels 
      ? (this.settings.plannerModel || this.settings.model || "")
      : (this.settings.model || "");

    const temperature = this.settings.useDualModels
      ? (this.settings.plannerTemperature ?? getOptimalTemperature(model, "planner"))
      : getOptimalTemperature(model, "planner");

    return { endpoint: baseEndpoint, model, temperature };
  }

  private getBuilderConfig() {
    const baseEndpoint = this.settings.endpoint || "http://localhost:1234/v1";
    const model = this.settings.useDualModels 
      ? (this.settings.builderModel || this.settings.model || "")
      : (this.settings.model || "");

    const temperature = this.settings.useDualModels
      ? (this.settings.builderTemperature ?? getOptimalTemperature(model, "builder"))
      : getOptimalTemperature(model, "builder");

    return { endpoint: baseEndpoint, model, temperature };
  }

  getConnectionPoolStats() {
    return llmConnectionPool.getStats();
  }

  getCircuitBreakerStats() {
    return llmCircuitBreaker.getStats();
  }

  getDeduplicatorStats() {
    return {
      pendingRequests: llmRequestDeduplicator.getPendingCount(),
    };
  }
}

export function createGenerationService(
  storage: IStorage,
  settings: LLMSettings,
  correlationId?: string
): GenerationService {
  return new GenerationService(storage, settings, correlationId);
}
