import { BaseService, ManagedMap } from "../lib/base-service";

interface FeatureEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  status: "planned" | "built" | "broken" | "modified";
  builtAt?: number;
  lastModifiedAt?: number;
}

interface ChangeEntry {
  id: string;
  timestamp: number;
  type: "generation" | "refinement" | "auto-fix" | "health-fix";
  description: string;
  linesChanged: number;
  featuresAffected: string[];
  successful: boolean;
}

interface HealthStatus {
  renders: boolean;
  lastCheckedAt: number;
  errors: string[];
  warnings: string[];
}

interface ProjectState {
  projectId: string;
  createdAt: number;
  lastUpdatedAt: number;
  features: FeatureEntry[];
  changes: ChangeEntry[];
  health: HealthStatus;
  summary: string;
  totalGenerations: number;
  totalRefinements: number;
  currentCodeHash: string;
}

class ProjectStateService extends BaseService {
  private static instance: ProjectStateService;
  private states: ManagedMap<string, ProjectState>;

  private constructor() {
    super("ProjectStateService");
    this.states = this.createManagedMap<string, ProjectState>({ maxSize: 200, strategy: "lru" });
  }

  static getInstance(): ProjectStateService {
    if (!ProjectStateService.instance) {
      ProjectStateService.instance = new ProjectStateService();
    }
    return ProjectStateService.instance;
  }

  getState(projectId: string): ProjectState | undefined {
    return this.states.get(projectId);
  }

  initializeState(projectId: string): ProjectState {
    const existing = this.states.get(projectId);
    if (existing) return existing;

    const state: ProjectState = {
      projectId,
      createdAt: Date.now(),
      lastUpdatedAt: Date.now(),
      features: [],
      changes: [],
      health: {
        renders: false,
        lastCheckedAt: 0,
        errors: [],
        warnings: [],
      },
      summary: "Project initialized, no code generated yet.",
      totalGenerations: 0,
      totalRefinements: 0,
      currentCodeHash: "",
    };

    this.states.set(projectId, state);
    this.log("Project state initialized", { projectId });
    return state;
  }

