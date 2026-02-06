import { logger } from "../lib/logger";

interface ReasoningStep {
  id: string;
  order: number;
  type: StepType;
  description: string;
  prompt: string;
  expectedOutput: string;
  validationCriteria: string[];
  dependencies: string[];
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
  result?: string;
  error?: string;
  startTime?: number;
  endTime?: number;
}

type StepType = 
  | "analyze"
  | "plan"
  | "generate"
  | "validate"
  | "refine"
  | "integrate"
  | "test";

interface ReasoningChain {
  id: string;
  projectId: string;
  objective: string;
  steps: ReasoningStep[];
  status: "pending" | "running" | "completed" | "failed";
  currentStepIndex: number;
  createdAt: number;
  completedAt?: number;
  metadata: Record<string, any>;
}

interface DecompositionResult {
  chain: ReasoningChain;
  estimatedSteps: number;
  estimatedTokens: number;
  complexity: "simple" | "moderate" | "complex";
}

interface StepResult {
  success: boolean;
  output: string;
  validationPassed: boolean;
  validationErrors: string[];
  nextStepRecommendation?: string;
}

class MultiStepReasoningService {
  private static instance: MultiStepReasoningService;
  private readonly MAX_CHAINS = 200;
  private chains: Map<string, ReasoningChain> = new Map();
  private stepTemplates: Map<StepType, Partial<ReasoningStep>> = new Map();

  private constructor() {
    this.initializeStepTemplates();
  }

  static getInstance(): MultiStepReasoningService {
    if (!MultiStepReasoningService.instance) {
      MultiStepReasoningService.instance = new MultiStepReasoningService();
    }
    return MultiStepReasoningService.instance;
  }

  private initializeStepTemplates(): void {
    this.stepTemplates.set("analyze", {
      type: "analyze",
      expectedOutput: "Analysis document with requirements, constraints, and considerations",
      validationCriteria: [
        "Identifies all key requirements",
        "Lists potential challenges",
        "Considers edge cases"
      ]
    });

    this.stepTemplates.set("plan", {
      type: "plan",
      expectedOutput: "Detailed implementation plan with file structure and approach",
      validationCriteria: [
        "Defines clear file structure",
        "Specifies component hierarchy",
        "Outlines data flow"
      ]
    });

    this.stepTemplates.set("generate", {
      type: "generate",
      expectedOutput: "Working code implementation",
      validationCriteria: [
        "Code compiles without errors",
        "Follows project conventions",
        "Implements required features"
      ]
    });

    this.stepTemplates.set("validate", {
      type: "validate",
      expectedOutput: "Validation report with any issues found",
      validationCriteria: [
        "No syntax errors",
        "Type safety verified",
        "Security checks passed"
      ]
    });

    this.stepTemplates.set("refine", {
      type: "refine",
      expectedOutput: "Refined code with improvements applied",
      validationCriteria: [
        "Issues from validation fixed",
        "Code quality improved",
        "Performance optimized"
      ]
    });

    this.stepTemplates.set("integrate", {
      type: "integrate",
      expectedOutput: "Integration instructions and updated code",
      validationCriteria: [
        "Integrates with existing codebase",
        "No breaking changes",
        "All imports resolved"
      ]
    });

    this.stepTemplates.set("test", {
      type: "test",
      expectedOutput: "Test cases and results",
      validationCriteria: [
        "All tests pass",
        "Edge cases covered",
        "Error handling verified"
      ]
    });
  }

