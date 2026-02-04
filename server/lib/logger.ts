type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
  error?: Error;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatEntry(entry: LogEntry): string {
  const { level, message, timestamp, context, error } = entry;
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  
  let output = `${prefix} ${message}`;
  
  if (context && Object.keys(context).length > 0) {
    output += ` ${JSON.stringify(context)}`;
  }
  
  if (error) {
    output += `\n  Error: ${error.message}`;
    if (error.stack) {
      output += `\n  Stack: ${error.stack.split("\n").slice(1, 4).join("\n        ")}`;
    }
  }
  
  return output;
}

function createEntry(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    context,
    error,
  };
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error): void {
  if (!shouldLog(level)) return;
  
  const entry = createEntry(level, message, context, error);
  const formatted = formatEntry(entry);
  
  switch (level) {
    case "error":
      console.error(formatted);
      break;
    case "warn":
      console.warn(formatted);
      break;
    default:
      console.log(formatted);
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => log("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) => log("info", message, context),
  warn: (message: string, context?: Record<string, unknown>, error?: Error) => log("warn", message, context, error),
  error: (message: string, context?: Record<string, unknown>, error?: Error) => log("error", message, context, error),
  
  request: (method: string, path: string, status: number, durationMs: number) => {
    log("info", `${method} ${path} ${status} in ${durationMs}ms`);
  },
  
  llm: (action: string, context?: Record<string, unknown>) => {
    log("info", `[LLM] ${action}`, context);
  },
  
  db: (action: string, context?: Record<string, unknown>) => {
    log("debug", `[DB] ${action}`, context);
  },
};

export default logger;
