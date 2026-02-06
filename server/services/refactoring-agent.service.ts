import { BaseService, ManagedMap } from "../lib/base-service";
import { projectMemoryService } from "./project-memory.service";

export interface RefactoringResult {
  success: boolean;
  changes: RefactoringChange[];
  summary: string;
  metrics: RefactoringMetrics;
}

export interface RefactoringChange {
  file: string;
  type: RefactoringType;
  description: string;
  before: string;
  after: string;
  lineStart: number;
  lineEnd: number;
}

export type RefactoringType =
  | "extract_function"
  | "extract_variable"
  | "rename"
  | "inline"
  | "move"
  | "simplify"
  | "dry_violation"
  | "solid_violation"
  | "dead_code"
  | "magic_number"
  | "long_method"
  | "complex_condition";

export interface RefactoringMetrics {
  filesAnalyzed: number;
  issuesFound: number;
  issuesFixed: number;
  linesReduced: number;
  complexityReduced: number;
  timeMs: number;
}

export interface CodeSmell {
  type: RefactoringType;
  file: string;
  line: number;
  description: string;
  severity: "low" | "medium" | "high";
  suggestion: string;
  autoFixable: boolean;
}

export interface RefactoringOptions {
  autoFix: boolean;
  types?: RefactoringType[];
  maxChangesPerFile?: number;
  dryRun?: boolean;
}

type LLMRefactorFunction = (code: string, instruction: string) => Promise<string>;

class RefactoringAgentService extends BaseService {
  private static instance: RefactoringAgentService;
  private llmRefactorFunction?: LLMRefactorFunction;
  private codeSmellPatterns: ManagedMap<RefactoringType, RegExp[]>;

  private constructor() {
    super("RefactoringAgentService");
    this.codeSmellPatterns = this.createManagedMap<RefactoringType, RegExp[]>({ maxSize: 200, strategy: "lru" });
    this.initializePatterns();
  }

  static getInstance(): RefactoringAgentService {
    if (!RefactoringAgentService.instance) {
      RefactoringAgentService.instance = new RefactoringAgentService();
    }
    return RefactoringAgentService.instance;
  }

  setLLMRefactorFunction(fn: LLMRefactorFunction): void {
    this.llmRefactorFunction = fn;
    this.log("LLM refactor function registered");
  }

  private initializePatterns(): void {
    this.codeSmellPatterns.set("magic_number", [
      /(?<![a-zA-Z_])(?:[2-9]\d{2,}|[1-9]\d{3,})(?![a-zA-Z_\d])/,
      /\b0x[a-fA-F0-9]{4,}\b/
    ]);

    this.codeSmellPatterns.set("long_method", [
      /function\s+\w+\s*\([^)]*\)\s*\{[\s\S]{1500,}\}/,
      /=>\s*\{[\s\S]{1000,}\}/
    ]);

