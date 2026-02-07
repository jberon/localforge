export interface Issue {
  type: string;
  severity: "error" | "warning" | "info";
  message: string;
  line?: number;
  fixed: boolean;
  fixDescription?: string;
}

export interface PassResult {
  passName: string;
  issuesFound: Issue[];
  issuesFixed: Issue[];
  durationMs: number;
}

export interface QualityReport {
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

export interface AnalyzeOptions {
  language?: string;
  isMultiFile?: boolean;
}
