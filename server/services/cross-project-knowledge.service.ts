import { BaseService, ManagedMap } from "../lib/base-service";

type PatternCategory = 'component' | 'api' | 'state-management' | 'form' | 'auth' | 'data-fetching' | 'layout' | 'utility' | 'hook' | 'middleware';

interface ExtractedPattern {
  id: string;
  name: string;
  description: string;
  category: PatternCategory;
  code: string;
  tags: string[];
  sourceProjectId: string;
  qualityScore: number;
  usageCount: number;
  successRate: number;
  complexity: 'simple' | 'moderate' | 'complex';
  dependencies: string[];
  createdAt: number;
  lastUsedAt: number;
}

interface PatternMatch {
  pattern: ExtractedPattern;
  relevanceScore: number;
  reason: string;
}

interface FileInput {
  path: string;
  content: string;
}

const CATEGORY_KEYWORDS: Record<PatternCategory, string[]> = {
  component: ["component", "render", "jsx", "tsx", "react", "ui", "widget", "view"],
  api: ["api", "route", "endpoint", "express", "rest", "handler", "server", "backend"],
  "state-management": ["state", "redux", "zustand", "context", "store", "reducer", "atom"],
  form: ["form", "input", "submit", "validation", "field", "wizard", "survey"],
  auth: ["auth", "login", "signup", "session", "jwt", "token", "password", "register"],
  "data-fetching": ["fetch", "query", "swr", "data", "loading", "cache", "request", "axios"],
  layout: ["layout", "grid", "flex", "sidebar", "header", "footer", "nav", "responsive"],
  utility: ["util", "helper", "format", "parse", "convert", "calculate", "transform"],
  hook: ["hook", "use", "custom hook", "react hook", "state hook"],
  middleware: ["middleware", "interceptor", "guard", "pipe", "filter", "validator"],
};

class CrossProjectKnowledgeService extends BaseService {
  private static instance: CrossProjectKnowledgeService;
  private patterns: ManagedMap<string, ExtractedPattern>;

  private constructor() {
    super("CrossProjectKnowledgeService");
    this.patterns = this.createManagedMap<string, ExtractedPattern>({ maxSize: 500, strategy: "lru" });
  }

  static getInstance(): CrossProjectKnowledgeService {
    if (!CrossProjectKnowledgeService.instance) {
      CrossProjectKnowledgeService.instance = new CrossProjectKnowledgeService();
    }
    return CrossProjectKnowledgeService.instance;
  }

  extractPatterns(projectId: string, files: FileInput[], qualityScore: number): ExtractedPattern[] {
    if (qualityScore <= 60) {
      this.log("Skipping pattern extraction - quality score too low", { projectId, qualityScore });
      return [];
    }

    const extracted: ExtractedPattern[] = [];

    for (const file of files) {
      const filePatterns = this.scanFileForPatterns(projectId, file, qualityScore);
      for (const pattern of filePatterns) {
        this.patterns.set(pattern.id, pattern);
        extracted.push(pattern);
      }
    }

    this.log("Extracted patterns from project", {
      projectId,
      fileCount: files.length,
      patternCount: extracted.length,
    });

    return extracted;
  }

  findRelevantPatterns(prompt: string, maxResults: number = 5): PatternMatch[] {
    const promptLower = prompt.toLowerCase();
    const promptWords = promptLower.split(/\s+/).filter(w => w.length > 2);
    const matches: PatternMatch[] = [];

    const allPatterns = this.patterns.values();

    for (const pattern of allPatterns) {
      let score = 0;
      const reasons: string[] = [];

      const matchingTags = pattern.tags.filter(tag =>
        promptWords.some(word => tag.toLowerCase().includes(word) || word.includes(tag.toLowerCase()))
      );
      if (matchingTags.length > 0) {
        const tagScore = Math.min(matchingTags.length * 0.3, 0.3);
        score += tagScore;
        reasons.push(`Tags match: ${matchingTags.join(", ")}`);
      }

      const categoryKeywords = CATEGORY_KEYWORDS[pattern.category];
      const categoryMatch = categoryKeywords.some(kw => promptLower.includes(kw));
      if (categoryMatch) {
        score += 0.25;
        reasons.push(`Category "${pattern.category}" matches prompt`);
      }

      const descWords = pattern.description.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const descOverlap = descWords.filter(dw => promptWords.some(pw => dw.includes(pw) || pw.includes(dw)));
      if (descOverlap.length > 0) {
        const descScore = Math.min((descOverlap.length / Math.max(descWords.length, 1)) * 0.2, 0.2);
        score += descScore;
        reasons.push(`Description overlap: ${descOverlap.join(", ")}`);
      }

      const qualityWeight = (pattern.qualityScore / 100) * 0.15;
      const successWeight = pattern.successRate * 0.1;
      score += qualityWeight + successWeight;

      if (score > 0.2) {
        matches.push({
          pattern,
          relevanceScore: Math.round(score * 1000) / 1000,
          reason: reasons.join("; "),
        });
      }
    }

    matches.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return matches.slice(0, maxResults);
  }

