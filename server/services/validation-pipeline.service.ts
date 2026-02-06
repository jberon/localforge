import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import logger from "../lib/logger";

export interface ValidationResult {
  type: "lint" | "typescript" | "test";
  success: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  duration: number;
}

export interface ValidationError {
  file: string;
  line?: number;
  column?: number;
  message: string;
  rule?: string;
  severity: "error";
}

export interface ValidationWarning {
  file: string;
  line?: number;
  column?: number;
  message: string;
  rule?: string;
  severity: "warning";
}

export interface PipelineResult {
  success: boolean;
  results: ValidationResult[];
  summary: {
    totalErrors: number;
    totalWarnings: number;
    totalDuration: number;
    passedChecks: number;
    failedChecks: number;
  };
  suggestions: string[];
}

export interface ValidationConfig {
  runLint?: boolean;
  runTypeScript?: boolean;
  runTests?: boolean;
  timeout?: number;
  autoFix?: boolean;
}

const DEFAULT_CONFIG: ValidationConfig = {
  runLint: true,
  runTypeScript: true,
  runTests: false,
  timeout: 60000,
  autoFix: false,
};

export class ValidationPipelineService {
  private static instance: ValidationPipelineService;
  private results: Map<string, PipelineResult> = new Map();
  private readonly MAX_RESULTS = 500;

  private constructor() {}

  static getInstance(): ValidationPipelineService {
    if (!ValidationPipelineService.instance) {
      ValidationPipelineService.instance = new ValidationPipelineService();
    }
    return ValidationPipelineService.instance;
  }

  async runPipeline(
    projectPath: string,
    files: string[],
    config: ValidationConfig = {}
  ): Promise<PipelineResult> {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    const results: ValidationResult[] = [];
    const startTime = Date.now();

    logger.info("Starting validation pipeline", { projectPath, fileCount: files.length });

    if (mergedConfig.runLint) {
      const lintResult = await this.runLint(projectPath, files, mergedConfig);
      results.push(lintResult);
    }

    if (mergedConfig.runTypeScript) {
      const tsResult = await this.runTypeScriptCheck(projectPath, files, mergedConfig);
      results.push(tsResult);
    }

    if (mergedConfig.runTests) {
      const testResult = await this.runTests(projectPath, mergedConfig);
      results.push(testResult);
    }

    const summary = this.generateSummary(results, Date.now() - startTime);
    const suggestions = this.generateSuggestions(results);

    const pipelineResult: PipelineResult = {
      success: summary.failedChecks === 0,
      results,
      summary,
      suggestions,
    };

    this.results.set(`${projectPath}:${Date.now()}`, pipelineResult);
    if (this.results.size > this.MAX_RESULTS) {
      const keys = Array.from(this.results.keys());
      const toRemove = keys.slice(0, keys.length - this.MAX_RESULTS);
      for (const key of toRemove) {
        this.results.delete(key);
      }
    }

    logger.info("Validation pipeline completed", { 
      success: pipelineResult.success,
      errors: summary.totalErrors,
      warnings: summary.totalWarnings,
      duration: summary.totalDuration,
    });

    return pipelineResult;
  }

  private async runLint(
    projectPath: string,
    files: string[],
    config: ValidationConfig
  ): Promise<ValidationResult> {
    const startTime = Date.now();
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      const tsFiles = files.filter(f => /\.(ts|tsx|js|jsx)$/.test(f));
      if (tsFiles.length === 0) {
        return {
          type: "lint",
          success: true,
          errors: [],
          warnings: [],
          duration: Date.now() - startTime,
        };
      }

      const args = ["eslint", "--format", "json"];
      if (config.autoFix) {
        args.push("--fix");
      }
      args.push(...tsFiles.slice(0, 50)); // Limit files to prevent command line overflow

      const result = await this.runCommand("npx", args, projectPath, config.timeout || 60000);
      
      if (result.stdout) {
        try {
          const lintOutput = JSON.parse(result.stdout);
          for (const fileResult of lintOutput) {
            for (const message of fileResult.messages || []) {
              const issue = {
                file: path.relative(projectPath, fileResult.filePath),
                line: message.line,
                column: message.column,
                message: message.message,
                rule: message.ruleId,
              };
              
              if (message.severity === 2) {
                errors.push({ ...issue, severity: "error" });
              } else {
                warnings.push({ ...issue, severity: "warning" });
              }
            }
          }
        } catch (parseError) {
          logger.debug("Could not parse ESLint output", { error: parseError });
        }
      }

      return {
        type: "lint",
        success: errors.length === 0,
        errors,
        warnings,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      logger.warn("Lint check failed", { error });
      return {
        type: "lint",
        success: false,
        errors: [{
          file: "",
          message: error instanceof Error ? error.message : "Lint check failed",
          severity: "error",
        }],
        warnings: [],
        duration: Date.now() - startTime,
      };
    }
  }

