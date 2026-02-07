import { BaseService, ManagedMap } from "../lib/base-service";

interface FeatureManifestEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  priority: number;
  acceptanceCriteria: string[];
  dependencies: string[];
  passes: boolean;
  implementedAt?: number;
}

interface FeatureManifest {
  projectId: string;
  prompt: string;
  createdAt: number;
  lastUpdatedAt: number;
  features: FeatureManifestEntry[];
  completionPercentage: number;
}

class InitializerService extends BaseService {
  private static instance: InitializerService;
  private manifests: ManagedMap<string, FeatureManifest>;

  private constructor() {
    super("InitializerService");
    this.manifests = this.createManagedMap<string, FeatureManifest>({ maxSize: 200, strategy: "lru" });
  }

  static getInstance(): InitializerService {
    if (!InitializerService.instance) {
      InitializerService.instance = new InitializerService();
    }
    return InitializerService.instance;
  }

  generateManifest(projectId: string, prompt: string): FeatureManifest {
    const features = this.extractFeatures(prompt);

    const ordered = this.orderByDependency(features);

    const manifest: FeatureManifest = {
      projectId,
      prompt,
      createdAt: Date.now(),
      lastUpdatedAt: Date.now(),
      features: ordered,
      completionPercentage: 0,
    };

    this.manifests.set(projectId, manifest);
    this.log("Feature manifest generated", { projectId, featureCount: ordered.length });
    return manifest;
  }

  getManifest(projectId: string): FeatureManifest | undefined {
    return this.manifests.get(projectId);
  }

  markFeaturePassed(projectId: string, featureId: string): boolean {
    const manifest = this.manifests.get(projectId);
    if (!manifest) return false;

    const feature = manifest.features.find(f => f.id === featureId);
    if (!feature) return false;

    feature.passes = true;
    feature.implementedAt = Date.now();
    manifest.lastUpdatedAt = Date.now();
    manifest.completionPercentage = this.calculateCompletion(manifest);
    this.manifests.set(projectId, manifest);
    return true;
  }

  markFeaturesByCode(projectId: string, code: string): FeatureManifest | undefined {
    const manifest = this.manifests.get(projectId);
    if (!manifest) return undefined;

    const lower = code.toLowerCase();

    for (const feature of manifest.features) {
      if (feature.passes) continue;

      const matched = feature.acceptanceCriteria.some(criterion => {
        const keywords = this.extractKeywords(criterion);
        return keywords.length > 0 && keywords.every(kw => lower.includes(kw.toLowerCase()));
      });

      if (matched || this.featureDetectedInCode(feature, code)) {
        feature.passes = true;
        feature.implementedAt = Date.now();
      }
    }

    manifest.completionPercentage = this.calculateCompletion(manifest);
    manifest.lastUpdatedAt = Date.now();
    this.manifests.set(projectId, manifest);
    return manifest;
  }

  getNextFeatureToBuild(projectId: string): FeatureManifestEntry | null {
    const manifest = this.manifests.get(projectId);
    if (!manifest) return null;

    for (const feature of manifest.features) {
      if (feature.passes) continue;

      const depsmet = feature.dependencies.every(depId => {
        const dep = manifest.features.find(f => f.id === depId);
        return dep?.passes === true;
      });

      if (depsmet) return feature;
    }

    return null;
  }

  getManifestContext(projectId: string): string {
    const manifest = this.manifests.get(projectId);
    if (!manifest) return "";

    const lines: string[] = [];
    lines.push("## Feature Manifest");
    lines.push(`Completion: ${manifest.completionPercentage}%`);
    lines.push("");

    for (const feature of manifest.features) {
      const status = feature.passes ? "DONE" : "TODO";
      lines.push(`- [${status}] ${feature.name}: ${feature.description}`);
      if (!feature.passes && feature.acceptanceCriteria.length > 0) {
        lines.push(`  Criteria: ${feature.acceptanceCriteria.join("; ")}`);
      }
    }

    return lines.join("\n");
  }

