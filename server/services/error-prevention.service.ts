import { logger } from "../lib/logger";

interface ErrorPattern {
  id: string;
  pattern: RegExp;
  category: ErrorCategory;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  suggestion: string;
  occurrences: number;
}

type ErrorCategory = 
  | "type-error"
  | "null-reference"
  | "async-issue"
  | "state-mutation"
  | "memory-leak"
  | "race-condition"
  | "security"
  | "performance";

interface PotentialError {
  pattern: ErrorPattern;
  location: { line: number; column: number };
  codeSnippet: string;
  filePath: string;
  confidence: number;
}

interface PreventionResult {
  potentialErrors: PotentialError[];
  riskScore: number;
  recommendations: string[];
  safePatterns: string[];
}

interface HistoricalError {
  error: string;
  filePath: string;
  timestamp: number;
  wasFixed: boolean;
  fixPattern?: string;
}

class ErrorPreventionService {
  private static instance: ErrorPreventionService;
  private patterns: ErrorPattern[] = [];
  private history: Map<string, HistoricalError[]> = new Map();
  private learnedPatterns: Map<string, number> = new Map();
  private readonly maxHistoryPerProject = 200;
  private readonly maxProjects = 100;

  private constructor() {
    this.initializePatterns();
  }

  static getInstance(): ErrorPreventionService {
    if (!ErrorPreventionService.instance) {
      ErrorPreventionService.instance = new ErrorPreventionService();
    }
    return ErrorPreventionService.instance;
  }

