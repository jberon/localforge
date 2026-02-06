import { BaseService } from "../lib/base-service";

interface FileInfo {
  path: string;
  content: string;
}

interface SecurityIssue {
  severity: "critical" | "high" | "medium" | "low" | "info";
  type: SecurityIssueType;
  filePath: string;
  line: number;
  column?: number;
  message: string;
  snippet: string;
  recommendation: string;
}

type SecurityIssueType =
  | "xss"
  | "sql_injection"
  | "exposed_secret"
  | "insecure_dependency"
  | "path_traversal"
  | "command_injection"
  | "insecure_random"
  | "hardcoded_credential"
  | "sensitive_data_exposure"
  | "insecure_http"
  | "eval_usage"
  | "prototype_pollution";

interface SecurityScanResult {
  issues: SecurityIssue[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    totalFiles: number;
    scannedFiles: number;
  };
  score: number;
  recommendations: string[];
}

interface SecurityPattern {
  type: SecurityIssueType;
  severity: SecurityIssue["severity"];
  pattern: RegExp;
  message: string;
  recommendation: string;
  fileTypes?: string[];
}

class SecurityScanningService extends BaseService {
  private static instance: SecurityScanningService;
  private patterns: SecurityPattern[];

  private constructor() {
    super("SecurityScanningService");
    this.patterns = this.initializePatterns();
  }

  static getInstance(): SecurityScanningService {
    if (!SecurityScanningService.instance) {
      SecurityScanningService.instance = new SecurityScanningService();
    }
    return SecurityScanningService.instance;
  }

