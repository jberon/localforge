import { BaseService, ManagedMap } from "../lib/base-service";

type HookEvent =
  | "post-generation"
  | "post-refinement"
  | "pre-deploy"
  | "post-test"
  | "on-error"
  | "pre-generation";

interface HookAction {
  type: "validate" | "check-todos" | "regenerate-tests" | "custom-check" | "log" | "health-check" | "auto-fix";
  description: string;
  config?: Record<string, unknown>;
}

interface Hook {
  id: string;
  event: HookEvent;
  action: HookAction;
  enabled: boolean;
  createdAt: number;
}

interface HookExecutionResult {
  hookId: string;
  event: HookEvent;
  action: string;
  success: boolean;
  message: string;
  duration: number;
  details?: Record<string, unknown>;
}

interface ProjectHooks {
  projectId: string;
  hooks: Hook[];
  executionHistory: HookExecutionResult[];
}

class HooksService extends BaseService {
  private static instance: HooksService;
  private projectHooks: ManagedMap<string, ProjectHooks>;
  private defaultHooks: Hook[];

  private constructor() {
    super("HooksService");
    this.projectHooks = this.createManagedMap<string, ProjectHooks>({ maxSize: 200, strategy: "lru" });
    this.defaultHooks = this.createDefaultHooks();
  }

  static getInstance(): HooksService {
    if (!HooksService.instance) {
      HooksService.instance = new HooksService();
    }
    return HooksService.instance;
  }

  getHooks(projectId: string): ProjectHooks {
    let hooks = this.projectHooks.get(projectId);
    if (!hooks) {
      hooks = {
        projectId,
        hooks: this.defaultHooks.map(h => ({ ...h, id: `${h.id}_${projectId}` })),
        executionHistory: [],
      };
      this.projectHooks.set(projectId, hooks);
    }
    return hooks;
  }

