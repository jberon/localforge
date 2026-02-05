import { logger } from "../lib/logger";
import { errorLearningService } from "./error-learning.service";
import { liveSyntaxValidatorService } from "./live-syntax-validator.service";
import { codeStyleEnforcerService } from "./code-style-enforcer.service";

export interface FixAttempt {
  attemptNumber: number;
  errors: Array<{ line: number; message: string; severity: string }>;
  fixPrompt: string;
  fixedCode: string | null;
  success: boolean;
  durationMs: number;
  strategy: FixStrategy;
}

export interface FixResult {
  originalCode: string;
  finalCode: string;
  wasFixed: boolean;
  totalAttempts: number;
  attempts: FixAttempt[];
  errorsFound: number;
  errorsFixed: number;
  warningsFound: number;
  modelUsed?: string;
  filePath?: string;
  durationMs: number;
}

export interface FixSession {
  id: string;
  startedAt: Date;
  completedAt?: Date;
  result: FixResult;
  config: FixConfig;
}

export interface FixConfig {
  maxRetries: number;
  autoFormat: boolean;
  strictMode: boolean;
  enableLearning: boolean;
  fixStrategies: FixStrategy[];
}

export type FixStrategy =
  | "syntax-targeted"
  | "error-pattern-match"
  | "full-rewrite-section"
  | "style-enforcement"
  | "import-resolution";

interface PreGenerationEnhancement {
  enhancedPrompt: string;
  preventionRules: string[];
  modelSpecificWarnings: string[];
  injectedExamples: string[];
  totalInjectedTokens: number;
}

interface FixHistoryEntry {
  sessionId: string;
  timestamp: Date;
  filePath?: string;
  modelUsed?: string;
  errorsFound: number;
  errorsFixed: number;
  attempts: number;
  success: boolean;
  strategies: FixStrategy[];
  errorCategories: string[];
}

export interface FixStatistics {
  totalSessions: number;
  totalErrors: number;
  totalFixed: number;
  fixRate: number;
  averageAttempts: number;
  averageDurationMs: number;
  strategyEffectiveness: Record<FixStrategy, { attempts: number; successes: number; rate: number }>;
  modelFixRates: Record<string, { errors: number; fixed: number; rate: number }>;
  topErrorCategories: Array<{ category: string; count: number; fixRate: number }>;
  recentTrend: { improving: boolean; recentFixRate: number; overallFixRate: number };
}

class ClosedLoopAutoFixService {
  private static instance: ClosedLoopAutoFixService;
  private defaultConfig: FixConfig;
  private fixHistory: FixHistoryEntry[];
  private activeSessions: Map<string, FixSession>;
  private maxHistorySize = 1000;
  private categoryFixTracking: Map<string, { found: number; fixed: number }>;

  private constructor() {
    this.defaultConfig = {
      maxRetries: 3,
      autoFormat: true,
      strictMode: false,
      enableLearning: true,
      fixStrategies: [
        "syntax-targeted",
        "error-pattern-match",
        "style-enforcement",
        "import-resolution",
        "full-rewrite-section",
      ],
    };
    this.fixHistory = [];
    this.activeSessions = new Map();
    this.categoryFixTracking = new Map();
    logger.info("ClosedLoopAutoFixService initialized");
  }

  static getInstance(): ClosedLoopAutoFixService {
    if (!ClosedLoopAutoFixService.instance) {
      ClosedLoopAutoFixService.instance = new ClosedLoopAutoFixService();
    }
    return ClosedLoopAutoFixService.instance;
  }

  configure(config: Partial<FixConfig>): void {
    this.defaultConfig = { ...this.defaultConfig, ...config };
    logger.info("ClosedLoopAutoFix configured", { config: this.defaultConfig });
  }

  getConfig(): FixConfig {
    return { ...this.defaultConfig };
  }

