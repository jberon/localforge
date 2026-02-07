import { BaseService, ManagedMap } from "../lib/base-service";

interface BuildStep {
  id: string;
  stepNumber: number;
  description: string;
  prompt: string;
  category: string;
  status: "pending" | "building" | "completed" | "failed" | "skipped";
  code?: string;
  qualityScore?: number;
  healthPassed?: boolean;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

interface BuildPipeline {
  id: string;
  projectId: string;
  originalPrompt: string;
  steps: BuildStep[];
  currentStep: number;
  status: "idle" | "running" | "completed" | "failed" | "paused";
  accumulatedCode: string;
  startedAt: number;
  completedAt?: number;
  stepsCompleted: number;
  stepsFailed: number;
}

class SequentialBuildService extends BaseService {
  private static instance: SequentialBuildService;
  private pipelines: ManagedMap<string, BuildPipeline>;

  private constructor() {
    super("SequentialBuildService");
    this.pipelines = this.createManagedMap<string, BuildPipeline>({ maxSize: 100, strategy: "lru" });
  }

  static getInstance(): SequentialBuildService {
    if (!SequentialBuildService.instance) {
      SequentialBuildService.instance = new SequentialBuildService();
    }
    return SequentialBuildService.instance;
  }

  createPipeline(
    projectId: string,
    originalPrompt: string,
    decomposedSteps: { description: string; prompt: string; category: string }[]
  ): BuildPipeline {
    const pipelineId = `pipeline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const steps: BuildStep[] = decomposedSteps.map((step, index) => ({
      id: `step_${index}_${Math.random().toString(36).slice(2, 8)}`,
      stepNumber: index + 1,
      description: step.description,
      prompt: step.prompt,
      category: step.category,
      status: "pending",
    }));

    const pipeline: BuildPipeline = {
      id: pipelineId,
      projectId,
      originalPrompt,
      steps,
      currentStep: 0,
      status: "idle",
      accumulatedCode: "",
      startedAt: Date.now(),
      stepsCompleted: 0,
      stepsFailed: 0,
    };

    this.pipelines.set(pipelineId, pipeline);
    this.log("Build pipeline created", { pipelineId, projectId, stepCount: steps.length });
    return pipeline;
  }

  getPipeline(pipelineId: string): BuildPipeline | undefined {
    return this.pipelines.get(pipelineId);
  }

  getPipelineForProject(projectId: string): BuildPipeline | undefined {
    for (const pipeline of this.pipelines.values()) {
      if (pipeline.projectId === projectId && (pipeline.status === "running" || pipeline.status === "idle")) {
        return pipeline;
      }
    }
    return undefined;
  }

  getNextStep(pipelineId: string): { step: BuildStep; prompt: string; contextCode: string } | null {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) return null;

    const nextStep = pipeline.steps.find(s => s.status === "pending");
    if (!nextStep) return null;

    pipeline.status = "running";
    nextStep.status = "building";
    nextStep.startedAt = Date.now();
    pipeline.currentStep = nextStep.stepNumber;
    this.pipelines.set(pipelineId, pipeline);

    const contextPrompt = this.buildStepPrompt(nextStep, pipeline);

    return {
      step: nextStep,
      prompt: contextPrompt,
      contextCode: pipeline.accumulatedCode,
    };
  }

  completeStep(
    pipelineId: string,
    stepId: string,
    result: { code: string; qualityScore: number; healthPassed: boolean }
  ): BuildPipeline | null {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) return null;

    const step = pipeline.steps.find(s => s.id === stepId);
    if (!step) return null;

    step.status = "completed";
    step.code = result.code;
    step.qualityScore = result.qualityScore;
    step.healthPassed = result.healthPassed;
    step.completedAt = Date.now();

    pipeline.accumulatedCode = result.code;
    pipeline.stepsCompleted++;

    const allDone = pipeline.steps.every(s => s.status === "completed" || s.status === "skipped");
    if (allDone) {
      pipeline.status = "completed";
      pipeline.completedAt = Date.now();
    }

    this.pipelines.set(pipelineId, pipeline);
    this.log("Build step completed", {
      pipelineId,
      stepId,
      stepNumber: step.stepNumber,
      qualityScore: result.qualityScore,
    });

    return pipeline;
  }

  failStep(pipelineId: string, stepId: string, error: string): BuildPipeline | null {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) return null;

    const step = pipeline.steps.find(s => s.id === stepId);
    if (!step) return null;

    step.status = "failed";
    step.error = error;
    step.completedAt = Date.now();

    pipeline.stepsFailed++;
    pipeline.status = "failed";
    pipeline.completedAt = Date.now();

    this.pipelines.set(pipelineId, pipeline);
    this.logError("Build step failed", { pipelineId, stepId, error });

    return pipeline;
  }

  pausePipeline(pipelineId: string): boolean {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline || pipeline.status !== "running") return false;

    pipeline.status = "paused";
    this.pipelines.set(pipelineId, pipeline);
    return true;
  }

  resumePipeline(pipelineId: string): boolean {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline || pipeline.status !== "paused") return false;

    pipeline.status = "running";
    this.pipelines.set(pipelineId, pipeline);
    return true;
  }

  getPipelineProgress(pipelineId: string): {
    pipelineId: string;
    status: string;
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    currentStep: number;
    currentStepDescription: string;
    completionPercentage: number;
    steps: { stepNumber: number; description: string; status: string; qualityScore?: number }[];
  } | null {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) return null;

    const currentStepObj = pipeline.steps.find(s => s.status === "building");

    return {
      pipelineId: pipeline.id,
      status: pipeline.status,
      totalSteps: pipeline.steps.length,
      completedSteps: pipeline.stepsCompleted,
      failedSteps: pipeline.stepsFailed,
      currentStep: pipeline.currentStep,
      currentStepDescription: currentStepObj?.description || "N/A",
      completionPercentage: Math.round((pipeline.stepsCompleted / pipeline.steps.length) * 100),
      steps: pipeline.steps.map(s => ({
        stepNumber: s.stepNumber,
        description: s.description,
        status: s.status,
        qualityScore: s.qualityScore,
      })),
    };
  }

  private buildStepPrompt(step: BuildStep, pipeline: BuildPipeline): string {
    const parts: string[] = [];

    parts.push(`## Build Step ${step.stepNumber} of ${pipeline.steps.length}: ${step.description}`);
    parts.push("");

    if (pipeline.accumulatedCode) {
      parts.push("You are building incrementally on existing code. The current code is provided as context.");
      parts.push("IMPORTANT: Return the COMPLETE updated code, not just the new additions.");
      parts.push("Preserve all existing functionality while adding the new feature.");
      parts.push("");
    }

    const completedSteps = pipeline.steps.filter(s => s.status === "completed");
    if (completedSteps.length > 0) {
      parts.push("Previously completed steps:");
      for (const cs of completedSteps) {
        parts.push(`- Step ${cs.stepNumber}: ${cs.description} (quality: ${cs.qualityScore || "N/A"})`);
      }
      parts.push("");
    }

    const remainingSteps = pipeline.steps.filter(s => s.status === "pending" && s.id !== step.id);
    if (remainingSteps.length > 0) {
      parts.push("Upcoming steps (do NOT implement these yet):");
      for (const rs of remainingSteps) {
        parts.push(`- Step ${rs.stepNumber}: ${rs.description}`);
      }
      parts.push("");
    }

    parts.push(`Current task: ${step.prompt}`);

    return parts.join("\n");
  }

  destroy(): void {
    this.pipelines.clear();
    this.log("SequentialBuildService destroyed");
  }
}

export const sequentialBuildService = SequentialBuildService.getInstance();
