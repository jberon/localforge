import { logger } from "../lib/logger";
import { codeRunnerService, RunResult, ParsedError } from "./code-runner.service";
import { projectMemoryService } from "./project-memory.service";
import { runtimeFeedbackService, RuntimeError } from "./runtime-feedback.service";
import { localModelOptimizerService } from "./local-model-optimizer.service";
import * as fs from "fs/promises";
import * as path from "path";

export interface RuntimeErrorContext {
  errors: RuntimeError[];
  recentLogs: string[];
  affectedFiles: string[];
  errorHistory: string[];
}

export interface CodePatch {
  file: string;
  oldContent: string;
  newContent: string;
  lineStart?: number;
  lineEnd?: number;
  description: string;
}

export interface FixAttempt {
  id: string;
  iteration: number;
  error: ParsedError;
  fix: string;
  patch?: CodePatch;
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
type LLMCodePatchFunction = (error: ParsedError, fileContent: string, context: any) => Promise<CodePatch | null>;

class AutoFixLoopService {
  private static instance: AutoFixLoopService;
  private activeSessions: Map<string, AutoFixSession> = new Map();
  private fixStrategies: FixStrategy[] = [];
  private llmFixFunction?: LLMFixFunction;
  private llmCodePatchFunction?: LLMCodePatchFunction;
  private projectsBaseDir: string = process.cwd();
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

  setLLMCodePatchFunction(fn: LLMCodePatchFunction): void {
    this.llmCodePatchFunction = fn;
    logger.info("LLM code patch function registered");
  }

  setProjectsBaseDir(dir: string): void {
    this.projectsBaseDir = dir;
  }

  /**
   * Read file content from the project
   */
  async readFileContent(projectId: string, filePath: string): Promise<string | null> {
    try {
      const fullPath = path.join(this.projectsBaseDir, "projects", projectId, filePath);
      const content = await fs.readFile(fullPath, "utf-8");
      return content;
    } catch (e) {
      logger.warn("Failed to read file for patching", { projectId, filePath, error: e });
      return null;
    }
  }

  /**
   * Apply a code patch to a file
   */
  async applyCodePatch(projectId: string, patch: CodePatch): Promise<boolean> {
    try {
      const fullPath = path.join(this.projectsBaseDir, "projects", projectId, patch.file);
      
      // Read current content
      let currentContent: string;
      try {
        currentContent = await fs.readFile(fullPath, "utf-8");
      } catch (e) {
        logger.error("Cannot read file for patching", { file: patch.file });
        return false;
      }

      // Verify old content matches (for safety)
      if (patch.oldContent && !currentContent.includes(patch.oldContent)) {
        logger.warn("Old content mismatch, applying full replacement", { file: patch.file });
      }

      // Apply the patch
      let newContent: string;
      if (patch.lineStart !== undefined && patch.lineEnd !== undefined) {
        // Line-based patch
        const lines = currentContent.split("\n");
        const beforeLines = lines.slice(0, patch.lineStart - 1);
        const afterLines = lines.slice(patch.lineEnd);
        const patchLines = patch.newContent.split("\n");
        newContent = [...beforeLines, ...patchLines, ...afterLines].join("\n");
      } else if (patch.oldContent) {
        // String replacement patch
        newContent = currentContent.replace(patch.oldContent, patch.newContent);
      } else {
        // Full file replacement
        newContent = patch.newContent;
      }

      // Write the patched content
      await fs.writeFile(fullPath, newContent, "utf-8");
      
      logger.info("Code patch applied successfully", {
        file: patch.file,
        description: patch.description
      });

      return true;
    } catch (e) {
      logger.error("Failed to apply code patch", { file: patch.file, error: e });
      return false;
    }
  }

  /**
   * Generate a code patch for an error using LLM
   */
  async generateCodePatch(
    projectId: string,
    error: ParsedError,
    context: FixContext
  ): Promise<CodePatch | null> {
    if (!error.file) {
      logger.warn("Cannot generate patch without file path");
      return null;
    }

    const fileContent = await this.readFileContent(projectId, error.file);
    if (!fileContent) {
      return null;
    }

    // Try LLM-based patch generation first
    if (this.llmCodePatchFunction) {
      try {
        const patch = await this.llmCodePatchFunction(error, fileContent, context);
        if (patch) {
          return patch;
        }
      } catch (e) {
        logger.warn("LLM patch generation failed, trying rule-based", { error: e });
      }
    }

    // Fallback to rule-based fixes
    return this.generateRuleBasedPatch(error, fileContent, context);
  }