  enhancePreGeneration(
    prompt: string,
    modelName?: string,
    taskType: string = "build",
    fileTypes: string[] = []
  ): PreGenerationEnhancement {
    const preventionRules: string[] = [];
    const modelSpecificWarnings: string[] = [];
    const injectedExamples: string[] = [];

    const modelFamily = this.detectModelFamily(modelName);

    const preventionPrompt = errorLearningService.getPreventionPrompt(modelFamily);
    if (preventionPrompt && preventionPrompt.length > 20) {
      preventionRules.push(preventionPrompt);
    }

    const insights = errorLearningService.getInsights();
    for (const insight of insights) {
      if (modelFamily && insight.modelSpecificIssues.has(modelFamily)) {
        const issues = insight.modelSpecificIssues.get(modelFamily)!;
        for (const issue of issues) {
          modelSpecificWarnings.push(`[${insight.category}] Watch for: ${issue}`);
        }
      }
    }

    const fileTypeRules = this.getFileTypePreventionRules(fileTypes);
    preventionRules.push(...fileTypeRules);

    const taskTypeRules = this.getTaskTypeRules(taskType);
    preventionRules.push(...taskTypeRules);

    const recentFailures = this.getRecentFailurePatterns();
    if (recentFailures.length > 0) {
      preventionRules.push(
        "\n## Recent Error Patterns (CRITICAL - avoid these)\n" +
        recentFailures.map(f => `- ${f}`).join("\n")
      );
    }

    const fixExamples = this.getFixExamplesForContext(taskType, fileTypes);
    injectedExamples.push(...fixExamples);

    let enhancedPrompt = prompt;

    if (preventionRules.length > 0) {
      enhancedPrompt = preventionRules.join("\n") + "\n\n" + enhancedPrompt;
    }

    if (modelSpecificWarnings.length > 0) {
      enhancedPrompt +=
        "\n\n## Model-Specific Warnings\n" +
        modelSpecificWarnings.map(w => `- ${w}`).join("\n");
    }

    if (injectedExamples.length > 0) {
      enhancedPrompt +=
        "\n\n## Correct Patterns (follow these)\n" +
        injectedExamples.join("\n\n");
    }

    const totalInjectedTokens = Math.ceil(
      (enhancedPrompt.length - prompt.length) / 3.5
    );

    logger.info("Pre-generation enhancement applied", {
      preventionRules: preventionRules.length,
      modelWarnings: modelSpecificWarnings.length,
      examples: injectedExamples.length,
      injectedTokens: totalInjectedTokens,
      modelFamily,
    });

    return {
      enhancedPrompt,
      preventionRules,
      modelSpecificWarnings,
      injectedExamples,
      totalInjectedTokens,
    };
  }

