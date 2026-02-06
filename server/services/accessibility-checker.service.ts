import { BaseService } from "../lib/base-service";

interface FileInfo {
  path: string;
  content: string;
}

interface AccessibilityResult {
  score: number;
  issues: AccessibilityIssue[];
  summary: AccessibilitySummary;
  recommendations: string[];
}

interface AccessibilityIssue {
  severity: "critical" | "serious" | "moderate" | "minor";
  type: AccessibilityIssueType;
  wcagCriteria: string;
  filePath: string;
  line: number;
  element: string;
  message: string;
  suggestion: string;
}

type AccessibilityIssueType =
  | "missing_alt"
  | "missing_label"
  | "missing_aria"
  | "color_contrast"
  | "keyboard_accessibility"
  | "focus_management"
  | "semantic_html"
  | "form_accessibility"
  | "link_text"
  | "heading_structure"
  | "language_attribute";

interface AccessibilitySummary {
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  totalIssues: number;
  filesScanned: number;
  passedChecks: number;
}

interface AccessibilityPattern {
  type: AccessibilityIssueType;
  severity: AccessibilityIssue["severity"];
  wcagCriteria: string;
  pattern: RegExp;
  check: (match: RegExpMatchArray, line: string) => boolean;
  message: string;
  suggestion: string;
}

class AccessibilityCheckerService extends BaseService {
  private static instance: AccessibilityCheckerService;
  private patterns: AccessibilityPattern[];

  private constructor() {
    super("AccessibilityCheckerService");
    this.patterns = this.initializePatterns();
  }

  static getInstance(): AccessibilityCheckerService {
    if (!AccessibilityCheckerService.instance) {
      AccessibilityCheckerService.instance = new AccessibilityCheckerService();
    }
    return AccessibilityCheckerService.instance;
  }

