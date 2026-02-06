import { logger } from "../lib/logger";
import { EventEmitter } from "events";

export interface RuntimeError {
  id: string;
  projectId: string;
  type: RuntimeErrorType;
  message: string;
  stack?: string;
  file?: string;
  line?: number;
  column?: number;
  timestamp: number;
  source: "browser" | "server" | "build";
  severity: "error" | "warning" | "info";
  handled: boolean;
  fixAttempted: boolean;
  suggestion?: string;
  metadata?: Record<string, any>;
}

export type RuntimeErrorType =
  | "syntax_error"
  | "reference_error"
  | "type_error"
  | "range_error"
  | "network_error"
  | "promise_rejection"
  | "render_error"
  | "hydration_error"
  | "build_error"
  | "import_error"
  | "unknown";

export interface RuntimeLog {
  id: string;
  projectId: string;
  level: "log" | "info" | "warn" | "error" | "debug";
  message: string;
  args?: any[];
  timestamp: number;
  source: "browser" | "server";
}

export interface RuntimeSession {
  id: string;
  projectId: string;
  status: "active" | "paused" | "stopped";
  errors: RuntimeError[];
  logs: RuntimeLog[];
  startedAt: number;
  lastActivityAt: number;
  errorCount: number;
  warningCount: number;
}

export interface ErrorPattern {
  pattern: RegExp;
  type: RuntimeErrorType;
  severity: "error" | "warning" | "info";
  extractDetails: (message: string, stack?: string) => Partial<RuntimeError>;
}

class RuntimeFeedbackService extends EventEmitter {
  private static instance: RuntimeFeedbackService;
  private activeSessions: Map<string, RuntimeSession> = new Map();
  private errorPatterns: ErrorPattern[] = [];
  private maxLogsPerSession = 500;
  private maxErrorsPerSession = 100;

  private constructor() {
    super();
    this.initializeErrorPatterns();
    logger.info("RuntimeFeedbackService initialized");
  }

  static getInstance(): RuntimeFeedbackService {
    if (!RuntimeFeedbackService.instance) {
      RuntimeFeedbackService.instance = new RuntimeFeedbackService();
    }
    return RuntimeFeedbackService.instance;
  }

