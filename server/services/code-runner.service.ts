import { logger } from "../lib/logger";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs/promises";

export interface RunResult {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  errors: ParsedError[];
  warnings: string[];
  executionTimeMs: number;
  memoryUsageMB?: number;
}

export interface ParsedError {
  type: ErrorType;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  stack?: string;
  suggestion?: string;
}

export type ErrorType =
  | "syntax"
  | "type"
  | "runtime"
  | "import"
  | "reference"
  | "timeout"
  | "memory"
  | "unknown";

export interface RunOptions {
  timeout?: number;
  env?: Record<string, string>;
  cwd?: string;
  captureMemory?: boolean;
  maxOutputLength?: number;
}

interface RunningProcess {
  id: string;
  process: ChildProcess;
  startTime: number;
  command: string;
}

class CodeRunnerService {
  private static instance: CodeRunnerService;
  private runningProcesses: Map<string, RunningProcess> = new Map();
  private defaultTimeout = 30000;
  private maxOutputLength = 50000;

  private constructor() {
    logger.info("CodeRunnerService initialized");
  }

  static getInstance(): CodeRunnerService {
    if (!CodeRunnerService.instance) {
      CodeRunnerService.instance = new CodeRunnerService();
    }
    return CodeRunnerService.instance;
  }

  async runTypeScriptFile(
    filePath: string,
    options: RunOptions = {}
  ): Promise<RunResult> {
    const command = "npx";
    const args = ["tsx", filePath];
    return this.runCommand(command, args, options);
  }

  async runNodeFile(
    filePath: string,
    options: RunOptions = {}
  ): Promise<RunResult> {
    const command = "node";
    const args = [filePath];
    return this.runCommand(command, args, options);
  }

  async runNpmScript(
    script: string,
    options: RunOptions = {}
  ): Promise<RunResult> {
    const command = "npm";
    const args = ["run", script];
    return this.runCommand(command, args, options);
  }

  async runTypeCheck(
    projectPath: string = ".",
    options: RunOptions = {}
  ): Promise<RunResult> {
    const command = "npx";
    const args = ["tsc", "--noEmit", "--pretty"];
    return this.runCommand(command, args, { ...options, cwd: projectPath });
  }

  async runESLint(
    targetPath: string,
    options: RunOptions = {}
  ): Promise<RunResult> {
    const command = "npx";
    const args = ["eslint", targetPath, "--format", "json"];
    return this.runCommand(command, args, options);
  }

  async runTests(
    testPath?: string,
    options: RunOptions = {}
  ): Promise<RunResult> {
    const command = "npm";
    const args = testPath ? ["test", "--", testPath] : ["test"];
    return this.runCommand(command, args, { ...options, timeout: 60000 });
  }

