import { BaseService, ManagedMap } from "../lib/base-service";

interface ErrorPattern {
  id: string;
  pattern: string;
  regex: RegExp;
  category: "syntax" | "type" | "runtime" | "logic" | "import" | "jsx" | "async";
  frequency: number;
  lastSeen: Date;
  prevention: string;
  autoFix?: string;
  modelFamily?: string;
}

interface ErrorOccurrence {
  errorMessage: string;
  code: string;
  filePath?: string;
  timestamp: Date;
  wasFixed: boolean;
  fixApplied?: string;
  modelUsed?: string;
}

interface LearningInsight {
  category: string;
  commonPatterns: string[];
  preventionTips: string[];
  modelSpecificIssues: Map<string, string[]>;
}

class ErrorLearningService extends BaseService {
  private static instance: ErrorLearningService;
  private errorPatterns: ManagedMap<string, ErrorPattern>;
  private errorHistory: ErrorOccurrence[];
  private maxHistorySize: number = 500;
  private modelErrorTracking: ManagedMap<string, { errors: number; fixed: number; patterns: Map<string, number> }>;
  private fixSuccessTracking: ManagedMap<string, { attempts: number; successes: number }>;

  private constructor() {
    super("ErrorLearningService");
    this.errorPatterns = this.createManagedMap<string, ErrorPattern>({ maxSize: 500, strategy: "lru" });
    this.errorHistory = [];
    this.modelErrorTracking = this.createManagedMap<string, { errors: number; fixed: number; patterns: Map<string, number> }>({ maxSize: 200, strategy: "lru" });
    this.fixSuccessTracking = this.createManagedMap<string, { attempts: number; successes: number }>({ maxSize: 200, strategy: "lru" });
    this.initializeCommonPatterns();
  }

  static getInstance(): ErrorLearningService {
    if (!ErrorLearningService.instance) {
      ErrorLearningService.instance = new ErrorLearningService();
    }
    return ErrorLearningService.instance;
  }

