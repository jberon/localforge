import logger from "../lib/logger";
import { contextPruningService } from "./context-pruning.service";
import { resilienceService } from "./resilience.service";

export interface RetryContext {
  originalPrompt: string;
  systemPrompt?: string;
  context?: string;
  error: Error;
  attemptNumber: number;
  maxAttempts: number;
}

export interface RetryStrategy {
  name: string;
  description: string;
  apply: (ctx: RetryContext) => RetryModification;
}

export interface RetryModification {
  prompt: string;
  systemPrompt?: string;
  context?: string;
  temperatureAdjustment?: number;
  maxTokensAdjustment?: number;
  strategyUsed: string;
  reason: string;
}

export interface SmartRetryResult {
  success: boolean;
  finalAttempt: number;
  strategiesUsed: string[];
  modifications: RetryModification[];
}

// Built-in retry strategies
const STRATEGIES: RetryStrategy[] = [
  {
    name: "reduce_context",
    description: "Reduce context size by 50%",
    apply: (ctx: RetryContext): RetryModification => {
      const contextTokens = contextPruningService.estimateTokens(ctx.context || "");
      const promptTokens = contextPruningService.estimateTokens(ctx.originalPrompt);
      
      // Reduce context to half
      let reducedContext = ctx.context || "";
      if (contextTokens > 1000) {
        const targetLength = Math.floor(reducedContext.length / 2);
        reducedContext = reducedContext.substring(reducedContext.length - targetLength);
        reducedContext = "[...earlier context trimmed...]\n" + reducedContext;
      }
      
      return {
        prompt: ctx.originalPrompt,
        context: reducedContext,
        systemPrompt: ctx.systemPrompt,
        strategyUsed: "reduce_context",
        reason: `Reduced context from ${contextTokens} to ~${contextTokens / 2} tokens`,
      };
    },
  },
  {
    name: "simplify_prompt",
    description: "Simplify the prompt to focus on core requirements",
    apply: (ctx: RetryContext): RetryModification => {
      // Remove verbose language and focus on key requirements
      let simplified = ctx.originalPrompt;
      
      // Remove qualifiers and hedging language
      simplified = simplified.replace(/\b(please|kindly|if possible|maybe|perhaps|could you|would you)\b/gi, "");
      
      // Remove explanatory phrases
      simplified = simplified.replace(/\b(I would like|I want|I need|I think|I believe|in my opinion)\b/gi, "");
      
      // Remove filler words
      simplified = simplified.replace(/\b(very|really|quite|rather|somewhat|fairly)\b/gi, "");
      
      // Compact whitespace
      simplified = simplified.replace(/\s+/g, " ").trim();
      
      // Add explicit instruction
      simplified = `TASK (simplified retry): ${simplified}`;
      
      return {
        prompt: simplified,
        systemPrompt: ctx.systemPrompt,
        context: ctx.context,
        strategyUsed: "simplify_prompt",
        reason: "Removed verbose language and focused on core task",
      };
    },
  },
  {
    name: "break_into_steps",
    description: "Break down complex task into smaller steps",
    apply: (ctx: RetryContext): RetryModification => {
      const stepPrompt = `Let's approach this step by step:

Original task: ${ctx.originalPrompt}

Please:
1. First, identify the key components needed
2. Then, implement the most critical part first
3. Finally, add supporting functionality

Focus on getting a working solution even if simplified.`;

      return {
        prompt: stepPrompt,
        systemPrompt: ctx.systemPrompt,
        context: ctx.context,
        strategyUsed: "break_into_steps",
        reason: "Decomposed task into sequential steps",
      };
    },
  },
  {
    name: "lower_temperature",
    description: "Lower temperature for more deterministic output",
    apply: (ctx: RetryContext): RetryModification => {
      return {
        prompt: ctx.originalPrompt,
        systemPrompt: ctx.systemPrompt,
        context: ctx.context,
        temperatureAdjustment: -0.2,
        strategyUsed: "lower_temperature",
        reason: "Reduced temperature for more consistent output",
      };
    },
  },
  {
    name: "minimal_output",
    description: "Request minimal output to avoid token limits",
    apply: (ctx: RetryContext): RetryModification => {
      const minimalPrompt = `${ctx.originalPrompt}

IMPORTANT: Provide a minimal, working implementation. Omit comments, tests, and optional features. Focus only on core functionality.`;

      return {
        prompt: minimalPrompt,
        systemPrompt: ctx.systemPrompt,
        context: ctx.context,
        maxTokensAdjustment: -2000,
        strategyUsed: "minimal_output",
        reason: "Requested minimal output to avoid limits",
      };
    },
  },
  {
    name: "error_context",
    description: "Include error information in retry",
    apply: (ctx: RetryContext): RetryModification => {
      const errorContext = `Previous attempt failed with error: ${ctx.error.message}

Please try again, avoiding the issue that caused the error.

Original request: ${ctx.originalPrompt}`;

      return {
        prompt: errorContext,
        systemPrompt: ctx.systemPrompt,
        context: ctx.context,
        strategyUsed: "error_context",
        reason: "Added error context to inform retry",
      };
    },
  },
];