  private initializeErrorPatterns(): void {
    this.errorPatterns = [
      {
        pattern: /SyntaxError|Unexpected token/i,
        type: "syntax_error",
        severity: "error",
        extractDetails: (message, stack) => ({
          suggestion: "Check for missing brackets, quotes, or semicolons"
        })
      },
      {
        pattern: /ReferenceError|is not defined/i,
        type: "reference_error",
        severity: "error",
        extractDetails: (message) => {
          const match = message.match(/(\w+) is not defined/);
          return {
            metadata: { undefinedVariable: match?.[1] },
            suggestion: `Import or define "${match?.[1]}" before using it`
          };
        }
      },
      {
        pattern: /TypeError|Cannot read propert|undefined is not/i,
        type: "type_error",
        severity: "error",
        extractDetails: (message) => ({
          suggestion: "Add null checks or optional chaining (?.)"
        })
      },
      {
        pattern: /Failed to fetch|NetworkError|CORS/i,
        type: "network_error",
        severity: "error",
        extractDetails: (message) => ({
          suggestion: "Check API endpoint URL and CORS configuration"
        })
      },
      {
        pattern: /Unhandled Rejection|UnhandledPromiseRejection/i,
        type: "promise_rejection",
        severity: "error",
        extractDetails: (message) => ({
          suggestion: "Add .catch() handler or try/catch around async code"
        })
      },
      {
        pattern: /Hydration|Text content does not match|did not match/i,
        type: "hydration_error",
        severity: "warning",
        extractDetails: (message) => ({
          suggestion: "Ensure server and client render the same content initially"
        })
      },
      {
        pattern: /Cannot find module|Module not found/i,
        type: "import_error",
        severity: "error",
        extractDetails: (message) => {
          const match = message.match(/Cannot find module ['"](.+?)['"]/);
          return {
            metadata: { missingModule: match?.[1] },
            suggestion: `Install missing module: npm install ${match?.[1]}`
          };
        }
      },
      {
        pattern: /React.*render|Component|JSX/i,
        type: "render_error",
        severity: "error",
        extractDetails: (message) => ({
          suggestion: "Check component props and return statements"
        })
      },
      {
        pattern: /Build failed|Compilation error|esbuild/i,
        type: "build_error",
        severity: "error",
        extractDetails: (message) => ({
          suggestion: "Fix syntax errors and missing dependencies"
        })
      }
    ];
  }

  /**
   * Start a new runtime feedback session for a project
   */
  startSession(projectId: string): RuntimeSession {
    const existingSession = this.activeSessions.get(projectId);
    if (existingSession && existingSession.status === "active") {
      return existingSession;
    }

    const session: RuntimeSession = {
      id: this.generateId(),
      projectId,
      status: "active",
      errors: [],
      logs: [],
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
      errorCount: 0,
      warningCount: 0
    };

    this.activeSessions.set(projectId, session);
    logger.info("Runtime session started", { projectId, sessionId: session.id });

    return session;
  }

  /**
   * Report an error from the runtime
   */
  reportError(
    projectId: string,
    errorData: {
      message: string;
      stack?: string;
      file?: string;
      line?: number;
      column?: number;
      source: "browser" | "server" | "build";
    }
  ): RuntimeError {
    let session = this.activeSessions.get(projectId);
    if (!session) {
      session = this.startSession(projectId);
    }

    const errorType = this.classifyError(errorData.message, errorData.stack);
    const pattern = this.findMatchingPattern(errorData.message);
    const additionalDetails = pattern?.extractDetails(errorData.message, errorData.stack) || {};

    const error: RuntimeError = {
      id: this.generateId(),
      projectId,
      type: errorType.type,
      message: errorData.message,
      stack: errorData.stack,
      file: errorData.file || this.extractFileFromStack(errorData.stack),
      line: errorData.line || this.extractLineFromStack(errorData.stack),
      column: errorData.column,
      timestamp: Date.now(),
      source: errorData.source,
      severity: errorType.severity,
      handled: false,
      fixAttempted: false,
      ...additionalDetails
    };

    if (session.errors.length >= this.maxErrorsPerSession) {
      session.errors.shift();
    }
    session.errors.push(error);
    session.lastActivityAt = Date.now();

    if (error.severity === "error") {
      session.errorCount++;
    } else if (error.severity === "warning") {
      session.warningCount++;
    }

    logger.info("Runtime error reported", {
      projectId,
      errorId: error.id,
      type: error.type,
      severity: error.severity
    });

    this.emit("error", error);

    return error;
  }

  /**
   * Report a log message from the runtime
   */
  reportLog(
    projectId: string,
    logData: {
      level: "log" | "info" | "warn" | "error" | "debug";
      message: string;
      args?: any[];
      source: "browser" | "server";
    }
  ): RuntimeLog {
    let session = this.activeSessions.get(projectId);
    if (!session) {
      session = this.startSession(projectId);
    }

    const log: RuntimeLog = {
      id: this.generateId(),
      projectId,
      level: logData.level,
      message: logData.message,
      args: logData.args,
      timestamp: Date.now(),
      source: logData.source
    };

    if (session.logs.length >= this.maxLogsPerSession) {
      session.logs.shift();
    }
    session.logs.push(log);
    session.lastActivityAt = Date.now();

    this.emit("log", log);

    return log;
  }

  /**
   * Get all unhandled errors for a project
   */
  getUnhandledErrors(projectId: string): RuntimeError[] {
    const session = this.activeSessions.get(projectId);
    if (!session) return [];

    return session.errors.filter(e => !e.handled && e.severity === "error");
  }

  /**
   * Get recent errors for a project
   */
  getRecentErrors(projectId: string, limit = 10): RuntimeError[] {
    const session = this.activeSessions.get(projectId);
    if (!session) return [];

    return session.errors.slice(-limit);
  }

  /**
   * Mark an error as handled
   */
  markErrorHandled(projectId: string, errorId: string): void {
    const session = this.activeSessions.get(projectId);
    if (!session) return;

    const error = session.errors.find(e => e.id === errorId);
    if (error) {
      error.handled = true;
      this.emit("errorHandled", error);
    }
  }

  /**
   * Mark that a fix was attempted for an error
   */
  markFixAttempted(projectId: string, errorId: string): void {
    const session = this.activeSessions.get(projectId);
    if (!session) return;

    const error = session.errors.find(e => e.id === errorId);
    if (error) {
      error.fixAttempted = true;
    }
  }

  /**
   * Get session statistics
   */
  getSessionStats(projectId: string): {
    errorCount: number;
    warningCount: number;
    unhandledCount: number;
    recentErrorTypes: Record<RuntimeErrorType, number>;
  } | null {
    const session = this.activeSessions.get(projectId);
    if (!session) return null;

    const recentErrors = session.errors.slice(-50);
    const recentErrorTypes: Record<string, number> = {};
    
    recentErrors.forEach(e => {
      recentErrorTypes[e.type] = (recentErrorTypes[e.type] || 0) + 1;
    });

    return {
      errorCount: session.errorCount,
      warningCount: session.warningCount,
      unhandledCount: session.errors.filter(e => !e.handled).length,
      recentErrorTypes: recentErrorTypes as Record<RuntimeErrorType, number>
    };
  }

  /**
   * Get logs for a project
   */
  getLogs(projectId: string, options: {
    level?: RuntimeLog["level"];
    since?: number;
    limit?: number;
  } = {}): RuntimeLog[] {
    const session = this.activeSessions.get(projectId);
    if (!session) return [];

    let logs = session.logs;

    if (options.level) {
      logs = logs.filter(l => l.level === options.level);
    }

    if (options.since !== undefined) {
      const since = options.since;
      logs = logs.filter(l => l.timestamp > since);
    }

    if (options.limit) {
      logs = logs.slice(-options.limit);
    }

    return logs;
  }

  /**
   * Clear session data
   */
  clearSession(projectId: string): void {
    const session = this.activeSessions.get(projectId);
    if (session) {
      session.errors = [];
      session.logs = [];
      session.errorCount = 0;
      session.warningCount = 0;
      logger.info("Runtime session cleared", { projectId });
    }
  }

  /**
   * Stop a runtime session
   */
  stopSession(projectId: string): void {
    const session = this.activeSessions.get(projectId);
    if (session) {
      session.status = "stopped";
      this.emit("sessionStopped", { projectId, sessionId: session.id });
      logger.info("Runtime session stopped", { projectId });
    }
  }

  /**
   * Subscribe to error events
   */
  onError(callback: (error: RuntimeError) => void): () => void {
    this.on("error", callback);
    return () => this.off("error", callback);
  }

  /**
   * Subscribe to log events
   */
  onLog(callback: (log: RuntimeLog) => void): () => void {
    this.on("log", callback);
    return () => this.off("log", callback);
  }

  private classifyError(
    message: string,
    stack?: string
  ): { type: RuntimeErrorType; severity: "error" | "warning" | "info" } {
    for (const pattern of this.errorPatterns) {
      if (pattern.pattern.test(message) || (stack && pattern.pattern.test(stack))) {
        return { type: pattern.type, severity: pattern.severity };
      }
    }

    return { type: "unknown", severity: "error" };
  }

  private findMatchingPattern(message: string): ErrorPattern | undefined {
    return this.errorPatterns.find(p => p.pattern.test(message));
  }

  private extractFileFromStack(stack?: string): string | undefined {
    if (!stack) return undefined;

    const match = stack.match(/at\s+.*?\s+\((.+?):\d+:\d+\)/);
    if (match) return match[1];

    const simpleMatch = stack.match(/(.+\.(?:js|ts|jsx|tsx)):\d+/);
    return simpleMatch?.[1];
  }

  private extractLineFromStack(stack?: string): number | undefined {
    if (!stack) return undefined;

    const match = stack.match(/:(\d+):\d+\)?/);
    return match ? parseInt(match[1]) : undefined;
  }

  /**
   * Format errors for LLM context
   */
  formatErrorsForLLM(projectId: string): string {
    const errors = this.getUnhandledErrors(projectId);
    if (errors.length === 0) return "";

    let formatted = "RUNTIME ERRORS:\n";
    
    errors.slice(-5).forEach((error, i) => {
      formatted += `\n${i + 1}. [${error.type}] ${error.message}\n`;
      if (error.file) {
        formatted += `   File: ${error.file}${error.line ? `:${error.line}` : ""}\n`;
      }
      if (error.metadata) {
        formatted += `   Details: ${JSON.stringify(error.metadata)}\n`;
      }
    });

    return formatted;
  }

  destroy(): void {
    this.activeSessions.clear();
    this.errorPatterns = [];
    this.removeAllListeners();
  }

  private generateId(): string {
    return `rt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const runtimeFeedbackService = RuntimeFeedbackService.getInstance();
