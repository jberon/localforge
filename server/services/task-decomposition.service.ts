import { logger } from "../lib/logger";

export interface Subtask {
  id: string;
  parentId?: string;
  title: string;
  description: string;
  type: SubtaskType;
  priority: number;
  status: SubtaskStatus;
  dependencies: string[];
  estimatedComplexity: "trivial" | "simple" | "moderate" | "complex";
  assignedAgent?: AgentType;
  result?: SubtaskResult;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  retryCount: number;
  maxRetries: number;
}

export type SubtaskType = 
  | "architecture"
  | "ui_component"
  | "api_endpoint"
  | "database"
  | "integration"
  | "testing"
  | "refactoring"
  | "documentation"
  | "deployment";

export type SubtaskStatus = 
  | "pending"
  | "blocked"
  | "in_progress"
  | "completed"
  | "failed"
  | "skipped";

export type AgentType =
  | "orchestrator"
  | "planner"
  | "coder"
  | "architect"
  | "ui_designer"
  | "tester"
  | "refactorer";

export interface SubtaskResult {
  success: boolean;
  output: string;
  artifacts: string[];
  errors: string[];
  metrics: {
    tokensUsed: number;
    timeMs: number;
  };
}

export interface DecomposedTask {
  id: string;
  projectId: string;
  originalPrompt: string;
  subtasks: Subtask[];
  dependencyGraph: Map<string, string[]>;
  executionOrder: string[];
  status: "pending" | "running" | "completed" | "failed" | "paused";
  progress: {
    total: number;
    completed: number;
    failed: number;
    inProgress: number;
  };
  createdAt: number;
  completedAt?: number;
}

interface DecompositionStrategy {
  name: string;
  patterns: RegExp[];
  subtaskTypes: SubtaskType[];
  estimatedSubtasks: number;
}

class TaskDecompositionService {
  private static instance: TaskDecompositionService;
  private activeTasks: Map<string, DecomposedTask> = new Map();
  private strategies: DecompositionStrategy[] = [];

  private constructor() {
    this.initializeStrategies();
    logger.info("TaskDecompositionService initialized");
  }

  static getInstance(): TaskDecompositionService {
    if (!TaskDecompositionService.instance) {
      TaskDecompositionService.instance = new TaskDecompositionService();
    }
    return TaskDecompositionService.instance;
  }

  private initializeStrategies(): void {
    this.strategies = [
      {
        name: "full_stack_app",
        patterns: [/build.*app/i, /create.*application/i, /full.?stack/i],
        subtaskTypes: ["architecture", "database", "api_endpoint", "ui_component", "testing"],
        estimatedSubtasks: 8
      },
      {
        name: "api_service",
        patterns: [/api/i, /backend/i, /server/i, /endpoint/i],
        subtaskTypes: ["architecture", "database", "api_endpoint", "testing"],
        estimatedSubtasks: 5
      },
      {
        name: "ui_feature",
        patterns: [/component/i, /ui/i, /interface/i, /page/i, /form/i],
        subtaskTypes: ["ui_component", "integration", "testing"],
        estimatedSubtasks: 3
      },
      {
        name: "database_work",
        patterns: [/database/i, /schema/i, /migration/i, /model/i],
        subtaskTypes: ["database", "api_endpoint", "testing"],
        estimatedSubtasks: 4
      },
      {
        name: "integration",
        patterns: [/integrate/i, /connect/i, /third.?party/i, /external/i],
        subtaskTypes: ["architecture", "integration", "testing"],
        estimatedSubtasks: 4
      },
      {
        name: "refactor",
        patterns: [/refactor/i, /clean/i, /improve/i, /optimize/i],
        subtaskTypes: ["refactoring", "testing"],
        estimatedSubtasks: 3
      }
    ];
  }

  async decomposePrompt(
    projectId: string,
    prompt: string,
    context?: { files?: string[]; existingCode?: string }
  ): Promise<DecomposedTask> {
    const taskId = this.generateId();
    const strategy = this.detectStrategy(prompt);
    
    logger.info("Decomposing prompt", { 
      taskId, 
      projectId, 
      strategy: strategy.name,
      promptLength: prompt.length 
    });

    const subtasks = await this.generateSubtasks(prompt, strategy, context);
    const dependencyGraph = this.buildDependencyGraph(subtasks);
    const executionOrder = this.topologicalSort(subtasks, dependencyGraph);

    const decomposedTask: DecomposedTask = {
      id: taskId,
      projectId,
      originalPrompt: prompt,
      subtasks,
      dependencyGraph,
      executionOrder,
      status: "pending",
      progress: {
        total: subtasks.length,
        completed: 0,
        failed: 0,
        inProgress: 0
      },
      createdAt: Date.now()
    };

    this.activeTasks.set(taskId, decomposedTask);
    
    logger.info("Task decomposed successfully", {
      taskId,
      subtaskCount: subtasks.length,
      executionOrder: executionOrder.slice(0, 5)
    });

    return decomposedTask;
  }

