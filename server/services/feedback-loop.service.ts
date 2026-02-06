import { logger } from "../lib/logger";

interface FeedbackEntry {
  id: string;
  projectId: string;
  generationId: string;
  rating: "positive" | "negative" | "neutral";
  originalPrompt: string;
  generatedCode: string;
  userComment?: string;
  timestamp: number;
  categories: string[];
  resolved: boolean;
}

interface PromptRefinement {
  trigger: string;
  refinement: string;
  confidence: number;
  successRate: number;
  appliedCount: number;
}

interface FeedbackStats {
  totalFeedback: number;
  positiveRate: number;
  negativeRate: number;
  commonIssues: Array<{ issue: string; count: number }>;
  improvementTrend: "improving" | "stable" | "declining";
  refinementsApplied: number;
}

interface GenerationContext {
  prompt: string;
  model: string;
  temperature: number;
  features: string[];
}

class FeedbackLoopService {
  private static instance: FeedbackLoopService;
  private readonly MAX_FEEDBACK_PER_PROJECT = 200;
  private readonly MAX_ISSUE_PATTERNS = 500;
  private feedback: Map<string, FeedbackEntry[]> = new Map();
  private refinements: PromptRefinement[] = [];
  private issuePatterns: Map<string, number> = new Map();

  private constructor() {
    this.initializeDefaultRefinements();
  }

  static getInstance(): FeedbackLoopService {
    if (!FeedbackLoopService.instance) {
      FeedbackLoopService.instance = new FeedbackLoopService();
    }
    return FeedbackLoopService.instance;
  }

  private initializeDefaultRefinements(): void {
    this.refinements = [
      {
        trigger: "type error",
        refinement: "Ensure all TypeScript types are properly defined. Use explicit type annotations.",
        confidence: 0.8,
        successRate: 0.75,
        appliedCount: 0
      },
      {
        trigger: "missing import",
        refinement: "Include all necessary imports at the top of the file.",
        confidence: 0.9,
        successRate: 0.85,
        appliedCount: 0
      },
      {
        trigger: "undefined variable",
        refinement: "Define all variables before use. Check for typos in variable names.",
        confidence: 0.85,
        successRate: 0.8,
        appliedCount: 0
      },
      {
        trigger: "styling issue",
        refinement: "Use consistent styling approach. Apply Tailwind classes for styling.",
        confidence: 0.7,
        successRate: 0.65,
        appliedCount: 0
      },
      {
        trigger: "accessibility",
        refinement: "Include alt text for images, aria labels for buttons, and proper heading structure.",
        confidence: 0.8,
        successRate: 0.7,
        appliedCount: 0
      },
      {
        trigger: "performance",
        refinement: "Use React.memo for expensive components. Implement useMemo/useCallback where appropriate.",
        confidence: 0.75,
        successRate: 0.6,
        appliedCount: 0
      }
    ];
  }