  private async runTypeScriptCheck(
    projectPath: string,
    files: string[],
    config: ValidationConfig
  ): Promise<ValidationResult> {
    const startTime = Date.now();
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      const tsFiles = files.filter(f => /\.(ts|tsx)$/.test(f));
      if (tsFiles.length === 0) {
        return {
          type: "typescript",
          success: true,
          errors: [],
          warnings: [],
          duration: Date.now() - startTime,
        };
      }

      const tsconfigPath = path.join(projectPath, "tsconfig.json");
      const hasTsConfig = fs.existsSync(tsconfigPath);

      const args = hasTsConfig 
        ? ["tsc", "--noEmit", "--pretty", "false"]
        : ["tsc", "--noEmit", "--pretty", "false", "--allowJs", "--checkJs", "false", ...tsFiles.slice(0, 50)];

      const result = await this.runCommand("npx", args, projectPath, config.timeout || 60000);
      
      const output = result.stderr || result.stdout;
      if (output) {
        const lines = output.split("\n");
        const errorPattern = /^(.+)\((\d+),(\d+)\): error (TS\d+): (.+)$/;
        
        for (const line of lines) {
          const match = line.match(errorPattern);
          if (match) {
            errors.push({
              file: match[1],
              line: parseInt(match[2], 10),
              column: parseInt(match[3], 10),
              message: match[5],
              rule: match[4],
              severity: "error",
            });
          }
        }
      }

      return {
        type: "typescript",
        success: result.exitCode === 0,
        errors,
        warnings,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      logger.warn("TypeScript check failed", { error });
      return {
        type: "typescript",
        success: false,
        errors: [{
          file: "",
          message: error instanceof Error ? error.message : "TypeScript check failed",
          severity: "error",
        }],
        warnings: [],
        duration: Date.now() - startTime,
      };
    }
  }

  private async runTests(
    projectPath: string,
    config: ValidationConfig
  ): Promise<ValidationResult> {
    const startTime = Date.now();
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      const packageJsonPath = path.join(projectPath, "package.json");
      if (!fs.existsSync(packageJsonPath)) {
        return {
          type: "test",
          success: true,
          errors: [],
          warnings: [{ file: "", message: "No package.json found, skipping tests", severity: "warning" }],
          duration: Date.now() - startTime,
        };
      }

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      const hasVitestConfig = fs.existsSync(path.join(projectPath, "vitest.config.ts")) ||
                              fs.existsSync(path.join(projectPath, "vitest.config.js"));
      const hasVitest = packageJson.devDependencies?.vitest || packageJson.dependencies?.vitest;
      const hasJest = packageJson.devDependencies?.jest || packageJson.dependencies?.jest;

      if (!hasVitest && !hasJest && !hasVitestConfig) {
        return {
          type: "test",
          success: true,
          errors: [],
          warnings: [{ file: "", message: "No test framework detected, skipping tests", severity: "warning" }],
          duration: Date.now() - startTime,
        };
      }

      const testCommand = hasVitest || hasVitestConfig ? ["vitest", "run", "--reporter=json"] : ["jest", "--json"];
      const result = await this.runCommand("npx", testCommand, projectPath, config.timeout || 120000);

      if (result.exitCode !== 0) {
        errors.push({
          file: "",
          message: "Some tests failed",
          severity: "error",
        });
        
        if (result.stdout) {
          try {
            const testOutput = JSON.parse(result.stdout);
            if (testOutput.testResults) {
              for (const testResult of testOutput.testResults) {
                if (testResult.status === "failed") {
                  for (const failure of testResult.assertionResults?.filter((a: any) => a.status === "failed") || []) {
                    errors.push({
                      file: testResult.name,
                      message: failure.title + ": " + (failure.failureMessages?.[0] || "Test failed"),
                      severity: "error",
                    });
                  }
                }
              }
            }
          } catch (parseError) {
            logger.debug("Could not parse test output", { error: parseError });
          }
        }
      }

      return {
        type: "test",
        success: result.exitCode === 0,
        errors,
        warnings,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      logger.warn("Test run failed", { error });
      return {
        type: "test",
        success: false,
        errors: [{
          file: "",
          message: error instanceof Error ? error.message : "Test run failed",
          severity: "error",
        }],
        warnings: [],
        duration: Date.now() - startTime,
      };
    }
  }

