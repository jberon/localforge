import { BaseService, ManagedMap } from "../lib/base-service";

interface Issue {
  type: string;
  severity: "error" | "warning" | "info";
  message: string;
  line?: number;
  fixed: boolean;
  fixDescription?: string;
}

interface PassResult {
  passName: string;
  issuesFound: Issue[];
  issuesFixed: Issue[];
  durationMs: number;
}

interface QualityReport {
  passResults: PassResult[];
  originalCode: string;
  fixedCode: string;
  totalIssuesFound: number;
  totalIssuesFixed: number;
  autoFixable: number;
  manualRequired: number;
  overallScore: number;
  summary: string;
}

interface AnalysisHistoryEntry {
  timestamp: Date;
  score: number;
  issuesFound: number;
  issuesFixed: number;
  issueTypes: string[];
}

interface AnalyzeOptions {
  language?: string;
  isMultiFile?: boolean;
}

class CodeQualityPipelineService extends BaseService {
  private static instance: CodeQualityPipelineService;
  private analysisHistory: ManagedMap<string, AnalysisHistoryEntry>;
  private issueCounter: ManagedMap<string, number>;

  private constructor() {
    super("CodeQualityPipelineService");
    this.analysisHistory = this.createManagedMap<string, AnalysisHistoryEntry>({
      maxSize: 500,
      strategy: "lru",
    });
    this.issueCounter = this.createManagedMap<string, number>({
      maxSize: 200,
      strategy: "lru",
    });
  }

  static getInstance(): CodeQualityPipelineService {
    if (!CodeQualityPipelineService.instance) {
      CodeQualityPipelineService.instance = new CodeQualityPipelineService();
    }
    return CodeQualityPipelineService.instance;
  }

  destroy(): void {
    this.analysisHistory.clear();
    this.issueCounter.clear();
    this.log("CodeQualityPipelineService destroyed");
  }

