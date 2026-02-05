import { logger } from "../lib/logger";
import { codeRunnerService, RunResult, ParsedError } from "./code-runner.service";
import { projectMemoryService } from "./project-memory.service";

export interface FixAttempt {
  id: string;
  iteration: number;
  error: ParsedError;
  fix: string;
  success: boolean;
  runResult: RunResult;
  timestamp: number;
}

export interface AutoFixSession {
  id: string;
  projectId: string;
  status: AutoFixStatus;
  maxIterations: number;
  currentIteration: number;
  originalErrors: ParsedError[];
  fixAttempts: FixAttempt[];
  resolvedErrors: ParsedError[];
  unresolvedErrors: ParsedError[];
  startedAt: number;
  completedAt?: number;
  totalTimeMs?: number;
}

export type AutoFixStatus =
  | "idle"
  | "analyzing"
  | "fixing"
  | "validating"
  | "completed"
  | "failed"
  | "max_iterations_reached";

export interface FixStrategy {
  type: string;
  pattern: RegExp;
  fix: (error: ParsedError, context: FixContext) => Promise<string>;
  priority: number;
}

export interface FixContext {
  projectId: string;
  fileContent?: string;
  relatedFiles?: string[];
  recentChanges?: string[];
}

type LLMFixFunction = (prompt: string, context: any) => Promise<string>;

class AutoFixLoopService {
  private static instance: AutoFixLoopService;
  private activeSessions: Map<string, AutoFixSession> = new Map();
  private fixStrategies: FixStrategy[] = [];
  private llmFixFunction?: LLMFixFunction;
  private defaultMaxIterations = 5;

  private constructor() {
    this.initializeStrategies();
    logger.info("AutoFixLoopService initialized");
  }

  static getInstance(): AutoFixLoopService {
    if (!AutoFixLoopService.instance) {
      AutoFixLoopService.instance = new AutoFixLoopService();
    }
    return AutoFixLoopService.instance;
  }

  setLLMFixFunction(fn: LLMFixFunction): void {
    this.llmFixFunction = fn;
    logger.info("LLM fix function registered");
  }

  private initializeStrategies(): void {
    this.fixStrategies = [
      {
        type: "missing_import",
        pattern: /Cannot find module|is not defined/i,
        priority: 1,
        fix: async (error, context) => {
          return `Add missing import for: ${error.message}`;
        }
      },
      {
        type: "type_mismatch",
        pattern: /Type '.*' is not assignable|Argument of type/i,
        priority: 2,
        fix: async (error, context) => {
          return `Fix type mismatch: ${error.message}`;
        }
      },
      {
        type: "null_check",
        pattern: /Object is possibly 'null'|Object is possibly 'undefined'/i,
        priority: 3,
        fix: async (error, context) => {
          return `Add null/undefined check: ${error.message}`;
        }
      },
      {
        type: "syntax_error",
        pattern: /Unexpected token|SyntaxError/i,
        priority: 1,
        fix: async (error, context) => {
          return `Fix syntax error: ${error.message}`;
        }
      },
      {
        type: "missing_property",
        pattern: /Property '.*' does not exist/i,
        priority: 2,
        fix: async (error, context) => {
          return `Add missing property: ${error.message}`;
        }
      }
    ];
  }

  async startAutoFixSession(
    projectId: string,
    options: { maxIterations?: number } = {}
  ): Promise<AutoFixSession> {
    const sessionId = this.generateId();
    const maxIterations = options.maxIterations || this.defaultMaxIterations;

    const session: AutoFixSession = {
      id: sessionId,
      projectId,
      status: "analyzing",
      maxIterations,
      currentIteration: 0,
      originalErrors: [],
      fixAttempts: [],
      resolvedErrors: [],
      unresolvedErrors: [],
      startedAt: Date.now()
    };

    this.activeSessions.set(sessionId, session);
    logger.info("Auto-fix session started", { sessionId, projectId, maxIterations });

    return session;
  }

  async runFixLoop(
    sessionId: string,
    validateFn: () => Promise<RunResult>,
    applyFixFn: (fix: string, error: ParsedError) => Promise<boolean>
  ): Promise<AutoFixSession> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    logger.info("Starting fix loop", { sessionId, maxIterations: session.maxIterations });

    let currentResult = await validateFn();
    session.originalErrors = [...currentResult.errors];
    session.unresolvedErrors = [...currentResult.errors];