  getPatternContext(prompt: string, maxTokens: number = 2000): string {
    const matches = this.findRelevantPatterns(prompt);

    if (matches.length === 0) {
      return "";
    }

    let context = "";
    let estimatedTokens = 0;

    for (const match of matches) {
      const patternBlock =
        `// Pattern: ${match.pattern.name} (${match.pattern.category})\n` +
        `// Description: ${match.pattern.description}\n` +
        `// Tags: ${match.pattern.tags.join(", ")}\n` +
        `${match.pattern.code}\n\n`;

      const blockTokens = Math.ceil(patternBlock.length / 4);

      if (estimatedTokens + blockTokens > maxTokens) {
        break;
      }

      context += patternBlock;
      estimatedTokens += blockTokens;

      const storedPattern = this.patterns.get(match.pattern.id);
      if (storedPattern) {
        storedPattern.usageCount += 1;
        storedPattern.lastUsedAt = Date.now();
        this.patterns.set(storedPattern.id, storedPattern);
      }
    }

    this.log("Generated pattern context", {
      matchCount: matches.length,
      estimatedTokens,
    });

    return context;
  }

  recordPatternOutcome(patternId: string, success: boolean): void {
    const pattern = this.patterns.get(patternId);
    if (!pattern) {
      this.logWarn("Pattern not found for outcome recording", { patternId });
      return;
    }

    pattern.successRate = 0.85 * pattern.successRate + 0.15 * (success ? 1 : 0);
    pattern.lastUsedAt = Date.now();
    this.patterns.set(patternId, pattern);

    this.log("Recorded pattern outcome", {
      patternId,
      success,
      newSuccessRate: pattern.successRate,
    });
  }

  getLibraryStats(): {
    totalPatterns: number;
    categories: Record<string, number>;
    topPatterns: Array<{ name: string; category: string; usageCount: number; successRate: number }>;
    avgQualityScore: number;
  } {
    const allPatterns = this.patterns.values();
    const categories: Record<string, number> = {};
    let totalQuality = 0;

    for (const pattern of allPatterns) {
      categories[pattern.category] = (categories[pattern.category] || 0) + 1;
      totalQuality += pattern.qualityScore;
    }

    const sorted = [...allPatterns].sort((a, b) => b.usageCount - a.usageCount);
    const topPatterns = sorted.slice(0, 10).map(p => ({
      name: p.name,
      category: p.category,
      usageCount: p.usageCount,
      successRate: p.successRate,
    }));

    return {
      totalPatterns: allPatterns.length,
      categories,
      topPatterns,
      avgQualityScore: allPatterns.length > 0 ? Math.round((totalQuality / allPatterns.length) * 100) / 100 : 0,
    };
  }

  searchPatterns(query: string, category?: PatternCategory): ExtractedPattern[] {
    const queryLower = query.toLowerCase();
    const allPatterns = this.patterns.values();

    return allPatterns.filter(pattern => {
      if (category && pattern.category !== category) {
        return false;
      }

      const searchableText = [
        pattern.name,
        pattern.description,
        ...pattern.tags,
        pattern.code,
      ].join(" ").toLowerCase();

      return searchableText.includes(queryLower);
    });
  }

  removePattern(patternId: string): boolean {
    const existed = this.patterns.has(patternId);
    if (existed) {
      this.patterns.delete(patternId);
      this.log("Removed pattern", { patternId });
    }
    return existed;
  }

  destroy(): void {
    this.patterns.clear();
    this.log("Service destroyed");
  }