  async analyzeAndFix(
    code: string,
    options?: AnalyzeOptions
  ): Promise<QualityReport> {
    const originalCode = code;
    let currentCode = code;
    const passResults: PassResult[] = [];
    const lang = options?.language || this.detectLanguage(code);

    const pass1Start = Date.now();
    const { code: afterPass1, issues: issues1 } =
      this.runStructuralIntegrity(currentCode);
    currentCode = afterPass1;
    passResults.push(this.buildPassResult("Structural Integrity", issues1, pass1Start));

    const isJsx = lang === "jsx" || lang === "tsx" || lang === "react";

    const pass2Start = Date.now();
    const { code: afterPass2, issues: issues2 } = this.runReactJsxPass(
      currentCode,
      isJsx
    );
    currentCode = afterPass2;
    passResults.push(this.buildPassResult("React/JSX Specific", issues2, pass2Start));

    const pass3Start = Date.now();
    const { code: afterPass3, issues: issues3 } =
      this.runImportDependencyResolution(currentCode);
    currentCode = afterPass3;
    passResults.push(
      this.buildPassResult("Import/Dependency Resolution", issues3, pass3Start)
    );

    const pass4Start = Date.now();
    const { code: afterPass4, issues: issues4 } =
      this.runCodeCompleteness(currentCode);
    currentCode = afterPass4;
    passResults.push(this.buildPassResult("Code Completeness", issues4, pass4Start));

    const pass5Start = Date.now();
    const { code: afterPass5, issues: issues5 } =
      this.runCommonLLMMistakes(currentCode);
    currentCode = afterPass5;
    passResults.push(this.buildPassResult("Common LLM Mistakes", issues5, pass5Start));

    const allIssues = [
      ...issues1,
      ...issues2,
      ...issues3,
      ...issues4,
      ...issues5,
    ];
    const totalFound = allIssues.length;
    const totalFixed = allIssues.filter((i) => i.fixed).length;
    const autoFixable = totalFixed;
    const manualRequired = totalFound - totalFixed;
    const overallScore = this.calculateScore(allIssues, originalCode, currentCode);

    const report: QualityReport = {
      passResults,
      originalCode,
      fixedCode: currentCode,
      totalIssuesFound: totalFound,
      totalIssuesFixed: totalFixed,
      autoFixable,
      manualRequired,
      overallScore,
      summary: this.buildSummary(totalFound, totalFixed, overallScore),
    };

    const historyId = `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.analysisHistory.set(historyId, {
      timestamp: new Date(),
      score: overallScore,
      issuesFound: totalFound,
      issuesFixed: totalFixed,
      issueTypes: allIssues.map((i) => i.type),
    });

    for (const issue of allIssues) {
      const count = this.issueCounter.get(issue.type) || 0;
      this.issueCounter.set(issue.type, count + 1);
    }

    this.log("Code quality analysis completed", {
      totalFound,
      totalFixed,
      score: overallScore,
    });

    return report;
  }

  getStats(): {
    totalAnalyzed: number;
    averageScore: number;
    commonIssues: Array<{ type: string; count: number }>;
  } {
    const entries = this.analysisHistory.values();
    const totalAnalyzed = entries.length;
    const averageScore =
      totalAnalyzed > 0
        ? entries.reduce((sum, e) => sum + e.score, 0) / totalAnalyzed
        : 100;

    const issueEntries = this.issueCounter.entries();
    const commonIssues = issueEntries
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    return { totalAnalyzed, averageScore: Math.round(averageScore * 10) / 10, commonIssues };
  }

  private detectLanguage(code: string): string {
    if (/<[A-Z][a-zA-Z]*[\s/>]/.test(code) || /className=/.test(code)) {
      if (/:\s*(string|number|boolean|React\.FC|JSX\.Element)/.test(code)) {
        return "tsx";
      }
      return "jsx";
    }
    if (/:\s*(string|number|boolean|void|any)\b/.test(code)) return "typescript";
    return "javascript";
  }

  private buildPassResult(
    passName: string,
    issues: Issue[],
    startTime: number
  ): PassResult {
    return {
      passName,
      issuesFound: issues,
      issuesFixed: issues.filter((i) => i.fixed),
      durationMs: Date.now() - startTime,
    };
  }

  private calculateScore(
    issues: Issue[],
    original: string,
    fixed: string
  ): number {
    let score = 100;
    for (const issue of issues) {
      if (issue.severity === "error") {
        score -= issue.fixed ? 1 : 5;
      } else if (issue.severity === "warning") {
        score -= issue.fixed ? 0.5 : 2;
      } else {
        score -= issue.fixed ? 0 : 0.5;
      }
    }
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private buildSummary(
    found: number,
    fixed: number,
    score: number
  ): string {
    if (found === 0) return "No issues found. Code looks clean.";
    const fixRate = Math.round((fixed / found) * 100);
    return `Found ${found} issue(s), auto-fixed ${fixed} (${fixRate}%). Quality score: ${score}/100.`;
  }

  private runStructuralIntegrity(code: string): {
    code: string;
    issues: Issue[];
  } {
    const issues: Issue[] = [];
    let result = code;

    const bracketResult = this.checkBracketMatching(result);
    issues.push(...bracketResult.issues);
    result = bracketResult.code;

    const stringResult = this.fixUnclosedStrings(result);
    issues.push(...stringResult.issues);
    result = stringResult.code;

    const truncationResult = this.detectTruncatedCode(result);
    issues.push(...truncationResult.issues);
    result = truncationResult.code;

    const semicolonResult = this.fixMissingSemicolons(result);
    issues.push(...semicolonResult.issues);
    result = semicolonResult.code;

    return { code: result, issues };
  }

  private checkBracketMatching(code: string): {
    code: string;
    issues: Issue[];
  } {
    const issues: Issue[] = [];
    let result = code;

    const pairs: Array<[string, string, string]> = [
      ["{", "}", "brace"],
      ["(", ")", "parenthesis"],
      ["[", "]", "bracket"],
    ];

    for (const [open, close, name] of pairs) {
      const stack: Array<{ char: string; line: number; col: number }> = [];
      const lines = result.split("\n");
      let inString = false;
      let stringChar = "";
      let inComment = false;
      let inMultiComment = false;
      let inTemplate = false;
      let lineNum = 0;

      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        lineNum = li + 1;
        for (let ci = 0; ci < line.length; ci++) {
          const ch = line[ci];
          const prev = ci > 0 ? line[ci - 1] : "";
          const next = ci < line.length - 1 ? line[ci + 1] : "";

          if (inMultiComment) {
            if (ch === "*" && next === "/") {
              inMultiComment = false;
              ci++;
            }
            continue;
          }
          if (inComment) continue;
          if (ch === "/" && next === "/") {
            inComment = true;
            continue;
          }
          if (ch === "/" && next === "*") {
            inMultiComment = true;
            ci++;
            continue;
          }

          if (inTemplate) {
            if (ch === "`" && prev !== "\\") {
              inTemplate = false;
            }
            continue;
          }

          if (!inString && ch === "`") {
            inTemplate = true;
            continue;
          }

          if (inString) {
            if (ch === stringChar && prev !== "\\") {
              inString = false;
            }
            continue;
          }

          if (ch === '"' || ch === "'") {
            inString = true;
            stringChar = ch;
            continue;
          }

          if (ch === open) {
            stack.push({ char: ch, line: lineNum, col: ci });
          } else if (ch === close) {
            if (stack.length === 0) {
              issues.push({
                type: `unmatched-closing-${name}`,
                severity: "error",
                message: `Unmatched closing ${name} '${close}' at line ${lineNum}`,
                line: lineNum,
                fixed: false,
              });
            } else {
              stack.pop();
            }
          }
        }
        inComment = false;
      }

      if (stack.length > 0) {
        const missing = stack.length;
        issues.push({
          type: `unclosed-${name}`,
          severity: "error",
          message: `${missing} unclosed ${name}(s) - first opened at line ${stack[0].line}`,
          line: stack[0].line,
          fixed: true,
          fixDescription: `Added ${missing} closing '${close}' at end of code`,
        });
        result = result.trimEnd() + "\n" + close.repeat(missing) + "\n";
      }
    }

    return { code: result, issues };
  }

  private fixUnclosedStrings(code: string): {
    code: string;
    issues: Issue[];
  } {
    const issues: Issue[] = [];
    const lines = code.split("\n");
    const fixedLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) {
        fixedLines.push(line);
        continue;
      }

      let inString = false;
      let stringChar = "";
      let escaped = false;

      for (let ci = 0; ci < line.length; ci++) {
        const ch = line[ci];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === "`") {
          fixedLines.push(line);
          inString = false;
          break;
        }
        if (!inString && (ch === '"' || ch === "'")) {
          inString = true;
          stringChar = ch;
        } else if (inString && ch === stringChar) {
          inString = false;
        }
      }

      if (inString) {
        issues.push({
          type: "unclosed-string",
          severity: "error",
          message: `Unclosed string literal at line ${i + 1}`,
          line: i + 1,
          fixed: true,
          fixDescription: `Added closing ${stringChar} at end of line`,
        });
        line = line + stringChar;
      }
      fixedLines.push(line);
    }

    return { code: fixedLines.join("\n"), issues };
  }

  private detectTruncatedCode(code: string): {
    code: string;
    issues: Issue[];
  } {
    const issues: Issue[] = [];
    const trimmed = code.trimEnd();
    const lastLine = trimmed.split("\n").pop() || "";
    const lastTrimmed = lastLine.trim();

    const truncationPatterns = [
      { pattern: /,\s*$/, desc: "ends with a trailing comma" },
      { pattern: /\(\s*$/, desc: "ends with an open parenthesis" },
      { pattern: /\{\s*$/, desc: "ends with an open brace" },
      { pattern: /=>\s*$/, desc: "ends with an arrow (incomplete arrow function)" },
      { pattern: /=\s*$/, desc: "ends with an assignment operator" },
      { pattern: /\+\s*$/, desc: "ends with a plus operator" },
      { pattern: /&&\s*$/, desc: "ends with logical AND" },
      { pattern: /\|\|\s*$/, desc: "ends with logical OR" },
      { pattern: /\?\s*$/, desc: "ends with a ternary operator" },
      { pattern: /:\s*$/, desc: "ends with a colon (incomplete ternary or object)" },
      { pattern: /return\s*$/, desc: "ends with an empty return statement" },
    ];

    for (const { pattern, desc } of truncationPatterns) {
      if (pattern.test(lastTrimmed)) {
        issues.push({
          type: "truncated-code",
          severity: "error",
          message: `Code appears truncated: ${desc}`,
          line: trimmed.split("\n").length,
          fixed: false,
        });
        break;
      }
    }

    const funcPattern = /(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:\(|async\s*\())[^{]*\{/g;
    let match;
    let lastFuncStart = -1;
    while ((match = funcPattern.exec(code)) !== null) {
      lastFuncStart = match.index;
    }

    if (lastFuncStart !== -1) {
      const afterFunc = code.substring(lastFuncStart);
      const openCount = (afterFunc.match(/\{/g) || []).length;
      const closeCount = (afterFunc.match(/\}/g) || []).length;
      if (openCount > closeCount + 1) {
        issues.push({
          type: "incomplete-function",
          severity: "warning",
          message: "Last function body may be incomplete (unbalanced braces)",
          fixed: false,
        });
      }
    }

    return { code, issues };
  }

  private fixMissingSemicolons(code: string): {
    code: string;
    issues: Issue[];
  } {
    const issues: Issue[] = [];
    const lines = code.split("\n");
    const fixedLines: string[] = [];

    const needsSemicolon =
      /^\s*(const|let|var|return|throw|import|export\s+(?:default\s+)?(?:const|let|var))\b/;
    const endsWithoutSemicolon = /[^;{},\s/\\*]\s*$/;
    const noSemicolonNeeded =
      /(?:^\s*(?:if|else|for|while|do|switch|try|catch|finally|class|function|\/\/|\/\*|\*|.*\{$|.*\}$|.*=>))/;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      const trimmed = line.trim();

      if (
        trimmed.length > 0 &&
        needsSemicolon.test(line) &&
        endsWithoutSemicolon.test(trimmed) &&
        !noSemicolonNeeded.test(trimmed) &&
        !trimmed.endsWith("{") &&
        !trimmed.endsWith("}") &&
        !trimmed.endsWith("(") &&
        !trimmed.endsWith(",") &&
        !trimmed.endsWith("=>")
      ) {
        const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : "";
        if (
          nextLine &&
          !nextLine.startsWith(".") &&
          !nextLine.startsWith("?") &&
          !nextLine.startsWith("+") &&
          !nextLine.startsWith("-") &&
          !nextLine.startsWith("||") &&
          !nextLine.startsWith("&&")
        ) {
          if (
            /^\s*(const|let|var)\s+\w+\s*=\s*[^{(]/.test(line) &&
            !trimmed.endsWith(",") &&
            !trimmed.endsWith("(")
          ) {
            const singleLineAssign = /=\s*.+[^,{(]\s*$/.test(trimmed);
            if (singleLineAssign) {
              issues.push({
                type: "missing-semicolon",
                severity: "warning",
                message: `Missing semicolon at line ${i + 1}`,
                line: i + 1,
                fixed: true,
                fixDescription: "Added semicolon at end of statement",
              });
              line = line.replace(/\s*$/, ";");
            }
          }
        }
      }

      fixedLines.push(line);
    }

    return { code: fixedLines.join("\n"), issues };
  }

  private runReactJsxPass(
    code: string,
    isJsx: boolean
  ): { code: string; issues: Issue[] } {
    const issues: Issue[] = [];
    let result = code;

    const hasJsx = /<[A-Z][a-zA-Z0-9]*[\s/>]/.test(result) || /className=/.test(result);
    if (!hasJsx && !isJsx) {
      return { code: result, issues };
    }

    const exportResult = this.ensureComponentExport(result);
    issues.push(...exportResult.issues);
    result = exportResult.code;

    const hookImportResult = this.addMissingReactHookImports(result);
    issues.push(...hookImportResult.issues);
    result = hookImportResult.code;

    const jsxTagResult = this.fixUnclosedJsxTags(result);
    issues.push(...jsxTagResult.issues);
    result = jsxTagResult.code;

    const renderResult = this.ensureRenderCall(result);
    issues.push(...renderResult.issues);
    result = renderResult.code;

    const jsxMistakesResult = this.fixCommonJsxMistakes(result);
    issues.push(...jsxMistakesResult.issues);
    result = jsxMistakesResult.code;

    return { code: result, issues };
  }

  private ensureComponentExport(code: string): {
    code: string;
    issues: Issue[];
  } {
    const issues: Issue[] = [];

    if (/export\s+(default\s+)?function\s+\w+/.test(code)) return { code, issues };
    if (/export\s+default\s+\w+/.test(code)) return { code, issues };
    if (/export\s+\{[^}]*\}/.test(code)) return { code, issues };
    if (/module\.exports/.test(code)) return { code, issues };

    const componentMatch = code.match(
      /(?:function|const)\s+([A-Z][a-zA-Z0-9]*)\s*(?:=\s*(?:\([^)]*\)|)\s*=>|[({])/
    );

    if (componentMatch) {
      const componentName = componentMatch[1];
      const hasReturn =
        new RegExp(`function\\s+${componentName}[\\s\\S]*?return\\s*\\(`).test(
          code
        ) ||
        new RegExp(
          `const\\s+${componentName}\\s*=.*=>\\s*(?:\\(|<)`
        ).test(code);

      if (hasReturn || /<[A-Z]/.test(code)) {
        issues.push({
          type: "missing-export",
          severity: "warning",
          message: `Component '${componentName}' is not exported`,
          fixed: true,
          fixDescription: `Added 'export default ${componentName}' at end of file`,
        });
        return {
          code: code.trimEnd() + `\n\nexport default ${componentName};\n`,
          issues,
        };
      }
    }

    return { code, issues };
  }

  private addMissingReactHookImports(code: string): {
    code: string;
    issues: Issue[];
  } {
    const issues: Issue[] = [];
    let result = code;

    const hooks = [
      "useState",
      "useEffect",
      "useContext",
      "useReducer",
      "useCallback",
      "useMemo",
      "useRef",
      "useLayoutEffect",
      "useImperativeHandle",
      "useDebugValue",
      "useId",
      "useTransition",
      "useDeferredValue",
      "useSyncExternalStore",
      "useInsertionEffect",
    ];

    const usedHooks: string[] = [];
    for (const hook of hooks) {
      const hookUsagePattern = new RegExp(`\\b${hook}\\s*\\(`, "g");
      if (hookUsagePattern.test(result)) {
        const importPattern = new RegExp(
          `import\\s+.*\\b${hook}\\b.*from\\s+['"]react['"]`
        );
        const destructurePattern = new RegExp(
          `import\\s*\\{[^}]*\\b${hook}\\b[^}]*\\}\\s*from\\s+['"]react['"]`
        );
        if (!importPattern.test(result) && !destructurePattern.test(result)) {
          usedHooks.push(hook);
        }
      }
    }

    if (usedHooks.length > 0) {
      const existingImport = result.match(
        /import\s*\{([^}]*)\}\s*from\s+['"]react['"]/
      );

      if (existingImport) {
        const existing = existingImport[1]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const merged = Array.from(new Set([...existing, ...usedHooks]));
        const newImport = `import { ${merged.join(", ")} } from 'react'`;
        result = result.replace(
          /import\s*\{[^}]*\}\s*from\s+['"]react['"]\s*;?/,
          newImport + ";"
        );
      } else {
        const hasReactImport = /import\s+React\b/.test(result);
        if (!hasReactImport) {
          const importLine = `import { ${usedHooks.join(", ")} } from 'react';\n`;
          result = importLine + result;
        } else {
          const defaultImport = result.match(
            /import\s+(React)\s+from\s+['"]react['"]\s*;?/
          );
          if (defaultImport) {
            const newImport = `import React, { ${usedHooks.join(", ")} } from 'react';`;
            result = result.replace(
              /import\s+React\s+from\s+['"]react['"]\s*;?/,
              newImport
            );
          }
        }
      }

      issues.push({
        type: "missing-react-imports",
        severity: "error",
        message: `Missing React hook imports: ${usedHooks.join(", ")}`,
        fixed: true,
        fixDescription: `Added imports for: ${usedHooks.join(", ")}`,
      });
    }

    return { code: result, issues };
  }

  private fixUnclosedJsxTags(code: string): {
    code: string;
    issues: Issue[];
  } {
    const issues: Issue[] = [];

    const voidElements = new Set([
      "img",
      "br",
      "hr",
      "input",
      "meta",
      "link",
      "area",
      "base",
      "col",
      "embed",
      "source",
      "track",
      "wbr",
    ]);

    const openTagPattern = /<([a-zA-Z][a-zA-Z0-9.]*)\b[^>]*(?<!\/)>/g;
    const closeTagPattern = /<\/([a-zA-Z][a-zA-Z0-9.]*)>/g;
    const selfClosePattern = /<([a-zA-Z][a-zA-Z0-9.]*)\b[^>]*\/>/g;

    const openTags: Map<string, number> = new Map();
    const closeTags: Map<string, number> = new Map();

    let match: RegExpExecArray | null;

    while ((match = openTagPattern.exec(code)) !== null) {
      const tag = match[1];
      if (voidElements.has(tag.toLowerCase())) continue;
      openTags.set(tag, (openTags.get(tag) || 0) + 1);
    }

    while ((match = selfClosePattern.exec(code)) !== null) {
      const tag = match[1];
      const count = openTags.get(tag) || 0;
      if (count > 0) {
        openTags.set(tag, count - 1);
      }
    }

    while ((match = closeTagPattern.exec(code)) !== null) {
      const tag = match[1];
      closeTags.set(tag, (closeTags.get(tag) || 0) + 1);
    }

    for (const [tag, openCount] of Array.from(openTags.entries())) {
      const closeCount = closeTags.get(tag) || 0;
      if (openCount > closeCount) {
        const diff = openCount - closeCount;
        issues.push({
          type: "unclosed-jsx-tag",
          severity: "warning",
          message: `Potentially ${diff} unclosed <${tag}> tag(s)`,
          fixed: false,
          fixDescription: `Check that all <${tag}> tags have matching closing tags`,
        });
      }
    }

    return { code, issues };
  }

  private ensureRenderCall(code: string): {
    code: string;
    issues: Issue[];
  } {
    const issues: Issue[] = [];
    let result = code;

    const hasComponent =
      /(?:function|const)\s+([A-Z][a-zA-Z0-9]*)\s*(?:=|[({])/.test(result);
    const hasRenderCall =
      /ReactDOM\.render|createRoot|ReactDOM\.createRoot|hydrateRoot/.test(
        result
      );
    const isStandalone =
      !/(export\s+default|export\s+\{|module\.exports)/.test(result) &&
      hasComponent;

    if (hasComponent && !hasRenderCall && isStandalone) {
      const componentMatch = result.match(
        /(?:function|const)\s+([A-Z][a-zA-Z0-9]*)/
      );
      if (componentMatch) {
        const componentName = componentMatch[1];
        const hasReactDomImport =
          /import.*from\s+['"]react-dom/.test(result);

        let renderBlock = "";
        if (!hasReactDomImport) {
          renderBlock += `\nimport { createRoot } from 'react-dom/client';\n`;
        }
        renderBlock += `\nconst root = createRoot(document.getElementById('root'));\nroot.render(<${componentName} />);\n`;

        result = result.trimEnd() + "\n" + renderBlock;

        issues.push({
          type: "missing-render-call",
          severity: "warning",
          message: "Standalone React component has no render call",
          fixed: true,
          fixDescription: `Added createRoot render call for <${componentName} />`,
        });
      }
    }

    return { code: result, issues };
  }

  private fixCommonJsxMistakes(code: string): {
    code: string;
    issues: Issue[];
  } {
    const issues: Issue[] = [];
    let result = code;

    const replacements: Array<{
      pattern: RegExp;
      replacement: string;
      type: string;
      message: string;
    }> = [
      {
        pattern: /\bclass=/g,
        replacement: "className=",
        type: "jsx-class-to-classname",
        message: 'HTML `class=` should be `className=` in JSX',
      },
      {
        pattern: /\bfor=(?!["']?\w+\s+(?:of|in)\b)/g,
        replacement: "htmlFor=",
        type: "jsx-for-to-htmlfor",
        message: 'HTML `for=` should be `htmlFor=` in JSX',
      },
      {
        pattern: /\bonclick=/gi,
        replacement: "onClick=",
        type: "jsx-onclick",
        message: "`onclick` should be `onClick` in JSX",
      },
      {
        pattern: /\bonchange=/gi,
        replacement: "onChange=",
        type: "jsx-onchange",
        message: "`onchange` should be `onChange` in JSX",
      },
      {
        pattern: /\bonsubmit=/gi,
        replacement: "onSubmit=",
        type: "jsx-onsubmit",
        message: "`onsubmit` should be `onSubmit` in JSX",
      },
      {
        pattern: /\bonmouseover=/gi,
        replacement: "onMouseOver=",
        type: "jsx-onmouseover",
        message: "`onmouseover` should be `onMouseOver` in JSX",
      },
      {
        pattern: /\bonmouseout=/gi,
        replacement: "onMouseOut=",
        type: "jsx-onmouseout",
        message: "`onmouseout` should be `onMouseOut` in JSX",
      },
      {
        pattern: /\bonkeydown=/gi,
        replacement: "onKeyDown=",
        type: "jsx-onkeydown",
        message: "`onkeydown` should be `onKeyDown` in JSX",
      },
      {
        pattern: /\bonkeyup=/gi,
        replacement: "onKeyUp=",
        type: "jsx-onkeyup",
        message: "`onkeyup` should be `onKeyUp` in JSX",
      },
      {
        pattern: /\bonfocus=/gi,
        replacement: "onFocus=",
        type: "jsx-onfocus",
        message: "`onfocus` should be `onFocus` in JSX",
      },
      {
        pattern: /\bonblur=/gi,
        replacement: "onBlur=",
        type: "jsx-onblur",
        message: "`onblur` should be `onBlur` in JSX",
      },
      {
        pattern: /\btabindex=/gi,
        replacement: "tabIndex=",
        type: "jsx-tabindex",
        message: "`tabindex` should be `tabIndex` in JSX",
      },
      {
        pattern: /\breadonly(?=\s|=|>)/gi,
        replacement: "readOnly",
        type: "jsx-readonly",
        message: "`readonly` should be `readOnly` in JSX",
      },
      {
        pattern: /\bautocomplete=/gi,
        replacement: "autoComplete=",
        type: "jsx-autocomplete",
        message: "`autocomplete` should be `autoComplete` in JSX",
      },
    ];

    for (const { pattern, replacement, type, message } of replacements) {
      const matches = result.match(pattern);
      if (matches && matches.length > 0) {
        result = result.replace(pattern, replacement);
        issues.push({
          type,
          severity: "error",
          message,
          fixed: true,
          fixDescription: `Replaced ${matches.length} occurrence(s)`,
        });
      }
    }

    return { code: result, issues };
  }

  private runImportDependencyResolution(code: string): {
    code: string;
    issues: Issue[];
  } {
    const issues: Issue[] = [];
    let result = code;

    const unusedResult = this.removeUnusedImports(result);
    issues.push(...unusedResult.issues);
    result = unusedResult.code;

    const tailwindResult = this.addTailwindCdnIfNeeded(result);
    issues.push(...tailwindResult.issues);
    result = tailwindResult.code;

    const usedNotImported = this.detectUsedButNotImported(result);
    issues.push(...usedNotImported.issues);
    result = usedNotImported.code;

    return { code: result, issues };
  }

  private removeUnusedImports(code: string): {
    code: string;
    issues: Issue[];
  } {
    const issues: Issue[] = [];
    let result = code;

    const importRegex =
      /^import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s+['"][^'"]+['"]\s*;?\s*$/gm;

    let match: RegExpExecArray | null;
    const importsToRemove: Array<{
      full: string;
      names: string[];
      unused: string[];
    }> = [];

    while ((match = importRegex.exec(code)) !== null) {
      const defaultImport = match[1];
      const namedImports = match[2];
      const allNames: string[] = [];

      if (defaultImport && defaultImport !== "React") {
        allNames.push(defaultImport);
      }
      if (namedImports) {
        const names = namedImports
          .split(",")
          .map((n) => {
            const parts = n.trim().split(/\s+as\s+/);
            return parts[parts.length - 1].trim();
          })
          .filter(Boolean);
        allNames.push(...names);
      }

      const unused: string[] = [];
      for (const name of allNames) {
        if (!name) continue;
        const codeWithoutImports = result.replace(
          /^import\s+.*$/gm,
          ""
        );
        const usagePattern = new RegExp(`\\b${this.escapeRegex(name)}\\b`);
        if (!usagePattern.test(codeWithoutImports)) {
          unused.push(name);
        }
      }

      if (unused.length > 0 && unused.length === allNames.length) {
        importsToRemove.push({ full: match[0], names: allNames, unused });
      }
    }

    for (const { full, unused } of importsToRemove) {
      result = result.replace(full, "").replace(/^\s*\n/gm, (m) => m);
      issues.push({
        type: "unused-import",
        severity: "info",
        message: `Unused import(s): ${unused.join(", ")}`,
        fixed: true,
        fixDescription: `Removed unused import statement`,
      });
    }

    result = result.replace(/\n{3,}/g, "\n\n");

    return { code: result, issues };
  }

  private detectUsedButNotImported(code: string): {
    code: string;
    issues: Issue[];
  } {
    const issues: Issue[] = [];

    const knownModules: Array<{ name: string; from: string }> = [
      { name: "React", from: "react" },
      { name: "ReactDOM", from: "react-dom" },
      { name: "createRoot", from: "react-dom/client" },
    ];

    for (const mod of knownModules) {
      const usagePattern = new RegExp(`\\b${mod.name}\\b`);
      const importPattern = new RegExp(
        `import\\s+.*\\b${mod.name}\\b.*from\\s+['"]`
      );

      if (usagePattern.test(code) && !importPattern.test(code)) {
        const alreadyDestructured = new RegExp(
          `import\\s*\\{[^}]*\\b${mod.name}\\b[^}]*\\}\\s*from`
        ).test(code);

        if (!alreadyDestructured) {
          issues.push({
            type: "used-not-imported",
            severity: "warning",
            message: `'${mod.name}' is used but not imported from '${mod.from}'`,
            fixed: false,
            fixDescription: `Add import for '${mod.name}' from '${mod.from}'`,
          });
        }
      }
    }

    return { code, issues };
  }

  private addTailwindCdnIfNeeded(code: string): {
    code: string;
    issues: Issue[];
  } {
    const issues: Issue[] = [];
    let result = code;

    const tailwindClasses =
      /\b(flex|grid|p-\d|m-\d|text-(?:sm|lg|xl|2xl|3xl)|bg-\w+|rounded|shadow|border|w-\d|h-\d|gap-\d|items-center|justify-center|space-[xy]-\d|min-h|max-w|overflow|relative|absolute|fixed|sticky)\b/;

    if (tailwindClasses.test(result)) {
      const hasTailwindImport =
        /tailwindcss|tailwind\.css|@tailwind|cdn\.tailwindcss/.test(result);

      if (!hasTailwindImport) {
        const hasHtmlHead = /<head[^>]*>/i.test(result);
        if (hasHtmlHead) {
          result = result.replace(
            /(<head[^>]*>)/i,
            '$1\n    <script src="https://cdn.tailwindcss.com"></script>'
          );
          issues.push({
            type: "missing-tailwind",
            severity: "info",
            message: "Tailwind CSS classes detected but no Tailwind import found",
            fixed: true,
            fixDescription: "Added Tailwind CSS CDN script to <head>",
          });
        } else {
          issues.push({
            type: "missing-tailwind",
            severity: "info",
            message:
              "Tailwind CSS classes detected but no Tailwind CSS import found. Add Tailwind CSS to your project.",
            fixed: false,
          });
        }
      }
    }

    return { code: result, issues };
  }

  private runCodeCompleteness(code: string): {
    code: string;
    issues: Issue[];
  } {
    const issues: Issue[] = [];

    const placeholderResult = this.detectPlaceholderCode(code);
    issues.push(...placeholderResult.issues);

    const nullReturnResult = this.detectNullReturns(code);
    issues.push(...nullReturnResult.issues);

    const handlerResult = this.checkEventHandlersDefined(code);
    issues.push(...handlerResult.issues);

    const stateResult = this.checkStateVariablesDeclared(code);
    issues.push(...stateResult.issues);

    return { code, issues };
  }

  private detectPlaceholderCode(code: string): {
    code: string;
    issues: Issue[];
  } {
    const issues: Issue[] = [];
    const lines = code.split("\n");

    const placeholderPatterns: Array<{
      pattern: RegExp;
      message: string;
    }> = [
      { pattern: /\/\/\s*TODO/i, message: "TODO comment found" },
      { pattern: /\/\/\s*FIXME/i, message: "FIXME comment found" },
      { pattern: /\/\/\s*HACK/i, message: "HACK comment found" },
      {
        pattern: /\/\*\s*implement\s*\*\//i,
        message: "Placeholder implement comment found",
      },
      {
        pattern: /\/\/\s*implement\s*(here|this|later|me)/i,
        message: "Placeholder implement comment found",
      },
      {
        pattern: /\/\/\s*\.{3}\s*$/,
        message: "Ellipsis placeholder comment found",
      },
      {
        pattern: /^\s*\.{3}\s*$/,
        message: "Spread/ellipsis placeholder found (likely incomplete code)",
      },
      {
        pattern: /\/\/\s*add\s+(your|the|more)\s+/i,
        message: "Placeholder instruction comment found",
      },
      {
        pattern: /\/\/\s*rest\s+of\s+(the\s+)?(code|implementation|logic)/i,
        message: 'Placeholder "rest of code" comment found',
      },
      {
        pattern: /\bpass\b\s*;?\s*$/,
        message: "Python-style `pass` placeholder detected",
      },
      {
        pattern: /throw\s+new\s+Error\s*\(\s*['"]not\s+implemented/i,
        message: '"Not implemented" error throw found',
      },
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { pattern, message } of placeholderPatterns) {
        if (pattern.test(line)) {
          issues.push({
            type: "placeholder-code",
            severity: "warning",
            message: `${message} at line ${i + 1}`,
            line: i + 1,
            fixed: false,
          });
          break;
        }
      }
    }

    return { code, issues };
  }

  private detectNullReturns(code: string): {
    code: string;
    issues: Issue[];
  } {
    const issues: Issue[] = [];

    const funcPattern =
      /(?:function\s+([A-Z]\w*)|const\s+([A-Z]\w*)\s*=\s*(?:\([^)]*\)|)\s*=>)\s*\{([\s\S]*?\n(?=\s*(?:function|const|class|export|$)))/g;

    let match: RegExpExecArray | null;
    while ((match = funcPattern.exec(code)) !== null) {
      const name = match[1] || match[2];
      const body = match[3] || "";

      const hasJsxReturn = /return\s*\(?\s*</.test(body);
      const hasNullReturn = /return\s+null\s*;/.test(body);
      const hasUndefinedReturn = /return\s+undefined\s*;/.test(body);
      const hasEmptyReturn = /return\s*;/.test(body);

      if (
        name &&
        !hasJsxReturn &&
        (hasNullReturn || hasUndefinedReturn || hasEmptyReturn)
      ) {
        const looksLikeComponent =
          /useState|useEffect|useRef|className|onClick/.test(body);
        if (looksLikeComponent) {
          issues.push({
            type: "null-return-component",
            severity: "warning",
            message: `Component '${name}' may return null/undefined instead of JSX`,
            fixed: false,
          });
        }
      }
    }

    return { code, issues };
  }

  private checkEventHandlersDefined(code: string): {
    code: string;
    issues: Issue[];
  } {
    const issues: Issue[] = [];

    const handlerUsagePattern =
      /(?:onClick|onChange|onSubmit|onKeyDown|onKeyUp|onFocus|onBlur|onMouseOver|onMouseOut|onInput)=\{(\w+)\}/g;

    let match: RegExpExecArray | null;
    while ((match = handlerUsagePattern.exec(code)) !== null) {
      const handlerName = match[1];

      if (
        handlerName === "undefined" ||
        handlerName === "null" ||
        handlerName === "true" ||
        handlerName === "false"
      ) {
        continue;
      }

      const definedPattern = new RegExp(
        `(?:function\\s+${this.escapeRegex(handlerName)}\\b|(?:const|let|var)\\s+${this.escapeRegex(handlerName)}\\s*=)`
      );

      if (!definedPattern.test(code)) {
        issues.push({
          type: "undefined-handler",
          severity: "error",
          message: `Event handler '${handlerName}' is used in JSX but not defined`,
          fixed: false,
        });
      }
    }

    return { code, issues };
  }

  private checkStateVariablesDeclared(code: string): {
    code: string;
    issues: Issue[];
  } {
    const issues: Issue[] = [];

    const statePattern = /\{(\w+)\}/g;
    const jsxRegions = this.extractJsxRegions(code);

    const declaredVars = new Set<string>();

    const varDeclarations =
      /(?:const|let|var)\s+(?:\[?\s*(\w+)(?:\s*,\s*(\w+))?\s*\]?)\s*=/g;
    let varMatch: RegExpExecArray | null;
    while ((varMatch = varDeclarations.exec(code)) !== null) {
      if (varMatch[1]) declaredVars.add(varMatch[1]);
      if (varMatch[2]) declaredVars.add(varMatch[2]);
    }

    const funcDecl = /function\s+(\w+)/g;
    while ((varMatch = funcDecl.exec(code)) !== null) {
      declaredVars.add(varMatch[1]);
    }

    const paramPattern =
      /(?:function\s+\w+|\w+\s*=\s*)\s*\(([^)]*)\)/g;
    while ((varMatch = paramPattern.exec(code)) !== null) {
      const params = varMatch[1].split(",").map((p) => p.trim().split(/[=:]/)[0].trim());
      params.forEach((p) => {
        if (p) declaredVars.add(p);
      });
    }

    const importNames = /import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from/g;
    while ((varMatch = importNames.exec(code)) !== null) {
      if (varMatch[1]) declaredVars.add(varMatch[1]);
      if (varMatch[2]) {
        varMatch[2].split(",").forEach((n) => {
          const parts = n.trim().split(/\s+as\s+/);
          const name = parts[parts.length - 1].trim();
          if (name) declaredVars.add(name);
        });
      }
    }

    const globals = new Set([
      "undefined", "null", "true", "false", "NaN", "Infinity",
      "console", "window", "document", "Math", "JSON", "Date",
      "Array", "Object", "String", "Number", "Boolean", "Map",
      "Set", "Promise", "Error", "RegExp", "parseInt", "parseFloat",
      "setTimeout", "setInterval", "clearTimeout", "clearInterval",
      "fetch", "alert", "confirm", "prompt", "event", "e",
      "props", "children", "key", "ref", "className", "style",
      "index", "item", "i", "j", "k",
    ]);

    for (const jsxRegion of jsxRegions) {
      let stateMatch: RegExpExecArray | null;
      const varUsage = /\{(\w+)(?:\.\w+|\[\w+\])?\}/g;
      while ((stateMatch = varUsage.exec(jsxRegion)) !== null) {
        const varName = stateMatch[1];
        if (
          !declaredVars.has(varName) &&
          !globals.has(varName) &&
          varName.length > 1
        ) {
          issues.push({
            type: "undeclared-state-variable",
            severity: "warning",
            message: `Variable '${varName}' used in JSX may not be declared`,
            fixed: false,
          });
        }
      }
    }

    return { code, issues };
  }

  private extractJsxRegions(code: string): string[] {
    const regions: string[] = [];
    const returnJsx = /return\s*\(\s*([\s\S]*?)\s*\)\s*;/g;

    let match: RegExpExecArray | null;
    while ((match = returnJsx.exec(code)) !== null) {
      regions.push(match[1]);
    }

    const arrowJsx = /=>\s*\(\s*([\s\S]*?)\s*\)\s*(?:;|$)/g;
    while ((match = arrowJsx.exec(code)) !== null) {
      regions.push(match[1]);
    }

    return regions;
  }

  private runCommonLLMMistakes(code: string): {
    code: string;
    issues: Issue[];
  } {
    const issues: Issue[] = [];
    let result = code;

    const markdownResult = this.removeMarkdownArtifacts(result);
    issues.push(...markdownResult.issues);
    result = markdownResult.code;

    const preambleResult = this.removeLLMPreamble(result);
    issues.push(...preambleResult.issues);
    result = preambleResult.code;

    const dupFuncResult = this.fixDuplicateFunctions(result);
    issues.push(...dupFuncResult.issues);
    result = dupFuncResult.code;

    const constRedeclResult = this.fixConstRedeclaration(result);
    issues.push(...constRedeclResult.issues);
    result = constRedeclResult.code;

    const ternaryResult = this.fixIncompleteTernary(result);
    issues.push(...ternaryResult.issues);
    result = ternaryResult.code;

    const orphanElseResult = this.removeOrphanedElse(result);
    issues.push(...orphanElseResult.issues);
    result = orphanElseResult.code;

    return { code: result, issues };
  }

  private removeMarkdownArtifacts(code: string): {
    code: string;
    issues: Issue[];
  } {
    const issues: Issue[] = [];
    let result = code;

    const codeBlockPattern = /^```(?:jsx?|tsx?|javascript|typescript|html|css|json)?\s*$/gm;
    const closingBlockPattern = /^```\s*$/gm;

    const openMatches = result.match(codeBlockPattern);
    const closeMatches = result.match(closingBlockPattern);
    const totalMatches = (openMatches?.length || 0) + (closeMatches?.length || 0);

    if (totalMatches > 0) {
      result = result.replace(
        /^```(?:jsx?|tsx?|javascript|typescript|html|css|json)?\s*$/gm,
        ""
      );
      result = result.replace(/^```\s*$/gm, "");
      result = result.replace(/\n{3,}/g, "\n\n");
      result = result.trim();

      issues.push({
        type: "markdown-artifacts",
        severity: "error",
        message: `Found ${totalMatches} markdown code block marker(s)`,
        fixed: true,
        fixDescription: "Removed markdown code block markers",
      });
    }

    return { code: result, issues };
  }

  private removeLLMPreamble(code: string): {
    code: string;
    issues: Issue[];
  } {
    const issues: Issue[] = [];
    let result = code;

    const preamblePatterns = [
      /^(?:Here(?:'s| is) (?:the|your|a|an) (?:updated |modified |complete |full )?(?:code|implementation|solution|component|file|example)[^:\n]*:?\s*\n)/im,
      /^(?:Sure[!,.]?\s*(?:Here(?:'s| is)[^:\n]*:?)?\s*\n)/im,
      /^(?:(?:Below|Following) is (?:the|your|a|an) [^:\n]*:?\s*\n)/im,
      /^(?:I've (?:created|written|implemented|updated|modified) [^:\n]*:?\s*\n)/im,
      /^(?:(?:The|This) (?:code|implementation|solution) [^:\n]*:?\s*\n)/im,
      /^(?:Let me (?:create|write|implement|show|provide) [^:\n]*:?\s*\n)/im,
      /^(?:Certainly[!,.]?\s*(?:Here[^:\n]*:?)?\s*\n)/im,
      /^(?:Of course[!,.]?\s*(?:Here[^:\n]*:?)?\s*\n)/im,
    ];

    for (const pattern of preamblePatterns) {
      if (pattern.test(result)) {
        result = result.replace(pattern, "").trimStart();
        issues.push({
          type: "llm-preamble",
          severity: "info",
          message: "LLM preamble text detected and removed",
          fixed: true,
          fixDescription: "Removed introductory text before code",
        });
        break;
      }
    }

    const suffixPatterns = [
      /\n(?:This (?:code|implementation|component) (?:will|should|does) [^.]+\.\s*)+$/i,
      /\n(?:(?:Let me|I can) (?:know|explain|help) [^.]+\.\s*)+$/i,
      /\n(?:Feel free to (?:modify|adjust|customize) [^.]+\.\s*)+$/i,
      /\n(?:You can (?:then|now|also) [^.]+\.\s*)+$/i,
      /\n(?:Note:?\s+[^.]+\.\s*)+$/i,
    ];

    for (const pattern of suffixPatterns) {
      if (pattern.test(result)) {
        result = result.replace(pattern, "").trimEnd();
        issues.push({
          type: "llm-suffix",
          severity: "info",
          message: "LLM explanatory suffix text detected and removed",
          fixed: true,
          fixDescription: "Removed trailing explanation text after code",
        });
        break;
      }
    }

    return { code: result, issues };
  }

  private fixDuplicateFunctions(code: string): {
    code: string;
    issues: Issue[];
  } {
    const issues: Issue[] = [];
    let result = code;

    const funcNames = new Map<string, number[]>();

    const funcDeclPattern =
      /^(\s*)(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/gm;
    let match: RegExpExecArray | null;

    while ((match = funcDeclPattern.exec(code)) !== null) {
      const name = match[2];
      if (!funcNames.has(name)) {
        funcNames.set(name, []);
      }
      funcNames.get(name)!.push(match.index);
    }

    const constFuncPattern =
      /^(\s*)(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(?[^)]*\)?\s*=>/gm;
    while ((match = constFuncPattern.exec(code)) !== null) {
      const name = match[2];
      if (!funcNames.has(name)) {
        funcNames.set(name, []);
      }
      funcNames.get(name)!.push(match.index);
    }

    for (const [name, positions] of Array.from(funcNames.entries())) {
      if (positions.length > 1) {
        issues.push({
          type: "duplicate-function",
          severity: "error",
          message: `Duplicate function declaration: '${name}' appears ${positions.length} times`,
          fixed: true,
          fixDescription: `Kept the last declaration of '${name}', removed earlier one(s)`,
        });

        for (let i = 0; i < positions.length - 1; i++) {
          const startPos = positions[i];
          const endPos =
            i + 1 < positions.length - 1
              ? positions[i + 1]
              : positions[positions.length - 1];

          const beforeDup = result.substring(0, startPos);
          const afterDup = result.substring(startPos);

          const funcBody = this.extractFunctionBody(afterDup);
          if (funcBody) {
            result =
              beforeDup +
              afterDup.substring(funcBody.length);
          }
        }
      }
    }

    return { code: result, issues };
  }

  private extractFunctionBody(code: string): string | null {
    let depth = 0;
    let started = false;
    let i = 0;

    for (; i < code.length; i++) {
      if (code[i] === "{") {
        depth++;
        started = true;
      } else if (code[i] === "}") {
        depth--;
        if (started && depth === 0) {
          return code.substring(0, i + 1);
        }
      }
    }

    if (started) {
      const lineEnd = code.indexOf("\n\n");
      if (lineEnd !== -1) return code.substring(0, lineEnd);
    }

    return null;
  }

  private fixConstRedeclaration(code: string): {
    code: string;
    issues: Issue[];
  } {
    const issues: Issue[] = [];
    let result = code;
    const lines = result.split("\n");

    const constDeclarations = new Map<string, number[]>();

    for (let i = 0; i < lines.length; i++) {
      const constMatch = lines[i].match(
        /^\s*const\s+(\w+)\s*=/
      );
      if (constMatch) {
        const name = constMatch[1];
        if (!constDeclarations.has(name)) {
          constDeclarations.set(name, []);
        }
        constDeclarations.get(name)!.push(i);
      }
    }

    const linesToModify = new Set<number>();
    for (const [name, lineNums] of Array.from(constDeclarations.entries())) {
      if (lineNums.length > 1) {
        for (let j = 0; j < lineNums.length - 1; j++) {
          linesToModify.add(lineNums[j]);
        }
        issues.push({
          type: "const-redeclaration",
          severity: "error",
          message: `Variable '${name}' declared with const ${lineNums.length} times`,
          line: lineNums[0] + 1,
          fixed: true,
          fixDescription: `Changed earlier const declarations to let for '${name}'`,
        });
      }
    }

    if (linesToModify.size > 0) {
      const fixedLines = lines.map((line, idx) => {
        if (linesToModify.has(idx)) {
          return line.replace(/^(\s*)const\s+/, "$1let ");
        }
        return line;
      });
      result = fixedLines.join("\n");
    }

    return { code: result, issues };
  }

  private fixIncompleteTernary(code: string): {
    code: string;
    issues: Issue[];
  } {
    const issues: Issue[] = [];
    let result = code;

    const ternaryPattern = /(\w+)\s*\?\s*([^:;\n]+)\s*(?=;|\n|$)/gm;
    let match: RegExpExecArray | null;

    const lines = result.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith("//") || trimmed.startsWith("/*")) continue;
      if (trimmed.startsWith("?.")) continue;

      const ternaryCheck = trimmed.match(/\w+\s*\?\s*[^:?]+$/);
      if (ternaryCheck && !trimmed.includes(":") && !trimmed.includes("?.")) {
        const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : "";
        if (!nextLine.startsWith(":")) {
          issues.push({
            type: "incomplete-ternary",
            severity: "warning",
            message: `Possible incomplete ternary expression at line ${i + 1}`,
            line: i + 1,
            fixed: false,
            fixDescription:
              "Ternary expression may be missing the : (else) branch",
          });
        }
      }
    }

    return { code: result, issues };
  }

  private removeOrphanedElse(code: string): {
    code: string;
    issues: Issue[];
  } {
    const issues: Issue[] = [];
    let result = code;
    const lines = result.split("\n");
    const fixedLines: string[] = [];
    let prevNonEmptyTrimmed = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed === "else {" || trimmed === "} else {" || trimmed.startsWith("else if")) {
        const hasPreceedingIf = this.hasMatchingIf(lines, i);
        if (!hasPreceedingIf) {
          issues.push({
            type: "orphaned-else",
            severity: "error",
            message: `Orphaned else block at line ${i + 1} without matching if`,
            line: i + 1,
            fixed: true,
            fixDescription: "Removed orphaned else block",
          });

          if (trimmed.includes("{")) {
            let depth = 1;
            let j = i + 1;
            while (j < lines.length && depth > 0) {
              for (const ch of lines[j]) {
                if (ch === "{") depth++;
                if (ch === "}") depth--;
              }
              j++;
            }
            i = j - 1;
          }
          continue;
        }
      }

      fixedLines.push(line);
      if (trimmed.length > 0) {
        prevNonEmptyTrimmed = trimmed;
      }
    }

    result = fixedLines.join("\n");
    return { code: result, issues };
  }

  private hasMatchingIf(lines: string[], elseLineIdx: number): boolean {
    for (let i = elseLineIdx - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (trimmed.length === 0) continue;
      if (trimmed === "}" || trimmed.endsWith("}")) {
        return true;
      }
      if (/\bif\s*\(/.test(trimmed)) {
        return true;
      }
      break;
    }
    return false;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}

export const codeQualityPipelineService =
  CodeQualityPipelineService.getInstance();