  validateAndFix(
    code: string,
    filePath?: string,
    modelUsed?: string,
    config?: Partial<FixConfig>
  ): FixResult {
    const startTime = Date.now();
    const cfg = { ...this.defaultConfig, ...config };
    const sessionId = `fix_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const attempts: FixAttempt[] = [];
    let currentCode = code;
    let totalErrorsFound = 0;
    let totalWarningsFound = 0;

    const initialValidation = liveSyntaxValidatorService.validateStreaming(currentCode);
    totalErrorsFound = initialValidation.errors.length;
    totalWarningsFound = initialValidation.warnings.length;

    if (initialValidation.isValid && !cfg.autoFormat) {
      const result: FixResult = {
        originalCode: code,
        finalCode: currentCode,
        wasFixed: false,
        totalAttempts: 0,
        attempts: [],
        errorsFound: 0,
        errorsFixed: 0,
        warningsFound: totalWarningsFound,
        modelUsed,
        filePath,
        durationMs: Date.now() - startTime,
      };

      this.recordSession(sessionId, result, cfg);
      return result;
    }

    for (let attempt = 0; attempt < cfg.maxRetries; attempt++) {
      const validation = liveSyntaxValidatorService.validateStreaming(currentCode);

      if (validation.isValid && (!cfg.strictMode || validation.warnings.length === 0)) {
        break;
      }

      const errors = validation.errors.map(e => ({
        line: e.line,
        message: e.message,
        severity: e.severity,
      }));

      const strategy = this.selectStrategy(errors, attempt, cfg.fixStrategies);
      const fixPrompt = this.buildFixPrompt(currentCode, errors, strategy, modelUsed);
      const attemptStart = Date.now();

      const fixedCode = this.applyLocalFix(currentCode, errors, strategy);

      const fixAttempt: FixAttempt = {
        attemptNumber: attempt + 1,
        errors,
        fixPrompt,
        fixedCode,
        success: false,
        durationMs: Date.now() - attemptStart,
        strategy,
      };

      if (fixedCode) {
        const revalidation = liveSyntaxValidatorService.validateStreaming(fixedCode);
        if (revalidation.errors.length < validation.errors.length) {
          currentCode = fixedCode;
          fixAttempt.success = true;

          if (cfg.enableLearning) {
            for (const error of validation.errors) {
              const autoFix = errorLearningService.getAutoFix(error.message);
              errorLearningService.recordError({
                errorMessage: error.message,
                code,
                filePath,
                wasFixed: true,
                fixApplied: autoFix || strategy,
                modelUsed,
              });
              this.trackCategoryFix(this.categorizeError(error.message), true);
            }
          }
        } else {
          if (cfg.enableLearning) {
            for (const error of validation.errors) {
              errorLearningService.recordError({
                errorMessage: error.message,
                code,
                filePath,
                wasFixed: false,
                modelUsed,
              });
              this.trackCategoryFix(this.categorizeError(error.message), false);
            }
          }
        }
      }

      attempts.push(fixAttempt);
    }

    if (cfg.autoFormat) {
      const formatResult = codeStyleEnforcerService.formatCode(currentCode);
      if (formatResult.changed) {
        currentCode = formatResult.formatted;
      }
    }

    const finalValidation = liveSyntaxValidatorService.validateStreaming(currentCode);
    const errorsFixed = totalErrorsFound - finalValidation.errors.length;

    const result: FixResult = {
      originalCode: code,
      finalCode: currentCode,
      wasFixed: currentCode !== code,
      totalAttempts: attempts.length,
      attempts,
      errorsFound: totalErrorsFound,
      errorsFixed: Math.max(0, errorsFixed),
      warningsFound: totalWarningsFound,
      modelUsed,
      filePath,
      durationMs: Date.now() - startTime,
    };

    this.recordSession(sessionId, result, cfg);

    logger.info("Closed-loop auto-fix completed", {
      sessionId,
      errorsFound: totalErrorsFound,
      errorsFixed: result.errorsFixed,
      attempts: attempts.length,
      wasFixed: result.wasFixed,
      durationMs: result.durationMs,
    });

    return result;
  }

  buildFixPrompt(
    code: string,
    errors: Array<{ line: number; message: string; severity: string }>,
    strategy: FixStrategy,
    modelUsed?: string
  ): string {
    let prompt = "## Code Fix Request\n\n";

    prompt += `### Strategy: ${strategy}\n\n`;

    prompt += "### Errors to Fix:\n";
    for (const error of errors) {
      prompt += `- Line ${error.line}: ${error.message} (${error.severity})\n`;

      const autoFix = errorLearningService.getAutoFix(error.message);
      if (autoFix) {
        prompt += `  Known fix: ${autoFix}\n`;
      }
    }

    prompt += "\n### Code with Errors:\n```\n";

    const lines = code.split("\n");
    const errorLines = new Set(errors.map(e => e.line));
    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const marker = errorLines.has(lineNum) ? ">>> " : "    ";
      prompt += `${marker}${lineNum.toString().padStart(4)}: ${lines[i]}\n`;
    }
    prompt += "```\n\n";

    switch (strategy) {
      case "syntax-targeted":
        prompt += "### Instructions:\nFix ONLY the syntax errors listed above. Do not change logic or add features. Return the complete corrected code.\n";
        break;
      case "error-pattern-match":
        prompt += "### Instructions:\nThese errors match known patterns. Apply the known fixes listed above. Return the complete corrected code.\n";
        break;
      case "full-rewrite-section":
        prompt += "### Instructions:\nThe errors are structural. Rewrite the problematic sections while preserving the overall logic and functionality. Return the complete corrected code.\n";
        break;
      case "style-enforcement":
        prompt += "### Instructions:\nFix style and formatting issues. Ensure consistent indentation, proper spacing, and clean code. Return the complete corrected code.\n";
        break;
      case "import-resolution":
        prompt += "### Instructions:\nFix import/export issues. Ensure all imports are correctly specified with proper module paths and export names. Return the complete corrected code.\n";
        break;
    }

