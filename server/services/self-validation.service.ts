import { BaseService, ManagedMap } from "../lib/base-service";

interface ValidationResult {
  isValid: boolean;
  score: number;
  issues: ValidationIssue[];
  suggestions: string[];
  autoFixApplied: boolean;
  fixedCode?: string;
}

interface ValidationIssue {
  type: IssueType;
  severity: "error" | "warning" | "info";
  message: string;
  location?: { line: number; column: number };
  fixable: boolean;
  suggestedFix?: string;
}

type IssueType = 
  | "syntax"
  | "type"
  | "import"
  | "security"
  | "performance"
  | "style"
  | "logic"
  | "completeness";

interface ValidationConfig {
  autoFix: boolean;
  strictMode: boolean;
  maxRetries: number;
  validationRules: ValidationRule[];
}

interface ValidationRule {
  id: string;
  name: string;
  check: (code: string, filePath: string) => ValidationIssue[];
  fix?: (code: string, issue: ValidationIssue) => string;
  enabled: boolean;
}

interface ValidationLoop {
  id: string;
  originalCode: string;
  currentCode: string;
  iterations: number;
  maxIterations: number;
  history: Array<{ code: string; result: ValidationResult }>;
  status: "running" | "completed" | "failed" | "max_iterations_reached";
}

class SelfValidationService extends BaseService {
  private static instance: SelfValidationService;
  private config: ValidationConfig;
  private rules: ValidationRule[] = [];
  private loops: ManagedMap<string, ValidationLoop>;

  private constructor() {
    super("SelfValidationService");
    this.config = {
      autoFix: true,
      strictMode: false,
      maxRetries: 3,
      validationRules: []
    };
    this.loops = this.createManagedMap<string, ValidationLoop>({ maxSize: 200, strategy: "lru" });
    this.initializeRules();
  }

  static getInstance(): SelfValidationService {
    if (!SelfValidationService.instance) {
      SelfValidationService.instance = new SelfValidationService();
    }
    return SelfValidationService.instance;
  }

