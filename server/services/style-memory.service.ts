import { BaseService, ManagedMap } from "../lib/base-service";

interface StyleProfile {
  projectId: string;
  conventions: CodingConventions;
  libraryPreferences: LibraryPreference[];
  componentPatterns: ComponentPattern[];
  fileStructure: FileStructurePreference;
  lastUpdated: number;
}

interface CodingConventions {
  indentation: { type: "tabs" | "spaces"; size: number };
  lineLength: number;
  semicolons: boolean;
  quotes: "single" | "double";
  trailingCommas: "none" | "es5" | "all";
  bracketSpacing: boolean;
  arrowParens: "always" | "avoid";
  jsxSingleQuote: boolean;
}

interface LibraryPreference {
  category: string;
  library: string;
  version?: string;
  usage: "preferred" | "avoided" | "required";
  reason?: string;
}

interface ComponentPattern {
  type: "functional" | "class" | "arrow";
  propsStyle: "destructured" | "props-object";
  stateManagement: "useState" | "useReducer" | "external";
  effectPattern: "cleanup" | "simple";
}

interface FileStructurePreference {
  componentLocation: string;
  hooksLocation: string;
  utilsLocation: string;
  typesLocation: string;
  stylesLocation: string;
  testLocation: "alongside" | "separate";
}

interface StyleAnalysis {
  detectedConventions: Partial<CodingConventions>;
  detectedLibraries: string[];
  detectedPatterns: string[];
  confidence: number;
}

class StyleMemoryService extends BaseService {
  private static instance: StyleMemoryService;
  private profiles: ManagedMap<string, StyleProfile>;

  private constructor() {
    super("StyleMemoryService");
    this.profiles = this.createManagedMap({ maxSize: 200, strategy: "lru" });
  }

  static getInstance(): StyleMemoryService {
    if (!StyleMemoryService.instance) {
      StyleMemoryService.instance = new StyleMemoryService();
    }
    return StyleMemoryService.instance;
  }

  analyzeAndRemember(
    projectId: string,
    files: Array<{ path: string; content: string }>
  ): StyleAnalysis {
    this.log("Analyzing project style", { projectId, fileCount: files.length });

    const analysis: StyleAnalysis = {
      detectedConventions: {},
      detectedLibraries: [],
      detectedPatterns: [],
      confidence: 0
    };

    let tabCount = 0;
    let spaceCount = 0;
    let semiCount = 0;
    let noSemiCount = 0;
    let singleQuoteCount = 0;
    let doubleQuoteCount = 0;
    const libraries = new Set<string>();
    const patterns = new Set<string>();

    for (const file of files) {
      const lines = file.content.split("\n");
      
      for (const line of lines) {
        if (line.startsWith("\t")) tabCount++;
        else if (line.startsWith("  ")) spaceCount++;
        
        if (line.trim().endsWith(";")) semiCount++;
        else if (line.trim().length > 0 && !line.trim().endsWith("{") && !line.trim().endsWith("}")) {
          noSemiCount++;
        }
      }

      const singleMatches = file.content.match(/'/g) || [];
      const doubleMatches = file.content.match(/"/g) || [];
      singleQuoteCount += singleMatches.length;
      doubleQuoteCount += doubleMatches.length;

      const importMatches = file.content.matchAll(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g);
      for (const match of Array.from(importMatches)) {
        const lib = match[1];
        if (!lib.startsWith(".") && !lib.startsWith("@/")) {
          libraries.add(lib.split("/")[0]);
        }
      }

      if (file.content.includes("function") && file.content.includes("return")) {
        patterns.add("functional-components");
      }
      if (file.content.includes("useState")) {
        patterns.add("hooks-state-management");
      }
      if (file.content.includes("useEffect")) {
        patterns.add("hooks-side-effects");
      }
      if (file.content.includes("useQuery") || file.content.includes("useMutation")) {
        patterns.add("react-query-data-fetching");
      }
      if (file.content.includes("createContext")) {
        patterns.add("context-api");
      }
      if (file.content.includes("zustand") || file.content.includes("create(")) {
        patterns.add("zustand-state");
      }
    }

    analysis.detectedConventions = {
      indentation: { type: tabCount > spaceCount ? "tabs" : "spaces", size: 2 },
      semicolons: semiCount > noSemiCount,
      quotes: singleQuoteCount > doubleQuoteCount ? "single" : "double",
      trailingCommas: "es5",
      bracketSpacing: true,
      arrowParens: "always"
    };

    analysis.detectedLibraries = Array.from(libraries);
    analysis.detectedPatterns = Array.from(patterns);
    analysis.confidence = Math.min(1, files.length / 10);

    const existingProfile = this.profiles.get(projectId);
    const newProfile: StyleProfile = {
      projectId,
      conventions: {
        ...this.getDefaultConventions(),
        ...analysis.detectedConventions
      } as CodingConventions,
      libraryPreferences: analysis.detectedLibraries.map(lib => ({
        category: this.categorizeLibrary(lib),
        library: lib,
        usage: "preferred" as const
      })),
      componentPatterns: this.detectComponentPatterns(files),
      fileStructure: existingProfile?.fileStructure || this.detectFileStructure(files),
      lastUpdated: Date.now()
    };

    this.profiles.set(projectId, newProfile);
    this.log("Style profile updated", { projectId, libraryCount: analysis.detectedLibraries.length });

    return analysis;
  }

  private getDefaultConventions(): CodingConventions {
    return {
      indentation: { type: "spaces", size: 2 },
      lineLength: 100,
      semicolons: true,
      quotes: "double",
      trailingCommas: "es5",
      bracketSpacing: true,
      arrowParens: "always",
      jsxSingleQuote: false
    };
  }

  private categorizeLibrary(lib: string): string {
    const categories: Record<string, string[]> = {
      ui: ["react", "vue", "angular", "svelte", "@radix-ui", "shadcn"],
      styling: ["tailwindcss", "styled-components", "emotion", "sass", "less"],
      state: ["redux", "zustand", "jotai", "recoil", "mobx"],
      data: ["@tanstack/react-query", "swr", "axios", "fetch"],
      forms: ["react-hook-form", "formik", "yup", "zod"],
      routing: ["react-router", "wouter", "next"],
      testing: ["jest", "vitest", "playwright", "cypress"],
      utils: ["lodash", "date-fns", "moment", "dayjs"]
    };

    for (const [category, libs] of Object.entries(categories)) {
      if (libs.some(l => lib.includes(l))) return category;
    }
    return "other";
  }

  private detectComponentPatterns(files: Array<{ path: string; content: string }>): ComponentPattern[] {
    const patterns: ComponentPattern[] = [];
    
    const hasArrowComponents = files.some(f => f.content.match(/const\s+\w+\s*=\s*\([^)]*\)\s*=>/));
    const hasFunctionComponents = files.some(f => f.content.match(/function\s+\w+\s*\([^)]*\)/));
    
    if (hasArrowComponents) {
      patterns.push({
        type: "arrow",
        propsStyle: "destructured",
        stateManagement: "useState",
        effectPattern: "cleanup"
      });
    }
    
    if (hasFunctionComponents) {
      patterns.push({
        type: "functional",
        propsStyle: "destructured",
        stateManagement: "useState",
        effectPattern: "simple"
      });
    }

    return patterns;
  }

