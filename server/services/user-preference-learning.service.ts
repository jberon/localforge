import { logger } from "../lib/logger";

interface CodeModification {
  originalCode: string;
  modifiedCode: string;
  filePath: string;
  timestamp: number;
  changeType: "addition" | "deletion" | "modification";
}

interface UserPreference {
  category: string;
  key: string;
  value: string;
  confidence: number;
  occurrences: number;
  lastUpdated: number;
}

interface LearningPattern {
  pattern: string;
  frequency: number;
  context: string;
  examples: string[];
}

interface PreferenceSummary {
  totalModifications: number;
  learnedPreferences: UserPreference[];
  topPatterns: LearningPattern[];
  codingStyle: {
    indentation: "tabs" | "spaces" | "mixed";
    semicolons: boolean;
    quotes: "single" | "double" | "mixed";
    trailingCommas: boolean;
  };
  preferredLibraries: string[];
  namingConventions: {
    components: "PascalCase" | "camelCase" | "mixed";
    functions: "camelCase" | "snake_case" | "mixed";
    variables: "camelCase" | "snake_case" | "mixed";
    constants: "UPPER_CASE" | "camelCase" | "mixed";
  };
}

class UserPreferenceLearningService {
  private static instance: UserPreferenceLearningService;
  private modifications: Map<string, CodeModification[]> = new Map();
  private preferences: Map<string, UserPreference[]> = new Map();
  private patterns: LearningPattern[] = [];

  private constructor() {}

  static getInstance(): UserPreferenceLearningService {
    if (!UserPreferenceLearningService.instance) {
      UserPreferenceLearningService.instance = new UserPreferenceLearningService();
    }
    return UserPreferenceLearningService.instance;
  }

  trackModification(projectId: string, modification: Omit<CodeModification, "timestamp">): void {
    const mods = this.modifications.get(projectId) || [];
    mods.push({
      ...modification,
      timestamp: Date.now()
    });
    this.modifications.set(projectId, mods);
    
    this.analyzeModification(projectId, modification);
    logger.info("Tracked code modification", { projectId, filePath: modification.filePath });
  }

  private analyzeModification(projectId: string, mod: Omit<CodeModification, "timestamp">): void {
    const prefs = this.preferences.get(projectId) || [];
    
    const indentation = this.detectIndentation(mod.modifiedCode);
    this.updatePreference(prefs, "codingStyle", "indentation", indentation);
    
    const semicolons = this.detectSemicolons(mod.modifiedCode);
    this.updatePreference(prefs, "codingStyle", "semicolons", semicolons.toString());
    
    const quotes = this.detectQuotes(mod.modifiedCode);
    this.updatePreference(prefs, "codingStyle", "quotes", quotes);
    
    const trailingCommas = this.detectTrailingCommas(mod.modifiedCode);
    this.updatePreference(prefs, "codingStyle", "trailingCommas", trailingCommas.toString());
    
    const libraries = this.detectLibraries(mod.modifiedCode);
    libraries.forEach(lib => {
      this.updatePreference(prefs, "libraries", lib, "preferred");
    });
    
    this.analyzeNamingConventions(mod.modifiedCode, prefs);
    
    this.preferences.set(projectId, prefs);
  }

  private updatePreference(
    prefs: UserPreference[],
    category: string,
    key: string,
    value: string
  ): void {
    const existing = prefs.find(p => p.category === category && p.key === key);
    if (existing) {
      if (existing.value === value) {
        existing.occurrences++;
        existing.confidence = Math.min(1, existing.confidence + 0.1);
      } else {
        existing.confidence = Math.max(0, existing.confidence - 0.05);
        if (existing.confidence < 0.3) {
          existing.value = value;
          existing.confidence = 0.5;
        }
      }
      existing.lastUpdated = Date.now();
    } else {
      prefs.push({
        category,
        key,
        value,
        confidence: 0.5,
        occurrences: 1,
        lastUpdated: Date.now()
      });
    }
  }

  private detectIndentation(code: string): "tabs" | "spaces" | "mixed" {
    const tabLines = (code.match(/^\t+/gm) || []).length;
    const spaceLines = (code.match(/^  +/gm) || []).length;
    if (tabLines > spaceLines * 2) return "tabs";
    if (spaceLines > tabLines * 2) return "spaces";
    return "mixed";
  }

  private detectSemicolons(code: string): boolean {
    const withSemi = (code.match(/;\s*$/gm) || []).length;
    const potentialStatements = (code.match(/[^;{}\s]\s*$/gm) || []).length;
    return withSemi > potentialStatements;
  }