  private initializePatterns(): AccessibilityPattern[] {
    return [
      {
        type: "missing_alt",
        severity: "critical",
        wcagCriteria: "WCAG 1.1.1",
        pattern: /<img\s+[^>]*(?!alt=)[^>]*>/gi,
        check: (match, line) => !line.includes("alt=") && !line.includes("role=\"presentation\""),
        message: "Image missing alt attribute",
        suggestion: "Add descriptive alt text: <img alt=\"Description of image\" />",
      },
      {
        type: "missing_alt",
        severity: "serious",
        wcagCriteria: "WCAG 1.1.1",
        pattern: /alt\s*=\s*['"]\s*['"]/gi,
        check: () => true,
        message: "Image has empty alt attribute without role=\"presentation\"",
        suggestion: "Add descriptive alt text or use role=\"presentation\" for decorative images",
      },
      {
        type: "missing_label",
        severity: "critical",
        wcagCriteria: "WCAG 1.3.1",
        pattern: /<input\s+(?![^>]*(?:aria-label|aria-labelledby|id\s*=\s*['"][^'"]+['"]\s*[^>]*<label))[^>]*>/gi,
        check: (match, line) => !line.includes("aria-label") && !line.includes("aria-labelledby") && !line.includes("type=\"hidden\""),
        message: "Form input missing accessible label",
        suggestion: "Add aria-label, aria-labelledby, or associate with a <label> element",
      },
      {
        type: "missing_label",
        severity: "critical",
        wcagCriteria: "WCAG 1.3.1",
        pattern: /<select\s+(?![^>]*(?:aria-label|aria-labelledby))[^>]*>/gi,
        check: (match, line) => !line.includes("aria-label") && !line.includes("aria-labelledby"),
        message: "Select element missing accessible label",
        suggestion: "Add aria-label or aria-labelledby to the select element",
      },
      {
        type: "keyboard_accessibility",
        severity: "serious",
        wcagCriteria: "WCAG 2.1.1",
        pattern: /onClick\s*=\s*\{[^}]+\}/gi,
        check: (match, line) => {
          const hasButton = /<button/i.test(line) || /<Button/i.test(line);
          const hasLink = /<a\s/i.test(line) || /<Link/i.test(line);
          const hasRole = /role\s*=\s*["']button["']/i.test(line);
          const hasTabIndex = /tabIndex/i.test(line);
          const hasKeyHandler = /onKeyDown|onKeyUp|onKeyPress/i.test(line);
          return !hasButton && !hasLink && !hasRole && !(hasTabIndex && hasKeyHandler);
        },
        message: "Click handler on non-interactive element without keyboard support",
        suggestion: "Use a <button> element, or add role=\"button\", tabIndex={0}, and keyboard handlers",
      },
      {
        type: "semantic_html",
        severity: "moderate",
        wcagCriteria: "WCAG 1.3.1",
        pattern: /<div\s+[^>]*onClick/gi,
        check: (match, line) => !line.includes("role=") && !line.includes("tabIndex"),
        message: "Clickable div should use semantic element or proper ARIA",
        suggestion: "Use <button> for actions, <a> for navigation, or add proper ARIA roles",
      },
      {
        type: "link_text",
        severity: "serious",
        wcagCriteria: "WCAG 2.4.4",
        pattern: /<a\s+[^>]*>\s*(?:click here|here|read more|learn more|more)\s*<\/a>/gi,
        check: () => true,
        message: "Link text is not descriptive",
        suggestion: "Use descriptive link text that explains the destination or action",
      },
      {
        type: "heading_structure",
        severity: "moderate",
        wcagCriteria: "WCAG 1.3.1",
        pattern: /<h([1-6])[^>]*>/gi,
        check: () => false, 
        message: "Review heading structure for proper hierarchy",
        suggestion: "Ensure headings follow a logical order (h1, h2, h3) without skipping levels",
      },
      {
        type: "form_accessibility",
        severity: "serious",
        wcagCriteria: "WCAG 3.3.2",
        pattern: /<form\s+[^>]*>/gi,
        check: (match, line) => !line.includes("aria-label") && !line.includes("aria-labelledby") && !line.includes("aria-describedby"),
        message: "Form should have accessible name or description",
        suggestion: "Add aria-labelledby pointing to a heading, or aria-label for the form purpose",
      },
      {
        type: "focus_management",
        severity: "serious",
        wcagCriteria: "WCAG 2.4.3",
        pattern: /outline\s*:\s*(?:none|0)/gi,
        check: () => true,
        message: "Focus outline removed without alternative",
        suggestion: "Provide a visible focus indicator using outline, box-shadow, or border",
      },
      {
        type: "missing_aria",
        severity: "moderate",
        wcagCriteria: "WCAG 4.1.2",
        pattern: /<(?:dialog|modal)\s+(?![^>]*(?:aria-labelledby|aria-label))[^>]*>/gi,
        check: (match, line) => !line.includes("aria-label") && !line.includes("aria-labelledby"),
        message: "Modal/dialog missing accessible name",
        suggestion: "Add aria-labelledby pointing to the dialog title",
      },
      {
        type: "color_contrast",
        severity: "moderate",
        wcagCriteria: "WCAG 1.4.3",
        pattern: /(?:text-gray-[3-4]00|text-slate-[3-4]00|opacity-[3-5]0)/gi,
        check: () => true,
        message: "Potential low color contrast",
        suggestion: "Ensure text has at least 4.5:1 contrast ratio against background",
      },
    ];
  }

  async checkAccessibility(files: FileInfo[]): Promise<AccessibilityResult> {
    this.log("Checking accessibility", { fileCount: files.length });

    const issues: AccessibilityIssue[] = [];
    let filesScanned = 0;
    let passedChecks = 0;

    for (const file of files) {
      if (!this.isComponentFile(file.path)) continue;
      
      filesScanned++;
      const fileIssues = this.checkFile(file);
      issues.push(...fileIssues);
      
      if (fileIssues.length === 0) passedChecks++;
    }

    const summary: AccessibilitySummary = {
      critical: issues.filter(i => i.severity === "critical").length,
      serious: issues.filter(i => i.severity === "serious").length,
      moderate: issues.filter(i => i.severity === "moderate").length,
      minor: issues.filter(i => i.severity === "minor").length,
      totalIssues: issues.length,
      filesScanned,
      passedChecks,
    };

    const score = this.calculateScore(summary);
    const recommendations = this.generateRecommendations(issues);

    this.log("Accessibility check completed", { 
      score, 
      issuesFound: issues.length,
      filesScanned,
    });

    return {
      score,
      issues,
      summary,
      recommendations,
    };
  }

  private isComponentFile(path: string): boolean {
    return path.endsWith(".tsx") || path.endsWith(".jsx");
  }

  private checkFile(file: FileInfo): AccessibilityIssue[] {
    const issues: AccessibilityIssue[] = [];
    const lines = file.content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const pattern of this.patterns) {
        const matches = Array.from(line.matchAll(pattern.pattern));
        
        for (const match of matches) {
          if (pattern.check(match, line)) {
            issues.push({
              severity: pattern.severity,
              type: pattern.type,
              wcagCriteria: pattern.wcagCriteria,
              filePath: file.path,
              line: i + 1,
              element: match[0].slice(0, 50),
              message: pattern.message,
              suggestion: pattern.suggestion,
            });
          }
        }
      }
    }