  private detectStrategy(prompt: string): DecompositionStrategy {
    for (const strategy of this.strategies) {
      for (const pattern of strategy.patterns) {
        if (pattern.test(prompt)) {
          return strategy;
        }
      }
    }
    return this.strategies[0];
  }

  private async generateSubtasks(
    prompt: string,
    strategy: DecompositionStrategy,
    context?: { files?: string[]; existingCode?: string }
  ): Promise<Subtask[]> {
    const subtasks: Subtask[] = [];
    const keywords = this.extractKeywords(prompt);
    
    if (strategy.subtaskTypes.includes("architecture")) {
      subtasks.push(this.createSubtask({
        title: "Analyze Requirements & Plan Architecture",
        description: `Analyze the request and create architectural plan: ${prompt.slice(0, 200)}...`,
        type: "architecture",
        priority: 1,
        assignedAgent: "planner",
        estimatedComplexity: "moderate"
      }));
    }

    if (strategy.subtaskTypes.includes("database")) {
      subtasks.push(this.createSubtask({
        title: "Design Data Model",
        description: "Create database schema and models based on requirements",
        type: "database",
        priority: 2,
        assignedAgent: "architect",
        dependencies: subtasks.filter(s => s.type === "architecture").map(s => s.id),
        estimatedComplexity: "moderate"
      }));
    }

    if (strategy.subtaskTypes.includes("api_endpoint")) {
      subtasks.push(this.createSubtask({
        title: "Implement API Endpoints",
        description: "Create API routes and controllers for data operations",
        type: "api_endpoint",
        priority: 3,
        assignedAgent: "coder",
        dependencies: subtasks.filter(s => s.type === "database").map(s => s.id),
        estimatedComplexity: "moderate"
      }));
    }

    if (strategy.subtaskTypes.includes("ui_component")) {
      const componentKeywords = keywords.filter(k => 
        /form|table|list|card|modal|button|input|dashboard/i.test(k)
      );
      
      subtasks.push(this.createSubtask({
        title: "Build UI Components",
        description: `Create user interface components${componentKeywords.length > 0 ? `: ${componentKeywords.join(", ")}` : ""}`,
        type: "ui_component",
        priority: 4,
        assignedAgent: "ui_designer",
        dependencies: subtasks.filter(s => s.type === "api_endpoint").map(s => s.id),
        estimatedComplexity: "moderate"
      }));
    }

    if (strategy.subtaskTypes.includes("integration")) {
      subtasks.push(this.createSubtask({
        title: "Integrate Components",
        description: "Connect frontend to backend, wire up data flow",
        type: "integration",
        priority: 5,
        assignedAgent: "coder",
        dependencies: subtasks.filter(s => 
          s.type === "api_endpoint" || s.type === "ui_component"
        ).map(s => s.id),
        estimatedComplexity: "simple"
      }));
    }

    if (strategy.subtaskTypes.includes("testing")) {
      subtasks.push(this.createSubtask({
        title: "Validate & Test",
        description: "Run code validation, test functionality, fix errors",
        type: "testing",
        priority: 6,
        assignedAgent: "tester",
        dependencies: subtasks.filter(s => 
          s.type === "integration" || s.type === "ui_component" || s.type === "api_endpoint"
        ).map(s => s.id),
        estimatedComplexity: "simple"
      }));
    }

    if (strategy.subtaskTypes.includes("refactoring")) {
      subtasks.push(this.createSubtask({
        title: "Refactor & Optimize",
        description: "Clean up code, apply best practices, optimize performance",
        type: "refactoring",
        priority: 7,
        assignedAgent: "refactorer",
        dependencies: subtasks.filter(s => s.type === "testing").map(s => s.id),
        estimatedComplexity: "simple"
      }));
    }

    return subtasks;
  }

  private createSubtask(partial: Partial<Subtask>): Subtask {
    return {
      id: this.generateId(),
      title: partial.title || "Untitled Task",
      description: partial.description || "",
      type: partial.type || "integration",
      priority: partial.priority || 5,
      status: "pending",
      dependencies: partial.dependencies || [],
      estimatedComplexity: partial.estimatedComplexity || "simple",
      assignedAgent: partial.assignedAgent,
      createdAt: Date.now(),
      retryCount: 0,
      maxRetries: 3
    };
  }

