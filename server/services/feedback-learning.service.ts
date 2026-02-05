import logger from "../lib/logger";

export interface FeedbackEntry {
  id: string;
  projectId: string;
  timestamp: Date;
  type: "correction" | "refinement" | "rejection" | "approval";
  originalContent: string;
  feedbackContent: string;
  appliedChange?: string;
  category: "code_style" | "architecture" | "naming" | "logic" | "ux" | "performance" | "other";
  learned: boolean;
}

export interface LearnedPattern {
  id: string;
  category: FeedbackEntry["category"];
  pattern: string;
  replacement?: string;
  frequency: number;
  confidence: number;
  examples: string[];
  lastApplied: Date;
}

export interface LearningStats {
  totalFeedback: number;
  learnedPatterns: number;
  applicationRate: number;
  topCategories: Array<{ category: string; count: number }>;
}

class FeedbackLearningService {
  private static instance: FeedbackLearningService;
  private feedback: Map<string, FeedbackEntry[]> = new Map();
  private patterns: Map<string, LearnedPattern> = new Map();
  private globalPatterns: LearnedPattern[] = [];

  private constructor() {
    logger.info("FeedbackLearningService initialized");
  }

  static getInstance(): FeedbackLearningService {
    if (!FeedbackLearningService.instance) {
      FeedbackLearningService.instance = new FeedbackLearningService();
    }
    return FeedbackLearningService.instance;
  }

  recordFeedback(
    projectId: string,
    type: FeedbackEntry["type"],
    originalContent: string,
    feedbackContent: string,
    appliedChange?: string
  ): FeedbackEntry {
    const entry: FeedbackEntry = {
      id: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      projectId,
      timestamp: new Date(),
      type,
      originalContent,
      feedbackContent,
      appliedChange,
      category: this.categorizeFromFeedback(feedbackContent),
      learned: false
    };

    const projectFeedback = this.feedback.get(projectId) || [];
    projectFeedback.push(entry);
    this.feedback.set(projectId, projectFeedback);

    this.attemptPatternExtraction(entry);

    logger.info("Feedback recorded", {
      projectId,
      type,
      category: entry.category,
      id: entry.id
    });

    return entry;
  }

  private categorizeFromFeedback(feedback: string): FeedbackEntry["category"] {
    const lowerFeedback = feedback.toLowerCase();

    if (lowerFeedback.match(/\b(style|format|indent|spacing|naming convention)\b/)) {
      return "code_style";
    }
    if (lowerFeedback.match(/\b(name|rename|variable|function name|component name)\b/)) {
      return "naming";
    }
    if (lowerFeedback.match(/\b(architecture|structure|organize|module|separation|component)\b/)) {
      return "architecture";
    }
    if (lowerFeedback.match(/\b(logic|bug|error|fix|wrong|incorrect|should|actually)\b/)) {
      return "logic";
    }
    if (lowerFeedback.match(/\b(ui|ux|user|interface|button|layout|design|look)\b/)) {
      return "ux";
    }
    if (lowerFeedback.match(/\b(slow|performance|optimize|fast|speed|memory)\b/)) {
      return "performance";
    }

    return "other";
  }

  private attemptPatternExtraction(entry: FeedbackEntry): void {
    if (entry.type !== "correction" && entry.type !== "refinement") {
      return;
    }

    if (!entry.appliedChange) {
      return;
    }

    const pattern = this.extractPattern(entry.originalContent, entry.appliedChange, entry.feedbackContent);
    
    if (pattern) {
      const existingPattern = this.findSimilarPattern(pattern);
      
      if (existingPattern) {
        existingPattern.frequency++;
        existingPattern.confidence = Math.min(1, existingPattern.confidence + 0.1);
        if (!existingPattern.examples.includes(entry.originalContent.slice(0, 200))) {
          existingPattern.examples.push(entry.originalContent.slice(0, 200));
          existingPattern.examples = existingPattern.examples.slice(-5);
        }
        existingPattern.lastApplied = new Date();
        this.patterns.set(existingPattern.id, existingPattern);
      } else {
        const newPattern: LearnedPattern = {
          id: `pattern_${Date.now()}`,
          category: entry.category,
          pattern: pattern.pattern,
          replacement: pattern.replacement,
          frequency: 1,
          confidence: 0.3,
          examples: [entry.originalContent.slice(0, 200)],
          lastApplied: new Date()
        };
        this.patterns.set(newPattern.id, newPattern);

        if (newPattern.frequency >= 3 && newPattern.confidence >= 0.6) {
          this.globalPatterns.push(newPattern);
        }
      }

      entry.learned = true;
    }
  }

  private extractPattern(
    original: string,
    changed: string,
    feedback: string
  ): { pattern: string; replacement?: string } | null {
    const originalLines = original.split('\n');
    const changedLines = changed.split('\n');

    const differences: Array<{ original: string; changed: string }> = [];
    
    for (let i = 0; i < Math.min(originalLines.length, changedLines.length); i++) {
      if (originalLines[i] !== changedLines[i]) {
        differences.push({
          original: originalLines[i],
          changed: changedLines[i]
        });
      }
    }

    if (differences.length === 0 || differences.length > 5) {
      return null;
    }

    const firstDiff = differences[0];
    
    const arrowPattern = /=>\s*{?\s*([^}]*)\s*}?/;
    if (arrowPattern.test(firstDiff.original) !== arrowPattern.test(firstDiff.changed)) {
      return {
        pattern: "arrow_function_style",
        replacement: arrowPattern.test(firstDiff.changed) ? "arrow" : "traditional"
      };
    }