export class SmartRetryService {
  private static instance: SmartRetryService;
  
  private strategies: RetryStrategy[] = [...STRATEGIES];
  private retryHistory: Map<string, SmartRetryResult> = new Map();

  private constructor() {}

  static getInstance(): SmartRetryService {
    if (!SmartRetryService.instance) {
      SmartRetryService.instance = new SmartRetryService();
    }
    return SmartRetryService.instance;
  }

  selectStrategy(ctx: RetryContext): RetryStrategy {
    const errorMessage = ctx.error.message.toLowerCase();
    
    // Strategy selection based on error type
    if (errorMessage.includes("token") || errorMessage.includes("length") || errorMessage.includes("too long")) {
      return this.getStrategy("reduce_context") || this.strategies[0];
    }
    
    if (errorMessage.includes("timeout") || errorMessage.includes("timed out")) {
      return this.getStrategy("minimal_output") || this.strategies[0];
    }
    
    if (errorMessage.includes("parse") || errorMessage.includes("syntax") || errorMessage.includes("invalid")) {
      return this.getStrategy("lower_temperature") || this.strategies[0];
    }
    
    if (errorMessage.includes("complex") || errorMessage.includes("too large")) {
      return this.getStrategy("break_into_steps") || this.strategies[0];
    }
    
    // Default strategy progression based on attempt number
    const strategyOrder = [
      "error_context",
      "simplify_prompt",
      "reduce_context",
      "lower_temperature",
      "minimal_output",
      "break_into_steps",
    ];
    
    const strategyIndex = Math.min(ctx.attemptNumber - 1, strategyOrder.length - 1);
    return this.getStrategy(strategyOrder[strategyIndex]) || this.strategies[0];
  }

  getStrategy(name: string): RetryStrategy | undefined {
    return this.strategies.find(s => s.name === name);
  }

  applyStrategy(ctx: RetryContext): RetryModification {
    const strategy = this.selectStrategy(ctx);
    const modification = strategy.apply(ctx);
    
    logger.info("Smart retry strategy applied", {
      strategy: strategy.name,
      attempt: ctx.attemptNumber,
      reason: modification.reason,
    });
    
    return modification;
  }

