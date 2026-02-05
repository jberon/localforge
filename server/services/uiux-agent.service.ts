import { logger } from "../lib/logger";

export interface DesignIssue {
  id: string;
  type: DesignIssueType;
  severity: "error" | "warning" | "info";
  file: string;
  line?: number;
  element?: string;
  message: string;
  suggestion: string;
  autoFixable: boolean;
}

export type DesignIssueType =
  | "color_inconsistency"
  | "spacing_violation"
  | "typography_mismatch"
  | "accessibility_issue"
  | "component_misuse"
  | "responsive_issue"
  | "dark_mode_issue"
  | "naming_convention";

export interface DesignSystem {
  colors: {
    primary: string[];
    secondary: string[];
    accent: string[];
    background: string[];
    foreground: string[];
    muted: string[];
    destructive: string[];
  };
  spacing: number[];
  borderRadius: string[];
  fontSizes: string[];
  fontWeights: number[];
  breakpoints: Record<string, string>;
}

export interface UIUXAnalysisResult {
  success: boolean;
  filesAnalyzed: number;
  issuesFound: DesignIssue[];
  score: number;
  summary: string;
  recommendations: string[];
}

export interface ComponentPattern {
  name: string;
  pattern: RegExp;
  expectedImport?: string;
  violations: string[];
}

class UIUXAgentService {
  private static instance: UIUXAgentService;
  private designSystem: DesignSystem;
  private componentPatterns: ComponentPattern[] = [];

  private constructor() {
    this.designSystem = this.getDefaultDesignSystem();
    this.initializeComponentPatterns();
    logger.info("UIUXAgentService initialized");
  }

  static getInstance(): UIUXAgentService {
    if (!UIUXAgentService.instance) {
      UIUXAgentService.instance = new UIUXAgentService();
    }
    return UIUXAgentService.instance;
  }

  private getDefaultDesignSystem(): DesignSystem {
    return {
      colors: {
        primary: ["hsl(var(--primary))", "bg-primary", "text-primary-foreground"],
        secondary: ["hsl(var(--secondary))", "bg-secondary", "text-secondary-foreground"],
        accent: ["hsl(var(--accent))", "bg-accent", "text-accent-foreground"],
        background: ["hsl(var(--background))", "bg-background"],
        foreground: ["hsl(var(--foreground))", "text-foreground"],
        muted: ["hsl(var(--muted))", "bg-muted", "text-muted-foreground"],
        destructive: ["hsl(var(--destructive))", "bg-destructive", "text-destructive"]
      },
      spacing: [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64],
      borderRadius: ["rounded-sm", "rounded", "rounded-md", "rounded-lg", "rounded-xl", "rounded-full"],
      fontSizes: ["text-xs", "text-sm", "text-base", "text-lg", "text-xl", "text-2xl", "text-3xl", "text-4xl"],
      fontWeights: [400, 500, 600, 700],
      breakpoints: {
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
        "2xl": "1536px"
      }
    };
  }