  private extractFeatures(prompt: string): FeatureManifestEntry[] {
    const features: FeatureManifestEntry[] = [];
    const lower = prompt.toLowerCase();
    let priority = 0;

    const featureMatchers: {
      patterns: RegExp[];
      name: string;
      category: string;
      criteria: string[];
      deps?: string[];
    }[] = [
      {
        patterns: [/\blayout\b/, /\bpage\b/, /\bapp\b/, /\bui\b/],
        name: "App Layout & Structure",
        category: "layout",
        criteria: ["Root component renders without errors", "Basic layout structure visible"],
      },
      {
        patterns: [/\bheader\b/, /\bnav\b/, /\btop.?bar\b/],
        name: "Header & Navigation",
        category: "layout",
        criteria: ["Header element present", "Navigation links visible", "Responsive on mobile"],
        deps: ["layout"],
      },
      {
        patterns: [/\bsidebar\b/],
        name: "Sidebar Navigation",
        category: "layout",
        criteria: ["Sidebar element present", "Menu items visible", "Collapsible on mobile"],
        deps: ["layout"],
      },
      {
        patterns: [/\bfooter\b/],
        name: "Footer",
        category: "layout",
        criteria: ["Footer element visible at bottom"],
        deps: ["layout"],
      },
      {
        patterns: [/\bform\b/, /\binput\b/, /\bsubmit\b/],
        name: "Form & Input Handling",
        category: "forms",
        criteria: ["Form fields render", "Submit button present", "Validation feedback shown"],
        deps: ["layout"],
      },
      {
        patterns: [/\bauth\b/, /\blogin\b/, /\bsign.?up\b/, /\bsign.?in\b/, /\bregist/],
        name: "Authentication",
        category: "auth",
        criteria: ["Login form present", "Registration form present", "Auth state managed"],
        deps: ["layout"],
      },
      {
        patterns: [/\bdashboard\b/],
        name: "Dashboard",
        category: "feature",
        criteria: ["Dashboard view renders", "Data widgets present", "Stats or metrics visible"],
        deps: ["layout"],
      },
      {
        patterns: [/\btable\b/, /\blist\b/, /\bgrid\b/, /\bdata\b/],
        name: "Data Display",
        category: "data",
        criteria: ["Data elements render", "Items displayed in structured format"],
        deps: ["layout"],
      },
      {
        patterns: [/\bcrud\b/, /\bcreate\b.*\bdelete\b/, /\badd\b.*\bremove\b/],
        name: "CRUD Operations",
        category: "data",
        criteria: ["Create new items", "Read/display items", "Update existing items", "Delete items"],
        deps: ["layout"],
      },
      {
        patterns: [/\bsearch\b/],
        name: "Search Functionality",
        category: "feature",
        criteria: ["Search input present", "Results update on search"],
        deps: ["layout"],
      },
      {
        patterns: [/\bfilter\b/, /\bsort\b/],
        name: "Filter & Sort",
        category: "feature",
        criteria: ["Filter controls present", "Data updates when filters change"],
        deps: ["layout"],
      },
      {
        patterns: [/\bchart\b/, /\bgraph\b/, /\bvisualiz/],
        name: "Charts & Visualization",
        category: "visualization",
        criteria: ["Chart component renders", "Data visualization visible"],
        deps: ["layout"],
      },
      {
        patterns: [/\bmodal\b/, /\bdialog\b/, /\bpopup\b/],
        name: "Modal/Dialog",
        category: "feature",
        criteria: ["Modal can be opened", "Modal can be closed", "Content displayed in modal"],
        deps: ["layout"],
      },
      {
        patterns: [/\btodo\b/, /\btask\b/],
        name: "Task/Todo Management",
        category: "feature",
        criteria: ["Add new tasks", "Mark tasks complete", "Delete tasks", "Task list renders"],
        deps: ["layout"],
      },
      {
        patterns: [/\bcart\b/, /\bshop\b/, /\becommerce\b/, /\bproduct/],
        name: "Shopping/E-commerce",
        category: "feature",
        criteria: ["Product listing visible", "Add to cart works", "Cart updates"],
        deps: ["layout"],
      },
      {
        patterns: [/\bpayment\b/, /\bstripe\b/, /\bcheckout\b/],
        name: "Payment Processing",
        category: "feature",
        criteria: ["Payment form present", "Checkout flow works"],
        deps: ["layout"],
      },
      {
        patterns: [/\bprofile\b/, /\bsetting/],
        name: "User Profile/Settings",
        category: "feature",
        criteria: ["Profile page renders", "Settings can be modified"],
        deps: ["layout"],
      },
      {
        patterns: [/\bdark.?mode\b/, /\btheme\b/, /\blight.?mode\b/],
        name: "Theme/Dark Mode",
        category: "styling",
        criteria: ["Theme toggle present", "Colors change when toggled"],
        deps: ["layout"],
      },
      {
        patterns: [/\bresponsive\b/, /\bmobile\b/],
        name: "Responsive Design",
        category: "styling",
        criteria: ["Layout adapts to mobile", "Elements stack on narrow screens"],
        deps: ["layout"],
      },
      {
        patterns: [/\bnotification\b/, /\btoast\b/, /\balert\b/],
        name: "Notifications/Toasts",
        category: "feature",
        criteria: ["Notification component present", "Messages displayed correctly"],
        deps: ["layout"],
      },
      {
        patterns: [/\bapi\b/, /\bbackend\b/, /\bserver\b/, /\bendpoint/],
        name: "API Integration",
        category: "data",
        criteria: ["API calls made", "Data fetched successfully", "Error handling present"],
        deps: ["layout"],
      },
      {
        patterns: [/\broute\b/, /\brouting\b/, /\bpages?\b.*\bmultiple\b/],
        name: "Multi-page Routing",
        category: "navigation",
        criteria: ["Multiple routes defined", "Navigation between pages works"],
        deps: ["layout"],
      },
      {
        patterns: [/\bimage\b/, /\bgallery\b/, /\bcarousel\b/],
        name: "Image Gallery/Carousel",
        category: "feature",
        criteria: ["Images display correctly", "Gallery navigation works"],
        deps: ["layout"],
      },
      {
        patterns: [/\bcalendar\b/, /\bdate/],
        name: "Calendar/Date Picker",
        category: "feature",
        criteria: ["Calendar component renders", "Date selection works"],
        deps: ["layout"],
      },
      {
        patterns: [/\bmap\b/, /\blocation\b/, /\bgeo/],
        name: "Maps/Geolocation",
        category: "feature",
        criteria: ["Map component renders", "Location data displayed"],
        deps: ["layout"],
      },
      {
        patterns: [/\bchat\b/, /\bmessag\b/, /\breal.?time\b/],
        name: "Chat/Messaging",
        category: "feature",
        criteria: ["Chat interface renders", "Messages can be sent", "Messages displayed"],
        deps: ["layout"],
      },
      {
        patterns: [/\bfile.?upload\b/, /\bdrag.?drop\b/, /\bupload\b/],
        name: "File Upload",
        category: "feature",
        criteria: ["Upload area present", "Files can be selected", "Upload feedback shown"],
        deps: ["layout"],
      },
      {
        patterns: [/\banimation\b/, /\btransition\b/],
        name: "Animations & Transitions",
        category: "styling",
        criteria: ["Animations render smoothly", "Transitions visible on interaction"],
        deps: ["layout"],
      },
    ];

    const layoutAdded = false;
    features.push({
      id: "layout",
      name: "App Layout & Structure",
      description: "Basic application shell and root component",
      category: "layout",
      priority: priority++,
      acceptanceCriteria: ["Root component renders without errors", "Basic layout structure visible"],
      dependencies: [],
      passes: false,
    });

    for (const matcher of featureMatchers) {
      if (matcher.name === "App Layout & Structure") continue;

      const matched = matcher.patterns.some(p => p.test(lower));
      if (matched) {
        const depIds = (matcher.deps || []).filter(d => {
          return features.some(f => f.id === d);
        });

        features.push({
          id: matcher.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          name: matcher.name,
          description: this.generateDescription(matcher.name, prompt),
          category: matcher.category,
          priority: priority++,
          acceptanceCriteria: matcher.criteria,
          dependencies: depIds,
          passes: false,
        });
      }
    }

    return features;
  }