  decomposeTask(
    projectId: string,
    objective: string,
    context: { files?: string[]; requirements?: string[] } = {}
  ): DecompositionResult {
    logger.info("Decomposing task into reasoning steps", { projectId, objective });

    const chainId = `chain_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const complexity = this.assessComplexity(objective, context);
    const steps = this.generateSteps(objective, complexity, context);

    const chain: ReasoningChain = {
      id: chainId,
      projectId,
      objective,
      steps,
      status: "pending",
      currentStepIndex: 0,
      createdAt: Date.now(),
      metadata: context
    };

    this.chains.set(chainId, chain);
    this.evictChainsIfNeeded();

    const estimatedTokens = steps.reduce((sum, step) => {
      return sum + this.estimateStepTokens(step);
    }, 0);

    logger.info("Task decomposed", {
      chainId,
      stepCount: steps.length,
      complexity,
      estimatedTokens
    });

    return {
      chain,
      estimatedSteps: steps.length,
      estimatedTokens,
      complexity
    };
  }

  private assessComplexity(
    objective: string,
    context: { files?: string[]; requirements?: string[] }
  ): "simple" | "moderate" | "complex" {
    let score = 0;

    if (objective.length > 200) score += 2;
    if (objective.includes("and") || objective.includes(",")) score += 1;
    
    const complexKeywords = ["integrate", "refactor", "migrate", "optimize", "full-stack"];
    for (const keyword of complexKeywords) {
      if (objective.toLowerCase().includes(keyword)) score += 2;
    }

    if (context.files && context.files.length > 5) score += 2;
    if (context.requirements && context.requirements.length > 3) score += 1;

    if (score <= 2) return "simple";
    if (score <= 5) return "moderate";
    return "complex";
  }

  private generateSteps(
    objective: string,
    complexity: "simple" | "moderate" | "complex",
    context: { files?: string[]; requirements?: string[] }
  ): ReasoningStep[] {
    const steps: ReasoningStep[] = [];
    let order = 0;

    const createStep = (
      type: StepType,
      description: string,
      prompt: string,
      deps: string[] = []
    ): ReasoningStep => {
      const template = this.stepTemplates.get(type) || {};
      const stepId = `step_${order}_${type}`;
      order++;

      return {
        id: stepId,
        order: order - 1,
        type,
        description,
        prompt,
        expectedOutput: template.expectedOutput || "",
        validationCriteria: template.validationCriteria || [],
        dependencies: deps,
        status: "pending"
      };
    };

    if (complexity === "complex") {
      steps.push(createStep(
        "analyze",
        "Analyze requirements and constraints",
        `Analyze the following task and identify:\n1. Core requirements\n2. Technical constraints\n3. Potential challenges\n4. Edge cases to consider\n\nTask: ${objective}`
      ));
    }

    steps.push(createStep(
      "plan",
      "Create implementation plan",
      `Create a detailed implementation plan for:\n${objective}\n\nInclude:\n- File structure\n- Component breakdown\n- Data flow\n- API endpoints (if applicable)`,
      complexity === "complex" ? [steps[0]?.id].filter(Boolean) : []
    ));

    steps.push(createStep(
      "generate",
      "Generate initial implementation",
      `Implement the following based on the plan:\n${objective}\n\nGenerate production-ready code.`,
      [steps[steps.length - 1].id]
    ));

    steps.push(createStep(
      "validate",
      "Validate generated code",
      "Review the generated code for:\n1. Syntax errors\n2. Type safety\n3. Security issues\n4. Best practices",
      [steps[steps.length - 1].id]
    ));

    if (complexity !== "simple") {
      steps.push(createStep(
        "refine",
        "Refine and optimize",
        "Based on validation results, refine the code:\n1. Fix any issues found\n2. Optimize performance\n3. Improve code quality",
        [steps[steps.length - 1].id]
      ));
    }

    if (context.files && context.files.length > 0) {
      steps.push(createStep(
        "integrate",
        "Integrate with existing codebase",
        `Ensure the new code integrates properly with:\n${context.files.join("\n")}\n\nUpdate imports and exports as needed.`,
        [steps[steps.length - 1].id]
      ));
    }

    if (complexity === "complex") {
      steps.push(createStep(
        "test",
        "Generate and run tests",
        "Create comprehensive tests for the implementation:\n1. Unit tests\n2. Integration tests (if applicable)\n3. Edge case tests",
        [steps[steps.length - 1].id]
      ));
    }

    return steps;
  }

  private estimateStepTokens(step: ReasoningStep): number {
    const baseTokens: Record<StepType, number> = {
      analyze: 500,
      plan: 800,
      generate: 2000,
      validate: 600,
      refine: 1500,
      integrate: 1000,
      test: 1200
    };
    return baseTokens[step.type] || 1000;
  }

  async executeStep(
    chainId: string,
    stepId: string,
    executor: (prompt: string) => Promise<string>
  ): Promise<StepResult> {
    const chain = this.chains.get(chainId);
    if (!chain) {
      return {
        success: false,
        output: "",
        validationPassed: false,
        validationErrors: ["Chain not found"]
      };
    }

    const step = chain.steps.find(s => s.id === stepId);
    if (!step) {
      return {
        success: false,
        output: "",
        validationPassed: false,
        validationErrors: ["Step not found"]
      };
    }

    for (const depId of step.dependencies) {
      const depStep = chain.steps.find(s => s.id === depId);
      if (depStep && depStep.status !== "completed") {
        return {
          success: false,
          output: "",
          validationPassed: false,
          validationErrors: [`Dependency ${depId} not completed`]
        };
      }
    }

    step.status = "in_progress";
    step.startTime = Date.now();
    chain.currentStepIndex = step.order;

    try {
      const context = this.buildStepContext(chain, step);
      const result = await executor(context);
      
      step.result = result;
      step.endTime = Date.now();

      const validation = this.validateStepResult(step, result);

      if (validation.passed) {
        step.status = "completed";
      } else {
        step.status = "failed";
        step.error = validation.errors.join("; ");
      }

      this.updateChainStatus(chain);

      return {
        success: validation.passed,
        output: result,
        validationPassed: validation.passed,
        validationErrors: validation.errors,
        nextStepRecommendation: this.getNextStepRecommendation(chain, step)
      };
    } catch (error) {
      step.status = "failed";
      step.error = error instanceof Error ? error.message : "Unknown error";
      step.endTime = Date.now();

      return {
        success: false,
        output: "",
        validationPassed: false,
        validationErrors: [step.error]
      };
    }
  }

  private buildStepContext(chain: ReasoningChain, step: ReasoningStep): string {
    let context = step.prompt;

    const completedSteps = chain.steps
      .filter(s => s.status === "completed" && step.dependencies.includes(s.id));

    if (completedSteps.length > 0) {
      context += "\n\n## Previous Step Results:\n";
      for (const completed of completedSteps) {
        context += `\n### ${completed.description}:\n${completed.result?.substring(0, 2000) || "No result"}`;
      }
    }

    return context;
  }

  private validateStepResult(
    step: ReasoningStep,
    result: string
  ): { passed: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!result || result.trim().length < 50) {
      errors.push("Result too short or empty");
    }

    if (step.type === "generate" && !result.includes("function") && !result.includes("const")) {
      errors.push("Generated code may be incomplete");
    }

    if (step.type === "validate" && !result.toLowerCase().includes("valid") && 
        !result.toLowerCase().includes("error") && !result.toLowerCase().includes("issue")) {
      errors.push("Validation result unclear");
    }

    return {
      passed: errors.length === 0,
      errors
    };
  }

  private updateChainStatus(chain: ReasoningChain): void {
    const allCompleted = chain.steps.every(s => s.status === "completed" || s.status === "skipped");
    const anyFailed = chain.steps.some(s => s.status === "failed");

    if (allCompleted) {
      chain.status = "completed";
      chain.completedAt = Date.now();
    } else if (anyFailed) {
      chain.status = "failed";
    } else {
      chain.status = "running";
    }
  }

  private getNextStepRecommendation(chain: ReasoningChain, currentStep: ReasoningStep): string | undefined {
    const nextStep = chain.steps.find(s => 
      s.order > currentStep.order && s.status === "pending"
    );
    return nextStep?.id;
  }

  getChain(chainId: string): ReasoningChain | undefined {
    return this.chains.get(chainId);
  }

  getChainProgress(chainId: string): { 
    completed: number; 
    total: number; 
    percentage: number;
    currentStep?: string;
  } {
    const chain = this.chains.get(chainId);
    if (!chain) {
      return { completed: 0, total: 0, percentage: 0 };
    }

    const completed = chain.steps.filter(s => s.status === "completed").length;
    const total = chain.steps.length;
    const currentStep = chain.steps.find(s => s.status === "in_progress" || s.status === "pending");

    return {
      completed,
      total,
      percentage: Math.round((completed / total) * 100),
      currentStep: currentStep?.description
    };
  }

  skipStep(chainId: string, stepId: string, reason: string): boolean {
    const chain = this.chains.get(chainId);
    if (!chain) return false;

    const step = chain.steps.find(s => s.id === stepId);
    if (!step) return false;

    step.status = "skipped";
    step.result = `Skipped: ${reason}`;

    logger.info("Step skipped", { chainId, stepId, reason });
    return true;
  }

  private evictChainsIfNeeded(): void {
    if (this.chains.size > this.MAX_CHAINS) {
      const sorted = Array.from(this.chains.entries())
        .sort((a, b) => a[1].createdAt - b[1].createdAt);
      const toRemove = sorted.slice(0, this.chains.size - this.MAX_CHAINS);
      for (const [key] of toRemove) {
        this.chains.delete(key);
      }
    }
  }

  destroy(): void {
    this.chains.clear();
  }

  abortChain(chainId: string): boolean {
    const chain = this.chains.get(chainId);
    if (!chain) return false;

    chain.status = "failed";
    for (const step of chain.steps) {
      if (step.status === "pending" || step.status === "in_progress") {
        step.status = "failed";
        step.error = "Chain aborted";
      }
    }

    logger.info("Chain aborted", { chainId });
    return true;
  }
}

export const multiStepReasoningService = MultiStepReasoningService.getInstance();