  private scanFileForPatterns(projectId: string, file: FileInput, qualityScore: number): ExtractedPattern[] {
    const patterns: ExtractedPattern[] = [];
    const lines = file.content.split("\n");
    const content = file.content;

    const hookRegex = /(?:export\s+)?(?:function|const)\s+(use[A-Z]\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = hookRegex.exec(content)) !== null) {
      const codeBlock = this.extractSurroundingCode(lines, this.getLineNumber(content, match.index));
      patterns.push(this.createPattern(
        match[1],
        `Custom React hook: ${match[1]}`,
        "hook",
        codeBlock,
        file,
        projectId,
        qualityScore,
      ));
    }

    const apiRegex = /(?:app|router)\.(get|post|put|delete|patch)\s*\(/g;
    while ((match = apiRegex.exec(content)) !== null) {
      const codeBlock = this.extractSurroundingCode(lines, this.getLineNumber(content, match.index));
      const method = match[1].toUpperCase();
      patterns.push(this.createPattern(
        `${method} Route Handler`,
        `API ${method} route handler pattern`,
        "api",
        codeBlock,
        file,
        projectId,
        qualityScore,
      ));
    }

    const hasUseState = /useState/.test(content);
    const hasJsxReturn = /return.*</.test(content);
    if (hasUseState && hasJsxReturn) {
      const codeBlock = this.extractSurroundingCode(lines, 0, Math.min(lines.length, 100));
      patterns.push(this.createPattern(
        `Stateful Component (${this.getFileName(file.path)})`,
        "React component with state management",
        "component",
        codeBlock,
        file,
        projectId,
        qualityScore,
      ));
    }

    const hasFormHandler = /onSubmit|handleSubmit/.test(content);
    const hasFormElement = /<form|<Form/.test(content);
    if (hasFormHandler && hasFormElement) {
      const codeBlock = this.extractSurroundingCode(lines, 0, Math.min(lines.length, 100));
      patterns.push(this.createPattern(
        `Form Component (${this.getFileName(file.path)})`,
        "Form component with submission handling",
        "form",
        codeBlock,
        file,
        projectId,
        qualityScore,
      ));
    }

    const authRegex = /(?:login|signup|auth|session|jwt|token)/i;
    if (authRegex.test(content)) {
      const codeBlock = this.extractSurroundingCode(lines, 0, Math.min(lines.length, 100));
      patterns.push(this.createPattern(
        `Auth Pattern (${this.getFileName(file.path)})`,
        "Authentication/authorization pattern",
        "auth",
        codeBlock,
        file,
        projectId,
        qualityScore,
      ));
    }

    const dataFetchRegex = /(?:useQuery|useSWR|fetch|axios|useEffect.*fetch)/;
    if (dataFetchRegex.test(content)) {
      const codeBlock = this.extractSurroundingCode(lines, 0, Math.min(lines.length, 100));
      patterns.push(this.createPattern(
        `Data Fetching (${this.getFileName(file.path)})`,
        "Data fetching pattern with async operations",
        "data-fetching",
        codeBlock,
        file,
        projectId,
        qualityScore,
      ));
    }

    const hasJsx = /<[A-Z]|<div|<span|<p /.test(content);
    const utilFuncRegex = /(?:export\s+)?(?:function|const)\s+\w+.*=.*=>/;
    if (utilFuncRegex.test(content) && !hasJsx) {
      const codeBlock = this.extractSurroundingCode(lines, 0, Math.min(lines.length, 100));
      patterns.push(this.createPattern(
        `Utility Functions (${this.getFileName(file.path)})`,
        "Utility/helper functions",
        "utility",
        codeBlock,
        file,
        projectId,
        qualityScore,
      ));
    }

    const hasFlexOrGrid = /<div.*className.*(?:flex|grid)/.test(content);
    const childCount = (content.match(/<[A-Z]\w+/g) || []).length;
    if (hasFlexOrGrid && childCount > 2) {
      const codeBlock = this.extractSurroundingCode(lines, 0, Math.min(lines.length, 100));
      patterns.push(this.createPattern(
        `Layout Component (${this.getFileName(file.path)})`,
        "Layout component with flex/grid structure",
        "layout",
        codeBlock,
        file,
        projectId,
        qualityScore,
      ));
    }

    const middlewareRegex = /(?:export\s+)?(?:async\s+)?function\s+\w+.*req.*res.*next/;
    if (middlewareRegex.test(content)) {
      const codeBlock = this.extractSurroundingCode(lines, 0, Math.min(lines.length, 100));
      patterns.push(this.createPattern(
        `Middleware (${this.getFileName(file.path)})`,
        "Express middleware function",
        "middleware",
        codeBlock,
        file,
        projectId,
        qualityScore,
      ));
    }

    return patterns;
  }