  private initializeComponentPatterns(): void {
    this.componentPatterns = [
      {
        name: "Button",
        pattern: /<button[^>]*className/gi,
        expectedImport: "@/components/ui/button",
        violations: ["Using raw <button> instead of <Button> component"]
      },
      {
        name: "Card",
        pattern: /className="[^"]*bg-card[^"]*border[^"]*rounded/gi,
        expectedImport: "@/components/ui/card",
        violations: ["Recreating Card styles instead of using <Card> component"]
      },
      {
        name: "Input",
        pattern: /<input[^>]*className/gi,
        expectedImport: "@/components/ui/input",
        violations: ["Using raw <input> instead of <Input> component"]
      },
      {
        name: "Badge",
        pattern: /className="[^"]*inline-flex[^"]*rounded-full[^"]*text-xs/gi,
        expectedImport: "@/components/ui/badge",
        violations: ["Recreating Badge styles instead of using <Badge> component"]
      }
    ];
  }

  async analyzeFiles(
    files: Array<{ path: string; content: string }>
  ): Promise<UIUXAnalysisResult> {
    const issues: DesignIssue[] = [];
    let totalScore = 100;

    for (const file of files) {
      if (!this.isUIFile(file.path)) continue;

      const fileIssues = await this.analyzeFile(file.path, file.content);
      issues.push(...fileIssues);
    }

    for (const issue of issues) {
      if (issue.severity === "error") totalScore -= 5;
      else if (issue.severity === "warning") totalScore -= 2;
      else totalScore -= 1;
    }

    const score = Math.max(0, totalScore);
    const recommendations = this.generateRecommendations(issues);

    return {
      success: true,
      filesAnalyzed: files.filter(f => this.isUIFile(f.path)).length,
      issuesFound: issues,
      score,
      summary: this.generateSummary(issues, score),
      recommendations
    };
  }

  private isUIFile(path: string): boolean {
    return /\.(tsx|jsx|css|scss)$/.test(path);
  }

  private async analyzeFile(path: string, content: string): Promise<DesignIssue[]> {
    const issues: DesignIssue[] = [];
    const lines = content.split("\n");

    issues.push(...this.checkColorConsistency(path, content, lines));
    issues.push(...this.checkSpacingViolations(path, content, lines));
    issues.push(...this.checkAccessibility(path, content, lines));
    issues.push(...this.checkComponentMisuse(path, content, lines));
    issues.push(...this.checkDarkModeSupport(path, content, lines));
    issues.push(...this.checkTypography(path, content, lines));

    return issues;
  }

  private checkColorConsistency(
    path: string,
    content: string,
    lines: string[]
  ): DesignIssue[] {
    const issues: DesignIssue[] = [];
    
    const hardcodedColors = [
      { pattern: /bg-\[#[a-fA-F0-9]+\]/g, type: "background" },
      { pattern: /text-\[#[a-fA-F0-9]+\]/g, type: "text" },
      { pattern: /border-\[#[a-fA-F0-9]+\]/g, type: "border" },
      { pattern: /#[a-fA-F0-9]{3,6}(?![a-fA-F0-9])/g, type: "inline" },
      { pattern: /rgb\([^)]+\)/g, type: "rgb" },
      { pattern: /rgba\([^)]+\)/g, type: "rgba" }
    ];

    lines.forEach((line, index) => {
      for (const colorPattern of hardcodedColors) {
        const matches = line.match(colorPattern.pattern);
        if (matches) {
          issues.push({
            id: this.generateId(),
            type: "color_inconsistency",
            severity: "warning",
            file: path,
            line: index + 1,
            element: matches[0],
            message: `Hardcoded ${colorPattern.type} color found: ${matches[0]}`,
            suggestion: "Use design system colors like bg-primary, text-foreground, etc.",
            autoFixable: false
          });
        }
      }
    });

    if (/text-primary(?!-foreground)/g.test(content)) {
      const match = content.match(/text-primary(?!-foreground)/);
      if (match) {
        issues.push({
          id: this.generateId(),
          type: "color_inconsistency",
          severity: "error",
          file: path,
          element: "text-primary",
          message: "Using text-primary class which may have poor contrast",
          suggestion: "Use text-primary-foreground for text on primary backgrounds, or text-foreground for general text",
          autoFixable: true
        });
      }
    }

    return issues;
  }

  private checkSpacingViolations(
    path: string,
    content: string,
    lines: string[]
  ): DesignIssue[] {
    const issues: DesignIssue[] = [];
    
    const inconsistentSpacing = /(?:p|m|gap|space)-\d+/g;
    const spacingValues = new Set<string>();
    
    const matches = Array.from(content.matchAll(inconsistentSpacing));
    matches.forEach(match => {
      spacingValues.add(match[0]);
    });

    if (spacingValues.size > 8) {
      issues.push({
        id: this.generateId(),
        type: "spacing_violation",
        severity: "warning",
        file: path,
        message: `Too many different spacing values used (${spacingValues.size}). Consider using a consistent spacing scale.`,
        suggestion: "Stick to a limited set of spacing values like 2, 4, 6, 8, 12, 16, 24",
        autoFixable: false
      });
    }

    lines.forEach((line, index) => {
      if (/style=["'][^"']*(?:margin|padding|gap):\s*\d+px/i.test(line)) {
        issues.push({
          id: this.generateId(),
          type: "spacing_violation",
          severity: "warning",
          file: path,
          line: index + 1,
          message: "Inline spacing styles detected",
          suggestion: "Use Tailwind spacing classes instead of inline pixel values",
          autoFixable: false
        });
      }
    });

    return issues;
  }

  private checkAccessibility(
    path: string,
    content: string,
    lines: string[]
  ): DesignIssue[] {
    const issues: DesignIssue[] = [];

    lines.forEach((line, index) => {
      if (/<img[^>]*(?!alt=)[^>]*>/i.test(line) && !line.includes("alt=")) {
        issues.push({
          id: this.generateId(),
          type: "accessibility_issue",
          severity: "error",
          file: path,
          line: index + 1,
          message: "Image missing alt attribute",
          suggestion: "Add alt attribute to describe the image for screen readers",
          autoFixable: false
        });
      }

      if (/<(?:div|span)[^>]*onClick[^>]*>(?!.*(?:role=|button))/i.test(line)) {
        issues.push({
          id: this.generateId(),
          type: "accessibility_issue",
          severity: "warning",
          file: path,
          line: index + 1,
          message: "Non-semantic element with click handler",
          suggestion: "Use <button> or add role=\"button\" and keyboard handlers",
          autoFixable: false
        });
      }

      if (/text-\[?\d+px\]?/.test(line)) {
        const sizeMatch = line.match(/text-\[?(\d+)px\]?/);
        if (sizeMatch && parseInt(sizeMatch[1]) < 12) {
          issues.push({
            id: this.generateId(),
            type: "accessibility_issue",
            severity: "warning",
            file: path,
            line: index + 1,
            message: "Text size below 12px may be difficult to read",
            suggestion: "Use at least text-xs (12px) for readable text",
            autoFixable: true
          });
        }
      }
    });

    if (!content.includes("data-testid=") && path.includes("component")) {
      issues.push({
        id: this.generateId(),
        type: "accessibility_issue",
        severity: "info",
        file: path,
        message: "Consider adding data-testid attributes for testing",
        suggestion: "Add data-testid to interactive elements for easier testing",
        autoFixable: false
      });
    }

    return issues;
  }

  private checkComponentMisuse(
    path: string,
    content: string,
    lines: string[]
  ): DesignIssue[] {
    const issues: DesignIssue[] = [];

    for (const pattern of this.componentPatterns) {
      if (pattern.pattern.test(content)) {
        const hasImport = content.includes(pattern.expectedImport || "");
        if (!hasImport && pattern.expectedImport) {
          issues.push({
            id: this.generateId(),
            type: "component_misuse",
            severity: "warning",
            file: path,
            message: pattern.violations[0] || `Consider using ${pattern.name} component`,
            suggestion: `Import from "${pattern.expectedImport}" and use the ${pattern.name} component`,
            autoFixable: false
          });
        }
      }
    }

    if (/<Card[^>]*className="[^"]*p-0/i.test(content)) {
      issues.push({
        id: this.generateId(),
        type: "component_misuse",
        severity: "info",
        file: path,
        message: "Card with p-0 - consider if CardContent is being used properly",
        suggestion: "Use CardHeader, CardContent, CardFooter for proper Card structure",
        autoFixable: false
      });
    }

    const buttonSizeMatch = content.match(/<Button[^>]*className="[^"]*(?:h-\d+|w-\d+)[^"]*"/gi);
    if (buttonSizeMatch) {
      issues.push({
        id: this.generateId(),
        type: "component_misuse",
        severity: "warning",
        file: path,
        message: "Manual height/width on Button - use size prop instead",
        suggestion: "Use size=\"sm\", size=\"lg\", or size=\"icon\" instead of custom dimensions",
        autoFixable: true
      });
    }

    return issues;
  }

  private checkDarkModeSupport(
    path: string,
    content: string,
    lines: string[]
  ): DesignIssue[] {
    const issues: DesignIssue[] = [];

    const hardcodedLightColors = [
      "bg-white", "bg-gray-100", "bg-gray-50",
      "text-black", "text-gray-900", "text-gray-800",
      "border-gray-200", "border-gray-300"
    ];

    for (const color of hardcodedLightColors) {
      const regex = new RegExp(`\\b${color}\\b(?![^"]*dark:)`, "g");
      lines.forEach((line, index) => {
        if (regex.test(line) && !line.includes("dark:")) {
          issues.push({
            id: this.generateId(),
            type: "dark_mode_issue",
            severity: "warning",
            file: path,
            line: index + 1,
            element: color,
            message: `Light-mode-only color "${color}" without dark variant`,
            suggestion: `Add dark mode variant: ${color} dark:bg-gray-900 or use semantic colors like bg-background`,
            autoFixable: true
          });
        }
      });
    }

    return issues;
  }

  private checkTypography(
    path: string,
    content: string,
    lines: string[]
  ): DesignIssue[] {
    const issues: DesignIssue[] = [];

    lines.forEach((line, index) => {
      if (/font-family:\s*['"]/i.test(line)) {
        issues.push({
          id: this.generateId(),
          type: "typography_mismatch",
          severity: "warning",
          file: path,
          line: index + 1,
          message: "Inline font-family style detected",
          suggestion: "Use Tailwind font classes like font-sans, font-mono, or configure custom fonts in tailwind.config",
          autoFixable: false
        });
      }

      const textSizes = line.match(/text-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)/g);
      if (textSizes && textSizes.length > 3) {
        issues.push({
          id: this.generateId(),
          type: "typography_mismatch",
          severity: "info",
          file: path,
          line: index + 1,
          message: "Many text sizes in single element - consider simplifying",
          suggestion: "Use consistent heading/body text scales",
          autoFixable: false
        });
      }
    });

    return issues;
  }

  private generateSummary(issues: DesignIssue[], score: number): string {
    const errorCount = issues.filter(i => i.severity === "error").length;
    const warningCount = issues.filter(i => i.severity === "warning").length;
    const infoCount = issues.filter(i => i.severity === "info").length;

    if (issues.length === 0) {
      return "Excellent! No design system issues found.";
    }

    let grade: string;
    if (score >= 90) grade = "A";
    else if (score >= 80) grade = "B";
    else if (score >= 70) grade = "C";
    else if (score >= 60) grade = "D";
    else grade = "F";

    return `Design System Score: ${score}/100 (Grade ${grade}). Found ${errorCount} errors, ${warningCount} warnings, ${infoCount} suggestions.`;
  }

  private generateRecommendations(issues: DesignIssue[]): string[] {
    const recommendations: string[] = [];
    const issueTypes = new Set(issues.map(i => i.type));

    if (issueTypes.has("color_inconsistency")) {
      recommendations.push("Use CSS variables and semantic color tokens (bg-primary, text-foreground) instead of hardcoded colors");
    }
    if (issueTypes.has("spacing_violation")) {
      recommendations.push("Establish a consistent spacing scale (4px, 8px, 16px, 24px, 32px) and stick to it");
    }
    if (issueTypes.has("accessibility_issue")) {
      recommendations.push("Add alt text to images, use semantic HTML elements, and ensure sufficient color contrast");
    }
    if (issueTypes.has("component_misuse")) {
      recommendations.push("Use Shadcn UI components instead of recreating styles - they handle accessibility and dark mode");
    }
    if (issueTypes.has("dark_mode_issue")) {
      recommendations.push("Always provide dark: variants for color classes, or use semantic tokens that adapt automatically");
    }
    if (issueTypes.has("typography_mismatch")) {
      recommendations.push("Define a typography scale in your design system and use consistent text sizes");
    }

    return recommendations;
  }

  async autoFixIssues(
    files: Array<{ path: string; content: string }>,
    issues: DesignIssue[]
  ): Promise<Array<{ path: string; content: string; fixed: number }>> {
    const fixableIssues = issues.filter(i => i.autoFixable);
    const results: Array<{ path: string; content: string; fixed: number }> = [];

    for (const file of files) {
      let content = file.content;
      let fixedCount = 0;

      const fileIssues = fixableIssues.filter(i => i.file === file.path);
      
      for (const issue of fileIssues) {
        const fixedContent = this.applyAutoFix(content, issue);
        if (fixedContent !== content) {
          content = fixedContent;
          fixedCount++;
        }
      }

      results.push({ path: file.path, content, fixed: fixedCount });
    }

    return results;
  }

  private applyAutoFix(content: string, issue: DesignIssue): string {
    switch (issue.type) {
      case "color_inconsistency":
        if (issue.element === "text-primary") {
          return content.replace(/\btext-primary\b(?!-foreground)/g, "text-foreground");
        }
        break;
        
      case "dark_mode_issue":
        if (issue.element) {
          const darkVariant = this.getDarkModeVariant(issue.element);
          if (darkVariant) {
            return content.replace(
              new RegExp(`\\b${issue.element}\\b(?![^"]*dark:)`, "g"),
              `${issue.element} ${darkVariant}`
            );
          }
        }
        break;

      case "component_misuse":
        break;
    }

    return content;
  }

  private getDarkModeVariant(lightClass: string): string | null {
    const mappings: Record<string, string> = {
      "bg-white": "dark:bg-gray-950",
      "bg-gray-50": "dark:bg-gray-900",
      "bg-gray-100": "dark:bg-gray-800",
      "text-black": "dark:text-white",
      "text-gray-900": "dark:text-gray-100",
      "text-gray-800": "dark:text-gray-200",
      "border-gray-200": "dark:border-gray-700",
      "border-gray-300": "dark:border-gray-600"
    };

    return mappings[lightClass] || null;
  }

  setDesignSystem(system: Partial<DesignSystem>): void {
    this.designSystem = { ...this.designSystem, ...system };
  }

  getDesignSystem(): DesignSystem {
    return this.designSystem;
  }

  private generateId(): string {
    return `ui_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const uiuxAgentService = UIUXAgentService.getInstance();