  recordGeneration(
    projectId: string,
    description: string,
    code: string,
    featuresDetected: string[],
    successful: boolean
  ): ProjectState {
    const state = this.states.get(projectId) || this.initializeState(projectId);

    state.totalGenerations++;
    state.lastUpdatedAt = Date.now();
    state.currentCodeHash = this.hashCode(code);

    const change: ChangeEntry = {
      id: `change_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      type: "generation",
      description,
      linesChanged: code.split("\n").length,
      featuresAffected: featuresDetected,
      successful,
    };
    state.changes.push(change);
    if (state.changes.length > 50) {
      state.changes = state.changes.slice(-50);
    }

    for (const featureName of featuresDetected) {
      const existing = state.features.find(f => f.name.toLowerCase() === featureName.toLowerCase());
      if (existing) {
        existing.status = successful ? "built" : "broken";
        existing.lastModifiedAt = Date.now();
      } else {
        state.features.push({
          id: `feat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: featureName,
          description: featureName,
          category: this.categorizeFeature(featureName),
          status: successful ? "built" : "planned",
          builtAt: successful ? Date.now() : undefined,
        });
      }
    }

    state.summary = this.buildSummary(state);
    this.states.set(projectId, state);
    return state;
  }

  recordRefinement(
    projectId: string,
    description: string,
    linesChanged: number,
    featuresAffected: string[],
    successful: boolean
  ): ProjectState {
    const state = this.states.get(projectId) || this.initializeState(projectId);

    state.totalRefinements++;
    state.lastUpdatedAt = Date.now();

    const change: ChangeEntry = {
      id: `change_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      type: "refinement",
      description,
      linesChanged,
      featuresAffected,
      successful,
    };
    state.changes.push(change);
    if (state.changes.length > 50) {
      state.changes = state.changes.slice(-50);
    }

    for (const featureName of featuresAffected) {
      const existing = state.features.find(f => f.name.toLowerCase() === featureName.toLowerCase());
      if (existing) {
        existing.status = successful ? "modified" : "broken";
        existing.lastModifiedAt = Date.now();
      }
    }

    state.summary = this.buildSummary(state);
    this.states.set(projectId, state);
    return state;
  }

  updateHealth(projectId: string, health: Partial<HealthStatus>): void {
    const state = this.states.get(projectId);
    if (!state) return;

    state.health = { ...state.health, ...health, lastCheckedAt: Date.now() };
    state.lastUpdatedAt = Date.now();
    this.states.set(projectId, state);
  }

  markFeatureBroken(projectId: string, featureName: string, error: string): void {
    const state = this.states.get(projectId);
    if (!state) return;

    const feature = state.features.find(f => f.name.toLowerCase() === featureName.toLowerCase());
    if (feature) {
      feature.status = "broken";
      feature.lastModifiedAt = Date.now();
    }

    state.health.errors.push(error);
    if (state.health.errors.length > 20) {
      state.health.errors = state.health.errors.slice(-20);
    }
    state.lastUpdatedAt = Date.now();
    this.states.set(projectId, state);
  }

  getContextForRefinement(projectId: string): string {
    const state = this.states.get(projectId);
    if (!state) return "";

    const lines: string[] = [];
    lines.push("## Project State Context");
    lines.push(`Generations: ${state.totalGenerations}, Refinements: ${state.totalRefinements}`);

    const builtFeatures = state.features.filter(f => f.status === "built" || f.status === "modified");
    const brokenFeatures = state.features.filter(f => f.status === "broken");

    if (builtFeatures.length > 0) {
      lines.push(`\nWorking features: ${builtFeatures.map(f => f.name).join(", ")}`);
    }
    if (brokenFeatures.length > 0) {
      lines.push(`\nBROKEN features (fix these first): ${brokenFeatures.map(f => f.name).join(", ")}`);
    }

    if (state.health.errors.length > 0) {
      lines.push(`\nKnown errors: ${state.health.errors.slice(-3).join("; ")}`);
    }

    const recentChanges = state.changes.slice(-5);
    if (recentChanges.length > 0) {
      lines.push("\nRecent changes:");
      for (const change of recentChanges) {
        const status = change.successful ? "OK" : "FAILED";
        lines.push(`- [${status}] ${change.type}: ${change.description} (${change.linesChanged} lines)`);
      }
    }

    return lines.join("\n");
  }

  detectFeaturesFromCode(code: string): string[] {
    const features: string[] = [];
    const lower = code.toLowerCase();

    const featurePatterns: [RegExp, string][] = [
      [/\bnavbar\b|\bnav\b|navigation|<nav/i, "Navigation"],
      [/\bheader\b|<header/i, "Header"],
      [/\bfooter\b|<footer/i, "Footer"],
      [/\bsidebar\b/i, "Sidebar"],
      [/\bform\b|<form|useform|onsubmit/i, "Form"],
      [/\bmodal\b|\bdialog\b/i, "Modal/Dialog"],
      [/\btable\b|<table|datagrid/i, "Data Table"],
      [/\bchart\b|\bgraph\b|recharts|chart\.js/i, "Charts/Graphs"],
      [/\bauth\b|\blogin\b|\bsignup\b|\bsign.?in/i, "Authentication"],
      [/\bdashboard\b/i, "Dashboard"],
      [/\bsearch\b/i, "Search"],
      [/\bfilter\b|\bsort\b/i, "Filter/Sort"],
      [/\bpagination\b|\bpage.*\d/i, "Pagination"],
      [/\btodo\b|\btask/i, "Task/Todo List"],
      [/\bcart\b|\bcheckout\b|\bpayment/i, "Shopping/Payment"],
      [/\bprofile\b|\bsettings\b/i, "User Profile/Settings"],
      [/\bnotification\b|\btoast\b|\balert/i, "Notifications"],
      [/\bdark.?mode\b|\btheme/i, "Theme/Dark Mode"],
      [/\bresponsive\b|\bmobile\b|\bmedia.?query/i, "Responsive Layout"],
      [/\bapi\b|\bfetch\b|\baxios\b|\buseSWR\b|\buseQuery/i, "API Integration"],
      [/\brouter\b|\broute\b|\blink.*to=/i, "Routing"],
      [/\bimage\b|\bgallery\b|\bcarousel/i, "Image Gallery"],
      [/\bmap\b|\bgeo\b|\blocation/i, "Maps/Geolocation"],
      [/\bcalendar\b|\bdate.?picker/i, "Calendar/Date Picker"],
      [/\beditor\b|\brich.?text\b|\bmarkdown/i, "Rich Text Editor"],
      [/\bfile.?upload\b|\bdrop.?zone\b|\bdropzone/i, "File Upload"],
      [/\bwebsocket\b|\breal.?time\b|\bsocket/i, "Real-time/WebSocket"],
      [/\bi18n\b|\btranslat/i, "Internationalization"],
      [/\banimation\b|\btransition\b|\bframer/i, "Animations"],
      [/\baccessib/i, "Accessibility"],
    ];

    for (const [pattern, name] of featurePatterns) {
      if (pattern.test(code)) {
        features.push(name);
      }
    }

    return features;
  }

  private categorizeFeature(name: string): string {
    const lower = name.toLowerCase();
    if (/nav|header|footer|sidebar|layout/.test(lower)) return "layout";
    if (/form|input|select|checkbox/.test(lower)) return "forms";
    if (/auth|login|signup/.test(lower)) return "auth";
    if (/api|fetch|data/.test(lower)) return "data";
    if (/chart|graph|table/.test(lower)) return "visualization";
    if (/style|theme|dark|color/.test(lower)) return "styling";
    if (/route|page|navigation/.test(lower)) return "navigation";
    return "feature";
  }

  private buildSummary(state: ProjectState): string {
    const built = state.features.filter(f => f.status === "built" || f.status === "modified").length;
    const broken = state.features.filter(f => f.status === "broken").length;
    const total = state.features.length;
    const healthStatus = state.health.renders ? "rendering" : "not rendering";

    return `Project has ${total} features (${built} working, ${broken} broken). App is ${healthStatus}. ${state.totalGenerations} generations, ${state.totalRefinements} refinements.`;
  }

  private hashCode(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  destroy(): void {
    this.states.clear();
    this.log("ProjectStateService destroyed");
  }
}

export const projectStateService = ProjectStateService.getInstance();