  private createPattern(
    name: string,
    description: string,
    category: PatternCategory,
    code: string,
    file: FileInput,
    projectId: string,
    qualityScore: number,
  ): ExtractedPattern {
    const lines = code.split("\n");
    const importCount = (code.match(/^import\s+/gm) || []).length;
    const lineCount = lines.length;

    let complexity: 'simple' | 'moderate' | 'complex';
    if (lineCount <= 30 && importCount <= 3) {
      complexity = "simple";
    } else if (lineCount <= 70 || importCount <= 6) {
      complexity = "moderate";
    } else {
      complexity = "complex";
    }

    const dependencies = this.extractDependencies(code);
    const tags = this.generateTags(name, description, category, code, file.path);

    return {
      id: `pat_${projectId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      name,
      description,
      category,
      code,
      tags,
      sourceProjectId: projectId,
      qualityScore,
      usageCount: 0,
      successRate: 0.5,
      complexity,
      dependencies,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    };
  }

  private extractSurroundingCode(lines: string[], lineIndex: number, maxEnd?: number): string {
    const start = Math.max(0, lineIndex - 5);
    const end = Math.min(lines.length, maxEnd !== undefined ? maxEnd : lineIndex + 100);
    const codeLines = lines.slice(start, end);

    if (codeLines.length < 30) {
      const expandedStart = Math.max(0, start - 15);
      const expandedEnd = Math.min(lines.length, end + 15);
      return lines.slice(expandedStart, expandedEnd).join("\n");
    }

    if (codeLines.length > 100) {
      return codeLines.slice(0, 100).join("\n");
    }

    return codeLines.join("\n");
  }

  private extractDependencies(code: string): string[] {
    const deps: Set<string> = new Set();
    const importRegex = /import\s+(?:.*?\s+from\s+)?['"]([^'"./][^'"]*)['"]/g;
    let match: RegExpExecArray | null;

    while ((match = importRegex.exec(code)) !== null) {
      const pkg = match[1];
      const basePkg = pkg.startsWith("@") ? pkg.split("/").slice(0, 2).join("/") : pkg.split("/")[0];
      deps.add(basePkg);
    }

    return Array.from(deps);
  }

  private generateTags(name: string, description: string, category: PatternCategory, code: string, filePath: string): string[] {
    const tags: Set<string> = new Set();

    tags.add(category);

    const ext = filePath.split(".").pop() || "";
    if (["tsx", "jsx"].includes(ext)) tags.add("react");
    if (["ts", "tsx"].includes(ext)) tags.add("typescript");

    if (/useState/.test(code)) tags.add("state");
    if (/useEffect/.test(code)) tags.add("effect");
    if (/useContext/.test(code)) tags.add("context");
    if (/useMemo|useCallback/.test(code)) tags.add("optimization");
    if (/async|await|Promise/.test(code)) tags.add("async");
    if (/express|Router/.test(code)) tags.add("express");
    if (/zod|z\./.test(code)) tags.add("validation");
    if (/drizzle|pgTable/.test(code)) tags.add("database");
    if (/tailwind|className/.test(code)) tags.add("tailwind");
    if (/useQuery|useMutation/.test(code)) tags.add("tanstack-query");
    if (/fetch|axios/.test(code)) tags.add("http");

    const nameWords = name.toLowerCase().split(/[\s_-]+/).filter(w => w.length > 2);
    for (const word of nameWords) {
      tags.add(word);
    }

    return Array.from(tags);
  }

  private getLineNumber(content: string, charIndex: number): number {
    return content.substring(0, charIndex).split("\n").length - 1;
  }

  private getFileName(filePath: string): string {
    const parts = filePath.split("/");
    return parts[parts.length - 1] || filePath;
  }
}

export const crossProjectKnowledgeService = CrossProjectKnowledgeService.getInstance();
