import { BaseService, ManagedMap } from "../lib/base-service";

export type RetryStrategy = "rephrase" | "simplify" | "add-examples" | "decompose" | "constrain-output" | "increase-context";

export type FailureMode = "syntax-error" | "incomplete-output" | "wrong-format" | "off-topic" | "repetition" | "empty-output" | "timeout" | "unknown";

export interface RetryConfig {
  maxRetries: number;
  strategies: RetryStrategy[];
  adaptiveOrder: boolean;
  cooldownMs: number;
}

export interface RetryAttempt {
  attempt: number;
  strategy: RetryStrategy;
  originalPrompt: string;
  modifiedPrompt: string;
  failureMode: FailureMode;
  succeeded: boolean;
  durationMs: number;
}

export interface RetrySession {
  id: string;
  originalPrompt: string;
  attempts: RetryAttempt[];
  finalResult: string | null;
  totalDurationMs: number;
  succeeded: boolean;
}

export interface RetryResult {
  prompt: string;
  strategy: RetryStrategy;
  attempt: number;
  shouldContinue: boolean;
  reasoning: string;
}

interface StrategyStats {
  uses: number;
  successes: number;
}

const ALL_STRATEGIES: RetryStrategy[] = ["rephrase", "simplify", "add-examples", "decompose", "constrain-output", "increase-context"];

const FAILURE_MODE_STRATEGIES: Record<FailureMode, RetryStrategy[]> = {
  "syntax-error": ["constrain-output", "simplify", "add-examples"],
  "incomplete-output": ["simplify", "decompose", "constrain-output"],
  "wrong-format": ["add-examples", "constrain-output", "rephrase"],
  "off-topic": ["rephrase", "add-examples", "constrain-output"],
  "repetition": ["rephrase", "simplify", "constrain-output"],
  "empty-output": ["rephrase", "increase-context", "simplify"],
  "timeout": ["simplify", "decompose", "constrain-output"],
  "unknown": ["rephrase", "simplify", "add-examples"],
};

class SmartRetryService extends BaseService {
  private static instance: SmartRetryService;
  private sessions: ManagedMap<string, RetrySession>;
  private strategyStats: ManagedMap<RetryStrategy, StrategyStats>;
  private completedSessions: RetrySession[];

  private constructor() {
    super("SmartRetryService");
    this.sessions = this.createManagedMap<string, RetrySession>({ maxSize: 200, strategy: "lru" });
    this.strategyStats = this.createManagedMap<RetryStrategy, StrategyStats>({ maxSize: 50, strategy: "lru" });
    this.completedSessions = [];
  }

  static getInstance(): SmartRetryService {
    if (!SmartRetryService.instance) {
      SmartRetryService.instance = new SmartRetryService();
    }
    return SmartRetryService.instance;
  }

  detectFailureMode(output: string, originalPrompt: string): FailureMode {
    if (!output || output.trim().length < 20) {
      return "empty-output";
    }

    const chunks = output.match(/.{50,}/g) || [];
    for (const chunk of chunks) {
      const escaped = chunk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "g");
      const matches = output.match(regex);
      if (matches && matches.length >= 3) {
        return "repetition";
      }
    }