  async runCommand(
    command: string,
    args: string[],
    options: RunOptions = {}
  ): Promise<RunResult> {
    const runId = this.generateId();
    const startTime = Date.now();
    const timeout = options.timeout || this.defaultTimeout;
    const maxOutput = options.maxOutputLength || this.maxOutputLength;

    logger.info("Running command", { runId, command, args: args.join(" ") });

    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const proc = spawn(command, args, {
        cwd: options.cwd || process.cwd(),
        env: { ...process.env, ...options.env },
        shell: true
      });

      this.runningProcesses.set(runId, {
        id: runId,
        process: proc,
        startTime,
        command: `${command} ${args.join(" ")}`
      });

      const timeoutId = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGTERM");
        setTimeout(() => proc.kill("SIGKILL"), 1000);
      }, timeout);

      proc.stdout?.on("data", (data) => {
        const chunk = data.toString();
        if (stdout.length < maxOutput) {
          stdout += chunk.slice(0, maxOutput - stdout.length);
        }
      });

      proc.stderr?.on("data", (data) => {
        const chunk = data.toString();
        if (stderr.length < maxOutput) {
          stderr += chunk.slice(0, maxOutput - stderr.length);
        }
      });

      proc.on("close", (exitCode) => {
        clearTimeout(timeoutId);
        this.runningProcesses.delete(runId);

        const executionTimeMs = Date.now() - startTime;
        const errors = this.parseErrors(stdout + stderr);
        const warnings = this.parseWarnings(stdout + stderr);

        if (timedOut) {
          errors.push({
            type: "timeout",
            message: `Command timed out after ${timeout}ms`,
            suggestion: "Consider optimizing the code or increasing timeout"
          });
        }

        const result: RunResult = {
          success: exitCode === 0 && !timedOut,
          exitCode: timedOut ? null : exitCode,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          errors,
          warnings,
          executionTimeMs
        };

        logger.info("Command completed", {
          runId,
          success: result.success,
          exitCode,
          errorCount: errors.length,
          executionTimeMs
        });

        resolve(result);
      });

      proc.on("error", (error) => {
        clearTimeout(timeoutId);
        this.runningProcesses.delete(runId);

        resolve({
          success: false,
          exitCode: null,
          stdout: stdout.trim(),
          stderr: error.message,
          errors: [{
            type: "runtime",
            message: error.message,
            suggestion: "Check if the command/executable exists"
          }],
          warnings: [],
          executionTimeMs: Date.now() - startTime
        });
      });
    });
  }

  private parseErrors(output: string): ParsedError[] {
    const errors: ParsedError[] = [];
    const lines = output.split("\n");

    for (const line of lines) {
      const tsError = this.parseTypeScriptError(line);
      if (tsError) {
        errors.push(tsError);
        continue;
      }

      const nodeError = this.parseNodeError(line);
      if (nodeError) {
        errors.push(nodeError);
        continue;
      }

      const syntaxError = this.parseSyntaxError(line);
      if (syntaxError) {
        errors.push(syntaxError);
        continue;
      }
    }

    const stackTraceError = this.parseStackTrace(output);
    if (stackTraceError) {
      errors.push(stackTraceError);
    }

    return errors;
  }

  private parseTypeScriptError(line: string): ParsedError | null {
    const match = line.match(/^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+TS(\d+):\s*(.+)$/);
    if (match) {
      return {
        type: "type",
        message: match[6],
        file: match[1],
        line: parseInt(match[2]),
        column: parseInt(match[3]),
        suggestion: this.getTypeScriptSuggestion(match[5])
      };
    }

    const simpleMatch = line.match(/error TS(\d+):\s*(.+)$/);
    if (simpleMatch) {
      return {
        type: "type",
        message: simpleMatch[2],
        suggestion: this.getTypeScriptSuggestion(simpleMatch[1])
      };
    }

    return null;
  }

  private parseNodeError(line: string): ParsedError | null {
    if (line.includes("ReferenceError:")) {
      const match = line.match(/ReferenceError:\s*(.+)/);
      return {
        type: "reference",
        message: match?.[1] || line,
        suggestion: "Check if the variable is defined and in scope"
      };
    }

    if (line.includes("TypeError:")) {
      const match = line.match(/TypeError:\s*(.+)/);
      return {
        type: "type",
        message: match?.[1] || line,
        suggestion: "Check the types of values being used"
      };
    }

    if (line.includes("Cannot find module")) {
      const match = line.match(/Cannot find module '([^']+)'/);
      return {
        type: "import",
        message: `Cannot find module: ${match?.[1] || "unknown"}`,
        suggestion: `Run 'npm install ${match?.[1]?.split("/")[0] || "package"}' to install the missing module`
      };
    }

    return null;
  }

  private parseSyntaxError(line: string): ParsedError | null {
    if (line.includes("SyntaxError:")) {
      const match = line.match(/SyntaxError:\s*(.+)/);
      return {
        type: "syntax",
        message: match?.[1] || line,
        suggestion: "Check for missing brackets, quotes, or semicolons"
      };
    }

    if (line.includes("Unexpected token")) {
      return {
        type: "syntax",
        message: line,
        suggestion: "Check for syntax errors near the unexpected token"
      };
    }

    return null;
  }

  private parseStackTrace(output: string): ParsedError | null {
    const stackMatch = output.match(/Error: (.+?)(?:\n\s+at .+)+/);
    if (stackMatch) {
      const fileMatch = output.match(/at .+?\((.+?):(\d+):(\d+)\)/);
      return {
        type: "runtime",
        message: stackMatch[1],
        file: fileMatch?.[1],
        line: fileMatch ? parseInt(fileMatch[2]) : undefined,
        column: fileMatch ? parseInt(fileMatch[3]) : undefined,
        stack: stackMatch[0]
      };
    }
    return null;
  }

  private parseWarnings(output: string): string[] {
    const warnings: string[] = [];
    const lines = output.split("\n");

    for (const line of lines) {
      if (line.toLowerCase().includes("warning") || line.includes("WARN")) {
        warnings.push(line.trim());
      }
      if (line.includes("deprecated")) {
        warnings.push(line.trim());
      }
    }

    return warnings.slice(0, 20);
  }

  private getTypeScriptSuggestion(errorCode: string): string {
    const suggestions: Record<string, string> = {
      "2304": "Check if the name is imported or defined",
      "2339": "The property might not exist on this type",
      "2345": "Argument type mismatch - check the function signature",
      "2322": "Type mismatch - ensure the assigned value matches the expected type",
      "2307": "Module not found - check the import path or install the package",
      "7006": "Add type annotation to the parameter",
      "2532": "Object might be undefined - add null check",
      "2531": "Object might be null - add null check"
    };
    return suggestions[errorCode] || "Review the TypeScript error and fix accordingly";
  }

  async validateCode(code: string, language: "typescript" | "javascript" = "typescript"): Promise<RunResult> {
    const tempFile = path.join("/tmp", `validate_${Date.now()}.${language === "typescript" ? "ts" : "js"}`);
    
    try {
      await fs.writeFile(tempFile, code);
      
      if (language === "typescript") {
        return await this.runCommand("npx", ["tsc", "--noEmit", tempFile]);
      } else {
        return await this.runCommand("node", ["--check", tempFile]);
      }
    } finally {
      try {
        await fs.unlink(tempFile);
      } catch {
      }
    }
  }

  killProcess(runId: string): boolean {
    const running = this.runningProcesses.get(runId);
    if (running) {
      running.process.kill("SIGTERM");
      setTimeout(() => running.process.kill("SIGKILL"), 1000);
      this.runningProcesses.delete(runId);
      logger.info("Process killed", { runId });
      return true;
    }
    return false;
  }

  killAllProcesses(): void {
    this.runningProcesses.forEach((running, runId) => {
      running.process.kill("SIGTERM");
      this.runningProcesses.delete(runId);
    });
    logger.info("All processes killed");
  }

  getRunningProcesses(): { id: string; command: string; runningTimeMs: number }[] {
    const now = Date.now();
    return Array.from(this.runningProcesses.values()).map(p => ({
      id: p.id,
      command: p.command,
      runningTimeMs: now - p.startTime
    }));
  }

  private generateId(): string {
    return `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const codeRunnerService = CodeRunnerService.getInstance();