  private generateDescription(featureName: string, prompt: string): string {
    const sentences = prompt.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
    const relevantSentence = sentences.find(s =>
      featureName.toLowerCase().split(/\s+/).some(word =>
        s.toLowerCase().includes(word)
      )
    );
    return relevantSentence || featureName;
  }

  private orderByDependency(features: FeatureManifestEntry[]): FeatureManifestEntry[] {
    const ordered: FeatureManifestEntry[] = [];
    const added = new Set<string>();
    const maxIterations = features.length * 2;
    let iterations = 0;

    while (ordered.length < features.length && iterations < maxIterations) {
      iterations++;
      for (const feature of features) {
        if (added.has(feature.id)) continue;
        const depsmet = feature.dependencies.every(d => added.has(d));
        if (depsmet) {
          ordered.push(feature);
          added.add(feature.id);
        }
      }
    }

    for (const feature of features) {
      if (!added.has(feature.id)) {
        ordered.push(feature);
      }
    }

    return ordered;
  }

  private calculateCompletion(manifest: FeatureManifest): number {
    if (manifest.features.length === 0) return 0;
    const passed = manifest.features.filter(f => f.passes).length;
    return Math.round((passed / manifest.features.length) * 100);
  }

  private extractKeywords(text: string): string[] {
    const stopwords = new Set(["the", "a", "an", "is", "are", "can", "be", "in", "on", "at", "to", "for", "of", "with", "and", "or"]);
    return text.toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopwords.has(w));
  }

  private featureDetectedInCode(feature: FeatureManifestEntry, code: string): boolean {
    const lower = code.toLowerCase();
    const nameWords = feature.name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    return nameWords.length > 0 && nameWords.some(w => lower.includes(w));
  }

  destroy(): void {
    this.manifests.clear();
    this.log("InitializerService destroyed");
  }
}

export const initializerService = InitializerService.getInstance();