    const namingPattern = /\b(const|let|var|function)\s+(\w+)/;
    const origMatch = firstDiff.original.match(namingPattern);
    const changedMatch = firstDiff.changed.match(namingPattern);
    if (origMatch && changedMatch && origMatch[1] === changedMatch[1]) {
      const origName = origMatch[2];
      const newName = changedMatch[2];
      
      if (origName.includes('_') && !newName.includes('_')) {
        return { pattern: "camelCase_preferred" };
      }
      if (!origName.includes('_') && newName.includes('_')) {
        return { pattern: "snake_case_preferred" };
      }
    }

    return {
      pattern: `custom_${feedback.slice(0, 30).replace(/\s+/g, '_')}`,
      replacement: firstDiff.changed.slice(0, 100)
    };
  }

  private findSimilarPattern(pattern: { pattern: string }): LearnedPattern | null {
    const patterns = Array.from(this.patterns.values());
    return patterns.find(p => p.pattern === pattern.pattern) || null;
  }

  getProjectPatterns(projectId: string): LearnedPattern[] {
    const projectFeedback = this.feedback.get(projectId) || [];
    const patternIds = new Set<string>();

    for (const entry of projectFeedback) {
      if (entry.learned) {
        const patterns = Array.from(this.patterns.entries());
        for (const [id, pattern] of patterns) {
          if (pattern.category === entry.category) {
            patternIds.add(id);
          }
        }
      }
    }

    return Array.from(patternIds)
      .map(id => this.patterns.get(id))
      .filter((p): p is LearnedPattern => p !== undefined)
      .concat(this.globalPatterns);
  }

  getHighConfidencePatterns(minConfidence: number = 0.7): LearnedPattern[] {
    return Array.from(this.patterns.values())
      .filter(p => p.confidence >= minConfidence)
      .sort((a, b) => b.confidence - a.confidence);
  }

  formatPatternsForPrompt(patterns: LearnedPattern[]): string {
    if (patterns.length === 0) {
      return "";
    }

    const lines: string[] = [];
    lines.push("## Learned User Preferences\n");

    const byCategory = new Map<string, LearnedPattern[]>();
    for (const p of patterns) {
      const existing = byCategory.get(p.category) || [];
      existing.push(p);
      byCategory.set(p.category, existing);
    }

    const entries = Array.from(byCategory.entries());
    for (const [category, catPatterns] of entries) {
      lines.push(`\n### ${category.replace('_', ' ').toUpperCase()}`);
      for (const p of catPatterns.slice(0, 3)) {
        lines.push(`- ${p.pattern}: ${p.replacement || 'preferred'} (${Math.round(p.confidence * 100)}% confident)`);
      }
    }

    return lines.join('\n');
  }

  getProjectFeedback(projectId: string): FeedbackEntry[] {
    return this.feedback.get(projectId) || [];
  }

  clearProjectFeedback(projectId: string): void {
    this.feedback.delete(projectId);
    logger.info("Project feedback cleared", { projectId });
  }

  getStats(): LearningStats {
    let totalFeedback = 0;
    const categoryCounts = new Map<string, number>();

    const feedbackEntries = Array.from(this.feedback.values());
    for (const entries of feedbackEntries) {
      totalFeedback += entries.length;
      for (const entry of entries) {
        categoryCounts.set(entry.category, (categoryCounts.get(entry.category) || 0) + 1);
      }
    }

    const patterns = Array.from(this.patterns.values());
    const learnedPatterns = patterns.length;

    const appliedCount = patterns.filter(p => p.frequency > 1).length;
    const applicationRate = learnedPatterns > 0 ? appliedCount / learnedPatterns : 0;

    const categoryEntries = Array.from(categoryCounts.entries());
    const topCategories = categoryEntries
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, count]) => ({ category, count }));

    return {
      totalFeedback,
      learnedPatterns,
      applicationRate: Math.round(applicationRate * 100) / 100,
      topCategories
    };
  }

  recordSuccessfulGeneration(projectId: string, generatedCode: string): void {
    const patterns = this.getProjectPatterns(projectId);
    
    for (const pattern of patterns) {
      if (this.codeMatchesPattern(generatedCode, pattern)) {
        pattern.frequency++;
        pattern.confidence = Math.min(1, pattern.confidence + 0.05);
        pattern.lastApplied = new Date();
        this.patterns.set(pattern.id, pattern);
      }
    }
  }

  private codeMatchesPattern(code: string, pattern: LearnedPattern): boolean {
    switch (pattern.pattern) {
      case "camelCase_preferred":
        return !code.match(/\b[a-z]+_[a-z]+\b/);
      case "snake_case_preferred":
        return !!code.match(/\b[a-z]+_[a-z]+\b/);
      case "arrow_function_style":
        return pattern.replacement === "arrow" 
          ? code.includes("=>")
          : code.includes("function ");
      default:
        return false;
    }
  }
}

export const feedbackLearningService = FeedbackLearningService.getInstance();
