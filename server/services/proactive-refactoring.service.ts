import { logger } from "../lib/logger";

interface ComplexityMetrics {
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  linesOfCode: number;
  nestingDepth: number;
  parameterCount: number;
  returnPoints: number;
}

interface RefactoringOpportunity {
  type: RefactoringType;
  severity: "low" | "medium" | "high";
  filePath: string;
  location: { startLine: number; endLine: number };
  description: string;
  suggestion: string;
  estimatedImpact: string;
  codeSnippet?: string;
}

type RefactoringType = 
  | "extract-function"
  | "extract-component"
  | "extract-hook"
  | "simplify-conditional"
  | "reduce-nesting"
  | "split-file"
  | "remove-duplication"
  | "improve-naming"
  | "add-abstraction";

interface AnalysisResult {
  opportunities: RefactoringOpportunity[];
  fileMetrics: Map<string, ComplexityMetrics>;
  overallHealth: number;
  prioritizedActions: string[];
}

interface ThresholdConfig {
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  functionLength: number;
  fileLength: number;
  nestingDepth: number;
  parameterCount: number;
}

class ProactiveRefactoringService {
  private static instance: ProactiveRefactoringService;
  private thresholds: ThresholdConfig = {
    cyclomaticComplexity: 10,
    cognitiveComplexity: 15,
    functionLength: 50,
    fileLength: 300,
    nestingDepth: 4,
    parameterCount: 4
  };

  private constructor() {}

  static getInstance(): ProactiveRefactoringService {
    if (!ProactiveRefactoringService.instance) {
      ProactiveRefactoringService.instance = new ProactiveRefactoringService();
    }
    return ProactiveRefactoringService.instance;
  }