  private initializePatterns(): SecurityPattern[] {
    return [
      {
        type: "xss",
        severity: "high",
        pattern: /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html\s*:/,
        message: "Potential XSS vulnerability: dangerouslySetInnerHTML usage",
        recommendation: "Sanitize HTML content using DOMPurify or similar library before rendering",
        fileTypes: ["tsx", "jsx", "js", "ts"],
      },
      {
        type: "xss",
        severity: "medium",
        pattern: /innerHTML\s*=(?!\s*['"`]\s*['"`])/,
        message: "Potential XSS vulnerability: direct innerHTML assignment",
        recommendation: "Use textContent or sanitize content before setting innerHTML",
        fileTypes: ["ts", "js", "tsx", "jsx"],
      },
      {
        type: "sql_injection",
        severity: "critical",
        pattern: /(?:execute|query|raw)\s*\(\s*[`'"].*\$\{/,
        message: "Potential SQL injection: string interpolation in query",
        recommendation: "Use parameterized queries or prepared statements",
        fileTypes: ["ts", "js"],
      },
      {
        type: "sql_injection",
        severity: "critical",
        pattern: /(?:execute|query)\s*\(\s*.*\+\s*(?:req\.|params\.|query\.)/,
        message: "Potential SQL injection: concatenating user input in query",
        recommendation: "Use parameterized queries with placeholders",
        fileTypes: ["ts", "js"],
      },
      {
        type: "exposed_secret",
        severity: "critical",
        pattern: /(?:api[_-]?key|apikey|secret|password|token|auth)\s*[:=]\s*['"][A-Za-z0-9+/=_-]{16,}['"]/i,
        message: "Potential exposed secret or API key",
        recommendation: "Move secrets to environment variables and never commit them",
      },
      {
        type: "exposed_secret",
        severity: "critical",
        pattern: /(?:sk_live_|pk_live_|sk_test_)[A-Za-z0-9]{20,}/,
        message: "Stripe API key detected in source code",
        recommendation: "Move Stripe keys to environment variables",
      },
      {
        type: "exposed_secret",
        severity: "critical",
        pattern: /(?:ghp_|github_pat_)[A-Za-z0-9]{36,}/,
        message: "GitHub token detected in source code",
        recommendation: "Move GitHub tokens to environment variables",
      },
      {
        type: "hardcoded_credential",
        severity: "high",
        pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}['"]/i,
        message: "Hardcoded password detected",
        recommendation: "Use environment variables for credentials",
      },
      {
        type: "path_traversal",
        severity: "high",
        pattern: /(?:readFile|writeFile|createReadStream|unlink|rmdir)\s*\([^)]*(?:req\.|params\.|query\.)/,
        message: "Potential path traversal vulnerability",
        recommendation: "Validate and sanitize file paths, use path.resolve and check against base directory",
        fileTypes: ["ts", "js"],
      },
      {
        type: "command_injection",
        severity: "critical",
        pattern: /(?:exec|spawn|execSync|spawnSync)\s*\([^)]*(?:req\.|params\.|query\.|\$\{)/,
        message: "Potential command injection vulnerability",
        recommendation: "Avoid using user input in shell commands, use allowlists for commands",
        fileTypes: ["ts", "js"],
      },
      {
        type: "eval_usage",
        severity: "high",
        pattern: /\beval\s*\(/,
        message: "Use of eval() is dangerous and can lead to code injection",
        recommendation: "Avoid eval(), use safer alternatives like JSON.parse for data",
        fileTypes: ["ts", "js", "tsx", "jsx"],
      },
      {
        type: "eval_usage",
        severity: "high",
        pattern: /new\s+Function\s*\(/,
        message: "Dynamic Function constructor can be exploited for code injection",
        recommendation: "Avoid dynamic code generation from user input",
        fileTypes: ["ts", "js", "tsx", "jsx"],
      },
      {
        type: "insecure_random",
        severity: "medium",
        pattern: /Math\.random\s*\(\)/,
        message: "Math.random() is not cryptographically secure",
        recommendation: "Use crypto.randomBytes() or crypto.randomUUID() for security-sensitive values",
        fileTypes: ["ts", "js"],
      },
      {
        type: "insecure_http",
        severity: "medium",
        pattern: /['"]http:\/\/(?!localhost|127\.0\.0\.1)/,
        message: "Insecure HTTP URL detected (non-localhost)",
        recommendation: "Use HTTPS for all external communications",
      },
      {
        type: "sensitive_data_exposure",
        severity: "medium",
        pattern: /console\.log\s*\([^)]*(?:password|secret|token|key|auth)/i,
        message: "Potential sensitive data logging",
        recommendation: "Remove logging of sensitive information before production",
        fileTypes: ["ts", "js", "tsx", "jsx"],
      },
      {
        type: "prototype_pollution",
        severity: "high",
        pattern: /\[(?:req\.|params\.|query\.|body\.)[^\]]+\]\s*=/,
        message: "Potential prototype pollution via dynamic property assignment",
        recommendation: "Validate property names against an allowlist",
        fileTypes: ["ts", "js"],
      },
    ];
  }

  async scanFiles(files: FileInfo[]): Promise<SecurityScanResult> {
    this.log("Starting security scan", { fileCount: files.length });

    const issues: SecurityIssue[] = [];
    let scannedFiles = 0;

    for (const file of files) {
      const ext = file.path.split(".").pop()?.toLowerCase();
      if (!ext || !["ts", "tsx", "js", "jsx", "json", "env"].includes(ext)) {
        continue;
      }

      scannedFiles++;
      const fileIssues = this.scanFile(file);
      issues.push(...fileIssues);
    }

    const summary = {
      critical: issues.filter(i => i.severity === "critical").length,
      high: issues.filter(i => i.severity === "high").length,
      medium: issues.filter(i => i.severity === "medium").length,
      low: issues.filter(i => i.severity === "low").length,
      info: issues.filter(i => i.severity === "info").length,
      totalFiles: files.length,
      scannedFiles,
    };

    const score = this.calculateSecurityScore(summary);
    const recommendations = this.generateRecommendations(issues);

    this.log("Security scan completed", { 
      issuesFound: issues.length, 
      score,
      ...summary 
    });

    return {
      issues,
      summary,
      score,
      recommendations,
    };
  }

  private scanFile(file: FileInfo): SecurityIssue[] {
    const issues: SecurityIssue[] = [];
    const lines = file.content.split("\n");
    const ext = file.path.split(".").pop()?.toLowerCase();

    for (const pattern of this.patterns) {
      if (pattern.fileTypes && ext && !pattern.fileTypes.includes(ext)) {
        continue;
      }

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(pattern.pattern);
        
        if (match) {
          issues.push({
            severity: pattern.severity,
            type: pattern.type,
            filePath: file.path,
            line: i + 1,
            column: match.index,
            message: pattern.message,
            snippet: line.trim().slice(0, 100),
            recommendation: pattern.recommendation,
          });
        }
      }
    }

    if (file.path.endsWith(".env") || file.path.includes(".env.")) {
      const envIssues = this.scanEnvFile(file);
      issues.push(...envIssues);
    }

    return issues;
  }

  private scanEnvFile(file: FileInfo): SecurityIssue[] {
    const issues: SecurityIssue[] = [];
    const lines = file.content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith("#")) continue;

      const [key, value] = line.split("=");
      if (!value) continue;

      if (value.length > 10 && !value.startsWith("${") && !value.includes("process.env")) {
        const sensitiveKeys = ["SECRET", "KEY", "TOKEN", "PASSWORD", "CREDENTIAL", "AUTH"];
        if (sensitiveKeys.some(sk => key.toUpperCase().includes(sk))) {
          issues.push({
            severity: "info",
            type: "sensitive_data_exposure",
            filePath: file.path,
            line: i + 1,
            message: "Environment variable with sensitive value - ensure this file is in .gitignore",
            snippet: `${key}=***`,
            recommendation: "Ensure .env files are in .gitignore and use secret management in production",
          });
        }
      }
    }

    return issues;
  }

  private calculateSecurityScore(summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  }): number {
    let score = 100;
    score -= summary.critical * 25;
    score -= summary.high * 15;
    score -= summary.medium * 5;
    score -= summary.low * 2;
    score -= summary.info * 0.5;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private generateRecommendations(issues: SecurityIssue[]): string[] {
    const recommendations = new Set<string>();

    const typeCounts = new Map<SecurityIssueType, number>();
    for (const issue of issues) {
      typeCounts.set(issue.type, (typeCounts.get(issue.type) || 0) + 1);
    }

    if (typeCounts.get("exposed_secret") || typeCounts.get("hardcoded_credential")) {
      recommendations.add("Implement a secrets management solution and audit all hardcoded credentials");
    }
    if (typeCounts.get("sql_injection")) {
      recommendations.add("Use parameterized queries for all database operations");
    }
    if (typeCounts.get("xss")) {
      recommendations.add("Implement Content Security Policy headers and sanitize all user-generated content");
    }
    if (typeCounts.get("command_injection")) {
      recommendations.add("Avoid shell commands with user input; if necessary, use strict allowlisting");
    }
    if (typeCounts.get("eval_usage")) {
      recommendations.add("Remove all uses of eval() and dynamic Function constructor");
    }
    if (typeCounts.get("insecure_http")) {
      recommendations.add("Enforce HTTPS for all external communications");
    }
    if (typeCounts.get("insecure_random")) {
      recommendations.add("Use crypto.randomBytes() for security-sensitive random values");
    }

    if (recommendations.size === 0) {
      recommendations.add("No critical security issues found - continue following security best practices");
    }

    return Array.from(recommendations);
  }

  scanSingleFile(content: string, filePath: string): SecurityIssue[] {
    return this.scanFile({ path: filePath, content });
  }

  destroy(): void {
    this.patterns = [];
    this.log("SecurityScanningService shutting down");
  }
}

export const securityScanningService = SecurityScanningService.getInstance();