  recordFeedback(
    projectId: string,
    generationId: string,
    rating: "positive" | "negative" | "neutral",
    originalPrompt: string,
    generatedCode: string,
    userComment?: string
  ): FeedbackEntry {
    const categories = this.categorizeIssues(userComment || "", generatedCode);
    
    const entry: FeedbackEntry = {
      id: `fb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      projectId,
      generationId,
      rating,
      originalPrompt,
      generatedCode,
      userComment,
      timestamp: Date.now(),
      categories,
      resolved: false
    };

    const projectFeedback = this.feedback.get(projectId) || [];
    projectFeedback.push(entry);
    this.feedback.set(projectId, projectFeedback);
    this.evictFeedbackIfNeeded(projectId);

    if (rating === "negative") {
      this.learnFromNegativeFeedback(entry);
    }

    logger.info("Feedback recorded", { projectId, generationId, rating, categories });
    return entry;
  }

  private categorizeIssues(comment: string, code: string): string[] {
    const categories: string[] = [];
    const lowerComment = comment.toLowerCase();
    const lowerCode = code.toLowerCase();

    if (lowerComment.includes("type") || lowerComment.includes("typescript")) {
      categories.push("type-issues");
    }
    if (lowerComment.includes("import") || lowerComment.includes("undefined")) {
      categories.push("import-issues");
    }
    if (lowerComment.includes("style") || lowerComment.includes("css") || lowerComment.includes("tailwind")) {
      categories.push("styling-issues");
    }
    if (lowerComment.includes("slow") || lowerComment.includes("performance")) {
      categories.push("performance-issues");
    }
    if (lowerComment.includes("accessible") || lowerComment.includes("a11y")) {
      categories.push("accessibility-issues");
    }
    if (lowerComment.includes("wrong") || lowerComment.includes("incorrect")) {
      categories.push("logic-issues");
    }
    if (lowerComment.includes("incomplete") || lowerComment.includes("missing")) {
      categories.push("incomplete-generation");
    }

    if (categories.length === 0) {
      categories.push("general");
    }

    return categories;
  }

  private learnFromNegativeFeedback(entry: FeedbackEntry): void {
    for (const category of entry.categories) {
      const count = this.issuePatterns.get(category) || 0;
      this.issuePatterns.set(category, count + 1);
      this.evictIssuePatternsIfNeeded();

      const relevantRefinement = this.refinements.find(r => 
        entry.userComment?.toLowerCase().includes(r.trigger) ||
        category.includes(r.trigger.split(" ")[0])
      );

      if (relevantRefinement) {
        relevantRefinement.appliedCount++;
        if (entry.resolved) {
          relevantRefinement.successRate = 
            (relevantRefinement.successRate * (relevantRefinement.appliedCount - 1) + 1) / 
            relevantRefinement.appliedCount;
        }
      }
    }
  }

  refinePrompt(prompt: string, context: GenerationContext): string {
    const projectFeedback = Array.from(this.feedback.values()).flat();
    const recentNegative = projectFeedback
      .filter(f => f.rating === "negative" && Date.now() - f.timestamp < 7 * 24 * 60 * 60 * 1000)
      .slice(-10);

    if (recentNegative.length === 0) {
      return prompt;
    }

    const commonCategories = new Map<string, number>();
    for (const fb of recentNegative) {
      for (const cat of fb.categories) {
        commonCategories.set(cat, (commonCategories.get(cat) || 0) + 1);
      }
    }

    const topIssues = Array.from(commonCategories.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat]) => cat);

    const applicableRefinements = this.refinements
      .filter(r => topIssues.some(issue => issue.includes(r.trigger.split(" ")[0])))
      .filter(r => r.confidence > 0.6)
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, 3);

    if (applicableRefinements.length === 0) {
      return prompt;
    }

    const refinementText = applicableRefinements
      .map(r => r.refinement)
      .join(" ");

    logger.info("Prompt refined based on feedback", { 
      refinementsApplied: applicableRefinements.length,
      topIssues 
    });

    return `${prompt}\n\nIMPORTANT: ${refinementText}`;
  }

  getStats(projectId?: string): FeedbackStats {
    const allFeedback = projectId 
      ? this.feedback.get(projectId) || []
      : Array.from(this.feedback.values()).flat();

    const total = allFeedback.length;
    const positive = allFeedback.filter(f => f.rating === "positive").length;
    const negative = allFeedback.filter(f => f.rating === "negative").length;

    const issueCounts = Array.from(this.issuePatterns.entries())
      .map(([issue, count]) => ({ issue, count }))
      .sort((a, b) => b.count - a.count);

    const recentFeedback = allFeedback.slice(-20);
    const olderFeedback = allFeedback.slice(-40, -20);
    
    let trend: "improving" | "stable" | "declining" = "stable";
    if (recentFeedback.length >= 5 && olderFeedback.length >= 5) {
      const recentPositiveRate = recentFeedback.filter(f => f.rating === "positive").length / recentFeedback.length;
      const olderPositiveRate = olderFeedback.filter(f => f.rating === "positive").length / olderFeedback.length;
      
      if (recentPositiveRate > olderPositiveRate + 0.1) trend = "improving";
      else if (recentPositiveRate < olderPositiveRate - 0.1) trend = "declining";
    }

    return {
      totalFeedback: total,
      positiveRate: total > 0 ? positive / total : 0,
      negativeRate: total > 0 ? negative / total : 0,
      commonIssues: issueCounts.slice(0, 10),
      improvementTrend: trend,
      refinementsApplied: this.refinements.reduce((sum, r) => sum + r.appliedCount, 0)
    };
  }

  markResolved(feedbackId: string): boolean {
    for (const [projectId, entries] of Array.from(this.feedback.entries())) {
      const entry = entries.find(e => e.id === feedbackId);
      if (entry) {
        entry.resolved = true;
        this.learnFromNegativeFeedback(entry);
        logger.info("Feedback marked as resolved", { feedbackId, projectId });
        return true;
      }
    }
    return false;
  }

  addCustomRefinement(trigger: string, refinement: string): void {
    this.refinements.push({
      trigger,
      refinement,
      confidence: 0.5,
      successRate: 0,
      appliedCount: 0
    });
    logger.info("Custom refinement added", { trigger });
  }

  private evictFeedbackIfNeeded(projectId: string): void {
    const entries = this.feedback.get(projectId);
    if (entries && entries.length > this.MAX_FEEDBACK_PER_PROJECT) {
      this.feedback.set(projectId, entries.slice(-this.MAX_FEEDBACK_PER_PROJECT));
    }
  }

  private evictIssuePatternsIfNeeded(): void {
    if (this.issuePatterns.size > this.MAX_ISSUE_PATTERNS) {
      const sorted = Array.from(this.issuePatterns.entries())
        .sort((a, b) => a[1] - b[1]);
      const toRemove = sorted.slice(0, this.issuePatterns.size - this.MAX_ISSUE_PATTERNS);
      for (const [key] of toRemove) {
        this.issuePatterns.delete(key);
      }
    }
  }

  destroy(): void {
    this.feedback.clear();
    this.issuePatterns.clear();
    this.refinements = [];
  }

  clearFeedback(projectId: string): void {
    this.feedback.delete(projectId);
    logger.info("Feedback cleared", { projectId });
  }
}

export const feedbackLoopService = FeedbackLoopService.getInstance();