  analyzeForRefactoring(
    files: Array<{ path: string; content: string }>
  ): AnalysisResult {
    logger.info("Analyzing code for refactoring opportunities", { fileCount: files.length });

    const opportunities: RefactoringOpportunity[] = [];
    const fileMetrics = new Map<string, ComplexityMetrics>();

    for (const file of files) {
      if (!this.isCodeFile(file.path)) continue;

      const metrics = this.calculateMetrics(file.content);
      fileMetrics.set(file.path, metrics);

      opportunities.push(...this.findOpportunities(file.path, file.content, metrics));
    }

    const overallHealth = this.calculateOverallHealth(fileMetrics, opportunities);
    const prioritizedActions = this.prioritizeActions(opportunities);

    logger.info("Refactoring analysis complete", {
      opportunityCount: opportunities.length,
      overallHealth
    });

    return {
      opportunities: opportunities.sort((a, b) => {
        const severityOrder = { high: 0, medium: 1, low: 2 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      }),
      fileMetrics,
      overallHealth,
      prioritizedActions
    };
  }

  private isCodeFile(path: string): boolean {
    return /\.(ts|tsx|js|jsx)$/.test(path);
  }

  private calculateMetrics(content: string): ComplexityMetrics {
    const lines = content.split("\n");
    
    let cyclomaticComplexity = 1;
    const ccPatterns = [/if\s*\(/, /else\s+if/, /\?\s*[^:]+\s*:/, /&&/, /\|\|/, /case\s+/, /catch\s*\(/, /while\s*\(/, /for\s*\(/];
    for (const pattern of ccPatterns) {
      const matches = content.match(new RegExp(pattern, "g"));
      if (matches) cyclomaticComplexity += matches.length;
    }

    let cognitiveComplexity = 0;
    let currentNesting = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.match(/^(if|for|while|switch)\s*\(/)) {
        cognitiveComplexity += 1 + currentNesting;
        currentNesting++;
      }
      if (trimmed.match(/^(else\s+if|else)\s*[{(]?/)) {
        cognitiveComplexity += 1;
      }
      if (trimmed === "}" || trimmed.endsWith("}")) {
        currentNesting = Math.max(0, currentNesting - 1);
      }
    }

    let maxNesting = 0;
    let currentDepth = 0;
    for (const char of content) {
      if (char === "{" || char === "(") {
        currentDepth++;
        maxNesting = Math.max(maxNesting, currentDepth);
      } else if (char === "}" || char === ")") {
        currentDepth--;
      }
    }

    const functionMatch = content.match(/function\s+\w+\s*\(([^)]*)\)/);
    const arrowMatch = content.match(/(?:const|let)\s+\w+\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/);
    const params = (functionMatch?.[1] || arrowMatch?.[1] || "").split(",").filter(p => p.trim());

    const returnPoints = (content.match(/\breturn\b/g) || []).length;

    return {
      cyclomaticComplexity,
      cognitiveComplexity,
      linesOfCode: lines.filter(l => l.trim() && !l.trim().startsWith("//")).length,
      nestingDepth: maxNesting,
      parameterCount: params.length,
      returnPoints
    };
  }

  private findOpportunities(
    filePath: string,
    content: string,
    metrics: ComplexityMetrics
  ): RefactoringOpportunity[] {
    const opportunities: RefactoringOpportunity[] = [];
    const lines = content.split("\n");

    if (metrics.linesOfCode > this.thresholds.fileLength) {
      opportunities.push({
        type: "split-file",
        severity: "high",
        filePath,
        location: { startLine: 1, endLine: lines.length },
        description: `File has ${metrics.linesOfCode} lines of code`,
        suggestion: "Split into smaller, focused modules",
        estimatedImpact: "Improved maintainability and code navigation"
      });
    }

    if (metrics.cyclomaticComplexity > this.thresholds.cyclomaticComplexity) {
      opportunities.push({
        type: "extract-function",
        severity: metrics.cyclomaticComplexity > 20 ? "high" : "medium",
        filePath,
        location: { startLine: 1, endLine: lines.length },
        description: `High cyclomatic complexity: ${metrics.cyclomaticComplexity}`,
        suggestion: "Extract complex logic into smaller functions",
        estimatedImpact: "Reduced complexity and improved testability"
      });
    }

    if (metrics.nestingDepth > this.thresholds.nestingDepth) {
      opportunities.push({
        type: "reduce-nesting",
        severity: "medium",
        filePath,
        location: { startLine: 1, endLine: lines.length },
        description: `Deep nesting detected: ${metrics.nestingDepth} levels`,
        suggestion: "Use early returns, guard clauses, or extract functions",
        estimatedImpact: "Improved readability and reduced cognitive load"
      });
    }

    this.findLongFunctions(filePath, content, opportunities);
    this.findComplexConditionals(filePath, content, opportunities);
    this.findReusableLogic(filePath, content, opportunities);
    this.findNamingIssues(filePath, content, opportunities);

    return opportunities;
  }

  private findLongFunctions(
    filePath: string,
    content: string,
    opportunities: RefactoringOpportunity[]
  ): void {
    const functionPattern = /(?:function\s+(\w+)|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)\s*\{/g;
    let match;

    while ((match = functionPattern.exec(content)) !== null) {
      const name = match[1] || match[2];
      const startIndex = match.index;
      const startLine = content.substring(0, startIndex).split("\n").length;

      let braceCount = 0;
      let endIndex = startIndex;
      let started = false;

      for (let i = startIndex; i < content.length; i++) {
        if (content[i] === "{") {
          braceCount++;
          started = true;
        } else if (content[i] === "}") {
          braceCount--;
        }
        if (started && braceCount === 0) {
          endIndex = i;
          break;
        }
      }

      const functionContent = content.substring(startIndex, endIndex);
      const lineCount = functionContent.split("\n").length;

      if (lineCount > this.thresholds.functionLength) {
        opportunities.push({
          type: "extract-function",
          severity: lineCount > 100 ? "high" : "medium",
          filePath,
          location: { startLine, endLine: startLine + lineCount },
          description: `Function '${name}' has ${lineCount} lines`,
          suggestion: "Extract logical sections into smaller functions",
          estimatedImpact: "Better readability and reusability",
          codeSnippet: `${name}(...)`
        });
      }
    }
  }

  private findComplexConditionals(
    filePath: string,
    content: string,
    opportunities: RefactoringOpportunity[]
  ): void {
    const lines = content.split("\n");
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      const andOrCount = (line.match(/&&|\|\|/g) || []).length;
      if (andOrCount >= 3) {
        opportunities.push({
          type: "simplify-conditional",
          severity: "medium",
          filePath,
          location: { startLine: i + 1, endLine: i + 1 },
          description: "Complex conditional expression",
          suggestion: "Extract condition into a named boolean variable or function",
          estimatedImpact: "Improved readability",
          codeSnippet: line.trim().substring(0, 60) + "..."
        });
      }

      if (line.match(/\?.*\?.*:/)) {
        opportunities.push({
          type: "simplify-conditional",
          severity: "low",
          filePath,
          location: { startLine: i + 1, endLine: i + 1 },
          description: "Nested ternary expression",
          suggestion: "Replace with if/else or extract into function",
          estimatedImpact: "Improved readability",
          codeSnippet: line.trim().substring(0, 60)
        });
      }
    }
  }

  private findReusableLogic(
    filePath: string,
    content: string,
    opportunities: RefactoringOpportunity[]
  ): void {
    const hookPatterns = [
      /useState\s*<[^>]+>\s*\([^)]+\)[\s\S]*?useEffect/g,
      /const\s+\[\w+,\s*set\w+\]\s*=\s*useState[\s\S]*?fetch\(/g
    ];

    for (const pattern of hookPatterns) {
      const matches = content.match(pattern);
      if (matches && matches.length > 1) {
        opportunities.push({
          type: "extract-hook",
          severity: "medium",
          filePath,
          location: { startLine: 1, endLine: 1 },
          description: "Repeated stateful logic pattern detected",
          suggestion: "Extract into a custom hook for reuse",
          estimatedImpact: "Reduced duplication and improved reusability"
        });
        break;
      }
    }

    if (filePath.includes("component") || filePath.endsWith(".tsx")) {
      const jsxBlocks = content.match(/<\w+[^>]*>[\s\S]*?<\/\w+>/g) || [];
      const blockCounts = new Map<string, number>();
      
      for (const block of jsxBlocks) {
        const normalized = block.replace(/\s+/g, " ").trim();
        if (normalized.length > 50) {
          blockCounts.set(normalized, (blockCounts.get(normalized) || 0) + 1);
        }
      }

      for (const [_, count] of Array.from(blockCounts.entries())) {
        if (count >= 2) {
          opportunities.push({
            type: "extract-component",
            severity: "low",
            filePath,
            location: { startLine: 1, endLine: 1 },
            description: "Repeated JSX structure detected",
            suggestion: "Extract into a reusable component",
            estimatedImpact: "Reduced duplication and consistent UI"
          });
          break;
        }
      }
    }
  }

  private findNamingIssues(
    filePath: string,
    content: string,
    opportunities: RefactoringOpportunity[]
  ): void {
    const singleLetterVars = content.match(/(?:const|let|var)\s+([a-z])\s*=/g);
    if (singleLetterVars && singleLetterVars.length > 3) {
      opportunities.push({
        type: "improve-naming",
        severity: "low",
        filePath,
        location: { startLine: 1, endLine: 1 },
        description: `${singleLetterVars.length} single-letter variable names found`,
        suggestion: "Use descriptive variable names",
        estimatedImpact: "Improved code clarity"
      });
    }

    const genericNames = content.match(/(?:const|let|var)\s+(data|temp|value|item|obj)\s*=/g);
    if (genericNames && genericNames.length > 2) {
      opportunities.push({
        type: "improve-naming",
        severity: "low",
        filePath,
        location: { startLine: 1, endLine: 1 },
        description: "Generic variable names detected",
        suggestion: "Use domain-specific naming",
        estimatedImpact: "Better code understanding"
      });
    }
  }

  private calculateOverallHealth(
    metrics: Map<string, ComplexityMetrics>,
    opportunities: RefactoringOpportunity[]
  ): number {
    let health = 100;

    const severityPenalty = { high: 10, medium: 5, low: 2 };
    for (const opp of opportunities) {
      health -= severityPenalty[opp.severity];
    }

    for (const [_, m] of Array.from(metrics.entries())) {
      if (m.cyclomaticComplexity > this.thresholds.cyclomaticComplexity * 2) health -= 5;
      if (m.linesOfCode > this.thresholds.fileLength * 2) health -= 5;
    }

    return Math.max(0, Math.min(100, health));
  }

  private prioritizeActions(opportunities: RefactoringOpportunity[]): string[] {
    const actions: string[] = [];
    
    const highPriority = opportunities.filter(o => o.severity === "high");
    const byType = new Map<string, number>();
    
    for (const opp of highPriority) {
      byType.set(opp.type, (byType.get(opp.type) || 0) + 1);
    }

    const sorted = Array.from(byType.entries()).sort((a, b) => b[1] - a[1]);
    
    for (const [type, count] of sorted.slice(0, 3)) {
      switch (type) {
        case "split-file":
          actions.push(`Split ${count} large file(s) into smaller modules`);
          break;
        case "extract-function":
          actions.push(`Extract complex logic in ${count} location(s)`);
          break;
        case "reduce-nesting":
          actions.push(`Reduce nesting depth in ${count} file(s)`);
          break;
        default:
          actions.push(`Address ${count} ${type} opportunity(ies)`);
      }
    }

    return actions;
  }

  setThresholds(config: Partial<ThresholdConfig>): void {
    this.thresholds = { ...this.thresholds, ...config };
    logger.info("Refactoring thresholds updated", { thresholds: this.thresholds });
  }

  getThresholds(): ThresholdConfig {
    return { ...this.thresholds };
  }
}

export const proactiveRefactoringService = ProactiveRefactoringService.getInstance();
