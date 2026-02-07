import { BaseService, ManagedMap } from "../lib/base-service";

interface TestScenario {
  id: string;
  name: string;
  description: string;
  type: "ui" | "functionality" | "accessibility" | "performance" | "responsive";
  steps: TestStep[];
  status: "pending" | "running" | "passed" | "failed" | "skipped";
  result?: TestResult;
  createdAt: Date;
}

interface TestStep {
  action: string;
  target: string;
  value?: string;
  assertion?: string;
}

interface TestResult {
  passed: boolean;
  duration: number;
  screenshot?: string;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

interface TestSuite {
  id: string;
  projectId: string;
  scenarios: TestScenario[];
  overallStatus: "pending" | "running" | "passed" | "failed" | "partial";
  createdAt: Date;
  completedAt?: Date;
  coverage: { ui: number; functionality: number; accessibility: number };
}

interface DetectedFeature {
  type: string;
  name: string;
  selector?: string;
  details: Record<string, any>;
}

interface FixSuggestion {
  scenarioId: string;
  scenarioName: string;
  errors: string[];
  suggestions: string[];
  priority: "high" | "medium" | "low";
}

interface SelfTestingStats {
  totalSuites: number;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  pendingScenarios: number;
  averageCoverage: { ui: number; functionality: number; accessibility: number };
  suitesByStatus: Record<string, number>;
}

const MAX_SUITES = 100;

class SelfTestingService extends BaseService {
  private static instance: SelfTestingService;
  private suites: ManagedMap<string, TestSuite>;
  private projectIndex: ManagedMap<string, string[]>;

  private constructor() {
    super("SelfTestingService");
    this.suites = this.createManagedMap<string, TestSuite>({ maxSize: 500, strategy: "lru" });
    this.projectIndex = this.createManagedMap<string, string[]>({ maxSize: 200, strategy: "lru" });
  }

  static getInstance(): SelfTestingService {
    if (!SelfTestingService.instance) {
      SelfTestingService.instance = new SelfTestingService();
    }
    return SelfTestingService.instance;
  }

