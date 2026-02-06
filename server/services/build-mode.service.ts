import { BaseService, ManagedMap } from "../lib/base-service";

export type BuildMode = "fast" | "full";

interface BuildModeConfig {
  mode: BuildMode;
  maxTokens: number;
  temperature: number;
  enabledServices: string[];
  estimatedTime: string;
  description: string;
}

interface FastModeSettings {
  maxTokens: number;
  temperature: number;
  skipServices: string[];
  focusOnFiles: boolean;
  singleFileEdits: boolean;
}

interface FullBuildSettings {
  maxTokens: number;
  temperature: number;
  enableAllServices: boolean;
  generateTests: boolean;
  generateDocs: boolean;
  runValidation: boolean;
}

const DEFAULT_FAST_SETTINGS: FastModeSettings = {
  maxTokens: 2048,
  temperature: 0.3,
  skipServices: [
    "auto-documentation",
    "test-coverage",
    "bundle-optimizer",
    "accessibility-checker",
    "performance-profiler"
  ],
  focusOnFiles: true,
  singleFileEdits: true
};

const DEFAULT_FULL_SETTINGS: FullBuildSettings = {
  maxTokens: 8192,
  temperature: 0.5,
  enableAllServices: true,
  generateTests: true,
  generateDocs: true,
  runValidation: true
};

class BuildModeService extends BaseService {
  private static instance: BuildModeService;
  private readonly MAX_HISTORY = 500;
  private currentMode: BuildMode = "full";
  private projectModes: ManagedMap<string, BuildMode>;
  private fastSettings: FastModeSettings = { ...DEFAULT_FAST_SETTINGS };
  private fullSettings: FullBuildSettings = { ...DEFAULT_FULL_SETTINGS };
  private modeHistory: Array<{ projectId: string; mode: BuildMode; timestamp: Date; reason?: string }> = [];

  private constructor() {
    super("BuildModeService");
    this.projectModes = this.createManagedMap<string, BuildMode>({ maxSize: 200, strategy: "lru" });
  }

  static getInstance(): BuildModeService {
    if (!BuildModeService.instance) {
      BuildModeService.instance = new BuildModeService();
    }
    return BuildModeService.instance;
  }

  setMode(mode: BuildMode, projectId?: string, reason?: string): void {
    if (projectId) {
      this.projectModes.set(projectId, mode);
    } else {
      this.currentMode = mode;
    }

    this.modeHistory.push({
      projectId: projectId || "global",
      mode,
      timestamp: new Date(),
      reason
    });
    this.evictHistoryIfNeeded();

    this.log("Build mode changed", { mode, projectId, reason });
  }

  private evictHistoryIfNeeded(): void {
    if (this.modeHistory.length > this.MAX_HISTORY) {
      this.modeHistory = this.modeHistory.slice(-this.MAX_HISTORY);
    }
  }

  destroy(): void {
    this.projectModes.clear();
    this.modeHistory = [];
    this.log("BuildModeService shut down");
  }

  getMode(projectId?: string): BuildMode {
    if (projectId && this.projectModes.has(projectId)) {
      return this.projectModes.get(projectId)!;
    }
    return this.currentMode;
  }

  getConfig(projectId?: string): BuildModeConfig {
    const mode = this.getMode(projectId);

    if (mode === "fast") {
      return {
        mode: "fast",
        maxTokens: this.fastSettings.maxTokens,
        temperature: this.fastSettings.temperature,
        enabledServices: this.getEnabledServicesForFast(),
        estimatedTime: "10-60 seconds",
        description: "Quick, targeted edits with minimal overhead"
      };
    }

    return {
      mode: "full",
      maxTokens: this.fullSettings.maxTokens,
      temperature: this.fullSettings.temperature,
      enabledServices: this.getAllServices(),
      estimatedTime: "5-15 minutes",
      description: "Comprehensive full-stack generation with all automation"
    };
  }

  private getEnabledServicesForFast(): string[] {
    const allServices = this.getAllServices();
    return allServices.filter(s => !this.fastSettings.skipServices.includes(s));
  }