    const openParens = (output.match(/\(/g) || []).length;
    const closeParens = (output.match(/\)/g) || []).length;
    const openBrackets = (output.match(/\[/g) || []).length;
    const closeBrackets = (output.match(/\]/g) || []).length;
    const openBraces = (output.match(/\{/g) || []).length;
    const closeBraces = (output.match(/\}/g) || []).length;
    const singleQuotes = (output.match(/'/g) || []).length;
    const doubleQuotes = (output.match(/"/g) || []).length;
    const backticks = (output.match(/`/g) || []).length;

    if (
      openParens !== closeParens ||
      openBrackets !== closeBrackets ||
      openBraces !== closeBraces ||
      singleQuotes % 2 !== 0 ||
      doubleQuotes % 2 !== 0 ||
      backticks % 2 !== 0
    ) {
      return "syntax-error";
    }

    const trimmed = output.trimEnd();
    const endsWithLetter = /[a-zA-Z]$/.test(trimmed) && /\s[a-zA-Z]+$/.test(trimmed);
    const unclosedCodeFence = (output.match(/```/g) || []).length % 2 !== 0;
    if (endsWithLetter || unclosedCodeFence) {
      return "incomplete-output";
    }

    const promptLower = originalPrompt.toLowerCase();
    const isCodeRequest = /(generat|creat|writ|implement|build|code|function|component)/i.test(promptLower);
    if (isCodeRequest) {
      const hasCodeMarkers = /(function|const|class|import|export|let|var|def|return)\b/.test(output);
      if (!hasCodeMarkers) {
        return "wrong-format";
      }
    }

    const promptWords = originalPrompt.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    const outputLower = output.toLowerCase();
    if (promptWords.length > 0) {
      const matchingWords = promptWords.filter(w => outputLower.includes(w));
      const overlapRatio = matchingWords.length / promptWords.length;
      if (overlapRatio < 0.1) {
        return "off-topic";
      }
    }

    return "unknown";
  }

  getRetryPrompt(
    originalPrompt: string,
    failureMode: FailureMode,
    attempt: number,
    previousOutput?: string,
    config?: Partial<RetryConfig>
  ): RetryResult {
    const mergedConfig: RetryConfig = {
      maxRetries: config?.maxRetries ?? 3,
      strategies: config?.strategies ?? ALL_STRATEGIES,
      adaptiveOrder: config?.adaptiveOrder ?? true,
      cooldownMs: config?.cooldownMs ?? 500,
    };

    let strategy: RetryStrategy;

    if (mergedConfig.adaptiveOrder) {
      const orderedStrategies = FAILURE_MODE_STRATEGIES[failureMode];
      const index = (attempt - 1) % orderedStrategies.length;
      strategy = orderedStrategies[index];
    } else {
      const index = (attempt - 1) % mergedConfig.strategies.length;
      strategy = mergedConfig.strategies[index];
    }

    const modifiedPrompt = this.applyStrategy(originalPrompt, strategy, failureMode, previousOutput);

    const shouldContinue = attempt < mergedConfig.maxRetries;

    const reasoning = `Attempt ${attempt}: Detected failure mode "${failureMode}", applying "${strategy}" strategy. ${shouldContinue ? "Will retry if this fails." : "This is the final attempt."}`;

    return {
      prompt: modifiedPrompt,
      strategy,
      attempt,
      shouldContinue,
      reasoning,
    };
  }

  applyStrategy(prompt: string, strategy: RetryStrategy, failureMode: FailureMode, previousOutput?: string): string {
    switch (strategy) {
      case "rephrase": {
        const sentences = prompt.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
        if (sentences.length > 1) {
          const last = sentences.pop()!;
          sentences.unshift(`IMPORTANT: ${last}`);
        } else if (sentences.length === 1) {
          sentences[0] = `IMPORTANT: ${sentences[0]}`;
        }
        return sentences.join(" ");
      }

      case "simplify": {
        let simplified = prompt
          .replace(/\b(beautiful|elegant|sophisticated|comprehensive|robust|advanced|complex|detailed|thorough)\b/gi, "")
          .replace(/\s+/g, " ")
          .trim();
        simplified += "\n\nKeep it simple. Generate ONLY the essential code. Limit scope to one component/function at a time.";
        return simplified;
      }

      case "add-examples": {
        let withExamples = prompt;
        withExamples += "\n\nExample of expected output format:\n```typescript\nimport { Something } from './module';\n\nexport function myFunction(param: string): Result {\n  return { data: param };\n}\n```";
        return withExamples;
      }

      case "decompose": {
        const words = prompt.split(/\s+/);
        const thirds = Math.ceil(words.length / 3);
        const step1 = words.slice(0, thirds).join(" ");
        const step2 = words.slice(thirds, thirds * 2).join(" ");
        const step3 = words.slice(thirds * 2).join(" ");
        return `Complete ONLY step 1 below:\n\n1. ${step1}\n2. ${step2}\n3. ${step3}`;
      }

      case "constrain-output": {
        return `${prompt}\n\nRespond with ONLY valid code. No explanations. No markdown outside of code fences. Start with import statements.`;
      }

      case "increase-context": {
        return `${prompt}\n\nContext: This is a TypeScript project using modern ES modules. The output should be a valid .ts or .tsx file following standard conventions. Use proper typing, named exports, and follow the existing project patterns.`;
      }

      default:
        return prompt;
    }
  }

  startSession(originalPrompt: string): string {
    const id = `retry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const session: RetrySession = {
      id,
      originalPrompt,
      attempts: [],
      finalResult: null,
      totalDurationMs: 0,
      succeeded: false,
    };
    this.sessions.set(id, session);
    return id;
  }

  recordAttempt(sessionId: string, attempt: RetryAttempt): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.attempts.push(attempt);
    session.totalDurationMs += attempt.durationMs;

    const stats = this.strategyStats.get(attempt.strategy) || { uses: 0, successes: 0 };
    stats.uses++;
    if (attempt.succeeded) {
      stats.successes++;
    }
    this.strategyStats.set(attempt.strategy, stats);
  }

  completeSession(sessionId: string, succeeded: boolean, finalResult?: string): RetrySession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    session.succeeded = succeeded;
    session.finalResult = finalResult ?? null;
    this.completedSessions.push(session);
    return session;
  }

  getStats(): {
    totalSessions: number;
    successRate: number;
    averageRetries: number;
    strategyEffectiveness: Record<RetryStrategy, { uses: number; successes: number; rate: number }>;
    failureModeDistribution: Record<FailureMode, number>;
  } {
    const totalSessions = this.completedSessions.length;
    const successfulSessions = this.completedSessions.filter(s => s.succeeded).length;
    const successRate = totalSessions > 0 ? successfulSessions / totalSessions : 0;

    const totalRetries = this.completedSessions.reduce((sum, s) => sum + s.attempts.length, 0);
    const averageRetries = totalSessions > 0 ? totalRetries / totalSessions : 0;

    const strategyEffectiveness = {} as Record<RetryStrategy, { uses: number; successes: number; rate: number }>;
    for (const s of ALL_STRATEGIES) {
      const stats = this.strategyStats.get(s);
      if (stats) {
        strategyEffectiveness[s] = {
          uses: stats.uses,
          successes: stats.successes,
          rate: stats.uses > 0 ? stats.successes / stats.uses : 0,
        };
      } else {
        strategyEffectiveness[s] = { uses: 0, successes: 0, rate: 0 };
      }
    }

    const failureModeDistribution = {} as Record<FailureMode, number>;
    const allModes: FailureMode[] = ["syntax-error", "incomplete-output", "wrong-format", "off-topic", "repetition", "empty-output", "timeout", "unknown"];
    for (const mode of allModes) {
      failureModeDistribution[mode] = 0;
    }
    for (const session of this.completedSessions) {
      for (const attempt of session.attempts) {
        failureModeDistribution[attempt.failureMode] = (failureModeDistribution[attempt.failureMode] || 0) + 1;
      }
    }

    return {
      totalSessions,
      successRate,
      averageRetries,
      strategyEffectiveness,
      failureModeDistribution,
    };
  }

  destroy(): void {
    this.sessions.clear();
    this.strategyStats.clear();
    this.completedSessions = [];
    this.log("SmartRetryService destroyed");
  }
}

export const smartRetryService = SmartRetryService.getInstance();