    const modelFamily = this.detectModelFamily(modelUsed);
    if (modelFamily) {
      const modelWarnings = this.getModelSpecificFixGuidance(modelFamily);
      if (modelWarnings) {
        prompt += `\n### Model Guidance (${modelFamily}):\n${modelWarnings}\n`;
      }
    }

    return prompt;
  }

  getFixHistory(limit: number = 50): FixHistoryEntry[] {
    return this.fixHistory.slice(-limit);
  }

  getStatistics(): FixStatistics {
    const history = this.fixHistory;

    if (history.length === 0) {
      return {
        totalSessions: 0,
        totalErrors: 0,
        totalFixed: 0,
        fixRate: 0,
        averageAttempts: 0,
        averageDurationMs: 0,
        strategyEffectiveness: this.emptyStrategyStats(),
        modelFixRates: {},
        topErrorCategories: this.getTopErrorCategories(),
        recentTrend: { improving: false, recentFixRate: 0, overallFixRate: 0 },
      };
    }

    const totalErrors = history.reduce((s, h) => s + h.errorsFound, 0);
    const totalFixed = history.reduce((s, h) => s + h.errorsFixed, 0);
    const totalAttempts = history.reduce((s, h) => s + h.attempts, 0);

    const strategyEffectiveness = this.calculateStrategyEffectiveness(history);
    const modelFixRates = this.calculateModelFixRates(history);

    const recentCount = Math.min(20, history.length);
    const recentHistory = history.slice(-recentCount);
    const recentErrors = recentHistory.reduce((s, h) => s + h.errorsFound, 0);
    const recentFixed = recentHistory.reduce((s, h) => s + h.errorsFixed, 0);
    const recentFixRate = recentErrors > 0 ? recentFixed / recentErrors : 0;
    const overallFixRate = totalErrors > 0 ? totalFixed / totalErrors : 0;

    return {
      totalSessions: history.length,
      totalErrors,
      totalFixed,
      fixRate: overallFixRate,
      averageAttempts: history.length > 0 ? totalAttempts / history.length : 0,
      averageDurationMs: 0,
      strategyEffectiveness,
      modelFixRates,
      topErrorCategories: this.getTopErrorCategories(),
      recentTrend: {
        improving: recentFixRate > overallFixRate,
        recentFixRate,
        overallFixRate,
      },
    };
  }

  clearHistory(): void {
    this.fixHistory = [];
    this.activeSessions.clear();
    this.categoryFixTracking.clear();
    logger.info("Closed-loop auto-fix history cleared");
  }

  private selectStrategy(
    errors: Array<{ line: number; message: string; severity: string }>,
    attemptNumber: number,
    allowedStrategies: FixStrategy[]
  ): FixStrategy {
    if (attemptNumber >= 2 && allowedStrategies.includes("full-rewrite-section")) {
      return "full-rewrite-section";
    }

    const hasImportErrors = errors.some(e =>
      /import|module|export/i.test(e.message)
    );
    if (hasImportErrors && allowedStrategies.includes("import-resolution")) {
      return "import-resolution";
    }

    const hasPatternMatch = errors.some(e => {
      const autoFix = errorLearningService.getAutoFix(e.message);
      return autoFix !== null;
    });
    if (hasPatternMatch && allowedStrategies.includes("error-pattern-match")) {
      return "error-pattern-match";
    }

    const hasSyntaxErrors = errors.some(e =>
      /bracket|brace|parenthesis|semicolon|unexpected token/i.test(e.message)
    );
    if (hasSyntaxErrors && allowedStrategies.includes("syntax-targeted")) {
      return "syntax-targeted";
    }

    if (allowedStrategies.includes("style-enforcement")) {
      return "style-enforcement";
    }

    return allowedStrategies[0] || "syntax-targeted";
  }

  private applyLocalFix(
    code: string,
    errors: Array<{ line: number; message: string; severity: string }>,
    strategy: FixStrategy
  ): string | null {
    let fixedCode = code;
    let anyFixApplied = false;

    for (const error of errors) {
      const fix = this.tryLocalFixForError(fixedCode, error, strategy);
      if (fix) {
        fixedCode = fix;
        anyFixApplied = true;
      }
    }

    return anyFixApplied ? fixedCode : null;
  }

  private tryLocalFixForError(
    code: string,
    error: { line: number; message: string; severity: string },
    strategy: FixStrategy
  ): string | null {
    const lines = code.split("\n");
    const lineIdx = error.line - 1;
    if (lineIdx < 0 || lineIdx >= lines.length) return null;

    if (/Unmatched closing parenthesis/i.test(error.message)) {
      return this.fixUnmatchedClosing(lines, lineIdx, ")");
    }
    if (/Unmatched closing bracket/i.test(error.message)) {
      return this.fixUnmatchedClosing(lines, lineIdx, "]");
    }
    if (/Unmatched closing brace/i.test(error.message)) {
      return this.fixUnmatchedClosing(lines, lineIdx, "}");
    }

    if (/Unterminated string literal/i.test(error.message)) {
      const line = lines[lineIdx];
      const quoteMatch = error.message.match(/started with (['"``])/);
      if (quoteMatch) {
        lines[lineIdx] = line + quoteMatch[1];
        return lines.join("\n");
      }
    }

    if (/Invalid equality operator \(====\)/i.test(error.message)) {
      lines[lineIdx] = lines[lineIdx].replace(/====/g, "===");
      return lines.join("\n");
    }

    if (/Missing semicolon/i.test(error.message)) {
      const trimmed = lines[lineIdx].trimEnd();
      if (!trimmed.endsWith(";") && !trimmed.endsWith("{") && !trimmed.endsWith("}") && !trimmed.endsWith(",")) {
        lines[lineIdx] = trimmed + ";";
        return lines.join("\n");
      }
    }

    if (strategy === "import-resolution" && /Cannot find module|Cannot find name/i.test(error.message)) {
      const nameMatch = error.message.match(/Cannot find name '(\w+)'/);
      if (nameMatch) {
        const missingName = nameMatch[1];
        const commonImports: Record<string, string> = {
          useState: 'import { useState } from "react";',
          useEffect: 'import { useEffect } from "react";',
          useCallback: 'import { useCallback } from "react";',
          useMemo: 'import { useMemo } from "react";',
          useRef: 'import { useRef } from "react";',
          useContext: 'import { useContext } from "react";',
          useReducer: 'import { useReducer } from "react";',
        };

        if (commonImports[missingName]) {
          const importLine = commonImports[missingName];
          if (!code.includes(importLine)) {
            return importLine + "\n" + code;
          }
        }
      }
    }

    return null;
  }

  private fixUnmatchedClosing(lines: string[], lineIdx: number, closingChar: string): string | null {
    const openers: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
    const opener = openers[closingChar];
    if (!opener) return null;

    for (let i = lineIdx; i >= 0; i--) {
      const line = lines[i];
      let openCount = 0;
      let closeCount = 0;
      for (const c of line) {
        if (c === opener) openCount++;
        if (c === closingChar) closeCount++;
      }
      if (closeCount > openCount) {
        const lastIdx = lines[i].lastIndexOf(closingChar);
        lines[i] = lines[i].slice(0, lastIdx) + lines[i].slice(lastIdx + 1);
        return lines.join("\n");
      }
    }

    return null;
  }

  private recordSession(sessionId: string, result: FixResult, config: FixConfig): void {
    const strategies = result.attempts.map(a => a.strategy);
    const errorCategories = this.extractErrorCategories(result);

    const entry: FixHistoryEntry = {
      sessionId,
      timestamp: new Date(),
      filePath: result.filePath,
      modelUsed: result.modelUsed,
      errorsFound: result.errorsFound,
      errorsFixed: result.errorsFixed,
      attempts: result.totalAttempts,
      success: result.errorsFound > 0 && result.errorsFixed === result.errorsFound,
      strategies: Array.from(new Set(strategies)),
      errorCategories: Array.from(new Set(errorCategories)),
    };

    this.fixHistory.push(entry);

    if (this.fixHistory.length > this.maxHistorySize) {
      this.fixHistory.shift();
    }

    const session: FixSession = {
      id: sessionId,
      startedAt: new Date(Date.now() - result.durationMs),
      completedAt: new Date(),
      result,
      config,
    };
    this.activeSessions.set(sessionId, session);

    if (this.activeSessions.size > 100) {
      const oldest = Array.from(this.activeSessions.keys())[0];
      this.activeSessions.delete(oldest);
    }
  }

  private extractErrorCategories(result: FixResult): string[] {
    const categories: string[] = [];
    for (const attempt of result.attempts) {
      for (const error of attempt.errors) {
        categories.push(this.categorizeError(error.message));
      }
    }
    return categories;
  }

  private categorizeError(message: string): string {
    const lower = message.toLowerCase();
    if (lower.includes("bracket") || lower.includes("brace") || lower.includes("parenthesis")) return "brackets";
    if (lower.includes("import") || lower.includes("module") || lower.includes("export")) return "imports";
    if (lower.includes("type") || lower.includes("assignable")) return "types";
    if (lower.includes("semicolon")) return "semicolons";
    if (lower.includes("string") || lower.includes("unterminated")) return "strings";
    if (lower.includes("jsx") || lower.includes("react")) return "jsx";
    if (lower.includes("async") || lower.includes("await")) return "async";
    if (lower.includes("undefined") || lower.includes("null")) return "nullability";
    return "other";
  }

  private trackCategoryFix(category: string, fixed: boolean): void {
    const existing = this.categoryFixTracking.get(category) || { found: 0, fixed: 0 };
    existing.found++;
    if (fixed) existing.fixed++;
    this.categoryFixTracking.set(category, existing);
  }

  private getTopErrorCategories(): Array<{ category: string; count: number; fixRate: number }> {
    return Array.from(this.categoryFixTracking.entries())
      .map(([category, stats]) => ({
        category,
        count: stats.found,
        fixRate: stats.found > 0 ? stats.fixed / stats.found : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private getRecentFailurePatterns(): string[] {
    const recentFails = this.fixHistory
      .filter(h => !h.success && h.errorsFound > 0)
      .slice(-10);

    const patterns: string[] = [];
    const seen = new Set<string>();

    for (const fail of recentFails) {
      for (const cat of fail.errorCategories) {
        if (!seen.has(cat)) {
          seen.add(cat);
          patterns.push(`Recurring ${cat} errors detected — double-check ${cat} carefully`);
        }
      }
    }

    return patterns;
  }

  private getFixExamplesForContext(taskType: string, fileTypes: string[]): string[] {
    const examples: string[] = [];

    if (fileTypes.some(f => f.includes("tsx") || f.includes("jsx"))) {
      examples.push(
        "// Correct JSX pattern: always wrap multiple elements\nreturn (\n  <>\n    <Header />\n    <Main />\n  </>\n);"
      );
    }

    if (taskType === "build" || taskType === "refine") {
      examples.push(
        "// Correct import pattern:\nimport { useState, useEffect } from \"react\";\nimport type { FC } from \"react\";"
      );
    }

    return examples;
  }

  private getFileTypePreventionRules(fileTypes: string[]): string[] {
    const rules: string[] = [];

    for (const ft of fileTypes) {
      if (ft.endsWith(".tsx") || ft.endsWith(".jsx")) {
        rules.push("- JSX files: Always return a single root element. Use fragments (<>...</>) when needed.");
        rules.push("- JSX files: Add unique 'key' props when mapping arrays to elements.");
      }
      if (ft.endsWith(".ts") || ft.endsWith(".tsx")) {
        rules.push("- TypeScript files: Avoid using 'any' type. Use explicit types or 'unknown' with type guards.");
        rules.push("- TypeScript files: Handle nullable values with optional chaining (?.) or null checks.");
      }
    }

    return Array.from(new Set(rules));
  }

  private getTaskTypeRules(taskType: string): string[] {
    switch (taskType) {
      case "build":
        return [
          "- Building new code: Ensure all imports are included at the top.",
          "- Building new code: Export the main component/function as default.",
          "- Building new code: Include proper TypeScript types for all props and state.",
        ];
      case "refine":
        return [
          "- Refining code: Preserve existing exports and interfaces.",
          "- Refining code: Do not remove existing imports unless confirmed unused.",
        ];
      case "plan":
        return [];
      case "review":
        return [];
      default:
        return [];
    }
  }

  private detectModelFamily(modelName?: string): string | undefined {
    if (!modelName) return undefined;
    const lower = modelName.toLowerCase();
    if (lower.includes("qwen")) return "qwen";
    if (lower.includes("ministral") || lower.includes("mistral")) return "ministral";
    if (lower.includes("deepseek")) return "deepseek";
    if (lower.includes("llama")) return "llama";
    if (lower.includes("codellama")) return "codellama";
    if (lower.includes("gpt")) return "gpt";
    if (lower.includes("claude")) return "claude";
    return undefined;
  }

  private getModelSpecificFixGuidance(modelFamily: string): string | null {
    const guidance: Record<string, string> = {
      qwen: "Qwen models: Be precise with TypeScript generics. Avoid nested ternaries. Use explicit return types.",
      ministral: "Ministral models: Keep functions short. Prefer explicit over implicit. Watch for missing 'async' keywords.",
      deepseek: "DeepSeek models: Double-check import paths. Ensure all variables are declared before use.",
      llama: "Llama models: Avoid complex type inference chains. Use simple, direct type annotations.",
      codellama: "CodeLlama models: Prefer functional patterns. Watch for scope issues in closures.",
    };
    return guidance[modelFamily] || null;
  }

  private calculateStrategyEffectiveness(
    history: FixHistoryEntry[]
  ): Record<FixStrategy, { attempts: number; successes: number; rate: number }> {
    const stats = this.emptyStrategyStats();

    for (const entry of history) {
      for (const strategy of entry.strategies) {
        if (stats[strategy]) {
          stats[strategy].attempts++;
          if (entry.success) {
            stats[strategy].successes++;
          }
          stats[strategy].rate =
            stats[strategy].attempts > 0
              ? stats[strategy].successes / stats[strategy].attempts
              : 0;
        }
      }
    }

    return stats;
  }

  private calculateModelFixRates(
    history: FixHistoryEntry[]
  ): Record<string, { errors: number; fixed: number; rate: number }> {
    const rates: Record<string, { errors: number; fixed: number; rate: number }> = {};

    for (const entry of history) {
      const model = entry.modelUsed || "unknown";
      if (!rates[model]) {
        rates[model] = { errors: 0, fixed: 0, rate: 0 };
      }
      rates[model].errors += entry.errorsFound;
      rates[model].fixed += entry.errorsFixed;
      rates[model].rate =
        rates[model].errors > 0
          ? rates[model].fixed / rates[model].errors
          : 0;
    }

    return rates;
  }

  private emptyStrategyStats(): Record<FixStrategy, { attempts: number; successes: number; rate: number }> {
    return {
      "syntax-targeted": { attempts: 0, successes: 0, rate: 0 },
      "error-pattern-match": { attempts: 0, successes: 0, rate: 0 },
      "full-rewrite-section": { attempts: 0, successes: 0, rate: 0 },
      "style-enforcement": { attempts: 0, successes: 0, rate: 0 },
      "import-resolution": { attempts: 0, successes: 0, rate: 0 },
    };
  }
}

export const closedLoopAutoFixService = ClosedLoopAutoFixService.getInstance();
