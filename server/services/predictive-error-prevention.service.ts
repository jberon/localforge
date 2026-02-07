import { BaseService, ManagedMap } from "../lib/base-service";

interface ErrorRiskPattern {
  id: string;
  name: string;
  description: string;
  promptSignals: RegExp[];
  errorCategory: 'syntax' | 'import' | 'type' | 'jsx' | 'async' | 'runtime' | 'logic' | 'state';
  riskScore: number;
  occurrences: number;
  preventions: number;
  preventionSuccessRate: number;
  scaffolding: string;
  lastSeen: number;
}

interface PromptRiskAssessment {
  overallRisk: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  matchedPatterns: Array<{
    patternId: string;
    patternName: string;
    riskScore: number;
    scaffolding: string;
  }>;
  preventivePrompt: string;
  recommendations: string[];
}

class PredictiveErrorPreventionService extends BaseService {
  private static instance: PredictiveErrorPreventionService;
  private patterns: ManagedMap<string, ErrorRiskPattern>;
  private assessedPrompts: ManagedMap<string, string[]>;
  private totalAssessments: number;
  private totalPreventions: number;

  private constructor() {
    super("PredictiveErrorPreventionService");
    this.patterns = this.createManagedMap<string, ErrorRiskPattern>({ maxSize: 500, strategy: "lru" });
    this.assessedPrompts = this.createManagedMap<string, string[]>({ maxSize: 1000, strategy: "lru" });
    this.totalAssessments = 0;
    this.totalPreventions = 0;
    this.initializeBuiltInPatterns();
  }

  static getInstance(): PredictiveErrorPreventionService {
    if (!PredictiveErrorPreventionService.instance) {
      PredictiveErrorPreventionService.instance = new PredictiveErrorPreventionService();
    }
    return PredictiveErrorPreventionService.instance;
  }