  private runCommand(
    command: string,
    args: string[],
    cwd: string,
    timeout: number
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const proc = spawn(command, args, {
        cwd,
        shell: true,
        env: { ...process.env, NODE_ENV: "development" },
      });

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGTERM");
      }, timeout);

      proc.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          stdout,
          stderr,
          exitCode: timedOut ? 124 : (code ?? 1),
        });
      });

      proc.on("error", (error) => {
        clearTimeout(timer);
        resolve({
          stdout,
          stderr: error.message,
          exitCode: 1,
        });
      });
    });
  }

  private generateSummary(results: ValidationResult[], totalDuration: number) {
    let totalErrors = 0;
    let totalWarnings = 0;
    let passedChecks = 0;
    let failedChecks = 0;

    for (const result of results) {
      totalErrors += result.errors.length;
      totalWarnings += result.warnings.length;
      if (result.success) {
        passedChecks++;
      } else {
        failedChecks++;
      }
    }

    return {
      totalErrors,
      totalWarnings,
      totalDuration,
      passedChecks,
      failedChecks,
    };
  }

  private generateSuggestions(results: ValidationResult[]): string[] {
    const suggestions: string[] = [];
    const errorRules = new Map<string, number>();

    for (const result of results) {
      for (const error of result.errors) {
        if (error.rule) {
          errorRules.set(error.rule, (errorRules.get(error.rule) || 0) + 1);
        }
      }
    }

    // Common patterns and suggestions
    const commonFixes: Record<string, string> = {
      "no-unused-vars": "Remove unused variables or prefix with underscore",
      "@typescript-eslint/no-unused-vars": "Remove unused variables or prefix with underscore",
      "no-undef": "Import missing dependencies or declare variables",
      "import/no-unresolved": "Install missing npm packages",
      "react/prop-types": "Add TypeScript types for component props",
      "TS2307": "Module not found - install missing dependency",
      "TS2304": "Cannot find name - check imports and declarations",
      "TS2339": "Property does not exist - check type definitions",
      "TS2345": "Argument type mismatch - verify function parameters",
      "TS2322": "Type mismatch - check assignment types",
    };

    for (const [rule, count] of Array.from(errorRules.entries())) {
      if (commonFixes[rule]) {
        suggestions.push(`${commonFixes[rule]} (${count} occurrences of ${rule})`);
      }
    }

    if (suggestions.length === 0 && results.some(r => !r.success)) {
      suggestions.push("Review the error messages above and fix issues in the generated code");
    }

    return suggestions.slice(0, 5); // Limit suggestions
  }

  async validateGeneratedCode(
    projectPath: string,
    generatedFiles: Array<{ path: string; content: string }>
  ): Promise<PipelineResult> {
    const tempFiles: string[] = [];

    try {
      // Write files temporarily for validation
      for (const file of generatedFiles) {
        const fullPath = path.join(projectPath, file.path);
        const dir = path.dirname(fullPath);
        
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(fullPath, file.content, "utf-8");
        tempFiles.push(file.path);
      }

      // Run validation
      return await this.runPipeline(projectPath, tempFiles, {
        runLint: true,
        runTypeScript: true,
        runTests: false, // Skip tests for quick validation
      });
    } finally {
      // Cleanup is handled by caller - files are kept for the project
    }
  }

  destroy(): void {
    this.results.clear();
  }
}

export const validationPipelineService = ValidationPipelineService.getInstance();