  private detectFileStructure(files: Array<{ path: string; content: string }>): FileStructurePreference {
    const paths = files.map(f => f.path);
    
    const findLocation = (patterns: string[]): string => {
      for (const pattern of patterns) {
        const match = paths.find(p => p.includes(pattern));
        if (match) {
          const parts = match.split("/");
          const idx = parts.findIndex(p => p.includes(pattern.split("/")[0]));
          return parts.slice(0, idx + 1).join("/");
        }
      }
      return "src";
    };

    return {
      componentLocation: findLocation(["components", "Components"]),
      hooksLocation: findLocation(["hooks", "Hooks"]),
      utilsLocation: findLocation(["utils", "lib", "helpers"]),
      typesLocation: findLocation(["types", "interfaces"]),
      stylesLocation: findLocation(["styles", "css"]),
      testLocation: paths.some(p => p.includes(".test.") || p.includes(".spec.")) ? "alongside" : "separate"
    };
  }

  getProfile(projectId: string): StyleProfile | null {
    return this.profiles.get(projectId) || null;
  }

  getStyleGuide(projectId: string): string {
    const profile = this.profiles.get(projectId);
    if (!profile) {
      return "No style profile found. Using default conventions.";
    }

    const lines: string[] = [
      "## Code Style Guidelines",
      "",
      "### Formatting",
      `- Indentation: ${profile.conventions.indentation.size} ${profile.conventions.indentation.type}`,
      `- Semicolons: ${profile.conventions.semicolons ? "required" : "omitted"}`,
      `- Quotes: ${profile.conventions.quotes}`,
      `- Trailing commas: ${profile.conventions.trailingCommas}`,
      "",
      "### Preferred Libraries"
    ];

    const librariesByCategory = new Map<string, string[]>();
    for (const lib of profile.libraryPreferences) {
      const existing = librariesByCategory.get(lib.category) || [];
      existing.push(lib.library);
      librariesByCategory.set(lib.category, existing);
    }

    for (const [category, libs] of Array.from(librariesByCategory.entries())) {
      lines.push(`- ${category}: ${libs.join(", ")}`);
    }

    lines.push("", "### File Structure");
    lines.push(`- Components: ${profile.fileStructure.componentLocation}`);
    lines.push(`- Hooks: ${profile.fileStructure.hooksLocation}`);
    lines.push(`- Tests: ${profile.fileStructure.testLocation}`);

    return lines.join("\n");
  }

  updateLibraryPreference(
    projectId: string,
    library: string,
    usage: "preferred" | "avoided" | "required",
    reason?: string
  ): void {
    const profile = this.profiles.get(projectId);
    if (!profile) return;

    const existing = profile.libraryPreferences.find(l => l.library === library);
    if (existing) {
      existing.usage = usage;
      existing.reason = reason;
    } else {
      profile.libraryPreferences.push({
        category: this.categorizeLibrary(library),
        library,
        usage,
        reason
      });
    }
    profile.lastUpdated = Date.now();
  }

  clearProfile(projectId: string): void {
    this.profiles.delete(projectId);
    this.log("Style profile cleared", { projectId });
  }

  destroy(): void {
    this.profiles.clear();
    this.log("StyleMemoryService shutting down");
  }
}

export const styleMemoryService = StyleMemoryService.getInstance();