  private initializeBuiltInPatterns(): void {
    const builtInPatterns: Array<Omit<ErrorRiskPattern, 'id' | 'occurrences' | 'preventions' | 'preventionSuccessRate' | 'lastSeen'>> = [
      {
        name: "complex-state-management",
        description: "Complex React state management with multiple useState and useEffect hooks",
        promptSignals: [/useState.*useEffect.*multiple/i, /global state|context.*provider.*nested/i],
        errorCategory: "state",
        riskScore: 0.7,
        scaffolding: "Use a single state object instead of multiple useState calls. Consider useReducer for complex state. Always provide initial values.",
      },
      {
        name: "async-data-fetching",
        description: "Async data fetching patterns within React components",
        promptSignals: [/fetch.*api.*useEffect/i, /async.*await.*component/i],
        errorCategory: "async",
        riskScore: 0.6,
        scaffolding: "Always handle loading and error states. Use try/catch around async operations. Clean up effects with AbortController.",
      },
      {
        name: "form-validation",
        description: "Form validation logic with input handling and error display",
        promptSignals: [/form.*validation.*submit/i, /input.*required.*error/i],
        errorCategory: "logic",
        riskScore: 0.5,
        scaffolding: "Use controlled components. Validate on blur and submit. Show inline error messages.",
      },
      {
        name: "dynamic-imports",
        description: "Dynamic imports, lazy loading, and code splitting patterns",
        promptSignals: [/dynamic.*import|lazy.*load|code.*split/i],
        errorCategory: "import",
        riskScore: 0.65,
        scaffolding: "Wrap lazy components in Suspense with fallback. Handle import failures gracefully.",
      },
      {
        name: "nested-routing",
        description: "Nested or hierarchical routing configurations",
        promptSignals: [/nested.*route|sub.*route|child.*route/i],
        errorCategory: "logic",
        riskScore: 0.5,
        scaffolding: "Define parent routes before child routes. Use Outlet for nested layouts. Ensure route paths are properly prefixed.",
      },
      {
        name: "database-operations",
        description: "ORM and database query operations",
        promptSignals: [/prisma|drizzle|sequelize|typeorm|sql.*query/i],
        errorCategory: "runtime",
        riskScore: 0.6,
        scaffolding: "Always wrap database calls in try/catch. Validate input before queries. Use transactions for multi-step operations.",
      },
      {
        name: "authentication-flow",
        description: "Authentication, login, signup, and session management",
        promptSignals: [/auth.*login.*signup|jwt.*token.*session/i],
        errorCategory: "logic",
        riskScore: 0.7,
        scaffolding: "Store tokens securely, never in localStorage for sensitive apps. Handle token expiration and refresh. Protect routes with auth guards.",
      },
      {
        name: "file-upload",
        description: "File upload handling with multipart form data",
        promptSignals: [/upload.*file|multer|formdata.*file/i],
        errorCategory: "runtime",
        riskScore: 0.65,
        scaffolding: "Validate file type and size on both client and server. Use streaming for large files. Handle upload errors with user feedback.",
      },
      {
        name: "websocket-realtime",
        description: "WebSocket and real-time communication patterns",
        promptSignals: [/websocket|socket\.io|real.*time.*update/i],
        errorCategory: "async",
        riskScore: 0.7,
        scaffolding: "Implement reconnection logic with exponential backoff. Clean up socket connections on unmount. Handle connection state in the UI.",
      },
      {
        name: "css-responsive",
        description: "Responsive design with breakpoints and media queries",
        promptSignals: [/responsive.*breakpoint|media.*query.*mobile/i],
        errorCategory: "logic",
        riskScore: 0.3,
        scaffolding: "Use mobile-first approach with min-width breakpoints. Test at common screen sizes. Avoid fixed pixel widths for containers.",
      },
      {
        name: "third-party-api",
        description: "Integration with third-party APIs and external services",
        promptSignals: [/stripe|twilio|sendgrid|api.*key.*external/i],
        errorCategory: "runtime",
        riskScore: 0.6,
        scaffolding: "Store API keys in environment variables. Implement rate limiting and retry logic. Handle API errors with meaningful user messages.",
      },
      {
        name: "complex-type-system",
        description: "Advanced TypeScript type patterns including generics and conditionals",
        promptSignals: [/generic.*type|union.*type|conditional.*type/i],
        errorCategory: "type",
        riskScore: 0.55,
        scaffolding: "Start with simpler types and compose them. Use utility types like Partial, Pick, and Omit. Add explicit type annotations to avoid inference issues.",
      },
      {
        name: "jsx-conditional-render",
        description: "Conditional rendering patterns in JSX",
        promptSignals: [/conditional.*render|ternary.*jsx|&&.*render/i],
        errorCategory: "jsx",
        riskScore: 0.4,
        scaffolding: "Avoid nested ternaries in JSX. Use early returns for complex conditions. Ensure falsy values like 0 don't accidentally render.",
      },
      {
        name: "multi-file-architecture",
        description: "Multi-file project structure with module splitting",
        promptSignals: [/multiple.*file|split.*component|module.*system/i],
        errorCategory: "import",
        riskScore: 0.5,
        scaffolding: "Use consistent import paths with aliases. Export from index files for cleaner imports. Keep circular dependencies in check.",
      },
      {
        name: "error-boundary",
        description: "Global error handling and error boundary patterns",
        promptSignals: [/error.*handling.*global|catch.*all.*error/i],
        errorCategory: "runtime",
        riskScore: 0.5,
        scaffolding: "Wrap top-level components in error boundaries. Log errors to a monitoring service. Provide user-friendly fallback UI.",
      },
    ];

    for (const pattern of builtInPatterns) {
      const id = `builtin_${pattern.name}`;
      this.patterns.set(id, {
        ...pattern,
        id,
        occurrences: 0,
        preventions: 0,
        preventionSuccessRate: 0,
        lastSeen: Date.now(),
      });
    }

    this.log("Initialized built-in risk patterns", { count: builtInPatterns.length });
  }