    this.codeSmellPatterns.set("complex_condition", [
      /if\s*\([^)]{100,}\)/,
      /\?\s*[^:]+:[^;]{100,}/
    ]);

    this.codeSmellPatterns.set("dead_code", [
      /\/\/\s*TODO:?\s*remove/i,
      /console\.log\([^)]+\);?\s*\/\/\s*debug/i
    ]);

    this.codeSmellPatterns.set("dry_violation", [
      /(\{[^}]{50,}\})\s*\n[\s\S]*?\1/
    ]);
  }

  async analyzeCode(code: string, fileName: string): Promise<CodeSmell[]> {
    const smells: CodeSmell[] = [];
    const lines = code.split("\n");

    this.codeSmellPatterns.forEach((patterns, type) => {
      patterns.forEach(pattern => {
        const matches = code.match(new RegExp(pattern, "g"));
        if (matches) {
          matches.forEach(match => {
            const lineIndex = this.findLineNumber(code, match);
            smells.push({
              type,
              file: fileName,
              line: lineIndex + 1,
              description: this.getSmellDescription(type, match),
              severity: this.getSmellSeverity(type),
              suggestion: this.getSmellSuggestion(type, match),
              autoFixable: this.isAutoFixable(type)
            });
          });
        }
      });
    });

    smells.push(...this.analyzeNaming(code, fileName, lines));
    smells.push(...this.analyzeComplexity(code, fileName, lines));
    smells.push(...this.analyzeImports(code, fileName, lines));

    return smells;
  }

  private findLineNumber(code: string, match: string): number {
    const index = code.indexOf(match);
    if (index === -1) return 0;
    return code.substring(0, index).split("\n").length - 1;
  }

  private getSmellDescription(type: RefactoringType, match: string): string {
    const descriptions: Record<RefactoringType, string> = {
      extract_function: "Code block should be extracted into a separate function",
      extract_variable: "Complex expression should be extracted into a named variable",
      rename: "Name doesn't follow conventions or is unclear",
      inline: "Variable or function is only used once and can be inlined",
      move: "Code should be moved to a more appropriate location",
      simplify: "Code can be simplified",
      dry_violation: "Duplicate code detected - violates DRY principle",
      solid_violation: "Code violates SOLID principles",
      dead_code: "Unreachable or unused code detected",
      magic_number: `Magic number detected: ${match.slice(0, 20)}`,
      long_method: "Method is too long and should be split",
      complex_condition: "Condition is too complex and hard to understand"
    };
    return descriptions[type];
  }

  private getSmellSeverity(type: RefactoringType): "low" | "medium" | "high" {
    const highSeverity: RefactoringType[] = ["dry_violation", "solid_violation", "long_method"];
    const mediumSeverity: RefactoringType[] = ["complex_condition", "magic_number", "dead_code"];
    
    if (highSeverity.includes(type)) return "high";
    if (mediumSeverity.includes(type)) return "medium";
    return "low";
  }

  private getSmellSuggestion(type: RefactoringType, match: string): string {
    const suggestions: Record<RefactoringType, string> = {
      extract_function: "Extract the repeated logic into a reusable function",
      extract_variable: "Create a named constant or variable for clarity",
      rename: "Use a more descriptive name following naming conventions",
      inline: "Inline this single-use variable/function",
      move: "Move to appropriate module/file",
      simplify: "Simplify using modern syntax or utility functions",
      dry_violation: "Extract common code into a shared function or component",
      solid_violation: "Refactor to follow SOLID principles",
      dead_code: "Remove unreachable or unused code",
      magic_number: "Replace with a named constant",
      long_method: "Split into smaller, focused functions",
      complex_condition: "Extract condition into well-named boolean variables"
    };
    return suggestions[type];
  }

  private isAutoFixable(type: RefactoringType): boolean {
    const autoFixable: RefactoringType[] = [
      "magic_number",
      "dead_code",
      "simplify",
      "inline"
    ];
    return autoFixable.includes(type);
  }

  private analyzeNaming(code: string, fileName: string, lines: string[]): CodeSmell[] {
    const smells: CodeSmell[] = [];
    
    const singleLetterVars = code.match(/(?:let|const|var)\s+([a-z])\s*=/g);
    if (singleLetterVars) {
      singleLetterVars.forEach(match => {
        if (!match.includes("i =") && !match.includes("j =") && !match.includes("k =")) {
          smells.push({
            type: "rename",
            file: fileName,
            line: this.findLineNumber(code, match) + 1,
            description: "Single-letter variable name (except loop counters)",
            severity: "low",
            suggestion: "Use a descriptive variable name",
            autoFixable: false
          });
        }
      });
    }

    return smells;
  }

  private analyzeComplexity(code: string, fileName: string, lines: string[]): CodeSmell[] {
    const smells: CodeSmell[] = [];
    
    let nestingLevel = 0;
    let maxNesting = 0;
    let maxNestingLine = 0;
    
    lines.forEach((line, index) => {
      const opens = (line.match(/\{/g) || []).length;
      const closes = (line.match(/\}/g) || []).length;
      nestingLevel += opens - closes;
      
      if (nestingLevel > maxNesting) {
        maxNesting = nestingLevel;
        maxNestingLine = index + 1;
      }
    });

    if (maxNesting > 4) {
      smells.push({
        type: "complex_condition",
        file: fileName,
        line: maxNestingLine,
        description: `Deep nesting detected (${maxNesting} levels)`,
        severity: "high",
        suggestion: "Reduce nesting by extracting functions or using early returns",
        autoFixable: false
      });
    }

    return smells;
  }

  private analyzeImports(code: string, fileName: string, lines: string[]): CodeSmell[] {
    const smells: CodeSmell[] = [];
    
    const importLines = lines.filter(line => line.trim().startsWith("import"));
    const usedImports = new Set<string>();
    
    importLines.forEach(line => {
      const match = line.match(/import\s+(?:\{([^}]+)\}|(\w+))/);
      if (match) {
        const imports = match[1] || match[2];
        imports.split(",").forEach(i => {
          const name = i.trim().split(" as ")[0];
          usedImports.add(name);
        });
      }
    });

    usedImports.forEach(importName => {
      const regex = new RegExp(`\\b${importName}\\b`, "g");
      const matches = code.match(regex);
      if (matches && matches.length === 1) {
        smells.push({
          type: "dead_code",
          file: fileName,
          line: this.findImportLine(lines, importName),
          description: `Import '${importName}' appears to be unused`,
          severity: "low",
          suggestion: "Remove unused import",
          autoFixable: true
        });
      }
    });

    return smells;
  }

  private findImportLine(lines: string[], importName: string): number {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(importName) && lines[i].trim().startsWith("import")) {
        return i + 1;
      }
    }
    return 1;
  }

  async refactorCode(
    code: string,
    fileName: string,
    options: RefactoringOptions = { autoFix: true }
  ): Promise<RefactoringResult> {
    const startTime = Date.now();
    const smells = await this.analyzeCode(code, fileName);
    const changes: RefactoringChange[] = [];
    let refactoredCode = code;

    const typesToFix = options.types || 
      smells.filter(s => s.autoFixable).map(s => s.type);

    const fixableSmells = smells.filter(
      s => typesToFix.includes(s.type) && s.autoFixable
    );

    this.log("Refactoring code", {
      fileName,
      totalSmells: smells.length,
      autoFixable: fixableSmells.length
    });

    if (options.autoFix && !options.dryRun) {
      for (const smell of fixableSmells.slice(0, options.maxChangesPerFile || 10)) {
        try {
          const change = await this.applyFix(refactoredCode, smell);
          if (change) {
            changes.push(change);
            refactoredCode = this.applyChange(refactoredCode, change);
          }
        } catch (e) {
          this.logWarn("Failed to apply refactoring", { smell: smell.type, error: e });
        }
      }
    }

    const metrics: RefactoringMetrics = {
      filesAnalyzed: 1,
      issuesFound: smells.length,
      issuesFixed: changes.length,
      linesReduced: this.calculateLinesReduced(code, refactoredCode),
      complexityReduced: 0,
      timeMs: Date.now() - startTime
    };

    return {
      success: true,
      changes,
      summary: this.generateSummary(smells, changes),
      metrics
    };
  }

  private async applyFix(code: string, smell: CodeSmell): Promise<RefactoringChange | null> {
    const lines = code.split("\n");
    const line = lines[smell.line - 1] || "";

    switch (smell.type) {
      case "magic_number": {
        const match = line.match(/(?<![a-zA-Z_])(\d{3,})(?![a-zA-Z_\d])/);
        if (match) {
          const number = match[1];
          const constName = `MAGIC_${number}`;
          const before = line;
          const after = line.replace(number, constName);
          return {
            file: smell.file,
            type: smell.type,
            description: `Extract magic number ${number} to constant`,
            before,
            after,
            lineStart: smell.line,
            lineEnd: smell.line
          };
        }
        break;
      }

      case "dead_code": {
        if (line.includes("console.log") && line.includes("debug")) {
          return {
            file: smell.file,
            type: smell.type,
            description: "Remove debug console.log",
            before: line,
            after: "",
            lineStart: smell.line,
            lineEnd: smell.line
          };
        }
        break;
      }
    }

    if (this.llmRefactorFunction && smell.severity !== "low") {
      const instruction = `Refactor this code to fix: ${smell.description}. ${smell.suggestion}`;
      const context = this.extractContext(code, smell.line, 10);
      
      try {
        const refactored = await this.llmRefactorFunction(context, instruction);
        return {
          file: smell.file,
          type: smell.type,
          description: smell.suggestion,
          before: context,
          after: refactored,
          lineStart: Math.max(1, smell.line - 5),
          lineEnd: Math.min(lines.length, smell.line + 5)
        };
      } catch (e) {
        this.logWarn("LLM refactoring failed", { error: e });
      }
    }

    return null;
  }

  private extractContext(code: string, line: number, radius: number): string {
    const lines = code.split("\n");
    const start = Math.max(0, line - 1 - radius);
    const end = Math.min(lines.length, line - 1 + radius);
    return lines.slice(start, end).join("\n");
  }

  private applyChange(code: string, change: RefactoringChange): string {
    const lines = code.split("\n");
    const beforeLines = change.before.split("\n");
    const afterLines = change.after.split("\n");
    
    const startIndex = change.lineStart - 1;
    lines.splice(startIndex, beforeLines.length, ...afterLines);
    
    return lines.join("\n");
  }

  private calculateLinesReduced(before: string, after: string): number {
    return before.split("\n").length - after.split("\n").length;
  }

  private generateSummary(smells: CodeSmell[], changes: RefactoringChange[]): string {
    const byType = smells.reduce((acc, smell) => {
      acc[smell.type] = (acc[smell.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const typesSummary = Object.entries(byType)
      .map(([type, count]) => `${count} ${type}`)
      .join(", ");

    return `Found ${smells.length} issues (${typesSummary}). Applied ${changes.length} fixes.`;
  }

  async refactorProject(
    projectId: string,
    files: { path: string; content: string }[],
    options: RefactoringOptions = { autoFix: true }
  ): Promise<{
    results: Map<string, RefactoringResult>;
    totalMetrics: RefactoringMetrics;
  }> {
    const results = new Map<string, RefactoringResult>();
    const totalMetrics: RefactoringMetrics = {
      filesAnalyzed: 0,
      issuesFound: 0,
      issuesFixed: 0,
      linesReduced: 0,
      complexityReduced: 0,
      timeMs: 0
    };

    const startTime = Date.now();

    for (const file of files) {
      if (!this.shouldAnalyze(file.path)) continue;

      const result = await this.refactorCode(file.content, file.path, options);
      results.set(file.path, result);

      totalMetrics.filesAnalyzed++;
      totalMetrics.issuesFound += result.metrics.issuesFound;
      totalMetrics.issuesFixed += result.metrics.issuesFixed;
      totalMetrics.linesReduced += result.metrics.linesReduced;
    }

    totalMetrics.timeMs = Date.now() - startTime;

    await projectMemoryService.recordChange(projectId, {
      type: "refactor",
      description: `Refactoring pass: ${totalMetrics.issuesFixed} issues fixed across ${totalMetrics.filesAnalyzed} files`,
      files: Array.from(results.keys()),
      metrics: {
        filesChanged: totalMetrics.filesAnalyzed,
        linesAdded: 0,
        linesRemoved: totalMetrics.linesReduced,
        tokensUsed: 0
      }
    });

    this.log("Project refactoring complete", { 
      filesAnalyzed: totalMetrics.filesAnalyzed,
      issuesFound: totalMetrics.issuesFound,
      issuesFixed: totalMetrics.issuesFixed 
    });

    return { results, totalMetrics };
  }

  private shouldAnalyze(path: string): boolean {
    const extensions = [".ts", ".tsx", ".js", ".jsx"];
    const excludePaths = ["node_modules", "dist", ".git", "build"];
    
    const hasValidExtension = extensions.some(ext => path.endsWith(ext));
    const isExcluded = excludePaths.some(excluded => path.includes(excluded));
    
    return hasValidExtension && !isExcluded;
  }

  destroy(): void {
    this.codeSmellPatterns.clear();
    this.log("RefactoringAgentService destroyed");
  }
}

export const refactoringAgentService = RefactoringAgentService.getInstance();