  private initializeCommonPatterns(): void {
    const patterns: Omit<ErrorPattern, "id" | "frequency" | "lastSeen">[] = [
      {
        pattern: "Missing semicolon",
        regex: /Missing semicolon|Expected.*';'/i,
        category: "syntax",
        prevention: "Always end statements with semicolons. Use 'semi: true' in your code style.",
        autoFix: "Add semicolon at end of line",
      },
      {
        pattern: "Unclosed bracket",
        regex: /Unexpected token|Expected.*[}\])]/i,
        category: "syntax",
        prevention: "Ensure all opening brackets have matching closing brackets. Use an editor with bracket matching.",
        autoFix: "Add missing closing bracket",
      },
      {
        pattern: "Type mismatch",
        regex: /Type '.*' is not assignable to type/i,
        category: "type",
        prevention: "Define explicit types for function parameters and return values. Avoid using 'any'.",
      },
      {
        pattern: "Missing import",
        regex: /Cannot find module|Cannot find name '(\w+)'/i,
        category: "import",
        prevention: "Import all dependencies at the top of the file. Check spelling of imported names.",
        autoFix: "Add import statement for missing module",
      },
      {
        pattern: "Duplicate declaration",
        regex: /Duplicate identifier|has already been declared/i,
        category: "syntax",
        prevention: "Use unique names for variables and functions. Check for conflicting imports.",
      },
      {
        pattern: "JSX expression error",
        regex: /JSX expressions must have one parent element/i,
        category: "jsx",
        prevention: "Wrap multiple JSX elements in a parent <div> or <Fragment>.",
        autoFix: "Wrap elements in React.Fragment",
      },
      {
        pattern: "Missing key prop",
        regex: /Each child in a list should have a unique "key" prop/i,
        category: "jsx",
        prevention: "Always provide a unique 'key' prop when rendering lists with .map().",
        autoFix: "Add key prop using index or unique id",
      },
      {
        pattern: "Async/await misuse",
        regex: /await is only valid in async function|Promise returned.*ignored/i,
        category: "async",
        prevention: "Mark functions as 'async' when using 'await'. Always handle Promise rejections.",
        autoFix: "Add async keyword to function",
      },
      {
        pattern: "Undefined variable",
        regex: /(\w+) is not defined|Cannot read propert.*undefined/i,
        category: "runtime",
        prevention: "Initialize variables before use. Add null checks for optional properties.",
        autoFix: "Add variable declaration or null check",
      },
      {
        pattern: "Invalid hook call",
        regex: /Invalid hook call|Hooks can only be called inside/i,
        category: "logic",
        prevention: "Only call hooks at the top level of React function components. Don't call hooks inside loops or conditions.",
      },
      {
        pattern: "Export/import mismatch",
        regex: /does not provide an export named|Module.*has no exported member/i,
        category: "import",
        prevention: "Match import names exactly with export names. Use 'export default' for single exports.",
        autoFix: "Fix export/import statement",
      },
      {
        pattern: "TypeScript strict mode",
        regex: /Object is possibly 'null'|Object is possibly 'undefined'/i,
        category: "type",
        prevention: "Use optional chaining (?.) and nullish coalescing (??) operators. Add type guards.",
        autoFix: "Add null check or optional chaining",
      },
      {
        pattern: "React state mutation",
        regex: /Do not mutate state directly|Cannot assign to.*because it is a read-only/i,
        category: "logic",
        prevention: "Never mutate state directly. Use setState or the spread operator to create new state objects.",
      },
      {
        pattern: "Missing return statement",
        regex: /A function whose declared type is.*must return a value/i,
        category: "type",
        prevention: "Ensure all code paths return a value for non-void functions.",
        autoFix: "Add return statement",
      },
      {
        pattern: "Circular dependency",
        regex: /Circular dependency|Cannot access.*before initialization/i,
        category: "import",
        prevention: "Restructure code to avoid circular imports. Move shared code to a separate module.",
      },
    ];

    for (const p of patterns) {
      const id = `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.errorPatterns.set(id, {
        ...p,
        id,
        frequency: 0,
        lastSeen: new Date(),
      });
    }
  }

  recordError(occurrence: Omit<ErrorOccurrence, "timestamp">): void {
    const record: ErrorOccurrence = {
      ...occurrence,
      timestamp: new Date(),
    };

    this.errorHistory.push(record);
    
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }

    const matchedPatternId = this.findMatchingPatternId(occurrence.errorMessage);

    Array.from(this.errorPatterns.values()).forEach((pattern) => {
      if (pattern.regex.test(occurrence.errorMessage)) {
        pattern.frequency++;
        pattern.lastSeen = new Date();
        
        this.log("Error pattern matched", {
          pattern: pattern.pattern,
          frequency: pattern.frequency,
          model: occurrence.modelUsed,
        });
      }
    });

    if (occurrence.modelUsed) {
      const model = occurrence.modelUsed;
      if (!this.modelErrorTracking.has(model)) {
        this.modelErrorTracking.set(model, { errors: 0, fixed: 0, patterns: new Map() });
      }
      const tracking = this.modelErrorTracking.get(model)!;
      tracking.errors++;
      if (occurrence.wasFixed) {
        tracking.fixed++;
      }
      if (matchedPatternId) {
        const patternCount = tracking.patterns.get(matchedPatternId) || 0;
        tracking.patterns.set(matchedPatternId, patternCount + 1);
      }
    }

    if (matchedPatternId) {
      const key = matchedPatternId;
      if (!this.fixSuccessTracking.has(key)) {
        this.fixSuccessTracking.set(key, { attempts: 0, successes: 0 });
      }
      const tracking = this.fixSuccessTracking.get(key)!;
      tracking.attempts++;
      if (occurrence.wasFixed) {
        tracking.successes++;
      }
    }

    this.learnNewPattern({ ...occurrence, timestamp: new Date() });
  }

  private findMatchingPatternId(errorMessage: string): string | null {
    const patterns = Array.from(this.errorPatterns.entries());
    for (const [id, pattern] of patterns) {
      if (pattern.regex.test(errorMessage)) {
        return id;
      }
    }
    return null;
  }

  private learnNewPattern(occurrence: ErrorOccurrence): void {
    let matched = false;
    const patterns = Array.from(this.errorPatterns.values());
    for (let i = 0; i < patterns.length; i++) {
      if (patterns[i].regex.test(occurrence.errorMessage)) {
        matched = true;
        break;
      }
    }

    if (!matched && occurrence.errorMessage.length > 10) {
      const similarErrors = this.errorHistory.filter(e => 
        this.calculateSimilarity(e.errorMessage, occurrence.errorMessage) > 0.7
      );

      if (similarErrors.length >= 3) {
        const newPattern = this.extractPattern(occurrence.errorMessage);
        if (newPattern) {
          const id = `learned_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          this.errorPatterns.set(id, {
            id,
            pattern: newPattern.pattern,
            regex: new RegExp(newPattern.regex, "i"),
            category: this.inferCategory(occurrence.errorMessage),
            frequency: similarErrors.length,
            lastSeen: new Date(),
            prevention: `This error has occurred ${similarErrors.length} times. Consider reviewing the related code patterns.`,
            modelFamily: occurrence.modelUsed,
          });

          this.log("New error pattern learned", { 
            pattern: newPattern.pattern,
            occurrences: similarErrors.length,
          });
        }
      }
    }
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const words1 = new Set(str1.toLowerCase().split(/\W+/));
    const words2 = new Set(str2.toLowerCase().split(/\W+/));
    
    const arr1 = Array.from(words1);
    const arr2 = Array.from(words2);
    const intersection = new Set(arr1.filter(x => words2.has(x)));
    const union = new Set([...arr1, ...arr2]);
    
    return intersection.size / union.size;
  }

  private extractPattern(errorMessage: string): { pattern: string; regex: string } | null {
    const cleaned = errorMessage
      .replace(/['"`][^'"`]*['"`]/g, "'...'")
      .replace(/\b\d+\b/g, "N")
      .replace(/\b[A-Z][a-z]+[A-Z]\w*/g, "ClassName")
      .trim();

    if (cleaned.length < 10) return null;

    const regex = cleaned
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\\.\\.\\.'/g, "'[^']*'")
      .replace(/N/g, "\\d+")
      .replace(/ClassName/g, "\\w+");

    return { pattern: cleaned, regex };
  }

  private inferCategory(errorMessage: string): ErrorPattern["category"] {
    const lower = errorMessage.toLowerCase();
    
    if (lower.includes("type") || lower.includes("assignable")) return "type";
    if (lower.includes("import") || lower.includes("module") || lower.includes("export")) return "import";
    if (lower.includes("jsx") || lower.includes("react")) return "jsx";
    if (lower.includes("async") || lower.includes("await") || lower.includes("promise")) return "async";
    if (lower.includes("undefined") || lower.includes("null") || lower.includes("runtime")) return "runtime";
    if (lower.includes("hook") || lower.includes("state") || lower.includes("effect")) return "logic";
    
    return "syntax";
  }

  getPreventionPrompt(modelFamily?: string): string {
    const topPatterns = Array.from(this.errorPatterns.values())
      .filter(p => p.frequency > 0)
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);

    if (topPatterns.length === 0) {
      return this.getDefaultPreventionPrompt();
    }

    let prompt = "\n## Common Error Prevention\n";
    prompt += "Based on previous generation patterns, please avoid these common mistakes:\n\n";

    for (const pattern of topPatterns) {
      const fixTracking = this.fixSuccessTracking.get(pattern.id);
      const fixRate = fixTracking && fixTracking.attempts > 0
        ? Math.round((fixTracking.successes / fixTracking.attempts) * 100)
        : null;
      
      let severity = "";
      if (fixRate !== null && fixRate < 50) {
        severity = " [CRITICAL - hard to fix automatically]";
      } else if (pattern.frequency >= 5) {
        severity = " [FREQUENT]";
      }

      prompt += `- **${pattern.pattern}**${severity}: ${pattern.prevention}\n`;
    }

    if (modelFamily) {
      const modelTracking = this.modelErrorTracking.get(modelFamily);
      const modelPatterns = Array.from(this.errorPatterns.values())
        .filter(p => p.modelFamily === modelFamily && p.frequency > 2);
      
      if (modelPatterns.length > 0 || modelTracking) {
        prompt += `\n### Model-Specific Notes (${modelFamily}):\n`;
        
        if (modelTracking && modelTracking.errors > 0) {
          const modelFixRate = Math.round((modelTracking.fixed / modelTracking.errors) * 100);
          prompt += `- Overall fix rate for this model: ${modelFixRate}%\n`;
          
          if (modelFixRate < 60) {
            prompt += `- This model has a below-average fix rate. Extra care is needed.\n`;
          }

          const topModelPatterns = Array.from(modelTracking.patterns.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
          
          for (const [patternId, count] of topModelPatterns) {
            const pattern = this.errorPatterns.get(patternId);
            if (pattern) {
              prompt += `- Watch for: ${pattern.pattern} (occurred ${count}x with this model)\n`;
            }
          }
        }
        
        for (const p of modelPatterns.slice(0, 5)) {
          prompt += `- Watch for: ${p.pattern}\n`;
        }
      }
    }

    return prompt;
  }

  private getDefaultPreventionPrompt(): string {
    return `
## Code Quality Guidelines
- Always close all brackets, parentheses, and braces
- Import all dependencies at the top of the file
- Use TypeScript types explicitly (avoid 'any')
- Handle null/undefined with optional chaining (?.) or null checks
- Wrap JSX elements in a single parent element
- Add unique 'key' props to list items
- Mark functions as 'async' when using 'await'
- Never mutate React state directly
`;
  }

  getAutoFix(errorMessage: string): string | null {
    const patterns = Array.from(this.errorPatterns.values());
    for (let i = 0; i < patterns.length; i++) {
      if (patterns[i].regex.test(errorMessage) && patterns[i].autoFix) {
        return patterns[i].autoFix!;
      }
    }
    return null;
  }

  getInsights(): LearningInsight[] {
    const categories = new Set<ErrorPattern["category"]>();
    const allPatterns = Array.from(this.errorPatterns.values());
    allPatterns.forEach((p) => {
      if (p.frequency > 0) {
        categories.add(p.category);
      }
    });

    const insights: LearningInsight[] = [];

    Array.from(categories).forEach((category) => {
      const categoryPatterns = allPatterns
        .filter(p => p.category === category && p.frequency > 0)
        .sort((a, b) => b.frequency - a.frequency);

      const modelIssues = new Map<string, string[]>();
      for (const p of categoryPatterns) {
        if (p.modelFamily) {
          const existing = modelIssues.get(p.modelFamily) || [];
          existing.push(p.pattern);
          modelIssues.set(p.modelFamily, existing);
        }
      }

      insights.push({
        category,
        commonPatterns: categoryPatterns.slice(0, 5).map(p => p.pattern),
        preventionTips: categoryPatterns.slice(0, 5).map(p => p.prevention),
        modelSpecificIssues: modelIssues,
      });
    });

    return insights;
  }

  getStats(): {
    totalPatterns: number;
    learnedPatterns: number;
    totalErrors: number;
    topCategories: Array<{ category: string; count: number }>;
    modelFixRates: Record<string, { errors: number; fixed: number; fixRate: number }>;
    patternFixRates: Array<{ pattern: string; attempts: number; successes: number; fixRate: number }>;
    overallFixRate: number;
  } {
    const allPatterns = Array.from(this.errorPatterns.values());
    const learnedCount = allPatterns
      .filter(p => p.id.startsWith("learned_"))
      .length;

    const categoryCount = new Map<string, number>();
    allPatterns.forEach((p) => {
      if (p.frequency > 0) {
        const count = categoryCount.get(p.category) || 0;
        categoryCount.set(p.category, count + p.frequency);
      }
    });

    const topCategories = Array.from(categoryCount.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => ({ category, count }));

    const modelFixRates: Record<string, { errors: number; fixed: number; fixRate: number }> = {};
    for (const [model, tracking] of Array.from(this.modelErrorTracking.entries())) {
      modelFixRates[model] = {
        errors: tracking.errors,
        fixed: tracking.fixed,
        fixRate: tracking.errors > 0 ? tracking.fixed / tracking.errors : 0,
      };
    }

    const patternFixRates: Array<{ pattern: string; attempts: number; successes: number; fixRate: number }> = [];
    for (const [patternId, tracking] of Array.from(this.fixSuccessTracking.entries())) {
      const pattern = this.errorPatterns.get(patternId);
      if (pattern) {
        patternFixRates.push({
          pattern: pattern.pattern,
          attempts: tracking.attempts,
          successes: tracking.successes,
          fixRate: tracking.attempts > 0 ? tracking.successes / tracking.attempts : 0,
        });
      }
    }
    patternFixRates.sort((a, b) => b.attempts - a.attempts);

    const totalFixed = this.errorHistory.filter(e => e.wasFixed).length;
    const overallFixRate = this.errorHistory.length > 0 ? totalFixed / this.errorHistory.length : 0;

    return {
      totalPatterns: this.errorPatterns.size,
      learnedPatterns: learnedCount,
      totalErrors: this.errorHistory.length,
      topCategories,
      modelFixRates,
      patternFixRates: patternFixRates.slice(0, 15),
      overallFixRate,
    };
  }

  getModelReport(modelName: string): {
    model: string;
    totalErrors: number;
    fixedErrors: number;
    fixRate: number;
    topPatterns: Array<{ pattern: string; count: number }>;
    weaknesses: string[];
    recommendations: string[];
  } {
    const tracking = this.modelErrorTracking.get(modelName);
    
    if (!tracking) {
      return {
        model: modelName,
        totalErrors: 0,
        fixedErrors: 0,
        fixRate: 0,
        topPatterns: [],
        weaknesses: [],
        recommendations: ["No data available yet. Use this model to generate code and build a profile."],
      };
    }

    const topPatterns = Array.from(tracking.patterns.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([patternId, count]) => {
        const pattern = this.errorPatterns.get(patternId);
        return { pattern: pattern?.pattern || patternId, count };
      });

    const weaknesses: string[] = [];
    const recommendations: string[] = [];

    const fixRate = tracking.errors > 0 ? tracking.fixed / tracking.errors : 0;

    if (fixRate < 0.5) {
      weaknesses.push("Low overall fix rate - code quality needs attention");
      recommendations.push("Consider using a more capable model for complex tasks");
    }

    for (const { pattern, count } of topPatterns) {
      if (count >= 3) {
        weaknesses.push(`Recurring issue: ${pattern} (${count} occurrences)`);
      }
    }

    const categoryWeaknesses = new Map<string, number>();
    for (const [patternId, count] of Array.from(tracking.patterns.entries())) {
      const pattern = this.errorPatterns.get(patternId);
      if (pattern && count >= 2) {
        const existing = categoryWeaknesses.get(pattern.category) || 0;
        categoryWeaknesses.set(pattern.category, existing + count);
      }
    }

    for (const [category, count] of Array.from(categoryWeaknesses.entries())) {
      if (count >= 4) {
        switch (category) {
          case "syntax":
            recommendations.push("Add extra emphasis on code syntax correctness in prompts");
            break;
          case "type":
            recommendations.push("Include explicit TypeScript type annotations in examples");
            break;
          case "import":
            recommendations.push("List required imports explicitly in the prompt");
            break;
          case "jsx":
            recommendations.push("Provide JSX structure examples in the prompt");
            break;
          case "async":
            recommendations.push("Include async/await patterns in code examples");
            break;
        }
      }
    }

    if (recommendations.length === 0) {
      recommendations.push("Model is performing within expected parameters");
    }

    return {
      model: modelName,
      totalErrors: tracking.errors,
      fixedErrors: tracking.fixed,
      fixRate,
      topPatterns,
      weaknesses,
      recommendations,
    };
  }

  clearHistory(): void {
    this.errorHistory = [];
    this.modelErrorTracking.clear();
    this.fixSuccessTracking.clear();
    const patterns = Array.from(this.errorPatterns.values());
    patterns.forEach((pattern) => {
      if (pattern.id.startsWith("learned_")) {
        this.errorPatterns.delete(pattern.id);
      } else {
        pattern.frequency = 0;
      }
    });
    this.log("Error history cleared");
  }

  destroy(): void {
    this.errorPatterns.clear();
    this.modelErrorTracking.clear();
    this.fixSuccessTracking.clear();
    this.errorHistory = [];
    this.log("ErrorLearningService shut down");
  }
}

export const errorLearningService = ErrorLearningService.getInstance();