  assessRisk(prompt: string, model?: string): PromptRiskAssessment {
    this.totalAssessments++;

    const matchedPatterns: Array<{
      patternId: string;
      patternName: string;
      riskScore: number;
      scaffolding: string;
    }> = [];

    for (const [, pattern] of this.patterns.entries()) {
      const matches = pattern.promptSignals.some(signal => signal.test(prompt));
      if (matches) {
        matchedPatterns.push({
          patternId: pattern.id,
          patternName: pattern.name,
          riskScore: pattern.riskScore,
          scaffolding: pattern.scaffolding,
        });
        pattern.lastSeen = Date.now();
      }
    }

    matchedPatterns.sort((a, b) => b.riskScore - a.riskScore);

    let overallRisk = 0;
    if (matchedPatterns.length > 0) {
      let totalWeight = 0;
      let weightedSum = 0;
      for (let i = 0; i < matchedPatterns.length; i++) {
        const weight = matchedPatterns[i].riskScore;
        weightedSum += matchedPatterns[i].riskScore * weight;
        totalWeight += weight;
      }
      overallRisk = Math.min(1.0, totalWeight > 0 ? weightedSum / totalWeight : 0);
    }

    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (overallRisk < 0.3) {
      riskLevel = 'low';
    } else if (overallRisk < 0.5) {
      riskLevel = 'medium';
    } else if (overallRisk < 0.7) {
      riskLevel = 'high';
    } else {
      riskLevel = 'critical';
    }

    const top5 = matchedPatterns.slice(0, 5);
    const preventivePrompt = top5.length > 0
      ? "## Preventive Guidelines\n" + top5.map(p => `- ${p.scaffolding}`).join("\n")
      : "";

    const recommendations: string[] = [];
    if (riskLevel === 'critical') {
      recommendations.push("This prompt has a very high risk of producing errors. Consider breaking it into smaller tasks.");
      recommendations.push("Review the matched patterns carefully and apply all suggested scaffolding.");
    } else if (riskLevel === 'high') {
      recommendations.push("Several risk patterns detected. Apply the preventive scaffolding to reduce error likelihood.");
      recommendations.push("Consider adding explicit error handling instructions to the prompt.");
    } else if (riskLevel === 'medium') {
      recommendations.push("Some risk patterns detected. Review the scaffolding suggestions for best results.");
    } else {
      recommendations.push("Low risk prompt. Standard code generation should proceed smoothly.");
    }

    if (model) {
      this.log("Risk assessment completed", {
        model,
        riskLevel,
        overallRisk: Math.round(overallRisk * 100) / 100,
        matchedCount: matchedPatterns.length,
      });
    }

    const promptKey = this.hashPrompt(prompt);
    this.assessedPrompts.set(promptKey, matchedPatterns.map(p => p.patternId));

    if (matchedPatterns.length > 0) {
      this.totalPreventions++;
    }

    return {
      overallRisk,
      riskLevel,
      matchedPatterns,
      preventivePrompt,
      recommendations,
    };
  }

  recordOutcome(prompt: string, errorCategory: string, errorCount: number, model?: string): void {
    const promptKey = this.hashPrompt(prompt);
    const previouslyMatched = this.assessedPrompts.get(promptKey);

    for (const [, pattern] of this.patterns.entries()) {
      const matches = pattern.promptSignals.some(signal => signal.test(prompt));
      if (matches) {
        pattern.riskScore = 0.8 * pattern.riskScore + 0.2 * (errorCount > 0 ? 1 : 0);
        pattern.occurrences++;
        pattern.lastSeen = Date.now();

        if (previouslyMatched && previouslyMatched.includes(pattern.id)) {
          if (errorCount === 0) {
            pattern.preventions++;
          }
          const totalOutcomes = pattern.preventions + (pattern.occurrences - pattern.preventions);
          pattern.preventionSuccessRate = totalOutcomes > 0 ? pattern.preventions / totalOutcomes : 0;
        }
      }
    }

    this.log("Outcome recorded", {
      errorCategory,
      errorCount,
      model,
      hadPreviousAssessment: !!previouslyMatched,
    });
  }