  private detectQuotes(code: string): "single" | "double" | "mixed" {
    const singleQuotes = (code.match(/'/g) || []).length;
    const doubleQuotes = (code.match(/"/g) || []).length;
    if (singleQuotes > doubleQuotes * 2) return "single";
    if (doubleQuotes > singleQuotes * 2) return "double";
    return "mixed";
  }

  private detectTrailingCommas(code: string): boolean {
    const withTrailing = (code.match(/,\s*[\]}]/g) || []).length;
    const withoutTrailing = (code.match(/[^,\s]\s*[\]}]/g) || []).length;
    return withTrailing > withoutTrailing;
  }

  private detectLibraries(code: string): string[] {
    const libraries: string[] = [];
    const importMatches = code.matchAll(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g);
    for (const match of Array.from(importMatches)) {
      const lib = match[1];
      if (!lib.startsWith(".") && !lib.startsWith("@/")) {
        libraries.push(lib.split("/")[0].replace("@", ""));
      }
    }
    return libraries;
  }

  private analyzeNamingConventions(code: string, prefs: UserPreference[]): void {
    const componentMatches = Array.from(code.matchAll(/(?:function|const)\s+([A-Z][a-zA-Z0-9]*)\s*[=(]/g));
    if (componentMatches.length > 0) {
      const isPascal = componentMatches.every(m => /^[A-Z][a-zA-Z0-9]*$/.test(m[1]));
      this.updatePreference(prefs, "naming", "components", isPascal ? "PascalCase" : "mixed");
    }

    const functionMatches = Array.from(code.matchAll(/(?:function|const)\s+([a-z][a-zA-Z0-9]*)\s*[=(]/g));
    if (functionMatches.length > 0) {
      const isCamel = functionMatches.every(m => /^[a-z][a-zA-Z0-9]*$/.test(m[1]));
      const isSnake = functionMatches.every(m => /^[a-z][a-z0-9_]*$/.test(m[1]));
      this.updatePreference(
        prefs,
        "naming",
        "functions",
        isCamel ? "camelCase" : isSnake ? "snake_case" : "mixed"
      );
    }

    const constMatches = Array.from(code.matchAll(/const\s+([A-Z][A-Z0-9_]*)\s*=/g));
    if (constMatches.length > 0) {
      this.updatePreference(prefs, "naming", "constants", "UPPER_CASE");
    }
  }

  getPreferences(projectId: string): PreferenceSummary {
    const mods = this.modifications.get(projectId) || [];
    const prefs = this.preferences.get(projectId) || [];

    const getPreferenceValue = (category: string, key: string, defaultValue: string): string => {
      const pref = prefs.find(p => p.category === category && p.key === key);
      return pref?.value || defaultValue;
    };

    const libraries = prefs
      .filter(p => p.category === "libraries" && p.confidence > 0.5)
      .sort((a, b) => b.occurrences - a.occurrences)
      .map(p => p.key);

    return {
      totalModifications: mods.length,
      learnedPreferences: prefs.filter(p => p.confidence > 0.5),
      topPatterns: this.patterns.slice(0, 10),
      codingStyle: {
        indentation: getPreferenceValue("codingStyle", "indentation", "spaces") as any,
        semicolons: getPreferenceValue("codingStyle", "semicolons", "true") === "true",
        quotes: getPreferenceValue("codingStyle", "quotes", "double") as any,
        trailingCommas: getPreferenceValue("codingStyle", "trailingCommas", "true") === "true"
      },
      preferredLibraries: libraries,
      namingConventions: {
        components: getPreferenceValue("naming", "components", "PascalCase") as any,
        functions: getPreferenceValue("naming", "functions", "camelCase") as any,
        variables: getPreferenceValue("naming", "variables", "camelCase") as any,
        constants: getPreferenceValue("naming", "constants", "UPPER_CASE") as any
      }
    };
  }

  getPromptEnhancements(projectId: string): string {
    const prefs = this.getPreferences(projectId);
    const enhancements: string[] = [];

    enhancements.push(`Use ${prefs.codingStyle.indentation} for indentation`);
    enhancements.push(prefs.codingStyle.semicolons ? "Include semicolons" : "Omit semicolons");
    enhancements.push(`Use ${prefs.codingStyle.quotes} quotes for strings`);

    if (prefs.preferredLibraries.length > 0) {
      enhancements.push(`Prefer these libraries when applicable: ${prefs.preferredLibraries.slice(0, 5).join(", ")}`);
    }

    enhancements.push(`Use ${prefs.namingConventions.components} for React components`);
    enhancements.push(`Use ${prefs.namingConventions.functions} for functions`);

    return enhancements.join(". ") + ".";
  }

  clearHistory(projectId: string): void {
    this.modifications.delete(projectId);
    this.preferences.delete(projectId);
    logger.info("Cleared preference history", { projectId });
  }
}

export const userPreferenceLearningService = UserPreferenceLearningService.getInstance();