  private initializePatterns(): void {
    this.patterns = [
      {
        id: "null-access",
        pattern: /(\w+)\.(\w+)\s*(?!\?\.)(?=\s*[;,)\]}])/g,
        category: "null-reference",
        severity: "high",
        message: "Potential null/undefined access without optional chaining",
        suggestion: "Use optional chaining (?.) or add null check",
        occurrences: 0
      },
      {
        id: "missing-await",
        pattern: /(?<!await\s)(?:fetch|axios\.\w+|Promise\.\w+)\s*\(/g,
        category: "async-issue",
        severity: "high",
        message: "Async operation may be missing await",
        suggestion: "Add 'await' before async operations or handle the Promise",
        occurrences: 0
      },
      {
        id: "state-mutation",
        pattern: /(\w+State|\w+)\.push\(|(\w+State|\w+)\[\w+\]\s*=/g,
        category: "state-mutation",
        severity: "medium",
        message: "Potential direct state mutation",
        suggestion: "Use immutable update patterns: [...array] or {...object}",
        occurrences: 0
      },
      {
        id: "missing-cleanup",
        pattern: /useEffect\s*\(\s*\(\)\s*=>\s*\{[^}]*(?:setInterval|setTimeout|addEventListener)[^}]*\}\s*,/g,
        category: "memory-leak",
        severity: "high",
        message: "useEffect with timer/listener may be missing cleanup",
        suggestion: "Return a cleanup function to clear intervals/remove listeners",
        occurrences: 0
      },
      {
        id: "missing-deps",
        pattern: /useEffect\s*\(\s*\(\)\s*=>\s*\{[^}]*(\w+)[^}]*\}\s*,\s*\[\s*\]\s*\)/g,
        category: "state-mutation",
        severity: "medium",
        message: "useEffect with empty deps may be missing dependencies",
        suggestion: "Add used variables to dependency array or use useCallback",
        occurrences: 0
      },
      {
        id: "unhandled-promise",
        pattern: /\.then\s*\([^)]+\)(?!\s*\.catch)/g,
        category: "async-issue",
        severity: "medium",
        message: "Promise chain without error handling",
        suggestion: "Add .catch() handler or use try/catch with async/await",
        occurrences: 0
      },
      {
        id: "unsafe-any",
        pattern: /:\s*any(?:\s*[;,\)])/g,
        category: "type-error",
        severity: "low",
        message: "Use of 'any' type reduces type safety",
        suggestion: "Replace 'any' with a specific type or 'unknown'",
        occurrences: 0
      },
      {
        id: "race-condition",
        pattern: /let\s+(\w+)\s*=.*\n.*await.*\n.*\1\s*=/g,
        category: "race-condition",
        severity: "high",
        message: "Potential race condition with shared mutable variable",
        suggestion: "Use local variables or implement proper synchronization",
        occurrences: 0
      },
      {
        id: "dangerous-html",
        pattern: /dangerouslySetInnerHTML|innerHTML\s*=/g,
        category: "security",
        severity: "high",
        message: "Direct HTML injection can lead to XSS vulnerabilities",
        suggestion: "Sanitize content or use React's built-in escaping",
        occurrences: 0
      },
      {
        id: "n-plus-one",
        pattern: /(?:for|forEach|map)\s*\([^)]*\)\s*(?:=>)?\s*\{[^}]*(?:await|fetch|query)[^}]*\}/g,
        category: "performance",
        severity: "medium",
        message: "Potential N+1 query pattern detected",
        suggestion: "Batch requests or use proper data loading strategies",
        occurrences: 0
      },
      {
        id: "infinite-loop",
        pattern: /useEffect\s*\([^)]*setState[^)]*\]\s*\)/g,
        category: "performance",
        severity: "critical",
        message: "setState in useEffect with state dependency may cause infinite loop",
        suggestion: "Remove state from deps or add condition to prevent loop",
        occurrences: 0
      },
      {
        id: "missing-key",
        pattern: /\.map\s*\([^)]*\)\s*(?:=>)?\s*(?:\{[^}]*)?<\w+(?!\s+key=)/g,
        category: "performance",
        severity: "medium",
        message: "List rendering without key prop",
        suggestion: "Add unique key prop to list items",
        occurrences: 0
      }
    ];
  }

  analyzeCode(
    projectId: string,
    files: Array<{ path: string; content: string }>
  ): PreventionResult {
    logger.info("Analyzing code for potential errors", { projectId, fileCount: files.length });

    const potentialErrors: PotentialError[] = [];
    
    for (const file of files) {
      const lines = file.content.split("\n");
      
      for (const pattern of this.patterns) {
        const matches = Array.from(file.content.matchAll(pattern.pattern));
        
        for (const match of matches) {
          const index = match.index || 0;
          const beforeMatch = file.content.substring(0, index);
          const line = beforeMatch.split("\n").length;
          const lastNewline = beforeMatch.lastIndexOf("\n");
          const column = index - lastNewline;

          const lineContent = lines[line - 1] || "";
          
          if (this.isInComment(file.content, index)) continue;
          if (this.isFalsePositive(pattern.id, lineContent, file.content)) continue;

          const confidence = this.calculateConfidence(pattern, file.content, index);

          potentialErrors.push({
            pattern,
            location: { line, column },
            codeSnippet: lineContent.trim(),
            filePath: file.path,
            confidence
          });

          pattern.occurrences++;
        }
      }
    }

    const riskScore = this.calculateRiskScore(potentialErrors);
    const recommendations = this.generateRecommendations(potentialErrors);
    const safePatterns = this.identifySafePatterns(files);

    logger.info("Error prevention analysis complete", {
      projectId,
      potentialErrors: potentialErrors.length,
      riskScore
    });

    return {
      potentialErrors: potentialErrors.sort((a, b) => {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return severityOrder[a.pattern.severity] - severityOrder[b.pattern.severity];
      }),
      riskScore,
      recommendations,
      safePatterns
    };
  }

  private isInComment(content: string, index: number): boolean {
    const before = content.substring(Math.max(0, index - 500), index);
    
    const lineStart = before.lastIndexOf("\n") + 1;
    const line = before.substring(lineStart);
    if (line.trim().startsWith("//")) return true;

    const lastBlockStart = before.lastIndexOf("/*");
    const lastBlockEnd = before.lastIndexOf("*/");
    if (lastBlockStart > lastBlockEnd) return true;

    return false;
  }

  private isFalsePositive(patternId: string, line: string, content: string): boolean {
    if (patternId === "null-access") {
      if (line.includes("?.") || line.includes("!.")) return true;
      if (line.match(/if\s*\(\s*\w+\s*[!=]=/) ) return true;
    }

    if (patternId === "missing-await") {
      if (line.includes("return ") || line.includes(".then(")) return true;
    }

    if (patternId === "unsafe-any") {
      if (line.includes("// eslint-disable") || line.includes("@ts-ignore")) return true;
    }

    return false;
  }

  private calculateConfidence(pattern: ErrorPattern, content: string, index: number): number {
    let confidence = 0.7;

    const learnedWeight = this.learnedPatterns.get(pattern.id) || 0;
    confidence += learnedWeight * 0.1;

    if (pattern.severity === "critical") confidence += 0.1;
    if (pattern.severity === "high") confidence += 0.05;

    const context = content.substring(Math.max(0, index - 100), Math.min(content.length, index + 100));
    if (context.includes("TODO") || context.includes("FIXME")) confidence += 0.1;

    return Math.min(1, Math.max(0, confidence));
  }

  private calculateRiskScore(errors: PotentialError[]): number {
    const weights = { critical: 10, high: 5, medium: 2, low: 1 };
    
    let score = 0;
    for (const error of errors) {
      score += weights[error.pattern.severity] * error.confidence;
    }

    return Math.min(100, Math.round(score));
  }

  private generateRecommendations(errors: PotentialError[]): string[] {
    const recommendations: string[] = [];
    const categoryCount = new Map<string, number>();

    for (const error of errors) {
      categoryCount.set(
        error.pattern.category,
        (categoryCount.get(error.pattern.category) || 0) + 1
      );
    }

    const sorted = Array.from(categoryCount.entries()).sort((a, b) => b[1] - a[1]);

    for (const [category, count] of sorted.slice(0, 3)) {
      switch (category) {
        case "null-reference":
          recommendations.push(`Found ${count} potential null reference issues. Enable strict null checks in TypeScript.`);
          break;
        case "async-issue":
          recommendations.push(`Found ${count} async/await issues. Consider using eslint-plugin-promise for async best practices.`);
          break;
        case "memory-leak":
          recommendations.push(`Found ${count} potential memory leaks. Always cleanup subscriptions and listeners in useEffect.`);
          break;
        case "type-error":
          recommendations.push(`Found ${count} type safety issues. Consider stricter TypeScript configuration.`);
          break;
        case "performance":
          recommendations.push(`Found ${count} performance concerns. Review rendering and data fetching patterns.`);
          break;
        case "security":
          recommendations.push(`Found ${count} security issues. Prioritize fixing these immediately.`);
          break;
      }
    }

    return recommendations;
  }

  private identifySafePatterns(files: Array<{ path: string; content: string }>): string[] {
    const safePatterns: string[] = [];
    const allContent = files.map(f => f.content).join("\n");

    if (allContent.includes("?.")) safePatterns.push("Using optional chaining");
    if (allContent.includes("??")) safePatterns.push("Using nullish coalescing");
    if (allContent.includes("try {") && allContent.includes("catch")) safePatterns.push("Using try/catch error handling");
    if (allContent.match(/useCallback|useMemo/)) safePatterns.push("Using memoization hooks");
    if (allContent.includes("return () =>") && allContent.includes("useEffect")) safePatterns.push("Using useEffect cleanup");
    if (allContent.includes("zod") || allContent.includes("z.")) safePatterns.push("Using schema validation");

    return safePatterns;
  }

  recordError(projectId: string, error: string, filePath: string): void {
    if (this.history.size >= this.maxProjects && !this.history.has(projectId)) {
      const oldest = Array.from(this.history.keys())[0];
      if (oldest) this.history.delete(oldest);
    }

    const history = this.history.get(projectId) || [];
    history.push({
      error,
      filePath,
      timestamp: Date.now(),
      wasFixed: false
    });

    if (history.length > this.maxHistoryPerProject) {
      history.splice(0, history.length - this.maxHistoryPerProject);
    }
    this.history.set(projectId, history);

    for (const pattern of this.patterns) {
      if (error.toLowerCase().includes(pattern.category.replace("-", " "))) {
        const current = this.learnedPatterns.get(pattern.id) || 0;
        this.learnedPatterns.set(pattern.id, current + 0.1);
      }
    }
  }

  markErrorFixed(projectId: string, error: string, fixPattern?: string): void {
    const history = this.history.get(projectId);
    if (!history) return;

    const entry = history.find(h => h.error === error && !h.wasFixed);
    if (entry) {
      entry.wasFixed = true;
      entry.fixPattern = fixPattern;
    }
  }

  getPatternStats(): Array<{ id: string; category: string; occurrences: number }> {
    return this.patterns.map(p => ({
      id: p.id,
      category: p.category,
      occurrences: p.occurrences
    }));
  }
}

export const errorPreventionService = ErrorPreventionService.getInstance();