  /**
   * Generate patches using built-in rules
   */
  private generateRuleBasedPatch(
    error: ParsedError,
    fileContent: string,
    context: FixContext
  ): CodePatch | null {
    const lines = fileContent.split("\n");
    const errorLine = error.line ? lines[error.line - 1] : null;

    // Missing import fix
    if (error.type === "import" || /Cannot find module|is not defined/i.test(error.message)) {
      const moduleMatch = error.message.match(/Cannot find module ['"](.+?)['"]/);
      const identifierMatch = error.message.match(/['"](.+?)['"] is not defined/);
      
      if (moduleMatch || identifierMatch) {
        const name = moduleMatch?.[1] || identifierMatch?.[1];
        const importStatement = `import { ${name} } from "./${name}";\n`;
        
        // Find first import or top of file
        const firstImportIndex = lines.findIndex(l => l.startsWith("import"));
        const insertLine = firstImportIndex >= 0 ? firstImportIndex : 0;
        
        return {
          file: error.file!,
          oldContent: lines[insertLine],
          newContent: importStatement + lines[insertLine],
          lineStart: insertLine + 1,
          lineEnd: insertLine + 1,
          description: `Add missing import for ${name}`
        };
      }
    }

    // Null check fix
    if (error.type === "type" && /Object is possibly ['"]?(null|undefined)/i.test(error.message)) {
      if (errorLine && error.line) {
        // Add optional chaining
        const fixedLine = errorLine.replace(/(\w+)\.(\w+)/g, "$1?.$2");
        if (fixedLine !== errorLine) {
          return {
            file: error.file!,
            oldContent: errorLine,
            newContent: fixedLine,
            lineStart: error.line,
            lineEnd: error.line,
            description: "Add optional chaining for null safety"
          };
        }
      }
    }

    // Type assertion fix
    if (error.type === "type" && /Type '.*' is not assignable/i.test(error.message)) {
      if (errorLine && error.line) {
        // Try adding 'as any' as last resort
        const fixedLine = errorLine.replace(/= (.+?);/, "= $1 as any;");
        if (fixedLine !== errorLine) {
          return {
            file: error.file!,
            oldContent: errorLine,
            newContent: fixedLine,
            lineStart: error.line,
            lineEnd: error.line,
            description: "Add type assertion to fix type mismatch"
          };
        }
      }
    }

    // Missing semicolon fix
    if (error.type === "syntax" && /Missing semicolon/i.test(error.message)) {
      if (errorLine && error.line && !errorLine.trimEnd().endsWith(";")) {
        return {
          file: error.file!,
          oldContent: errorLine,
          newContent: errorLine + ";",
          lineStart: error.line,
          lineEnd: error.line,
          description: "Add missing semicolon"
        };
      }
    }

    return null;
  }

  /**
   * Apply fix to code and return updated code string
   * This is used when working with in-memory code rather than files
   */
  applyFixToCode(code: string, patch: CodePatch): string {
    if (patch.lineStart !== undefined && patch.lineEnd !== undefined) {
      const lines = code.split("\n");
      const beforeLines = lines.slice(0, patch.lineStart - 1);
      const afterLines = lines.slice(patch.lineEnd);
      const patchLines = patch.newContent.split("\n");
      return [...beforeLines, ...patchLines, ...afterLines].join("\n");
    } else if (patch.oldContent) {
      return code.replace(patch.oldContent, patch.newContent);
    }
    return patch.newContent;
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

  // ============================================================================
  // RUNTIME ERROR → LLM PROMPT INTEGRATION
  // Inject runtime errors into LLM prompts for automatic fix generation
  // ============================================================================

  /**
   * Collect runtime errors from the feedback service and format for LLM
   */
  async collectRuntimeErrors(projectId: string): Promise<RuntimeErrorContext> {
    const errors = runtimeFeedbackService.getRecentErrors(projectId, 10);
    const logs = runtimeFeedbackService.getLogs(projectId, { limit: 20 });
    const recentLogs = logs.map((log: { level: string; message: string }) => `[${log.level}] ${log.message}`);
    
    const affectedFiles = Array.from(new Set(errors
      .filter((e: RuntimeError) => e.file)
      .map((e: RuntimeError) => e.file as string)));
    
    const errorHistory = errors.map((e: RuntimeError) => 
      `[${e.type}] ${e.message}${e.file ? ` in ${e.file}` : ''}${e.line ? `:${e.line}` : ''}`
    );

    return { errors, recentLogs, affectedFiles, errorHistory };
  }

  /**
   * Build an enhanced LLM prompt with runtime error context
   */
  buildRuntimeErrorPrompt(
    basePrompt: string,
    errorContext: RuntimeErrorContext,
    fileContents: Map<string, string>,
    modelName?: string
  ): string {
    const sections: string[] = [];
    
    sections.push("# Runtime Error Fix Request\n");
    sections.push("## Errors Detected\n");
    
    for (const error of errorContext.errors.slice(0, 5)) {
      sections.push(`### ${error.type.toUpperCase()} Error`);
      sections.push(`**Message:** ${error.message}`);
      if (error.file) sections.push(`**File:** ${error.file}${error.line ? `:${error.line}` : ''}`);
      if (error.stack) sections.push(`**Stack:**\n\`\`\`\n${error.stack.slice(0, 500)}\n\`\`\``);
      sections.push("");
    }

    if (errorContext.affectedFiles.length > 0) {
      sections.push("## Affected File Contents\n");
      
      for (const filePath of errorContext.affectedFiles) {
        const content = fileContents.get(filePath);
        if (content) {
          const extension = filePath.split('.').pop() || '';
          sections.push(`### ${filePath}`);
          sections.push(`\`\`\`${extension}`);
          sections.push(content);
          sections.push("```\n");
        }
      }
    }

    if (errorContext.recentLogs.length > 0) {
      sections.push("## Recent Console Logs");
      sections.push("```");
      sections.push(errorContext.recentLogs.slice(-10).join("\n"));
      sections.push("```\n");
    }

    sections.push("## Task");
    sections.push(basePrompt);
    sections.push("\n## Instructions");
    sections.push("Fix the runtime errors above. Provide the corrected code for each affected file.");
    sections.push("Return the code in markdown code blocks with file paths as headers.");

    let prompt = sections.join("\n");
    
    if (modelName) {
      const profile = localModelOptimizerService.getModelProfile(modelName);
      if (profile.family === "qwen") {
        prompt += "\n\nIMPORTANT: Output only the corrected code files without explanations.";
      }
    }

    return prompt;
  }

  /**
   * Convert ParsedError to RuntimeError format
   */
  parsedErrorToRuntimeError(error: ParsedError, projectId: string): RuntimeError {
    return {
      id: `runtime_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      projectId,
      timestamp: Date.now(),
      source: 'build',
      type: this.mapErrorTypeToRuntimeType(error.type),
      message: error.message,
      stack: error.stack,
      file: error.file,
      line: error.line,
      column: error.column,
      severity: 'error',
      handled: false,
      fixAttempted: false
    };
  }

  private mapErrorTypeToRuntimeType(errorType: string): RuntimeError['type'] {
    const mapping: Record<string, RuntimeError['type']> = {
      'syntax': 'syntax_error',
      'reference': 'reference_error',
      'type': 'type_error',
      'import': 'import_error',
      'runtime': 'unknown'
    };
    return mapping[errorType] || 'unknown';
  }

  /**
   * Run enhanced auto-fix with runtime error injection
   */
  async runEnhancedAutoFix(
    projectId: string,
    options: {
      maxIterations?: number;
      modelName?: string;
      onProgress?: (status: string, iteration: number) => void;
    } = {}
  ): Promise<AutoFixSession> {
    const { maxIterations = 5, modelName, onProgress } = options;
    
    runtimeFeedbackService.startSession(projectId);
    
    try {
      const session = await this.startAutoFixSession(projectId, { maxIterations });
      
      while (
        session.currentIteration < session.maxIterations &&
        session.unresolvedErrors.length > 0 &&
        session.status !== "failed"
      ) {
        session.currentIteration++;
        session.status = "analyzing";
        
        onProgress?.("Analyzing errors...", session.currentIteration);

        const errorContext = await this.collectRuntimeErrors(projectId);
        
        if (errorContext.errors.length === 0 && session.unresolvedErrors.length === 0) {
          session.status = "completed";
          break;
        }

        session.status = "fixing";
        onProgress?.("Generating fixes...", session.currentIteration);

        const fileContents = new Map<string, string>();
        for (const filePath of errorContext.affectedFiles) {
          const content = await this.readFileContent(projectId, filePath);
          if (content) {
            fileContents.set(filePath, content);
          }
        }

        const basePrompt = "Fix all the errors listed above.";
        const enhancedPrompt = this.buildRuntimeErrorPrompt(
          basePrompt,
          errorContext,
          fileContents,
          modelName
        );

        if (this.llmFixFunction) {
          try {
            const fixResponse = await this.llmFixFunction(enhancedPrompt, {
              projectId,
              errors: errorContext.errors,
              iteration: session.currentIteration
            });

            const patches = this.parseCodePatches(fixResponse);
            
            for (const patch of patches) {
              const success = await this.applyCodePatch(projectId, patch);
              if (success) {
                session.fixAttempts.push({
                  id: this.generateId(),
                  iteration: session.currentIteration,
                  error: { 
                    type: 'runtime', 
                    message: `Fix for ${patch.file}`,
                    file: patch.file 
                  } as ParsedError,
                  fix: patch.description,
                  patch,
                  success: true,
                  runResult: { success: true, errors: [], warnings: [], exitCode: 0, stdout: '', stderr: '', executionTimeMs: 0 },
                  timestamp: Date.now()
                });
              }
            }
          } catch (e) {
            logger.error("LLM fix generation failed", { error: e, iteration: session.currentIteration });
          }
        }

        session.status = "validating";
        onProgress?.("Validating fixes...", session.currentIteration);

        await new Promise(resolve => setTimeout(resolve, 1000));
        const newErrors = await this.collectRuntimeErrors(projectId);
        
        const resolvedCount = errorContext.errors.length - newErrors.errors.length;
        if (resolvedCount > 0) {
          logger.info("Errors resolved in iteration", { 
            iteration: session.currentIteration, 
            resolvedCount 
          });
        }

        if (newErrors.errors.length === 0) {
          session.status = "completed";
          break;
        }
      }

      if (session.currentIteration >= session.maxIterations && session.unresolvedErrors.length > 0) {
        session.status = "max_iterations_reached";
      }

      session.completedAt = Date.now();
      session.totalTimeMs = session.completedAt - session.startedAt;

      return session;
    } finally {
      runtimeFeedbackService.stopSession(projectId);
    }
  }

  /**
   * Parse LLM response to extract code patches
   */
  private parseCodePatches(response: string): CodePatch[] {
    const patches: CodePatch[] = [];
    
    const fileBlockRegex = /###?\s*([^\n`]+?)\s*\n```(?:\w+)?\n([\s\S]*?)```/g;
    let match;

    while ((match = fileBlockRegex.exec(response)) !== null) {
      const filePath = match[1].trim();
      const code = match[2];

      if (filePath && code && (filePath.includes('.') || filePath.includes('/'))) {
        patches.push({
          file: filePath,
          oldContent: '',
          newContent: code,
          description: `LLM-generated fix for ${filePath}`
        });
      }
    }

    return patches;
  }

  /**
   * Format errors for LLM context (optimized for local models)
   */
  formatErrorsForLLM(errors: ParsedError[], maxTokens: number = 2000): string {
    const formatted: string[] = [];
    let tokenCount = 0;
    const tokensPerError = 100;

    for (const error of errors) {
      if (tokenCount + tokensPerError > maxTokens) break;

      const entry = [
        `[${error.type.toUpperCase()}] ${error.message}`,
        error.file ? `  File: ${error.file}${error.line ? `:${error.line}` : ''}` : null,
        error.suggestion ? `  Suggestion: ${error.suggestion}` : null
      ].filter(Boolean).join('\n');

      formatted.push(entry);
      tokenCount += tokensPerError;
    }

    return formatted.join('\n\n');
  }
}

export const autoFixLoopService = AutoFixLoopService.getInstance();