    const headingIssues = this.checkHeadingStructure(file.content, file.path);
    issues.push(...headingIssues);

    return issues;
  }

  private checkHeadingStructure(content: string, filePath: string): AccessibilityIssue[] {
    const issues: AccessibilityIssue[] = [];
    const headingMatches = content.matchAll(/<h([1-6])[^>]*>/gi);
    const headings: { level: number; line: number }[] = [];

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/<h([1-6])/i);
      if (match) {
        headings.push({ level: parseInt(match[1]), line: i + 1 });
      }
    }

    for (let i = 1; i < headings.length; i++) {
      const current = headings[i];
      const previous = headings[i - 1];
      
      if (current.level > previous.level + 1) {
        issues.push({
          severity: "moderate",
          type: "heading_structure",
          wcagCriteria: "WCAG 1.3.1",
          filePath,
          line: current.line,
          element: `<h${current.level}>`,
          message: `Heading level skipped: h${previous.level} to h${current.level}`,
          suggestion: `Use h${previous.level + 1} instead, or restructure content`,
        });
      }
    }

    return issues;
  }

  private calculateScore(summary: AccessibilitySummary): number {
    let score = 100;
    score -= summary.critical * 20;
    score -= summary.serious * 10;
    score -= summary.moderate * 5;
    score -= summary.minor * 2;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private generateRecommendations(issues: AccessibilityIssue[]): string[] {
    const recommendations = new Set<string>();

    const typeCounts = new Map<AccessibilityIssueType, number>();
    for (const issue of issues) {
      typeCounts.set(issue.type, (typeCounts.get(issue.type) || 0) + 1);
    }

    if (typeCounts.get("missing_alt")) {
      recommendations.add("Add alt text to all images - use descriptive text for informative images, empty alt for decorative");
    }
    if (typeCounts.get("missing_label")) {
      recommendations.add("Ensure all form inputs have accessible labels using <label>, aria-label, or aria-labelledby");
    }
    if (typeCounts.get("keyboard_accessibility")) {
      recommendations.add("Make all interactive elements keyboard accessible - use semantic HTML or add proper ARIA");
    }
    if (typeCounts.get("color_contrast")) {
      recommendations.add("Verify color contrast ratios meet WCAG 2.1 AA standards (4.5:1 for text)");
    }
    if (typeCounts.get("focus_management")) {
      recommendations.add("Ensure visible focus indicators for all interactive elements");
    }
    if (typeCounts.get("heading_structure")) {
      recommendations.add("Maintain proper heading hierarchy without skipping levels");
    }

    if (recommendations.size === 0) {
      recommendations.add("Good accessibility practices detected - continue following WCAG guidelines");
    }

    return Array.from(recommendations);
  }

  checkSingleFile(content: string, filePath: string): AccessibilityIssue[] {
    return this.checkFile({ path: filePath, content });
  }

  destroy(): void {
    this.patterns = [];
    this.log("AccessibilityCheckerService shutting down");
  }
}

export const accessibilityCheckerService = AccessibilityCheckerService.getInstance();
