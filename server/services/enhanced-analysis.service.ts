import logger from "../lib/logger";

export interface AnalysisResult {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  issues: AnalysisIssue[];
  metrics: CodeMetrics;
  suggestions: string[];
  securityFindings: SecurityFinding[];
  bestPracticeViolations: BestPracticeViolation[];
}

export interface AnalysisIssue {
  id: string;
  type: "logic" | "complexity" | "duplication" | "naming" | "structure" | "error_handling";
  severity: "critical" | "high" | "medium" | "low" | "info";
  message: string;
  line?: number;
  suggestion?: string;
  autoFixable: boolean;
}

export interface CodeMetrics {
  linesOfCode: number;
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  maintainabilityIndex: number;
  duplicatePercentage: number;
  testCoverage?: number;
}

export interface SecurityFinding {
  type: "xss" | "injection" | "exposure" | "auth" | "crypto" | "other";
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  location?: string;
  remediation: string;
}

export interface BestPracticeViolation {
  rule: string;
  category: "solid" | "dry" | "kiss" | "yagni" | "separation" | "react" | "typescript";
  description: string;
  severity: "high" | "medium" | "low";
  recommendation: string;
}

class EnhancedAnalysisService {
  private static instance: EnhancedAnalysisService;

  private constructor() {
    logger.info("EnhancedAnalysisService initialized");
  }

  static getInstance(): EnhancedAnalysisService {
    if (!EnhancedAnalysisService.instance) {
      EnhancedAnalysisService.instance = new EnhancedAnalysisService();
    }
    return EnhancedAnalysisService.instance;
  }

  analyzeCode(code: string, filePath: string): AnalysisResult {
    const issues: AnalysisIssue[] = [];
    const securityFindings: SecurityFinding[] = [];
    const bestPracticeViolations: BestPracticeViolation[] = [];

    issues.push(...this.detectLogicIssues(code));
    issues.push(...this.detectComplexity(code));
    issues.push(...this.detectNamingIssues(code));
    issues.push(...this.detectStructureIssues(code, filePath));
    issues.push(...this.detectErrorHandling(code));

    securityFindings.push(...this.detectSecurityIssues(code));

    bestPracticeViolations.push(...this.detectBestPracticeViolations(code, filePath));

    const metrics = this.calculateMetrics(code);

    const score = this.calculateScore(issues, securityFindings, bestPracticeViolations, metrics);

    const grade = this.scoreToGrade(score);

    const suggestions = this.generateSuggestions(issues, bestPracticeViolations, metrics);

    logger.info("Code analysis complete", {
      filePath,
      score,
      grade,
      issueCount: issues.length,
      securityCount: securityFindings.length
    });

    return {
      score,
      grade,
      issues,
      metrics,
      suggestions,
      securityFindings,
      bestPracticeViolations
    };
  }