    while (
      session.currentIteration < session.maxIterations &&
      session.unresolvedErrors.length > 0 &&
      session.status !== "failed"
    ) {
      session.currentIteration++;
      session.status = "fixing";

      logger.info("Fix iteration starting", {
        sessionId,
        iteration: session.currentIteration,
        errorsRemaining: session.unresolvedErrors.length
      });

      const errorToFix = this.prioritizeError(session.unresolvedErrors);
      const fixContext = await this.buildFixContext(session.projectId, errorToFix);
      
      let fixSuggestion: string;
      try {
        fixSuggestion = await this.generateFix(errorToFix, fixContext);
      } catch (e) {
        logger.error("Failed to generate fix", { error: e });
        continue;
      }

      const fixApplied = await applyFixFn(fixSuggestion, errorToFix);
      
      if (!fixApplied) {
        logger.warn("Fix could not be applied", { sessionId, error: errorToFix.message });
        continue;
      }

      session.status = "validating";
      currentResult = await validateFn();

      const fixAttempt: FixAttempt = {
        id: this.generateId(),
        iteration: session.currentIteration,
        error: errorToFix,
        fix: fixSuggestion,
        success: currentResult.success || !currentResult.errors.some(
          e => e.message === errorToFix.message && e.file === errorToFix.file
        ),
        runResult: currentResult,
        timestamp: Date.now()
      };

      session.fixAttempts.push(fixAttempt);

      if (fixAttempt.success) {
        session.resolvedErrors.push(errorToFix);
        session.unresolvedErrors = session.unresolvedErrors.filter(
          e => !(e.message === errorToFix.message && e.file === errorToFix.file)
        );
        
        const newErrors = currentResult.errors.filter(
          e => !session.originalErrors.some(
            orig => orig.message === e.message && orig.file === e.file
          )
        );
        session.unresolvedErrors.push(...newErrors);

        logger.info("Error fixed successfully", {
          sessionId,
          iteration: session.currentIteration,
          errorFixed: errorToFix.message.slice(0, 50)
        });
      } else {
        logger.warn("Fix attempt failed", {
          sessionId,
          iteration: session.currentIteration,
          error: errorToFix.message.slice(0, 50)
        });
      }

      await projectMemoryService.recordChange(session.projectId, {
        type: "bugfix",
        description: `Auto-fix attempt ${session.currentIteration}: ${errorToFix.type} error`,
        files: errorToFix.file ? [errorToFix.file] : [],
        metrics: {
          filesChanged: 1,
          linesAdded: 0,
          linesRemoved: 0,
          tokensUsed: 0
        }
      });
    }

    session.completedAt = Date.now();
    session.totalTimeMs = session.completedAt - session.startedAt;

    if (session.unresolvedErrors.length === 0) {
      session.status = "completed";
    } else if (session.currentIteration >= session.maxIterations) {
      session.status = "max_iterations_reached";
    }

    logger.info("Auto-fix session completed", {
      sessionId,
      status: session.status,
      iterations: session.currentIteration,
      resolved: session.resolvedErrors.length,
      unresolved: session.unresolvedErrors.length,
      totalTimeMs: session.totalTimeMs
    });

    return session;
  }

  private prioritizeError(errors: ParsedError[]): ParsedError {
    const priorityOrder: Record<string, number> = {
      syntax: 1,
      import: 2,
      reference: 3,
      type: 4,
      runtime: 5,
      unknown: 6
    };

    return [...errors].sort((a, b) => {
      const priorityA = priorityOrder[a.type] || 10;
      const priorityB = priorityOrder[b.type] || 10;
      return priorityA - priorityB;
    })[0];
  }

  private async buildFixContext(projectId: string, error: ParsedError): Promise<FixContext> {
    const context: FixContext = { projectId };

    if (error.file) {
      try {
        const relatedFiles = await projectMemoryService.getRelatedFiles(projectId, error.file);
        context.relatedFiles = relatedFiles;
      } catch (e) {
      }
    }

    return context;
  }

  private async generateFix(error: ParsedError, context: FixContext): Promise<string> {
    for (const strategy of this.fixStrategies.sort((a, b) => a.priority - b.priority)) {
      if (strategy.pattern.test(error.message)) {
        return strategy.fix(error, context);
      }
    }

    if (this.llmFixFunction) {
      const prompt = this.buildLLMFixPrompt(error, context);
      return this.llmFixFunction(prompt, context);
    }

    return error.suggestion || `Fix ${error.type} error: ${error.message}`;
  }

  private buildLLMFixPrompt(error: ParsedError, context: FixContext): string {
    let prompt = `Fix the following ${error.type} error:\n\n`;
    prompt += `Error: ${error.message}\n`;
    
    if (error.file) {
      prompt += `File: ${error.file}\n`;
    }
    if (error.line) {
      prompt += `Line: ${error.line}\n`;
    }
    if (error.suggestion) {
      prompt += `Suggestion: ${error.suggestion}\n`;
    }
    if (error.stack) {
      prompt += `Stack trace:\n${error.stack.slice(0, 500)}\n`;
    }

    prompt += "\nProvide the corrected code that fixes this error.";
    
    return prompt;
  }

  getSession(sessionId: string): AutoFixSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  getSessionStatus(sessionId: string): {
    status: AutoFixStatus;
    progress: number;
    resolved: number;
    unresolved: number;
  } | null {
    const session = this.activeSessions.get(sessionId);
    if (!session) return null;

    return {
      status: session.status,
      progress: (session.currentIteration / session.maxIterations) * 100,
      resolved: session.resolvedErrors.length,
      unresolved: session.unresolvedErrors.length
    };
  }

  cancelSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.status = "failed";
      session.completedAt = Date.now();
      logger.info("Auto-fix session cancelled", { sessionId });
    }
  }

  clearSession(sessionId: string): void {
    this.activeSessions.delete(sessionId);
  }

  private generateId(): string {
    return `fix_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const autoFixLoopService = AutoFixLoopService.getInstance();