  private getAllServices(): string[] {
    return [
      "auto-validation",
      "context-pruning",
      "model-hot-swap",
      "health-alerts",
      "auto-dependency",
      "generation-checkpoints",
      "smart-retry",
      "auto-documentation",
      "security-scanning",
      "bundle-optimizer",
      "test-coverage",
      "accessibility-checker",
      "code-deduplication",
      "api-contract-validation",
      "import-optimizer",
      "performance-profiler",
      "user-preference-learning",
      "style-memory",
      "feedback-loop",
      "semantic-search",
      "auto-context-injection",
      "error-prevention",
      "proactive-refactoring",
      "dependency-health",
      "pattern-library",
      "smart-templates",
      "multi-step-reasoning",
      "self-validation"
    ];
  }

  getFastSettings(): FastModeSettings {
    return { ...this.fastSettings };
  }

  setFastSettings(settings: Partial<FastModeSettings>): void {
    this.fastSettings = { ...this.fastSettings, ...settings };
    this.log("Fast mode settings updated", { settings });
  }

  getFullSettings(): FullBuildSettings {
    return { ...this.fullSettings };
  }

  setFullSettings(settings: Partial<FullBuildSettings>): void {
    this.fullSettings = { ...this.fullSettings, ...settings };
    this.log("Full build settings updated", { settings });
  }

  shouldSkipService(serviceName: string, projectId?: string): boolean {
    const mode = this.getMode(projectId);
    if (mode === "full") return false;
    return this.fastSettings.skipServices.includes(serviceName);
  }

  getPromptModifiers(projectId?: string): {
    prefix: string;
    suffix: string;
    constraints: string[];
  } {
    const mode = this.getMode(projectId);

    if (mode === "fast") {
      return {
        prefix: "Make a quick, targeted edit. Focus only on the specific change requested.",
        suffix: "Keep changes minimal and focused. Do not refactor unrelated code.",
        constraints: [
          "Edit only the files directly related to the request",
          "Do not add new dependencies unless absolutely necessary",
          "Skip documentation generation",
          "Skip test generation",
          "Prioritize speed over comprehensiveness"
        ]
      };
    }

    return {
      prefix: "Build a comprehensive, production-ready solution.",
      suffix: "Ensure all best practices are followed and the solution is complete.",
      constraints: [
        "Generate complete implementations",
        "Include error handling",
        "Add appropriate TypeScript types",
        "Consider edge cases",
        "Generate tests where appropriate",
        "Add documentation comments"
      ]
    };
  }

  autoDetectMode(prompt: string): BuildMode {
    const fastIndicators = [
      "fix", "change", "update", "modify", "tweak", "adjust",
      "rename", "remove", "delete", "add a", "quick", "simple",
      "just", "only", "small", "minor", "typo", "bug"
    ];

    const fullIndicators = [
      "build", "create", "implement", "develop", "design",
      "full", "complete", "comprehensive", "new feature",
      "refactor entire", "rebuild", "overhaul", "application",
      "project", "system", "architecture"
    ];

    const lowerPrompt = prompt.toLowerCase();
    
    const fastScore = fastIndicators.filter(i => lowerPrompt.includes(i)).length;
    const fullScore = fullIndicators.filter(i => lowerPrompt.includes(i)).length;

    if (fastScore > fullScore && prompt.length < 200) {
      return "fast";
    }

    return "full";
  }

  getModeHistory(projectId?: string, limit: number = 20): typeof this.modeHistory {
    let history = this.modeHistory;
    if (projectId) {
      history = history.filter(h => h.projectId === projectId);
    }
    return history.slice(-limit);
  }

  getStats(): {
    currentMode: BuildMode;
    projectCount: number;
    fastModeUsage: number;
    fullModeUsage: number;
  } {
    const fastCount = this.modeHistory.filter(h => h.mode === "fast").length;
    const fullCount = this.modeHistory.filter(h => h.mode === "full").length;

    return {
      currentMode: this.currentMode,
      projectCount: this.projectModes.size,
      fastModeUsage: fastCount,
      fullModeUsage: fullCount
    };
  }
}

export const buildModeService = BuildModeService.getInstance();