  private detectLogicIssues(code: string): AnalysisIssue[] {
    const issues: AnalysisIssue[] = [];

    const infiniteLoopPatterns = [
      /while\s*\(\s*true\s*\)\s*\{(?![^}]*break)/,
      /for\s*\(\s*;\s*;\s*\)\s*\{(?![^}]*break)/
    ];

    for (const pattern of infiniteLoopPatterns) {
      if (pattern.test(code)) {
        issues.push({
          id: "logic-infinite-loop",
          type: "logic",
          severity: "high",
          message: "Potential infinite loop detected without break condition",
          autoFixable: false,
          suggestion: "Add a break condition or termination criteria"
        });
      }
    }

    const nullCheckPatterns = [
      { pattern: /(\w+)\.(\w+)\s*&&\s*\1/, msg: "Redundant null check after property access" },
      { pattern: /typeof\s+(\w+)\s*===?\s*['"]undefined['"].*\1\./, msg: "Accessing property after undefined check without guard" }
    ];

    for (const { pattern, msg } of nullCheckPatterns) {
      if (pattern.test(code)) {
        issues.push({
          id: "logic-null-check",
          type: "logic",
          severity: "medium",
          message: msg,
          autoFixable: false
        });
      }
    }

    const unreachablePatterns = [
      /return\s+[^;]+;\s*(?![\s\}])[^}]+/,
      /throw\s+[^;]+;\s*(?![\s\}])[^}]+/
    ];

    for (const pattern of unreachablePatterns) {
      if (pattern.test(code)) {
        issues.push({
          id: "logic-unreachable",
          type: "logic",
          severity: "medium",
          message: "Possible unreachable code after return/throw",
          autoFixable: false
        });
      }
    }

    const comparisonPatterns = [
      { pattern: /[^!=<>]=[^=]/, context: /if\s*\([^)]*[^!=<>]=[^=][^)]*\)/, msg: "Assignment in conditional (did you mean ==?)" },
      { pattern: /===?\s*NaN/, msg: "Direct comparison with NaN (use Number.isNaN instead)" }
    ];

    for (const { pattern, msg, context } of comparisonPatterns) {
      const checkPattern = context || pattern;
      if (checkPattern.test(code)) {
        issues.push({
          id: "logic-comparison",
          type: "logic",
          severity: "high",
          message: msg,
          autoFixable: false
        });
      }
    }

    return issues;
  }

  private detectComplexity(code: string): AnalysisIssue[] {
    const issues: AnalysisIssue[] = [];

    const functions = code.match(/(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)\s*\{[^}]*\}/g) || [];
    
    for (const func of functions) {
      const branchingKeywords = (func.match(/\b(if|else|for|while|switch|case|catch|\?|&&|\|\|)\b/g) || []).length;
      
      if (branchingKeywords > 15) {
        issues.push({
          id: "complexity-high",
          type: "complexity",
          severity: "high",
          message: `Function has very high cyclomatic complexity (${branchingKeywords} branches)`,
          autoFixable: false,
          suggestion: "Consider breaking this function into smaller, focused functions"
        });
      } else if (branchingKeywords > 10) {
        issues.push({
          id: "complexity-medium",
          type: "complexity",
          severity: "medium",
          message: `Function has high complexity (${branchingKeywords} branches)`,
          autoFixable: false
        });
      }
    }

    const nestedDepth = this.calculateNestingDepth(code);
    if (nestedDepth > 4) {
      issues.push({
        id: "complexity-nesting",
        type: "complexity",
        severity: "high",
        message: `Deep nesting detected (${nestedDepth} levels)`,
        autoFixable: false,
        suggestion: "Use early returns, extract methods, or flatten the structure"
      });
    }

    const longLines = code.split('\n').filter(line => line.length > 120);
    if (longLines.length > 5) {
      issues.push({
        id: "complexity-line-length",
        type: "complexity",
        severity: "low",
        message: `${longLines.length} lines exceed 120 characters`,
        autoFixable: true
      });
    }

    return issues;
  }

  private calculateNestingDepth(code: string): number {
    let maxDepth = 0;
    let currentDepth = 0;

    for (const char of code) {
      if (char === '{') {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      } else if (char === '}') {
        currentDepth = Math.max(0, currentDepth - 1);
      }
    }

    return maxDepth;
  }

  private detectNamingIssues(code: string): AnalysisIssue[] {
    const issues: AnalysisIssue[] = [];

    const singleLetterVars = code.match(/(?:const|let|var)\s+([a-z])\s*=/g) || [];
    const allowedSingle = ['i', 'j', 'k', 'x', 'y', 'z', 'e', '_'];
    
    for (const match of singleLetterVars) {
      const varName = match.match(/\s([a-z])\s*=/)?.[1];
      if (varName && !allowedSingle.includes(varName)) {
        issues.push({
          id: "naming-single-letter",
          type: "naming",
          severity: "low",
          message: `Single-letter variable '${varName}' lacks descriptive meaning`,
          autoFixable: false,
          suggestion: "Use a descriptive name that reveals intent"
        });
      }
    }

    const booleanVars = code.match(/(?:const|let|var)\s+(\w+)\s*:\s*boolean/g) || [];
    for (const match of booleanVars) {
      const varName = match.match(/\s(\w+)\s*:/)?.[1];
      if (varName && !varName.match(/^(is|has|can|should|will|was|did)/)) {
        issues.push({
          id: "naming-boolean",
          type: "naming",
          severity: "info",
          message: `Boolean '${varName}' should start with is/has/can/should`,
          autoFixable: true
        });
      }
    }

    const magicNumbers = code.match(/(?<!=)\s+\d{2,}(?!\s*[;,\]])/g) || [];
    if (magicNumbers.length > 3) {
      issues.push({
        id: "naming-magic-numbers",
        type: "naming",
        severity: "medium",
        message: `${magicNumbers.length} magic numbers found - consider using named constants`,
        autoFixable: false,
        suggestion: "Extract numbers into named constants that explain their purpose"
      });
    }

    return issues;
  }

  private detectStructureIssues(code: string, filePath: string): AnalysisIssue[] {
    const issues: AnalysisIssue[] = [];

    const lines = code.split('\n').length;
    if (lines > 300) {
      issues.push({
        id: "structure-file-size",
        type: "structure",
        severity: "medium",
        message: `File is ${lines} lines - consider splitting into smaller modules`,
        autoFixable: false
      });
    }

    const imports = (code.match(/^import\s+/gm) || []).length;
    if (imports > 15) {
      issues.push({
        id: "structure-imports",
        type: "structure",
        severity: "low",
        message: `${imports} imports may indicate this file does too much`,
        autoFixable: false
      });
    }

    if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
      const componentCount = (code.match(/(?:function|const)\s+[A-Z]\w*\s*[=(]/g) || []).length;
      if (componentCount > 3) {
        issues.push({
          id: "structure-components",
          type: "structure",
          severity: "medium",
          message: `${componentCount} components in one file - consider separating`,
          autoFixable: false
        });
      }
    }

    return issues;
  }

  private detectErrorHandling(code: string): AnalysisIssue[] {
    const issues: AnalysisIssue[] = [];

    const emptyCatch = code.match(/catch\s*\([^)]*\)\s*\{\s*\}/g);
    if (emptyCatch && emptyCatch.length > 0) {
      issues.push({
        id: "error-empty-catch",
        type: "error_handling",
        severity: "high",
        message: `${emptyCatch.length} empty catch block(s) - errors are silently swallowed`,
        autoFixable: false,
        suggestion: "At minimum, log the error or re-throw it"
      });
    }

    const asyncWithoutTry = code.match(/async\s+(?:function|\([^)]*\)\s*=>)\s*\{(?![^}]*try)/g);
    if (asyncWithoutTry && asyncWithoutTry.length > 2) {
      issues.push({
        id: "error-async-no-try",
        type: "error_handling",
        severity: "medium",
        message: "Multiple async functions without try-catch blocks",
        autoFixable: false
      });
    }

    if (code.includes('.catch(() => {})') || code.includes('.catch(() => null)')) {
      issues.push({
        id: "error-promise-swallow",
        type: "error_handling",
        severity: "high",
        message: "Promise errors are being swallowed",
        autoFixable: false
      });
    }

    return issues;
  }

  private detectSecurityIssues(code: string): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    if (code.includes('dangerouslySetInnerHTML') && !code.includes('DOMPurify')) {
      findings.push({
        type: "xss",
        severity: "high",
        description: "dangerouslySetInnerHTML without sanitization",
        remediation: "Use DOMPurify to sanitize HTML content"
      });
    }

    if (code.includes('eval(') || code.includes('new Function(')) {
      findings.push({
        type: "injection",
        severity: "critical",
        description: "Dynamic code execution detected",
        remediation: "Avoid eval() and new Function() - use safer alternatives"
      });
    }

    const secretPatterns = [
      /(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{10,}['"]/gi,
      /(?:aws|azure|gcp|github|stripe)[_-]?(?:key|secret|token)\s*[:=]/gi
    ];

    for (const pattern of secretPatterns) {
      if (pattern.test(code)) {
        findings.push({
          type: "exposure",
          severity: "critical",
          description: "Possible hardcoded secret detected",
          remediation: "Move secrets to environment variables"
        });
        break;
      }
    }

    if (code.match(/\$\{.*\}.*(?:SELECT|INSERT|UPDATE|DELETE)/i)) {
      findings.push({
        type: "injection",
        severity: "high",
        description: "Possible SQL injection via string interpolation",
        remediation: "Use parameterized queries or an ORM"
      });
    }

    return findings;
  }

  private detectBestPracticeViolations(code: string, filePath: string): BestPracticeViolation[] {
    const violations: BestPracticeViolation[] = [];

    const codeChunks = this.findDuplicateChunks(code);
    if (codeChunks.length > 0) {
      violations.push({
        rule: "DRY",
        category: "dry",
        description: "Duplicate code patterns detected",
        severity: "medium",
        recommendation: "Extract common code into reusable functions or components"
      });
    }

    if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
      if (code.match(/useState[\s\S]*useState[\s\S]*useState[\s\S]*useState[\s\S]*useState/)) {
        violations.push({
          rule: "React State Management",
          category: "react",
          description: "5+ useState calls - consider useReducer or custom hook",
          severity: "medium",
          recommendation: "Group related state with useReducer or extract to custom hook"
        });
      }

      if (code.match(/useEffect[^}]*\[\s*\]/g) && !code.includes('// mount only')) {
        violations.push({
          rule: "React useEffect Dependencies",
          category: "react",
          description: "Empty dependency array without mount-only comment",
          severity: "low",
          recommendation: "Add comment explaining why empty deps are intentional"
        });
      }
    }

    const anyCount = (code.match(/:\s*any\b/g) || []).length;
    if (anyCount > 3) {
      violations.push({
        rule: "TypeScript Type Safety",
        category: "typescript",
        description: `${anyCount} uses of 'any' type`,
        severity: "medium",
        recommendation: "Replace 'any' with proper types or 'unknown'"
      });
    }

    const godFunction = code.match(/(?:function|const)\s+\w+[^}]{500,}/g);
    if (godFunction) {
      violations.push({
        rule: "Single Responsibility",
        category: "solid",
        description: "Very long function detected (possible god function)",
        severity: "high",
        recommendation: "Break into smaller, focused functions"
      });
    }

    return violations;
  }

  private findDuplicateChunks(code: string): string[] {
    const lines = code.split('\n');
    const chunks: string[] = [];
    const seen = new Map<string, number>();

    for (let i = 0; i < lines.length - 3; i++) {
      const chunk = lines.slice(i, i + 3).join('\n').trim();
      if (chunk.length > 30) {
        const count = (seen.get(chunk) || 0) + 1;
        seen.set(chunk, count);
        if (count === 2) {
          chunks.push(chunk);
        }
      }
    }

    return chunks;
  }

  private calculateMetrics(code: string): CodeMetrics {
    const lines = code.split('\n');
    const linesOfCode = lines.filter(l => l.trim() && !l.trim().startsWith('//')).length;

    const branchingKeywords = (code.match(/\b(if|else|for|while|switch|case|catch|\?|&&|\|\|)\b/g) || []).length;
    const cyclomaticComplexity = branchingKeywords + 1;

    const nestingPenalty = this.calculateNestingDepth(code) * 2;
    const cognitiveComplexity = cyclomaticComplexity + nestingPenalty;

    const commentLines = lines.filter(l => l.trim().startsWith('//')).length;
    const commentRatio = commentLines / Math.max(1, linesOfCode);
    const avgLineLength = lines.reduce((sum, l) => sum + l.length, 0) / Math.max(1, lines.length);
    
    const maintainabilityIndex = Math.max(0, Math.min(100,
      171 - 5.2 * Math.log(Math.max(1, linesOfCode))
      - 0.23 * cyclomaticComplexity
      - 16.2 * Math.log(Math.max(1, avgLineLength))
      + 50 * Math.sqrt(2.4 * commentRatio)
    ));

    const duplicatePercentage = this.findDuplicateChunks(code).length * 5;

    return {
      linesOfCode,
      cyclomaticComplexity,
      cognitiveComplexity,
      maintainabilityIndex: Math.round(maintainabilityIndex),
      duplicatePercentage: Math.min(100, duplicatePercentage)
    };
  }

  private calculateScore(
    issues: AnalysisIssue[],
    security: SecurityFinding[],
    violations: BestPracticeViolation[],
    metrics: CodeMetrics
  ): number {
    let score = 100;

    for (const issue of issues) {
      switch (issue.severity) {
        case "critical": score -= 15; break;
        case "high": score -= 10; break;
        case "medium": score -= 5; break;
        case "low": score -= 2; break;
        case "info": score -= 1; break;
      }
    }

    for (const finding of security) {
      switch (finding.severity) {
        case "critical": score -= 25; break;
        case "high": score -= 15; break;
        case "medium": score -= 8; break;
        case "low": score -= 3; break;
      }
    }

    for (const violation of violations) {
      switch (violation.severity) {
        case "high": score -= 8; break;
        case "medium": score -= 4; break;
        case "low": score -= 2; break;
      }
    }

    if (metrics.maintainabilityIndex < 50) score -= 10;
    else if (metrics.maintainabilityIndex < 70) score -= 5;

    if (metrics.cyclomaticComplexity > 20) score -= 10;
    else if (metrics.cyclomaticComplexity > 10) score -= 5;

    return Math.max(0, Math.min(100, score));
  }

  private scoreToGrade(score: number): "A" | "B" | "C" | "D" | "F" {
    if (score >= 90) return "A";
    if (score >= 80) return "B";
    if (score >= 70) return "C";
    if (score >= 60) return "D";
    return "F";
  }

  private generateSuggestions(
    issues: AnalysisIssue[],
    violations: BestPracticeViolation[],
    metrics: CodeMetrics
  ): string[] {
    const suggestions: string[] = [];

    const criticalIssues = issues.filter(i => i.severity === "critical" || i.severity === "high");
    if (criticalIssues.length > 0) {
      suggestions.push(`Address ${criticalIssues.length} high-priority issues first`);
    }

    if (metrics.cyclomaticComplexity > 15) {
      suggestions.push("Reduce function complexity by extracting smaller functions");
    }

    if (metrics.maintainabilityIndex < 60) {
      suggestions.push("Improve maintainability with better naming and structure");
    }

    const violationCategories = new Set(violations.map(v => v.category));
    if (violationCategories.has("solid")) {
      suggestions.push("Review SOLID principles - especially Single Responsibility");
    }
    if (violationCategories.has("react")) {
      suggestions.push("Apply React best practices for state and effects");
    }

    return suggestions.slice(0, 5);
  }

  generateReport(result: AnalysisResult): string {
    const lines: string[] = [];
    
    lines.push(`# Code Analysis Report`);
    lines.push(`\n**Score:** ${result.score}/100 (${result.grade})`);
    
    lines.push(`\n## Metrics`);
    lines.push(`- Lines of Code: ${result.metrics.linesOfCode}`);
    lines.push(`- Cyclomatic Complexity: ${result.metrics.cyclomaticComplexity}`);
    lines.push(`- Cognitive Complexity: ${result.metrics.cognitiveComplexity}`);
    lines.push(`- Maintainability Index: ${result.metrics.maintainabilityIndex}`);

    if (result.securityFindings.length > 0) {
      lines.push(`\n## Security Findings (${result.securityFindings.length})`);
      for (const finding of result.securityFindings) {
        lines.push(`- **${finding.severity.toUpperCase()}** [${finding.type}]: ${finding.description}`);
        lines.push(`  - Fix: ${finding.remediation}`);
      }
    }

    if (result.issues.length > 0) {
      lines.push(`\n## Issues (${result.issues.length})`);
      const grouped = this.groupIssuesByType(result.issues);
      const entries = Array.from(grouped.entries());
      for (const [type, typeIssues] of entries) {
        lines.push(`\n### ${type} (${typeIssues.length})`);
        for (const issue of typeIssues.slice(0, 3)) {
          lines.push(`- ${issue.severity}: ${issue.message}`);
        }
      }
    }

    if (result.suggestions.length > 0) {
      lines.push(`\n## Suggestions`);
      for (const suggestion of result.suggestions) {
        lines.push(`- ${suggestion}`);
      }
    }

    return lines.join('\n');
  }

  private groupIssuesByType(issues: AnalysisIssue[]): Map<string, AnalysisIssue[]> {
    const grouped = new Map<string, AnalysisIssue[]>();
    for (const issue of issues) {
      const existing = grouped.get(issue.type) || [];
      existing.push(issue);
      grouped.set(issue.type, existing);
    }
    return grouped;
  }
}

export const enhancedAnalysisService = EnhancedAnalysisService.getInstance();