  private extractKeywords(prompt: string): string[] {
    const stopWords = new Set(["a", "an", "the", "is", "are", "and", "or", "for", "to", "with", "that", "this", "it", "in", "on", "at"]);
    return prompt
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .slice(0, 20);
  }

  private buildDependencyGraph(subtasks: Subtask[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    for (const subtask of subtasks) {
      graph.set(subtask.id, subtask.dependencies);
    }
    return graph;
  }

  private topologicalSort(subtasks: Subtask[], graph: Map<string, string[]>): string[] {
    const visited = new Set<string>();
    const result: string[] = [];
    const inProgress = new Set<string>();

    const visit = (id: string) => {
      if (inProgress.has(id)) {
        logger.warn("Circular dependency detected", { taskId: id });
        return;
      }
      if (visited.has(id)) return;

      inProgress.add(id);
      const deps = graph.get(id) || [];
      for (const dep of deps) {
        visit(dep);
      }
      inProgress.delete(id);
      visited.add(id);
      result.push(id);
    };

    const sorted = [...subtasks].sort((a, b) => a.priority - b.priority);
    for (const subtask of sorted) {
      visit(subtask.id);
    }

    return result;
  }

  async startTask(taskId: string): Promise<void> {
    const task = this.activeTasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    task.status = "running";
    logger.info("Starting task execution", { taskId, subtaskCount: task.subtasks.length });
  }

  async executeNextSubtask(
    taskId: string,
    executor: (subtask: Subtask) => Promise<SubtaskResult>
  ): Promise<{ subtask: Subtask; result: SubtaskResult } | null> {
    const task = this.activeTasks.get(taskId);
    if (!task || task.status !== "running") {
      return null;
    }

    const nextSubtaskId = this.findNextExecutableSubtask(task);
    if (!nextSubtaskId) {
      if (task.progress.completed === task.progress.total) {
        task.status = "completed";
        task.completedAt = Date.now();
      }
      return null;
    }

    const subtask = task.subtasks.find(s => s.id === nextSubtaskId)!;
    subtask.status = "in_progress";
    subtask.startedAt = Date.now();
    task.progress.inProgress++;

    logger.info("Executing subtask", { 
      taskId, 
      subtaskId: nextSubtaskId, 
      title: subtask.title 
    });

    try {
      const result = await executor(subtask);
      subtask.result = result;
      subtask.completedAt = Date.now();
      task.progress.inProgress--;

      if (result.success) {
        subtask.status = "completed";
        task.progress.completed++;
      } else {
        subtask.retryCount++;
        if (subtask.retryCount >= subtask.maxRetries) {
          subtask.status = "failed";
          task.progress.failed++;
        } else {
          subtask.status = "pending";
        }
      }

      return { subtask, result };
    } catch (error) {
      subtask.status = "failed";
      subtask.result = {
        success: false,
        output: "",
        artifacts: [],
        errors: [error instanceof Error ? error.message : "Unknown error"],
        metrics: { tokensUsed: 0, timeMs: Date.now() - (subtask.startedAt || Date.now()) }
      };
      task.progress.inProgress--;
      task.progress.failed++;
      
      return { subtask, result: subtask.result };
    }
  }

  private findNextExecutableSubtask(task: DecomposedTask): string | null {
    for (const subtaskId of task.executionOrder) {
      const subtask = task.subtasks.find(s => s.id === subtaskId);
      if (!subtask) continue;

      if (subtask.status !== "pending") continue;

      const depsCompleted = subtask.dependencies.every(depId => {
        const dep = task.subtasks.find(s => s.id === depId);
        return dep?.status === "completed";
      });

      if (depsCompleted) {
        return subtaskId;
      }
    }
    return null;
  }

  getTask(taskId: string): DecomposedTask | undefined {
    return this.activeTasks.get(taskId);
  }

  getTaskProgress(taskId: string): DecomposedTask["progress"] | null {
    const task = this.activeTasks.get(taskId);
    return task?.progress || null;
  }

  pauseTask(taskId: string): void {
    const task = this.activeTasks.get(taskId);
    if (task && task.status === "running") {
      task.status = "paused";
      logger.info("Task paused", { taskId });
    }
  }

  resumeTask(taskId: string): void {
    const task = this.activeTasks.get(taskId);
    if (task && task.status === "paused") {
      task.status = "running";
      logger.info("Task resumed", { taskId });
    }
  }

  cancelTask(taskId: string): void {
    const task = this.activeTasks.get(taskId);
    if (task) {
      task.status = "failed";
      for (const subtask of task.subtasks) {
        if (subtask.status === "pending" || subtask.status === "in_progress") {
          subtask.status = "skipped";
        }
      }
      logger.info("Task cancelled", { taskId });
    }
  }

  private generateId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const taskDecompositionService = TaskDecompositionService.getInstance();