  learnNewPattern(name: string, promptExample: string, errorCategory: string, scaffolding: string): string {
    const id = `learned_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const phrases = this.extractKeyPhrases(promptExample);
    const signals: RegExp[] = phrases.map(phrase => new RegExp(phrase, "i"));

    const validCategory = this.validateCategory(errorCategory);

    const pattern: ErrorRiskPattern = {
      id,
      name,
      description: `Learned pattern: ${name}`,
      promptSignals: signals,
      errorCategory: validCategory,
      riskScore: 0.5,
      occurrences: 0,
      preventions: 0,
      preventionSuccessRate: 0,
      scaffolding,
      lastSeen: Date.now(),
    };

    this.patterns.set(id, pattern);
    this.log("New pattern learned", { id, name, signalCount: signals.length });

    return id;
  }

  getPreventivePrompt(prompt: string): string {
    const assessment = this.assessRisk(prompt);
    if (assessment.riskLevel === 'low') {
      return "";
    }
    return assessment.preventivePrompt;
  }

  getStats(): {
    totalPatterns: number;
    learnedPatterns: number;
    totalAssessments: number;
    preventionRate: number;
    topRisks: Array<{ name: string; riskScore: number; occurrences: number }>;
  } {
    const allPatterns = this.patterns.values();
    const learnedPatterns = allPatterns.filter(p => p.id.startsWith("learned_")).length;

    const topRisks = allPatterns
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10)
      .map(p => ({
        name: p.name,
        riskScore: Math.round(p.riskScore * 100) / 100,
        occurrences: p.occurrences,
      }));

    const preventionRate = this.totalAssessments > 0
      ? this.totalPreventions / this.totalAssessments
      : 0;

    return {
      totalPatterns: this.patterns.size,
      learnedPatterns,
      totalAssessments: this.totalAssessments,
      preventionRate: Math.round(preventionRate * 100) / 100,
      topRisks,
    };
  }

  destroy(): void {
    this.patterns.clear();
    this.assessedPrompts.clear();
    this.totalAssessments = 0;
    this.totalPreventions = 0;
    this.log("PredictiveErrorPreventionService shut down");
  }

  private hashPrompt(prompt: string): string {
    let hash = 0;
    for (let i = 0; i < prompt.length; i++) {
      const char = prompt.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `prompt_${hash}`;
  }

  private extractKeyPhrases(text: string): string[] {
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const stopWords = new Set(["with", "that", "this", "from", "have", "been", "will", "would", "could", "should", "they", "them", "their", "what", "when", "where", "which", "there", "these", "those", "about", "into", "through", "during", "before", "after", "above", "below", "between"]);
    const meaningful = words.filter(w => !stopWords.has(w));

    const phrases: string[] = [];
    if (meaningful.length >= 4) {
      for (let i = 0; i < Math.min(meaningful.length - 1, 3); i++) {
        phrases.push(`${meaningful[i]}.*${meaningful[i + 1]}`);
      }
    } else if (meaningful.length > 0) {
      phrases.push(meaningful.join(".*"));
    }

    if (phrases.length === 0) {
      const fallback = text.substring(0, 50).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      phrases.push(fallback);
    }

    return phrases;
  }

  private validateCategory(category: string): ErrorRiskPattern['errorCategory'] {
    const valid: ErrorRiskPattern['errorCategory'][] = ['syntax', 'import', 'type', 'jsx', 'async', 'runtime', 'logic', 'state'];
    if (valid.includes(category as ErrorRiskPattern['errorCategory'])) {
      return category as ErrorRiskPattern['errorCategory'];
    }
    return 'runtime';
  }
}

export const predictiveErrorPreventionService = PredictiveErrorPreventionService.getInstance();