  generateTestSuite(projectId: string, code: string, appType?: string): TestSuite {
    const suiteId = `suite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const features = this.detectFeatures(code);
    const detectedAppType = appType || this.inferAppType(code, features);
    const scenarios = this.generateScenarios(suiteId, features, detectedAppType, code);

    const coverage = this.calculateCoverage(scenarios);

    const suite: TestSuite = {
      id: suiteId,
      projectId,
      scenarios,
      overallStatus: "pending",
      createdAt: new Date(),
      coverage,
    };

    this.suites.set(suiteId, suite);

    const projectSuites = this.projectIndex.get(projectId) || [];
    projectSuites.push(suiteId);
    this.projectIndex.set(projectId, projectSuites);

    this.log("Generated test suite", {
      suiteId,
      projectId,
      scenarioCount: scenarios.length,
      features: features.length,
      appType: detectedAppType,
      coverage,
    });

    return suite;
  }

  getTestSuite(suiteId: string): TestSuite | undefined {
    return this.suites.get(suiteId);
  }

  getProjectSuites(projectId: string): TestSuite[] {
    const suiteIds = this.projectIndex.get(projectId) || [];
    const results: TestSuite[] = [];
    for (const id of suiteIds) {
      const suite = this.suites.get(id);
      if (suite) {
        results.push(suite);
      }
    }
    return results;
  }

  updateScenarioStatus(
    suiteId: string,
    scenarioId: string,
    status: TestScenario["status"],
    result?: TestResult
  ): boolean {
    const suite = this.suites.get(suiteId);
    if (!suite) {
      this.logWarn("Suite not found for status update", { suiteId, scenarioId });
      return false;
    }

    const scenario = suite.scenarios.find((s) => s.id === scenarioId);
    if (!scenario) {
      this.logWarn("Scenario not found for status update", { suiteId, scenarioId });
      return false;
    }

    scenario.status = status;
    if (result) {
      scenario.result = result;
    }

    suite.overallStatus = this.computeOverallStatus(suite.scenarios);

    if (suite.overallStatus === "passed" || suite.overallStatus === "failed" || suite.overallStatus === "partial") {
      suite.completedAt = new Date();
    }

    this.log("Updated scenario status", { suiteId, scenarioId, status, passed: result?.passed });
    return true;
  }

  generateFixSuggestions(suiteId: string): FixSuggestion[] {
    const suite = this.suites.get(suiteId);
    if (!suite) {
      this.logWarn("Suite not found for fix suggestions", { suiteId });
      return [];
    }

    const suggestions: FixSuggestion[] = [];

    for (const scenario of suite.scenarios) {
      if (scenario.status !== "failed" || !scenario.result) continue;

      const fixSuggestions = this.generateSuggestionsForScenario(scenario);
      suggestions.push({
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        errors: scenario.result.errors,
        suggestions: fixSuggestions,
        priority: this.determinePriority(scenario),
      });
    }

    suggestions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    this.log("Generated fix suggestions", {
      suiteId,
      suggestionCount: suggestions.length,
    });

    return suggestions;
  }

  getStats(): SelfTestingStats {
    const allSuites = this.suites.values();
    let totalScenarios = 0;
    let passedScenarios = 0;
    let failedScenarios = 0;
    let pendingScenarios = 0;
    let totalUi = 0;
    let totalFunc = 0;
    let totalA11y = 0;
    const suitesByStatus: Record<string, number> = {};

    for (const suite of allSuites) {
      suitesByStatus[suite.overallStatus] = (suitesByStatus[suite.overallStatus] || 0) + 1;
      totalUi += suite.coverage.ui;
      totalFunc += suite.coverage.functionality;
      totalA11y += suite.coverage.accessibility;

      for (const scenario of suite.scenarios) {
        totalScenarios++;
        if (scenario.status === "passed") passedScenarios++;
        else if (scenario.status === "failed") failedScenarios++;
        else if (scenario.status === "pending") pendingScenarios++;
      }
    }

    const count = allSuites.length || 1;

    return {
      totalSuites: allSuites.length,
      totalScenarios,
      passedScenarios,
      failedScenarios,
      pendingScenarios,
      averageCoverage: {
        ui: Math.round(totalUi / count),
        functionality: Math.round(totalFunc / count),
        accessibility: Math.round(totalA11y / count),
      },
      suitesByStatus,
    };
  }

  destroy(): void {
    this.suites.clear();
    this.projectIndex.clear();
    this.log("SelfTestingService destroyed");
  }

  private detectFeatures(code: string): DetectedFeature[] {
    const features: DetectedFeature[] = [];

    const formPatterns = [
      /<form[\s>]/gi,
      /useForm\s*\(/gi,
      /onSubmit/gi,
      /handleSubmit/gi,
      /<input[\s>]/gi,
      /<textarea[\s>]/gi,
      /<select[\s>]/gi,
    ];
    const formMatches = formPatterns.reduce((count, p) => count + (code.match(p) || []).length, 0);
    if (formMatches > 0) {
      const inputTypes = this.extractInputTypes(code);
      features.push({
        type: "form",
        name: "Form inputs",
        details: { matchCount: formMatches, inputTypes },
      });
    }

    const buttonPatterns = [
      /<button[\s>]/gi,
      /<Button[\s>]/gi,
      /onClick/gi,
      /onPress/gi,
    ];
    const buttonMatches = buttonPatterns.reduce((count, p) => count + (code.match(p) || []).length, 0);
    if (buttonMatches > 0) {
      features.push({
        type: "button",
        name: "Interactive buttons",
        details: { matchCount: buttonMatches },
      });
    }

    const navPatterns = [
      /<nav[\s>]/gi,
      /<Link[\s>]/gi,
      /useLocation/gi,
      /useNavigate/gi,
      /useRouter/gi,
      /href="/gi,
      /<a\s/gi,
      /Route\s/gi,
      /Switch/gi,
    ];
    const navMatches = navPatterns.reduce((count, p) => count + (code.match(p) || []).length, 0);
    if (navMatches > 0) {
      const routes = this.extractRoutes(code);
      features.push({
        type: "navigation",
        name: "Navigation and routing",
        details: { matchCount: navMatches, routes },
      });
    }

    const apiPatterns = [
      /fetch\s*\(/gi,
      /axios\./gi,
      /useQuery/gi,
      /useMutation/gi,
      /apiRequest/gi,
      /\.get\s*\(/gi,
      /\.post\s*\(/gi,
      /\.put\s*\(/gi,
      /\.delete\s*\(/gi,
      /\.patch\s*\(/gi,
    ];
    const apiMatches = apiPatterns.reduce((count, p) => count + (code.match(p) || []).length, 0);
    if (apiMatches > 0) {
      const endpoints = this.extractEndpoints(code);
      features.push({
        type: "api",
        name: "API calls",
        details: { matchCount: apiMatches, endpoints },
      });
    }

    const listPatterns = [
      /\.map\s*\(/gi,
      /\.filter\s*\(/gi,
      /forEach/gi,
      /<ul[\s>]/gi,
      /<ol[\s>]/gi,
      /<table[\s>]/gi,
      /DataTable/gi,
      /isLoading/gi,
      /isPending/gi,
    ];
    const listMatches = listPatterns.reduce((count, p) => count + (code.match(p) || []).length, 0);
    if (listMatches > 2) {
      features.push({
        type: "list",
        name: "List/table display",
        details: { matchCount: listMatches },
      });
    }

    const authPatterns = [
      /login/gi,
      /logout/gi,
      /signIn/gi,
      /signOut/gi,
      /signUp/gi,
      /register/gi,
      /password/gi,
      /auth/gi,
      /token/gi,
      /session/gi,
    ];
    const authMatches = authPatterns.reduce((count, p) => count + (code.match(p) || []).length, 0);
    if (authMatches > 3) {
      features.push({
        type: "auth",
        name: "Authentication",
        details: { matchCount: authMatches },
      });
    }

    const crudPatterns = [
      /create/gi,
      /update/gi,
      /delete/gi,
      /remove/gi,
      /add/gi,
      /edit/gi,
      /save/gi,
      /INSERT/gi,
      /UPDATE/gi,
      /DELETE/gi,
    ];
    const crudMatches = crudPatterns.reduce((count, p) => count + (code.match(p) || []).length, 0);
    if (crudMatches > 3) {
      features.push({
        type: "crud",
        name: "CRUD operations",
        details: { matchCount: crudMatches },
      });
    }

    const imagePatterns = [/<img[\s>]/gi, /<Image[\s>]/gi, /background-image/gi, /src="/gi];
    const imageMatches = imagePatterns.reduce((count, p) => count + (code.match(p) || []).length, 0);
    if (imageMatches > 0) {
      features.push({
        type: "media",
        name: "Images/media",
        details: { matchCount: imageMatches },
      });
    }

    const modalPatterns = [/modal/gi, /dialog/gi, /Dialog/gi, /Sheet/gi, /Drawer/gi, /popup/gi];
    const modalMatches = modalPatterns.reduce((count, p) => count + (code.match(p) || []).length, 0);
    if (modalMatches > 0) {
      features.push({
        type: "modal",
        name: "Modals/dialogs",
        details: { matchCount: modalMatches },
      });
    }

    const a11yPatterns = [/aria-/gi, /role="/gi, /alt="/gi, /tabIndex/gi, /sr-only/gi];
    const a11yMatches = a11yPatterns.reduce((count, p) => count + (code.match(p) || []).length, 0);
    features.push({
      type: "accessibility",
      name: "Accessibility attributes",
      details: { matchCount: a11yMatches, hasAriaLabels: a11yMatches > 0 },
    });

    const responsivePatterns = [/md:/gi, /lg:/gi, /sm:/gi, /xl:/gi, /@media/gi, /useMediaQuery/gi];
    const responsiveMatches = responsivePatterns.reduce((count, p) => count + (code.match(p) || []).length, 0);
    if (responsiveMatches > 0) {
      features.push({
        type: "responsive",
        name: "Responsive design",
        details: { matchCount: responsiveMatches },
      });
    }

    return features;
  }

  private extractInputTypes(code: string): string[] {
    const types: Set<string> = new Set();
    const typeMatches = Array.from(code.matchAll(/type="(\w+)"/gi));
    for (const m of typeMatches) {
      const t = m[1].toLowerCase();
      if (["text", "email", "password", "number", "tel", "url", "date", "file", "checkbox", "radio", "search"].includes(t)) {
        types.add(t);
      }
    }
    return Array.from(types);
  }

  private extractRoutes(code: string): string[] {
    const routes: Set<string> = new Set();
    const routeMatches = Array.from(code.matchAll(/path="([^"]+)"/gi));
    for (const m of routeMatches) {
      routes.add(m[1]);
    }
    const hrefMatches = Array.from(code.matchAll(/href="(\/[^"]+)"/gi));
    for (const m of hrefMatches) {
      routes.add(m[1]);
    }
    return Array.from(routes);
  }

  private extractEndpoints(code: string): string[] {
    const endpoints: Set<string> = new Set();
    const apiMatches = Array.from(code.matchAll(/["'`](\/api\/[^"'`]+)["'`]/gi));
    for (const m of apiMatches) {
      endpoints.add(m[1]);
    }
    return Array.from(endpoints);
  }

  private inferAppType(code: string, features: DetectedFeature[]): string {
    const featureTypes = new Set(features.map((f) => f.type));

    if (featureTypes.has("auth") && featureTypes.has("crud")) return "full-stack";
    if (featureTypes.has("auth")) return "auth-app";
    if (featureTypes.has("crud") && featureTypes.has("api")) return "data-app";
    if (featureTypes.has("form") && featureTypes.has("api")) return "form-app";
    if (featureTypes.has("navigation") && featureTypes.has("list")) return "content-app";
    if (featureTypes.has("form")) return "form-app";
    if (featureTypes.has("list")) return "list-app";
    return "generic";
  }

  private generateScenarios(
    suiteId: string,
    features: DetectedFeature[],
    appType: string,
    code: string
  ): TestScenario[] {
    const scenarios: TestScenario[] = [];
    let scenarioIndex = 0;

    const makeId = () => `${suiteId}_scenario_${scenarioIndex++}`;

    for (const feature of features) {
      switch (feature.type) {
        case "form":
          scenarios.push(...this.generateFormScenarios(makeId, feature));
          break;
        case "button":
          scenarios.push(...this.generateButtonScenarios(makeId, feature));
          break;
        case "navigation":
          scenarios.push(...this.generateNavigationScenarios(makeId, feature));
          break;
        case "api":
          scenarios.push(...this.generateApiScenarios(makeId, feature));
          break;
        case "list":
          scenarios.push(...this.generateListScenarios(makeId, feature));
          break;
        case "auth":
          scenarios.push(...this.generateAuthScenarios(makeId, feature));
          break;
        case "crud":
          scenarios.push(...this.generateCrudScenarios(makeId, feature));
          break;
        case "modal":
          scenarios.push(...this.generateModalScenarios(makeId, feature));
          break;
        case "accessibility":
          scenarios.push(...this.generateAccessibilityScenarios(makeId, feature));
          break;
        case "responsive":
          scenarios.push(...this.generateResponsiveScenarios(makeId, feature));
          break;
        case "media":
          scenarios.push(...this.generateMediaScenarios(makeId, feature));
          break;
      }
    }

    scenarios.push(...this.generatePerformanceScenarios(makeId, code));

    return scenarios;
  }

  private generateFormScenarios(makeId: () => string, feature: DetectedFeature): TestScenario[] {
    const scenarios: TestScenario[] = [];
    const inputTypes: string[] = feature.details.inputTypes || [];

    scenarios.push({
      id: makeId(),
      name: "Form - Valid submission",
      description: "Submit form with all valid data and verify success",
      type: "functionality",
      steps: [
        { action: "navigate", target: "form page" },
        ...inputTypes.map((t) => ({
          action: "type" as string,
          target: `input[type="${t}"]`,
          value: this.getValidValueForType(t),
        })),
        { action: "click", target: "submit button", assertion: "Form submits successfully" },
        { action: "verify", target: "success message", assertion: "Success feedback is displayed" },
      ],
      status: "pending",
      createdAt: new Date(),
    });

    scenarios.push({
      id: makeId(),
      name: "Form - Empty submission",
      description: "Submit form without filling any fields and verify validation errors",
      type: "functionality",
      steps: [
        { action: "navigate", target: "form page" },
        { action: "click", target: "submit button" },
        { action: "verify", target: "validation errors", assertion: "Validation errors are displayed for required fields" },
      ],
      status: "pending",
      createdAt: new Date(),
    });

    if (inputTypes.includes("email")) {
      scenarios.push({
        id: makeId(),
        name: "Form - Invalid email format",
        description: "Enter invalid email and verify validation error",
        type: "functionality",
        steps: [
          { action: "type", target: 'input[type="email"]', value: "not-an-email" },
          { action: "click", target: "submit button" },
          { action: "verify", target: "email error", assertion: "Email validation error is shown" },
        ],
        status: "pending",
        createdAt: new Date(),
      });
    }

    if (inputTypes.includes("password")) {
      scenarios.push({
        id: makeId(),
        name: "Form - Weak password",
        description: "Enter a weak password and verify validation",
        type: "functionality",
        steps: [
          { action: "type", target: 'input[type="password"]', value: "123" },
          { action: "click", target: "submit button" },
          { action: "verify", target: "password error", assertion: "Password strength validation is shown" },
        ],
        status: "pending",
        createdAt: new Date(),
      });
    }

    return scenarios;
  }

  private generateButtonScenarios(makeId: () => string, feature: DetectedFeature): TestScenario[] {
    return [
      {
        id: makeId(),
        name: "Buttons - Click handlers respond",
        description: "Verify all interactive buttons trigger their handlers",
        type: "ui",
        steps: [
          { action: "verify", target: "all buttons", assertion: "All buttons have click handlers attached" },
          { action: "click", target: "primary action button", assertion: "Click handler executes without error" },
          { action: "verify", target: "UI state", assertion: "UI updates appropriately after button click" },
        ],
        status: "pending",
        createdAt: new Date(),
      },
      {
        id: makeId(),
        name: "Buttons - Disabled state",
        description: "Verify buttons show proper disabled states",
        type: "ui",
        steps: [
          { action: "verify", target: "disabled buttons", assertion: "Disabled buttons have visual indication" },
          { action: "click", target: "disabled button", assertion: "Disabled buttons do not trigger actions" },
        ],
        status: "pending",
        createdAt: new Date(),
      },
    ];
  }

  private generateNavigationScenarios(makeId: () => string, feature: DetectedFeature): TestScenario[] {
    const routes: string[] = feature.details.routes || [];
    const scenarios: TestScenario[] = [];

    if (routes.length > 0) {
      scenarios.push({
        id: makeId(),
        name: "Navigation - Route accessibility",
        description: "Verify all defined routes are accessible",
        type: "functionality",
        steps: routes.map((route) => ({
          action: "navigate" as string,
          target: route,
          assertion: `Route ${route} renders without errors`,
        })),
        status: "pending",
        createdAt: new Date(),
      });
    }

    scenarios.push({
      id: makeId(),
      name: "Navigation - Link functionality",
      description: "Verify all navigation links work correctly",
      type: "functionality",
      steps: [
        { action: "verify", target: "nav links", assertion: "All links have valid href attributes" },
        { action: "click", target: "first nav link", assertion: "Navigation occurs without errors" },
        { action: "verify", target: "page content", assertion: "Correct page content is displayed" },
      ],
      status: "pending",
      createdAt: new Date(),
    });

    scenarios.push({
      id: makeId(),
      name: "Navigation - 404 handling",
      description: "Verify that invalid routes show proper 404 page",
      type: "functionality",
      steps: [
        { action: "navigate", target: "/non-existent-route-xyz" },
        { action: "verify", target: "404 page", assertion: "404 or not-found page is displayed" },
      ],
      status: "pending",
      createdAt: new Date(),
    });

    return scenarios;
  }

  private generateApiScenarios(makeId: () => string, feature: DetectedFeature): TestScenario[] {
    const endpoints: string[] = feature.details.endpoints || [];
    const scenarios: TestScenario[] = [];

    scenarios.push({
      id: makeId(),
      name: "API - Loading states",
      description: "Verify loading indicators appear during API calls",
      type: "ui",
      steps: [
        { action: "navigate", target: "page with API calls" },
        { action: "verify", target: "loading indicator", assertion: "Loading state is shown during data fetch" },
        { action: "wait", target: "data load complete" },
        { action: "verify", target: "loaded content", assertion: "Content displays after loading completes" },
      ],
      status: "pending",
      createdAt: new Date(),
    });

    scenarios.push({
      id: makeId(),
      name: "API - Error handling",
      description: "Verify proper error states when API calls fail",
      type: "functionality",
      steps: [
        { action: "navigate", target: "page with API calls" },
        { action: "simulate", target: "API failure" },
        { action: "verify", target: "error message", assertion: "User-friendly error message is displayed" },
      ],
      status: "pending",
      createdAt: new Date(),
    });

    if (endpoints.length > 0) {
      scenarios.push({
        id: makeId(),
        name: "API - Endpoint responses",
        description: "Verify API endpoints return expected data",
        type: "functionality",
        steps: endpoints.map((ep) => ({
          action: "request" as string,
          target: ep,
          assertion: `Endpoint ${ep} returns valid response`,
        })),
        status: "pending",
        createdAt: new Date(),
      });
    }

    return scenarios;
  }

  private generateListScenarios(makeId: () => string, feature: DetectedFeature): TestScenario[] {
    return [
      {
        id: makeId(),
        name: "List - Empty state",
        description: "Verify proper display when list has no items",
        type: "ui",
        steps: [
          { action: "navigate", target: "list page" },
          { action: "verify", target: "empty state", assertion: "Empty state message or illustration is shown" },
        ],
        status: "pending",
        createdAt: new Date(),
      },
      {
        id: makeId(),
        name: "List - Data display",
        description: "Verify list correctly displays data items",
        type: "functionality",
        steps: [
          { action: "navigate", target: "list page" },
          { action: "verify", target: "list items", assertion: "List items render with correct data" },
          { action: "verify", target: "item count", assertion: "Number of displayed items matches data" },
        ],
        status: "pending",
        createdAt: new Date(),
      },
    ];
  }

  private generateAuthScenarios(makeId: () => string, feature: DetectedFeature): TestScenario[] {
    return [
      {
        id: makeId(),
        name: "Auth - Login flow",
        description: "Verify complete login process",
        type: "functionality",
        steps: [
          { action: "navigate", target: "login page" },
          { action: "type", target: "email input", value: "test@example.com" },
          { action: "type", target: "password input", value: "TestPass123!" },
          { action: "click", target: "login button", assertion: "Login succeeds" },
          { action: "verify", target: "authenticated state", assertion: "User is redirected to dashboard" },
        ],
        status: "pending",
        createdAt: new Date(),
      },
      {
        id: makeId(),
        name: "Auth - Protected routes",
        description: "Verify unauthenticated users cannot access protected pages",
        type: "functionality",
        steps: [
          { action: "navigate", target: "protected page" },
          { action: "verify", target: "redirect", assertion: "User is redirected to login page" },
        ],
        status: "pending",
        createdAt: new Date(),
      },
    ];
  }

  private generateCrudScenarios(makeId: () => string, feature: DetectedFeature): TestScenario[] {
    return [
      {
        id: makeId(),
        name: "CRUD - Create item",
        description: "Verify new item creation",
        type: "functionality",
        steps: [
          { action: "click", target: "create/add button" },
          { action: "type", target: "form fields", value: "test data" },
          { action: "click", target: "save button", assertion: "Item is created successfully" },
          { action: "verify", target: "item in list", assertion: "New item appears in the list" },
        ],
        status: "pending",
        createdAt: new Date(),
      },
      {
        id: makeId(),
        name: "CRUD - Delete item",
        description: "Verify item deletion with confirmation",
        type: "functionality",
        steps: [
          { action: "click", target: "delete button", assertion: "Confirmation dialog appears" },
          { action: "click", target: "confirm delete", assertion: "Item is removed" },
          { action: "verify", target: "item list", assertion: "Deleted item no longer appears" },
        ],
        status: "pending",
        createdAt: new Date(),
      },
    ];
  }

  private generateModalScenarios(makeId: () => string, feature: DetectedFeature): TestScenario[] {
    return [
      {
        id: makeId(),
        name: "Modal - Open and close",
        description: "Verify modal opens and closes correctly",
        type: "ui",
        steps: [
          { action: "click", target: "modal trigger", assertion: "Modal opens" },
          { action: "verify", target: "modal content", assertion: "Modal displays expected content" },
          { action: "click", target: "close button", assertion: "Modal closes" },
          { action: "verify", target: "modal gone", assertion: "Modal is no longer visible" },
        ],
        status: "pending",
        createdAt: new Date(),
      },
    ];
  }

  private generateAccessibilityScenarios(makeId: () => string, feature: DetectedFeature): TestScenario[] {
    return [
      {
        id: makeId(),
        name: "A11y - ARIA labels",
        description: "Verify all interactive elements have proper ARIA labels",
        type: "accessibility",
        steps: [
          { action: "verify", target: "interactive elements", assertion: "All buttons, links, and inputs have ARIA labels" },
          { action: "verify", target: "images", assertion: "All images have alt attributes" },
          { action: "verify", target: "headings", assertion: "Heading hierarchy is correct (h1 > h2 > h3)" },
        ],
        status: "pending",
        createdAt: new Date(),
      },
      {
        id: makeId(),
        name: "A11y - Keyboard navigation",
        description: "Verify the app is fully navigable by keyboard",
        type: "accessibility",
        steps: [
          { action: "press", target: "Tab key", assertion: "Focus moves to next interactive element" },
          { action: "verify", target: "focus indicator", assertion: "Focused element has visible focus ring" },
          { action: "press", target: "Enter key", assertion: "Focused button/link activates" },
          { action: "press", target: "Escape key", assertion: "Open modals/popups close" },
        ],
        status: "pending",
        createdAt: new Date(),
      },
    ];
  }

  private generateResponsiveScenarios(makeId: () => string, feature: DetectedFeature): TestScenario[] {
    return [
      {
        id: makeId(),
        name: "Responsive - Mobile viewport",
        description: "Verify layout adapts to mobile screen size (375px)",
        type: "responsive",
        steps: [
          { action: "verify", target: "viewport 375px", assertion: "Layout stacks to single column on mobile" },
          { action: "verify", target: "navigation", assertion: "Navigation collapses to hamburger menu" },
          { action: "verify", target: "touch targets", assertion: "All touch targets are at least 44x44px" },
          { action: "verify", target: "no overflow", assertion: "No horizontal scrollbar appears" },
        ],
        status: "pending",
        createdAt: new Date(),
      },
      {
        id: makeId(),
        name: "Responsive - Tablet viewport",
        description: "Verify layout adapts to tablet screen size (768px)",
        type: "responsive",
        steps: [
          { action: "verify", target: "viewport 768px", assertion: "Layout adjusts for tablet width" },
          { action: "verify", target: "content spacing", assertion: "Content has appropriate spacing for tablet" },
        ],
        status: "pending",
        createdAt: new Date(),
      },
      {
        id: makeId(),
        name: "Responsive - Desktop viewport",
        description: "Verify full desktop layout at 1280px+",
        type: "responsive",
        steps: [
          { action: "verify", target: "viewport 1280px", assertion: "Full desktop layout is displayed" },
          { action: "verify", target: "sidebar/navigation", assertion: "Desktop navigation is fully visible" },
        ],
        status: "pending",
        createdAt: new Date(),
      },
    ];
  }

  private generateMediaScenarios(makeId: () => string, feature: DetectedFeature): TestScenario[] {
    return [
      {
        id: makeId(),
        name: "Media - Image loading",
        description: "Verify images load correctly and have alt text",
        type: "ui",
        steps: [
          { action: "verify", target: "all images", assertion: "All images load without broken image icons" },
          { action: "verify", target: "image alt text", assertion: "All images have descriptive alt attributes" },
        ],
        status: "pending",
        createdAt: new Date(),
      },
    ];
  }

  private generatePerformanceScenarios(makeId: () => string, code: string): TestScenario[] {
    const scenarios: TestScenario[] = [];

    scenarios.push({
      id: makeId(),
      name: "Performance - Initial render",
      description: "Verify the application renders within acceptable time",
      type: "performance",
      steps: [
        { action: "navigate", target: "home page" },
        { action: "verify", target: "first contentful paint", assertion: "Page renders meaningful content within 2 seconds" },
      ],
      status: "pending",
      createdAt: new Date(),
    });

    if (code.length > 50000) {
      scenarios.push({
        id: makeId(),
        name: "Performance - Bundle size",
        description: "Verify the code bundle is not excessively large",
        type: "performance",
        steps: [
          { action: "verify", target: "bundle", assertion: "Total code size is within acceptable limits" },
        ],
        status: "pending",
        createdAt: new Date(),
      });
    }

    return scenarios;
  }

  private getValidValueForType(type: string): string {
    const values: Record<string, string> = {
      text: "Test User Input",
      email: "testuser@example.com",
      password: "StrongP@ssw0rd!",
      number: "42",
      tel: "+1-555-123-4567",
      url: "https://example.com",
      date: "2026-01-15",
      file: "test-file.pdf",
      checkbox: "checked",
      radio: "option1",
      search: "search query",
    };
    return values[type] || "test value";
  }

  private calculateCoverage(scenarios: TestScenario[]): { ui: number; functionality: number; accessibility: number } {
    if (scenarios.length === 0) return { ui: 0, functionality: 0, accessibility: 0 };

    const uiScenarios = scenarios.filter((s) => s.type === "ui" || s.type === "responsive").length;
    const funcScenarios = scenarios.filter((s) => s.type === "functionality").length;
    const a11yScenarios = scenarios.filter((s) => s.type === "accessibility").length;

    const total = scenarios.length;
    return {
      ui: Math.round((uiScenarios / total) * 100),
      functionality: Math.round((funcScenarios / total) * 100),
      accessibility: Math.round((a11yScenarios / total) * 100),
    };
  }

  private computeOverallStatus(scenarios: TestScenario[]): TestSuite["overallStatus"] {
    if (scenarios.length === 0) return "pending";

    const statuses = new Set(scenarios.map((s) => s.status));

    if (statuses.has("running")) return "running";
    if (statuses.size === 1 && statuses.has("passed")) return "passed";
    if (statuses.size === 1 && statuses.has("failed")) return "failed";
    if (statuses.size === 1 && statuses.has("pending")) return "pending";
    if (statuses.has("passed") && statuses.has("failed")) return "partial";
    if (statuses.has("passed") || statuses.has("failed")) return "partial";

    return "pending";
  }

  private generateSuggestionsForScenario(scenario: TestScenario): string[] {
    const suggestions: string[] = [];

    for (const error of scenario.result?.errors || []) {
      if (/not found|missing/i.test(error)) {
        suggestions.push(`Ensure the element or component referenced exists in the DOM: "${error}"`);
      }
      if (/timeout|slow/i.test(error)) {
        suggestions.push(`Optimize loading performance or add loading states: "${error}"`);
      }
      if (/validation|invalid/i.test(error)) {
        suggestions.push(`Add proper input validation with user-friendly error messages: "${error}"`);
      }
      if (/accessibility|aria|contrast/i.test(error)) {
        suggestions.push(`Add proper ARIA labels, alt text, or improve color contrast: "${error}"`);
      }
      if (/navigation|route|redirect/i.test(error)) {
        suggestions.push(`Verify route definitions and navigation handlers are correct: "${error}"`);
      }
    }

    switch (scenario.type) {
      case "ui":
        suggestions.push("Check that UI components render correctly in all states (loading, error, empty, populated)");
        break;
      case "functionality":
        suggestions.push("Verify event handlers are properly attached and state updates correctly");
        break;
      case "accessibility":
        suggestions.push("Run an accessibility audit tool and address all reported issues");
        break;
      case "performance":
        suggestions.push("Profile the application to identify render bottlenecks and unnecessary re-renders");
        break;
      case "responsive":
        suggestions.push("Test with browser dev tools at standard breakpoints (375px, 768px, 1024px, 1440px)");
        break;
    }

    return suggestions;
  }

  private determinePriority(scenario: TestScenario): "high" | "medium" | "low" {
    if (scenario.type === "functionality") return "high";
    if (scenario.type === "accessibility") return "high";
    if (scenario.type === "ui") return "medium";
    if (scenario.type === "responsive") return "medium";
    return "low";
  }

  generateHealthCheck(projectId: string, code: string): {
    checks: { name: string; type: string; assertion: string; target: string }[];
    isBroken: boolean;
    issues: string[];
  } {
    const checks: { name: string; type: string; assertion: string; target: string }[] = [];
    const issues: string[] = [];

    const hasReturn = /return\s*\(/m.test(code) || /return\s+</m.test(code);
    if (!hasReturn) {
      issues.push("No JSX return statement found - app may not render");
    }
    checks.push({
      name: "App renders without crash",
      type: "render",
      assertion: "check_exists",
      target: "body > *",
    });

    const hasUnclosedTag = this.detectUnclosedTags(code);
    if (hasUnclosedTag) {
      issues.push("Potential unclosed JSX tag detected");
    }

    const hasSyntaxError = this.detectBasicSyntaxErrors(code);
    if (hasSyntaxError) {
      issues.push("Potential syntax error detected");
    }

    if (/import\s/.test(code)) {
      const missingExports = this.detectMissingImports(code);
      if (missingExports.length > 0) {
        issues.push(`Potentially missing imports: ${missingExports.join(", ")}`);
      }
    }

    if (/function\s+App|const\s+App|export\s+default/.test(code)) {
      checks.push({
        name: "Root component mounts",
        type: "render",
        assertion: "check_exists",
        target: "#root, #app, [data-reactroot], body > div",
      });
    }

    if (/<button|<a\s|<input|onClick/.test(code)) {
      checks.push({
        name: "Interactive elements present",
        type: "functionality",
        assertion: "check_exists",
        target: "button, a, input, [role='button']",
      });
    }

    if (/<h[1-6]/.test(code)) {
      checks.push({
        name: "Headings render",
        type: "ui",
        assertion: "check_exists",
        target: "h1, h2, h3, h4, h5, h6",
      });
    }

    if (/useState|useReducer/.test(code)) {
      checks.push({
        name: "State-dependent UI renders",
        type: "functionality",
        assertion: "check_visible",
        target: "[data-testid], button, input, select",
      });
    }

    const isBroken = issues.length > 0;

    this.log("Health check generated", {
      projectId,
      checkCount: checks.length,
      issueCount: issues.length,
      isBroken,
    });

    return { checks, isBroken, issues };
  }

  private detectUnclosedTags(code: string): boolean {
    const selfClosing = new Set(["br", "hr", "img", "input", "meta", "link", "area", "base", "col", "embed", "source", "track", "wbr"]);
    const openTags: string[] = [];
    const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*\/?>/g;

    let match;
    while ((match = tagPattern.exec(code)) !== null) {
      const fullMatch = match[0];
      const tagName = match[1].toLowerCase();

      if (selfClosing.has(tagName) || fullMatch.endsWith("/>")) continue;

      if (fullMatch.startsWith("</")) {
        if (openTags.length > 0 && openTags[openTags.length - 1] === tagName) {
          openTags.pop();
        }
      } else {
        openTags.push(tagName);
      }
    }

    return openTags.length > 3;
  }

  private detectBasicSyntaxErrors(code: string): boolean {
    let braces = 0;
    let parens = 0;
    let brackets = 0;
    let inString = false;
    let stringChar = "";
    let inTemplate = false;

    for (let i = 0; i < code.length; i++) {
      const ch = code[i];
      const prev = i > 0 ? code[i - 1] : "";

      if (inString) {
        if (ch === stringChar && prev !== "\\") inString = false;
        continue;
      }
      if (inTemplate) {
        if (ch === "`" && prev !== "\\") inTemplate = false;
        continue;
      }

      if (ch === '"' || ch === "'") { inString = true; stringChar = ch; continue; }
      if (ch === "`") { inTemplate = true; continue; }
      if (ch === "{") braces++;
      if (ch === "}") braces--;
      if (ch === "(") parens++;
      if (ch === ")") parens--;
      if (ch === "[") brackets++;
      if (ch === "]") brackets--;

      if (braces < -2 || parens < -2 || brackets < -2) return true;
    }

    return Math.abs(braces) > 2 || Math.abs(parens) > 2 || Math.abs(brackets) > 2;
  }

  private detectMissingImports(code: string): string[] {
    const missing: string[] = [];
    const importPattern = /import\s+\{([^}]+)\}\s+from\s+['"]\.\/([^'"]+)['"]/g;

    let match;
    while ((match = importPattern.exec(code)) !== null) {
      const importedNames = match[1].split(",").map(s => s.trim());
      const modulePath = match[2];

      for (const name of importedNames) {
        const exportPattern = new RegExp(`export\\s+(?:const|function|class|type|interface)\\s+${name}\\b`);
        if (!exportPattern.test(code) && !code.includes(`export { ${name}`)) {
          if (!code.includes(`from '${modulePath}'`) || code.split(`from './${modulePath}'`).length <= 1) {
            continue;
          }
        }
      }
    }

    return missing;
  }
}

export const selfTestingService = SelfTestingService.getInstance();