  private initializeRules(): void {
    this.rules = [
      {
        id: "syntax-brackets",
        name: "Bracket matching",
        check: (code) => {
          const issues: ValidationIssue[] = [];
          let braceCount = 0;
          let parenCount = 0;
          let bracketCount = 0;

          for (let i = 0; i < code.length; i++) {
            const char = code[i];
            if (char === "{") braceCount++;
            else if (char === "}") braceCount--;
            else if (char === "(") parenCount++;
            else if (char === ")") parenCount--;
            else if (char === "[") bracketCount++;
            else if (char === "]") bracketCount--;
          }

          if (braceCount !== 0) {
            issues.push({
              type: "syntax",
              severity: "error",
              message: `Unmatched braces: ${braceCount > 0 ? "missing closing" : "extra closing"} brace`,
              fixable: false
            });
          }
          if (parenCount !== 0) {
            issues.push({
              type: "syntax",
              severity: "error",
              message: `Unmatched parentheses: ${parenCount > 0 ? "missing closing" : "extra closing"} paren`,
              fixable: false
            });
          }

          return issues;
        },
        enabled: true
      },
      {
        id: "missing-imports",
        name: "Missing imports detection",
        check: (code) => {
          const issues: ValidationIssue[] = [];
          
          const usedIdentifiers = new Set<string>();
          const identifierPattern = /\b([A-Z][a-zA-Z0-9]*)\b/g;
          let match;
          while ((match = identifierPattern.exec(code)) !== null) {
            usedIdentifiers.add(match[1]);
          }

          const importPattern = /import\s+\{?\s*([^}]+)\s*\}?\s+from/g;
          const imported = new Set<string>();
          while ((match = importPattern.exec(code)) !== null) {
            match[1].split(",").forEach(i => imported.add(i.trim()));
          }

          const reactComponents = ["useState", "useEffect", "useRef", "useCallback", "useMemo", "useContext"];
          const commonComponents = ["Button", "Card", "Input", "Form", "Dialog", "Table"];

          for (const id of Array.from(usedIdentifiers)) {
            if (reactComponents.includes(id) && !imported.has(id)) {
              if (!code.includes(`import { ${id}`) && !code.includes(`import {${id}`)) {
                issues.push({
                  type: "import",
                  severity: "error",
                  message: `'${id}' is used but not imported from 'react'`,
                  fixable: true,
                  suggestedFix: `import { ${id} } from 'react';`
                });
              }
            }
          }

          return issues;
        },
        fix: (code, issue) => {
          if (issue.suggestedFix) {
            if (code.startsWith("import")) {
              return issue.suggestedFix + "\n" + code;
            }
            return issue.suggestedFix + "\n" + code;
          }
          return code;
        },
        enabled: true
      },
      {
        id: "export-check",
        name: "Export statement check",
        check: (code, filePath) => {
          const issues: ValidationIssue[] = [];
          
          if (filePath.endsWith(".tsx") || filePath.endsWith(".ts")) {
            if (!code.includes("export ") && !code.includes("export default")) {
              issues.push({
                type: "completeness",
                severity: "warning",
                message: "File has no exports - component may not be usable",
                fixable: false
              });
            }
          }

          return issues;
        },
        enabled: true
      },
      {
        id: "jsx-return",
        name: "JSX return check",
        check: (code, filePath) => {
          const issues: ValidationIssue[] = [];
          
          if (filePath.endsWith(".tsx") || filePath.endsWith(".jsx")) {
            const hasComponent = code.match(/(?:function|const)\s+[A-Z]\w*\s*(?:=\s*(?:async\s*)?\([^)]*\)\s*=>|\([^)]*\)\s*(?::\s*\w+)?\s*\{)/);
            
            if (hasComponent && !code.includes("return") && !code.includes("=>")) {
              issues.push({
                type: "logic",
                severity: "error",
                message: "Component function has no return statement",
                fixable: false
              });
            }
          }

          return issues;
        },
        enabled: true
      },
      {
        id: "security-check",
        name: "Basic security check",
        check: (code) => {
          const issues: ValidationIssue[] = [];
          
          if (code.includes("dangerouslySetInnerHTML") && !code.includes("DOMPurify")) {
            issues.push({
              type: "security",
              severity: "warning",
              message: "dangerouslySetInnerHTML used without sanitization",
              fixable: false
            });
          }

          if (code.includes("eval(")) {
            issues.push({
              type: "security",
              severity: "error",
              message: "Use of eval() is a security risk",
              fixable: false
            });
          }

          const secretPatterns = [
            /(?:api[_-]?key|secret|password)\s*[:=]\s*['"][^'"]{8,}['"]/gi
          ];

          for (const pattern of secretPatterns) {
            if (pattern.test(code)) {
              issues.push({
                type: "security",
                severity: "error",
                message: "Possible hardcoded secret detected",
                fixable: false
              });
              break;
            }
          }

          return issues;
        },
        enabled: true
      },
      {
        id: "typescript-any",
        name: "TypeScript any usage",
        check: (code, filePath) => {
          const issues: ValidationIssue[] = [];
          
          if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) {
            const anyUsages = code.match(/:\s*any\b/g) || [];
            if (anyUsages.length > 3) {
              issues.push({
                type: "type",
                severity: "warning",
                message: `Excessive use of 'any' type (${anyUsages.length} occurrences)`,
                fixable: false
              });
            }
          }

          return issues;
        },
        enabled: true
      },
      {
        id: "console-log",
        name: "Console.log detection",
        check: (code) => {
          const issues: ValidationIssue[] = [];
          const matches = code.match(/console\.(log|warn|error|debug)\(/g) || [];
          
          if (matches.length > 0) {
            issues.push({
              type: "style",
              severity: "info",
              message: `${matches.length} console statement(s) found - consider removing for production`,
              fixable: true
            });
          }

          return issues;
        },
        enabled: true
      }
    ];
  }

  validate(code: string, filePath: string): ValidationResult {
    this.log("Validating code", { filePath, codeLength: code.length });

    const issues: ValidationIssue[] = [];
    
    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      
      try {
        const ruleIssues = rule.check(code, filePath);
        issues.push(...ruleIssues);
      } catch (error) {
        this.logError(`Rule ${rule.id} failed`, { error });
      }
    }

    const errorCount = issues.filter(i => i.severity === "error").length;
    const warningCount = issues.filter(i => i.severity === "warning").length;
    
    let score = 100;
    score -= errorCount * 20;
    score -= warningCount * 5;
    score = Math.max(0, Math.min(100, score));

    const isValid = errorCount === 0;

    let autoFixApplied = false;
    let fixedCode = code;

    if (this.config.autoFix && issues.some(i => i.fixable)) {
      const fixResult = this.applyFixes(code, issues);
      if (fixResult.modified) {
        autoFixApplied = true;
        fixedCode = fixResult.code;
      }
    }

    const suggestions = this.generateSuggestions(issues);

    this.log("Validation complete", {
      filePath,
      isValid,
      score,
      errorCount,
      warningCount,
      autoFixApplied
    });

    return {
      isValid,
      score,
      issues,
      suggestions,
      autoFixApplied,
      fixedCode: autoFixApplied ? fixedCode : undefined
    };
  }

  private applyFixes(code: string, issues: ValidationIssue[]): { code: string; modified: boolean } {
    let currentCode = code;
    let modified = false;

    const fixableIssues = issues.filter(i => i.fixable && i.suggestedFix);

    for (const issue of fixableIssues) {
      const rule = this.rules.find(r => r.fix);
      if (rule && rule.fix) {
        const fixed = rule.fix(currentCode, issue);
        if (fixed !== currentCode) {
          currentCode = fixed;
          modified = true;
        }
      }
    }

    return { code: currentCode, modified };
  }

  private generateSuggestions(issues: ValidationIssue[]): string[] {
    const suggestions: string[] = [];
    const typeCount = new Map<IssueType, number>();

    for (const issue of issues) {
      typeCount.set(issue.type, (typeCount.get(issue.type) || 0) + 1);
    }

    if ((typeCount.get("import") || 0) > 0) {
      suggestions.push("Review and add missing imports at the top of the file");
    }

    if ((typeCount.get("type") || 0) > 2) {
      suggestions.push("Consider creating explicit type definitions instead of using 'any'");
    }

    if ((typeCount.get("security") || 0) > 0) {
      suggestions.push("Address security issues before deploying to production");
    }

    if ((typeCount.get("syntax") || 0) > 0) {
      suggestions.push("Fix syntax errors to ensure code can be parsed correctly");
    }

    return suggestions;
  }

  async validateWithRetry(
    code: string,
    filePath: string,
    onFix: (code: string) => Promise<string>
  ): Promise<ValidationResult> {
    const loopId = `loop_${Date.now()}`;
    const loop: ValidationLoop = {
      id: loopId,
      originalCode: code,
      currentCode: code,
      iterations: 0,
      maxIterations: this.config.maxRetries,
      history: [],
      status: "running"
    };

    this.loops.set(loopId, loop);

    while (loop.iterations < loop.maxIterations && loop.status === "running") {
      loop.iterations++;
      
      const result = this.validate(loop.currentCode, filePath);
      loop.history.push({ code: loop.currentCode, result });

      if (result.isValid) {
        loop.status = "completed";
        return result;
      }

      if (!result.issues.some(i => i.severity === "error")) {
        loop.status = "completed";
        return result;
      }

      try {
        const fixPrompt = this.generateFixPrompt(result);
        const fixedCode = await onFix(fixPrompt);
        loop.currentCode = fixedCode;
      } catch (error) {
        loop.status = "failed";
        return result;
      }
    }

    loop.status = "max_iterations_reached";
    return loop.history[loop.history.length - 1]?.result || this.validate(code, filePath);
  }

  private generateFixPrompt(result: ValidationResult): string {
    const errors = result.issues.filter(i => i.severity === "error");
    
    let prompt = "Please fix the following issues in the code:\n\n";
    
    for (const error of errors) {
      prompt += `- ${error.message}`;
      if (error.suggestedFix) {
        prompt += ` (Suggested: ${error.suggestedFix})`;
      }
      prompt += "\n";
    }

    return prompt;
  }

  addRule(rule: ValidationRule): void {
    this.rules.push(rule);
    this.log("Validation rule added", { id: rule.id });
  }

  enableRule(ruleId: string, enabled: boolean): void {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) {
      rule.enabled = enabled;
    }
  }

  setConfig(config: Partial<ValidationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): ValidationConfig {
    return { ...this.config };
  }

  getRules(): Array<{ id: string; name: string; enabled: boolean }> {
    return this.rules.map(r => ({
      id: r.id,
      name: r.name,
      enabled: r.enabled
    }));
  }

  destroy(): void {
    this.loops.clear();
    this.log("SelfValidationService destroyed");
  }
}

export const selfValidationService = SelfValidationService.getInstance();
