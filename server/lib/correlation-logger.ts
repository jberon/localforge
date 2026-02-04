import { randomUUID } from "crypto";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  correlationId?: string;
  requestId?: string;
  userId?: string;
  projectId?: string;
  phase?: string;
  model?: string;
  [key: string]: unknown;
}

export interface StructuredLog {
  timestamp: string;
  level: LogLevel;
  correlationId: string;
  message: string;
  context?: LogContext;
  stack?: string;
  durationMs?: number;
}

let globalCorrelationId: string | null = null;

export function setGlobalCorrelationId(id: string): void {
  globalCorrelationId = id;
}

export function getGlobalCorrelationId(): string {
  return globalCorrelationId || "no-correlation";
}

export function generateCorrelationId(): string {
  return randomUUID().slice(0, 8);
}

function formatLog(log: StructuredLog): string {
  if (process.env.NODE_ENV === "production") {
    return JSON.stringify(log);
  }
  
  const time = log.timestamp.split("T")[1]?.replace("Z", "") || log.timestamp;
  const ctx = log.context ? ` :: ${JSON.stringify(log.context)}` : "";
  const duration = log.durationMs ? ` (${log.durationMs}ms)` : "";
  return `[${time}] [${log.level.toUpperCase()}] [${log.correlationId}] ${log.message}${duration}${ctx}`;
}

export function createLogger(correlationId?: string) {
  const corrId = correlationId || globalCorrelationId || generateCorrelationId();

  const log = (level: LogLevel, message: string, context?: LogContext, error?: Error) => {
    const structuredLog: StructuredLog = {
      timestamp: new Date().toISOString(),
      level,
      correlationId: corrId,
      message,
      context,
      stack: error?.stack,
    };

    const formatted = formatLog(structuredLog);

    switch (level) {
      case "debug":
        if (process.env.NODE_ENV !== "production") console.debug(formatted);
        break;
      case "info":
        console.log(formatted);
        break;
      case "warn":
        console.warn(formatted);
        break;
      case "error":
        console.error(formatted);
        break;
    }

    return structuredLog;
  };

  return {
    correlationId: corrId,
    debug: (message: string, context?: LogContext) => log("debug", message, context),
    info: (message: string, context?: LogContext) => log("info", message, context),
    warn: (message: string, context?: LogContext) => log("warn", message, context),
    error: (message: string, error?: Error, context?: LogContext) => log("error", message, context, error),
    child: (additionalContext: LogContext) => {
      return createLogger(corrId);
    },
    timed: <T>(operation: string, fn: () => Promise<T>, context?: LogContext): Promise<T> => {
      const start = Date.now();
      log("info", `${operation} started`, context);
      return fn()
        .then((result) => {
          const structuredLog: StructuredLog = {
            timestamp: new Date().toISOString(),
            level: "info",
            correlationId: corrId,
            message: `${operation} completed`,
            context,
            durationMs: Date.now() - start,
          };
          console.log(formatLog(structuredLog));
          return result;
        })
        .catch((error) => {
          log("error", `${operation} failed`, context, error);
          throw error;
        });
    },
  };
}

export type CorrelationLogger = ReturnType<typeof createLogger>;