  async executeWithSmartRetry<T>(
    executor: (prompt: string, systemPrompt?: string, context?: string, temperatureOffset?: number, maxTokensOffset?: number) => Promise<T>,
    originalPrompt: string,
    options?: {
      systemPrompt?: string;
      context?: string;
      maxAttempts?: number;
      circuitKey?: string;
      onRetry?: (attempt: number, strategy: string, modification: RetryModification) => void;
    }
  ): Promise<{ result: T; retryInfo: SmartRetryResult }> {
    const maxAttempts = options?.maxAttempts || 3;
    const circuitKey = options?.circuitKey || "smart-retry";
    const strategiesUsed: string[] = [];
    const modifications: RetryModification[] = [];
    
    let currentPrompt = originalPrompt;
    let currentSystemPrompt = options?.systemPrompt;
    let currentContext = options?.context;
    let temperatureOffset = 0;
    let maxTokensOffset = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Check circuit breaker before attempting
      if (!resilienceService.canExecute(circuitKey)) {
        throw new Error(`Circuit breaker open for ${circuitKey}`);
      }

      try {
        const result = await executor(
          currentPrompt,
          currentSystemPrompt,
          currentContext,
          temperatureOffset,
          maxTokensOffset
        );
        
        // Record success with resilience service
        resilienceService.recordSuccess(circuitKey);
        
        return {
          result,
          retryInfo: {
            success: true,
            finalAttempt: attempt,
            strategiesUsed,
            modifications,
          },
        };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        
        // Record failure with resilience service
        resilienceService.recordFailure(circuitKey, err);
        
        if (attempt >= maxAttempts) {
          throw error;
        }

        const ctx: RetryContext = {
          originalPrompt,
          systemPrompt: options?.systemPrompt,
          context: options?.context,
          error: err,
          attemptNumber: attempt,
          maxAttempts,
        };

        const modification = this.applyStrategy(ctx);
        strategiesUsed.push(modification.strategyUsed);
        modifications.push(modification);

        // Apply modifications
        currentPrompt = modification.prompt;
        currentSystemPrompt = modification.systemPrompt;
        currentContext = modification.context;
        
        if (modification.temperatureAdjustment) {
          temperatureOffset += modification.temperatureAdjustment;
        }
        if (modification.maxTokensAdjustment) {
          maxTokensOffset += modification.maxTokensAdjustment;
        }

        // Use resilience service backoff for delay
        const backoffDelay = resilienceService.calculateBackoff(attempt);
        
        if (options?.onRetry) {
          options.onRetry(attempt, modification.strategyUsed, modification);
        }

        logger.info("Smart retry attempt", {
          attempt,
          strategy: modification.strategyUsed,
          promptLength: currentPrompt.length,
          contextLength: currentContext?.length || 0,
          backoffDelay,
        });

        // Wait before next attempt using resilience backoff
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }

    // This should never be reached, but TypeScript needs it
    throw new Error("Max retry attempts exceeded");
  }

  addStrategy(strategy: RetryStrategy): void {
    this.strategies.push(strategy);
    logger.info("Custom retry strategy added", { name: strategy.name });
  }

  removeStrategy(name: string): boolean {
    const index = this.strategies.findIndex(s => s.name === name);
    if (index >= 0) {
      this.strategies.splice(index, 1);
      return true;
    }
    return false;
  }

  getAvailableStrategies(): Array<{ name: string; description: string }> {
    return this.strategies.map(s => ({
      name: s.name,
      description: s.description,
    }));
  }

  analyzeError(error: Error): {
    category: string;
    suggestedStrategies: string[];
    severity: "low" | "medium" | "high";
  } {
    const message = error.message.toLowerCase();
    
    if (message.includes("token") || message.includes("length")) {
      return {
        category: "token_limit",
        suggestedStrategies: ["reduce_context", "minimal_output"],
        severity: "medium",
      };
    }
    
    if (message.includes("timeout")) {
      return {
        category: "timeout",
        suggestedStrategies: ["minimal_output", "break_into_steps"],
        severity: "high",
      };
    }
    
    if (message.includes("rate limit") || message.includes("429")) {
      return {
        category: "rate_limit",
        suggestedStrategies: ["lower_temperature"],
        severity: "medium",
      };
    }
    
    if (message.includes("parse") || message.includes("json") || message.includes("syntax")) {
      return {
        category: "parse_error",
        suggestedStrategies: ["lower_temperature", "simplify_prompt"],
        severity: "low",
      };
    }
    
    if (message.includes("connection") || message.includes("network")) {
      return {
        category: "connection",
        suggestedStrategies: ["error_context"],
        severity: "high",
      };
    }
    
    return {
      category: "unknown",
      suggestedStrategies: ["error_context", "simplify_prompt"],
      severity: "medium",
    };
  }
}

export const smartRetryService = SmartRetryService.getInstance();