  addHook(projectId: string, event: HookEvent, action: HookAction): Hook {
    const hooks = this.getHooks(projectId);
    const hook: Hook = {
      id: `hook_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      event,
      action,
      enabled: true,
      createdAt: Date.now(),
    };
    hooks.hooks.push(hook);
    this.projectHooks.set(projectId, hooks);
    this.log("Hook added", { projectId, event, action: action.type });
    return hook;
  }

  removeHook(projectId: string, hookId: string): boolean {
    const hooks = this.projectHooks.get(projectId);
    if (!hooks) return false;

    const idx = hooks.hooks.findIndex(h => h.id === hookId);
    if (idx === -1) return false;

    hooks.hooks.splice(idx, 1);
    this.projectHooks.set(projectId, hooks);
    return true;
  }

  toggleHook(projectId: string, hookId: string, enabled: boolean): boolean {
    const hooks = this.projectHooks.get(projectId);
    if (!hooks) return false;

    const hook = hooks.hooks.find(h => h.id === hookId);
    if (!hook) return false;

    hook.enabled = enabled;
    this.projectHooks.set(projectId, hooks);
    return true;
  }

  async fireHooks(projectId: string, event: HookEvent, context: {
    code?: string;
    prompt?: string;
    errors?: string[];
    error?: string;
    testResults?: { passed: number; failed: number };
    qualityScore?: number;
    refinement?: string;
    phase?: string;
    autoHealed?: boolean;
  }): Promise<HookExecutionResult[]> {
    const hooks = this.getHooks(projectId);
    const activeHooks = hooks.hooks.filter(h => h.event === event && h.enabled);

    if (activeHooks.length === 0) return [];

    const results: HookExecutionResult[] = [];

    for (const hook of activeHooks) {
      const start = Date.now();
      try {
        const result = await this.executeHook(projectId, hook, context);
        const execResult: HookExecutionResult = {
          hookId: hook.id,
          event,
          action: hook.action.type,
          success: result.success,
          message: result.message,
          duration: Date.now() - start,
          details: result.details,
        };
        results.push(execResult);
      } catch (error: any) {
        results.push({
          hookId: hook.id,
          event,
          action: hook.action.type,
          success: false,
          message: `Hook execution error: ${error.message}`,
          duration: Date.now() - start,
        });
      }
    }

    hooks.executionHistory.push(...results);
    if (hooks.executionHistory.length > 100) {
      hooks.executionHistory = hooks.executionHistory.slice(-100);
    }
    this.projectHooks.set(projectId, hooks);

    return results;
  }

  getExecutionHistory(projectId: string, limit: number = 20): HookExecutionResult[] {
    const hooks = this.projectHooks.get(projectId);
    if (!hooks) return [];
    return hooks.executionHistory.slice(-limit);
  }

  private async executeHook(
    projectId: string,
    hook: Hook,
    context: { code?: string; prompt?: string; errors?: string[]; error?: string; testResults?: { passed: number; failed: number }; qualityScore?: number; refinement?: string; phase?: string; autoHealed?: boolean }
  ): Promise<{ success: boolean; message: string; details?: Record<string, unknown> }> {
    switch (hook.action.type) {
      case "validate":
        return this.runValidateHook(context.code || "");
      case "check-todos":
        return this.runCheckTodosHook(context.code || "");
      case "regenerate-tests":
        return this.runRegenerateTestsHook(context.code || "");
      case "custom-check":
        return this.runCustomCheckHook(hook.action.config || {}, context.code || "");
      case "log":
        return { success: true, message: `Hook event logged: ${hook.event}` };
      case "health-check": {
        const { selfTestingService } = await import("./self-testing.service");
        const code = context?.code || "";
        if (code.length > 50) {
          const healthResult = selfTestingService.generateHealthCheck(projectId, code);
          return {
            success: !healthResult.isBroken,
            message: healthResult.isBroken
              ? `Health check failed: ${healthResult.issues.join(", ")}`
              : "Health check passed",
            details: { issues: healthResult.issues, isBroken: healthResult.isBroken },
          };
        }
        return { success: true, message: "No code to health check" };
      }
      case "auto-fix": {
        const { closedLoopAutoFixService } = await import("./closed-loop-autofix.service");
        const code = context?.code || "";
        if (code.length > 50) {
          const fixResult = closedLoopAutoFixService.validateAndFix(code);
          return {
            success: fixResult.wasFixed || fixResult.errorsFound === 0,
            message: fixResult.wasFixed
              ? `Auto-fixed ${fixResult.errorsFixed} of ${fixResult.errorsFound} issues`
              : fixResult.errorsFound === 0 ? "No issues found" : "Could not auto-fix issues",
            details: { errorsFound: fixResult.errorsFound, errorsFixed: fixResult.errorsFixed },
          };
        }
        return { success: true, message: "No code to auto-fix" };
      }
      default:
        return { success: false, message: `Unknown action type: ${hook.action.type}` };
    }
  }

  private runValidateHook(code: string): { success: boolean; message: string; details?: Record<string, unknown> } {
    const issues: string[] = [];

    if (code.includes("console.log")) {
      const count = (code.match(/console\.log/g) || []).length;
      if (count > 5) issues.push(`${count} console.log statements found`);
    }

    if (code.includes("TODO") || code.includes("FIXME") || code.includes("HACK")) {
      const todoCount = (code.match(/TODO|FIXME|HACK/g) || []).length;
      issues.push(`${todoCount} TODO/FIXME/HACK comments found`);
    }

    if (/any\b/.test(code)) {
      const anyCount = (code.match(/:\s*any\b/g) || []).length;
      if (anyCount > 3) issues.push(`${anyCount} 'any' type annotations found`);
    }

    const hasErrorBoundary = code.includes("ErrorBoundary") || code.includes("error boundary") || code.includes("componentDidCatch");
    if (!hasErrorBoundary && code.length > 500) {
      issues.push("No error boundary detected");
    }

    return {
      success: issues.length === 0,
      message: issues.length === 0 ? "Code validation passed" : `Found ${issues.length} issue(s): ${issues.join("; ")}`,
      details: { issues, issueCount: issues.length },
    };
  }

  private runCheckTodosHook(code: string): { success: boolean; message: string; details?: Record<string, unknown> } {
    const todoPattern = /\/\/\s*(TODO|FIXME|HACK|XXX|REVIEW)[\s:]+(.+)/gi;
    const todos: { type: string; text: string; line: number }[] = [];
    const lines = code.split("\n");

    for (let i = 0; i < lines.length; i++) {
      let match;
      todoPattern.lastIndex = 0;
      while ((match = todoPattern.exec(lines[i])) !== null) {
        todos.push({ type: match[1].toUpperCase(), text: match[2].trim(), line: i + 1 });
      }
    }

    return {
      success: todos.length === 0,
      message: todos.length === 0
        ? "No TODOs or FIXMEs found"
        : `Found ${todos.length} TODO/FIXME item(s)`,
      details: { todos, count: todos.length },
    };
  }

  private runRegenerateTestsHook(code: string): { success: boolean; message: string; details?: Record<string, unknown> } {
    const hasTestableElements = /<button|<input|<form|onClick|onSubmit|onChange/i.test(code);
    return {
      success: true,
      message: hasTestableElements
        ? "Code has testable interactive elements - test regeneration recommended"
        : "Code has minimal interactive elements - basic tests sufficient",
      details: { hasTestableElements, shouldRegenerate: hasTestableElements },
    };
  }

  private runCustomCheckHook(
    config: Record<string, unknown>,
    code: string
  ): { success: boolean; message: string; details?: Record<string, unknown> } {
    const pattern = config.pattern as string | undefined;
    const message = config.message as string | undefined;
    const shouldExist = config.shouldExist as boolean | undefined;

    if (!pattern) {
      return { success: false, message: "Custom check requires a 'pattern' in config" };
    }

    try {
      const regex = new RegExp(pattern, "gi");
      const matches = code.match(regex) || [];
      const found = matches.length > 0;
      const expected = shouldExist !== false;

      return {
        success: found === expected,
        message: found === expected
          ? (message || `Pattern check passed: ${pattern}`)
          : (message || `Pattern check failed: expected ${expected ? "presence" : "absence"} of ${pattern}`),
        details: { pattern, matchCount: matches.length, found, expected },
      };
    } catch (e: any) {
      return { success: false, message: `Invalid pattern: ${e.message}` };
    }
  }

  private createDefaultHooks(): Hook[] {
    return [
      {
        id: "default_post_gen_validate",
        event: "post-generation",
        action: { type: "validate", description: "Validate code quality after generation" },
        enabled: true,
        createdAt: Date.now(),
      },
      {
        id: "default_post_gen_todos",
        event: "post-generation",
        action: { type: "check-todos", description: "Check for remaining TODOs after generation" },
        enabled: true,
        createdAt: Date.now(),
      },
      {
        id: "default_post_refine_tests",
        event: "post-refinement",
        action: { type: "regenerate-tests", description: "Check if tests need regeneration after refinement" },
        enabled: true,
        createdAt: Date.now(),
      },
      {
        id: "default_pre_deploy_validate",
        event: "pre-deploy",
        action: { type: "validate", description: "Validate code before deployment" },
        enabled: true,
        createdAt: Date.now(),
      },
      {
        id: "default_pre_deploy_todos",
        event: "pre-deploy",
        action: { type: "check-todos", description: "Ensure no TODOs remain before deployment" },
        enabled: true,
        createdAt: Date.now(),
      },
      {
        id: "default_health_check",
        event: "post-generation" as HookEvent,
        action: { type: "health-check" as const, description: "Run health check after generation" },
        enabled: true,
        createdAt: Date.now(),
      },
    ];
  }

  destroy(): void {
    this.projectHooks.clear();
    this.log("HooksService destroyed");
  }
}

export const hooksService = HooksService.getInstance();
