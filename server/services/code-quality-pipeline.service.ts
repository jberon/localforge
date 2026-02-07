import { BaseService, ManagedMap } from "../lib/base-service";
import type { Issue, PassResult, QualityReport, AnalyzeOptions } from "./code-quality/types";
import { runStructuralIntegrity } from "./code-quality/structural-pass";
import { runReactJsxPass } from "./code-quality/react-jsx-pass";
import { runImportDependencyResolution } from "./code-quality/import-pass";
import { runCodeCompleteness } from "./code-quality/completeness-pass";
import { runCommonLLMMistakes } from "./code-quality/llm-cleanup-pass";

export type { Issue, PassResult, QualityReport, AnalyzeOptions } from "./code-quality/types";

interface AnalysisHistoryEntry {
  timestamp: Date;
  score: number;
  issuesFound: number;
  issuesFixed: number;
  issueTypes: string[];
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
      runStructuralIntegrity(currentCode);
    currentCode = afterPass1;
    passResults.push(this.buildPassResult("Structural Integrity", issues1, pass1Start));

    const isJsx = lang === "jsx" || lang === "tsx" || lang === "react";

    const pass2Start = Date.now();
    const { code: afterPass2, issues: issues2 } = runReactJsxPass(
      currentCode,
      isJsx
    );
    currentCode = afterPass2;
    passResults.push(this.buildPassResult("React/JSX Specific", issues2, pass2Start));

    const pass3Start = Date.now();
    const { code: afterPass3, issues: issues3 } =
      runImportDependencyResolution(currentCode);
    currentCode = afterPass3;
    passResults.push(
      this.buildPassResult("Import/Dependency Resolution", issues3, pass3Start)
    );

    const pass4Start = Date.now();
    const { code: afterPass4, issues: issues4 } =
      runCodeCompleteness(currentCode);
    currentCode = afterPass4;
    passResults.push(this.buildPassResult("Code Completeness", issues4, pass4Start));

    const pass5Start = Date.now();
    const { code: afterPass5, issues: issues5 } =
      runCommonLLMMistakes(currentCode);
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
}

export const codeQualityPipelineService =
  CodeQualityPipelineService.getInstance();
