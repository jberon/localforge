import logger from "../lib/logger";

export type ThinkingMode = "standard" | "extended" | "deep";

interface ThinkingSession {
  id: string;
  projectId: string;
  mode: ThinkingMode;
  prompt: string;
  steps: ThinkingStep[];
  startTime: Date;
  endTime?: Date;
  conclusion?: string;
  confidence: number;
  triggerReason?: string;
}

interface ThinkingStep {
  id: string;
  type: "analyze" | "decompose" | "research" | "synthesize" | "validate" | "conclude";
  content: string;
  duration: number;
  insights: string[];
  questions: string[];
  timestamp: Date;
}

interface ThinkingConfig {
  mode: ThinkingMode;
  maxSteps: number;
  stepTimeout: number;
  autoTriggerOnComplexity: boolean;
  complexityThreshold: number;
  loopDetectionEnabled: boolean;
  maxLoopRetries: number;
}

const DEFAULT_CONFIG: ThinkingConfig = {
  mode: "standard",
  maxSteps: 3,
  stepTimeout: 30000,
  autoTriggerOnComplexity: true,
  complexityThreshold: 0.7,
  loopDetectionEnabled: true,
  maxLoopRetries: 3
};

const EXTENDED_CONFIG: ThinkingConfig = {
  mode: "extended",
  maxSteps: 7,
  stepTimeout: 60000,
  autoTriggerOnComplexity: true,
  complexityThreshold: 0.5,
  loopDetectionEnabled: true,
  maxLoopRetries: 5
};

const DEEP_CONFIG: ThinkingConfig = {
  mode: "deep",
  maxSteps: 15,
  stepTimeout: 120000,
  autoTriggerOnComplexity: true,
  complexityThreshold: 0.3,
  loopDetectionEnabled: true,
  maxLoopRetries: 10
};

class ExtendedThinkingService {
  private static instance: ExtendedThinkingService;
  private sessions: Map<string, ThinkingSession> = new Map();
  private projectModes: Map<string, ThinkingMode> = new Map();
  private globalMode: ThinkingMode = "standard";
  private loopCounts: Map<string, number> = new Map();
  private customConfigs: Map<string, Partial<ThinkingConfig>> = new Map();

  private constructor() {
    logger.info("ExtendedThinkingService initialized");
  }

  static getInstance(): ExtendedThinkingService {
    if (!ExtendedThinkingService.instance) {
      ExtendedThinkingService.instance = new ExtendedThinkingService();
    }
    return ExtendedThinkingService.instance;
  }

  setMode(mode: ThinkingMode, projectId?: string): void {
    if (projectId) {
      this.projectModes.set(projectId, mode);
    } else {
      this.globalMode = mode;
    }
    logger.info("Thinking mode set", { mode, projectId });
  }

  getMode(projectId?: string): ThinkingMode {
    if (projectId && this.projectModes.has(projectId)) {
      return this.projectModes.get(projectId)!;
    }
    return this.globalMode;
  }

  getConfig(projectId?: string): ThinkingConfig {
    const mode = this.getMode(projectId);
    let baseConfig: ThinkingConfig;

    switch (mode) {
      case "extended":
        baseConfig = { ...EXTENDED_CONFIG };
        break;
      case "deep":
        baseConfig = { ...DEEP_CONFIG };
        break;
      default:
        baseConfig = { ...DEFAULT_CONFIG };
    }

    if (projectId && this.customConfigs.has(projectId)) {
      return { ...baseConfig, ...this.customConfigs.get(projectId) };
    }

    return baseConfig;
  }

  setCustomConfig(projectId: string, config: Partial<ThinkingConfig>): void {
    this.customConfigs.set(projectId, config);
    logger.info("Custom thinking config set", { projectId });
  }

  shouldTriggerExtended(prompt: string, projectId?: string): {
    shouldTrigger: boolean;
    reason?: string;
    suggestedMode: ThinkingMode;
  } {
    const config = this.getConfig(projectId);
    const complexity = this.analyzeComplexity(prompt);

    if (this.detectLoopPattern(projectId || "global")) {
      return {
        shouldTrigger: true,
        reason: "Loop pattern detected - deeper analysis needed",
        suggestedMode: "extended"
      };
    }

    if (complexity.score >= config.complexityThreshold && config.autoTriggerOnComplexity) {
      return {
        shouldTrigger: true,
        reason: `High complexity detected: ${complexity.factors.join(", ")}`,
        suggestedMode: complexity.score > 0.85 ? "deep" : "extended"
      };
    }

    const complexIndicators = [
      "architecture", "design system", "complex", "challenging",
      "multiple", "integrate", "migration", "refactor entire",
      "optimize", "scale", "performance", "security audit"
    ];

    const hasComplexIndicators = complexIndicators.some(
      i => prompt.toLowerCase().includes(i)
    );

    if (hasComplexIndicators) {
      return {
        shouldTrigger: true,
        reason: "Complex task indicators found in prompt",
        suggestedMode: "extended"
      };
    }

    return {
      shouldTrigger: false,
      suggestedMode: "standard"
    };
  }

  analyzeComplexity(prompt: string): {
    score: number;
    factors: string[];
  } {
    const factors: string[] = [];
    let score = 0;

    if (prompt.length > 500) {
      score += 0.15;
      factors.push("long prompt");
    }

    if (prompt.length > 1000) {
      score += 0.15;
      factors.push("very long prompt");
    }

    const technicalTerms = [
      "api", "database", "authentication", "authorization",
      "cache", "queue", "websocket", "graphql", "microservice",
      "container", "kubernetes", "ci/cd", "deployment"
    ];
    const techCount = technicalTerms.filter(t => 
      prompt.toLowerCase().includes(t)
    ).length;
    if (techCount > 3) {
      score += 0.2;
      factors.push(`${techCount} technical concepts`);
    }

    const multiStepIndicators = ["first", "then", "after", "finally", "step"];
    const stepCount = multiStepIndicators.filter(s =>
      prompt.toLowerCase().includes(s)
    ).length;
    if (stepCount >= 2) {
      score += 0.15;
      factors.push("multi-step request");
    }

    const questionCount = (prompt.match(/\?/g) || []).length;
    if (questionCount > 2) {
      score += 0.1;
      factors.push(`${questionCount} questions`);
    }

    const ambiguousTerms = ["maybe", "possibly", "might", "could", "or"];
    const ambiguityCount = ambiguousTerms.filter(t =>
      prompt.toLowerCase().includes(t)
    ).length;
    if (ambiguityCount > 2) {
      score += 0.15;
      factors.push("ambiguous requirements");
    }

    return {
      score: Math.min(1, score),
      factors
    };
  }

  startSession(
    projectId: string,
    prompt: string,
    mode?: ThinkingMode,
    triggerReason?: string
  ): ThinkingSession {
    const sessionId = `thinking_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const effectiveMode = mode || this.getMode(projectId);

    const session: ThinkingSession = {
      id: sessionId,
      projectId,
      mode: effectiveMode,
      prompt,
      steps: [],
      startTime: new Date(),
      confidence: 0,
      triggerReason
    };

    this.sessions.set(sessionId, session);
    logger.info("Thinking session started", { sessionId, mode: effectiveMode, projectId });

    return session;
  }

  addStep(
    sessionId: string,
    type: ThinkingStep["type"],
    content: string,
    insights: string[] = [],
    questions: string[] = []
  ): ThinkingStep | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const config = this.getConfig(session.projectId);
    if (session.steps.length >= config.maxSteps) {
      logger.warn("Max thinking steps reached", { sessionId });
      return null;
    }

    const step: ThinkingStep = {
      id: `step_${session.steps.length + 1}`,
      type,
      content,
      duration: 0,
      insights,
      questions,
      timestamp: new Date()
    };

    if (session.steps.length > 0) {
      const prevStep = session.steps[session.steps.length - 1];
      step.duration = step.timestamp.getTime() - prevStep.timestamp.getTime();
    }

    session.steps.push(step);
    this.sessions.set(sessionId, session);

    logger.info("Thinking step added", { sessionId, stepType: type });
    return step;
  }

  completeSession(
    sessionId: string,
    conclusion: string,
    confidence: number
  ): ThinkingSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.endTime = new Date();
    session.conclusion = conclusion;
    session.confidence = Math.min(1, Math.max(0, confidence));

    this.sessions.set(sessionId, session);
    logger.info("Thinking session completed", {
      sessionId,
      stepCount: session.steps.length,
      confidence
    });

    return session;
  }

  getSession(sessionId: string): ThinkingSession | null {
    return this.sessions.get(sessionId) || null;
  }

  getProjectSessions(projectId: string, limit: number = 10): ThinkingSession[] {
    return Array.from(this.sessions.values())
      .filter(s => s.projectId === projectId)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, limit);
  }

  getSessions(projectId?: string, limit: number = 20): ThinkingSession[] {
    let sessions = Array.from(this.sessions.values());
    
    if (projectId) {
      sessions = sessions.filter(s => s.projectId === projectId);
    }
    
    return sessions
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, limit);
  }

  setProjectMode(projectId: string, mode: ThinkingMode): void {
    this.projectModes.set(projectId, mode);
    logger.info("Project thinking mode set", { projectId, mode });
  }

  detectLoopPattern(projectId: string): boolean {
    const count = this.loopCounts.get(projectId) || 0;
    const config = this.getConfig(projectId);
    return count >= config.maxLoopRetries;
  }

  incrementLoopCount(projectId: string): number {
    const count = (this.loopCounts.get(projectId) || 0) + 1;
    this.loopCounts.set(projectId, count);
    return count;
  }

  resetLoopCount(projectId: string): void {
    this.loopCounts.delete(projectId);
  }

  generateThinkingPrompt(session: ThinkingSession): string {
    const prompts: string[] = [];

    prompts.push(`## Extended Thinking Analysis\n`);
    prompts.push(`**Mode:** ${session.mode}`);
    prompts.push(`**Original Request:** ${session.prompt}\n`);

    if (session.triggerReason) {
      prompts.push(`**Trigger Reason:** ${session.triggerReason}\n`);
    }

    prompts.push(`### Analysis Steps Required:\n`);

    switch (session.mode) {
      case "deep":
        prompts.push("1. **Decompose** - Break down into atomic sub-problems");
        prompts.push("2. **Research** - Identify patterns and prior solutions");
        prompts.push("3. **Analyze** - Examine each component in detail");
        prompts.push("4. **Synthesize** - Combine insights into coherent plan");
        prompts.push("5. **Validate** - Check for logical consistency");
        prompts.push("6. **Conclude** - Form actionable recommendations");
        break;

      case "extended":
        prompts.push("1. **Analyze** - Understand the full scope");
        prompts.push("2. **Decompose** - Identify key components");
        prompts.push("3. **Synthesize** - Create implementation plan");
        prompts.push("4. **Validate** - Verify approach");
        break;

      default:
        prompts.push("1. **Analyze** - Quick assessment");
        prompts.push("2. **Conclude** - Direct solution");
    }

    return prompts.join("\n");
  }

  getStats(): {
    globalMode: ThinkingMode;
    totalSessions: number;
    activeSessions: number;
    averageSteps: number;
    averageConfidence: number;
  } {
    const allSessions = Array.from(this.sessions.values());
    const completedSessions = allSessions.filter(s => s.endTime);
    const activeSessions = allSessions.filter(s => !s.endTime);

    const avgSteps = completedSessions.length > 0
      ? completedSessions.reduce((sum, s) => sum + s.steps.length, 0) / completedSessions.length
      : 0;

    const avgConfidence = completedSessions.length > 0
      ? completedSessions.reduce((sum, s) => sum + s.confidence, 0) / completedSessions.length
      : 0;

    return {
      globalMode: this.globalMode,
      totalSessions: allSessions.length,
      activeSessions: activeSessions.length,
      averageSteps: Math.round(avgSteps * 10) / 10,
      averageConfidence: Math.round(avgConfidence * 100) / 100
    };
  }

  getAllModes(): Array<{ mode: ThinkingMode; config: ThinkingConfig }> {
    return [
      { mode: "standard", config: DEFAULT_CONFIG },
      { mode: "extended", config: EXTENDED_CONFIG },
      { mode: "deep", config: DEEP_CONFIG }
    ];
  }

  validateStep(step: ThinkingStep): {
    valid: boolean;
    confidence: number;
    issues: string[];
    canProceed: boolean;
  } {
    const issues: string[] = [];
    let confidence = step.insights.length > 0 ? 0.6 : 0.4;

    if (step.content.length < 50) {
      issues.push("Step content is too brief for thorough analysis");
      confidence -= 0.1;
    }

    if (step.type === "validate" && step.questions.length === 0) {
      issues.push("Validation step should identify remaining questions");
      confidence -= 0.05;
    }

    if (step.type === "conclude" && step.insights.length === 0) {
      issues.push("Conclusion should have supporting insights");
      confidence -= 0.15;
    }

    const incompleteIndicators = ["TODO", "TBD", "...", "etc."];
    for (const indicator of incompleteIndicators) {
      if (step.content.includes(indicator)) {
        issues.push(`Incomplete indicator found: ${indicator}`);
        confidence -= 0.1;
      }
    }

    if (step.insights.length > 0) {
      confidence += Math.min(0.2, step.insights.length * 0.05);
    }

    confidence = Math.max(0, Math.min(1, confidence));

    return {
      valid: issues.filter(i => i.includes("too brief") || i.includes("should have")).length === 0,
      confidence,
      issues,
      canProceed: confidence >= 0.4
    };
  }

  backtrackSession(sessionId: string, toStepIndex?: number): ThinkingSession | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.steps.length === 0) return null;

    const targetIndex = toStepIndex ?? Math.max(0, session.steps.length - 2);
    const removedCount = session.steps.length - targetIndex;
    
    session.steps = session.steps.slice(0, targetIndex);
    session.confidence = session.steps.length > 0
      ? session.steps.reduce((sum, s) => sum + (s.insights.length * 0.1), 0.3)
      : 0;

    this.sessions.set(sessionId, session);
    logger.info("Session backtracked", { sessionId, removedCount, newStepCount: session.steps.length });

    return session;
  }

  generateEnhancedThinkingPrompt(session: ThinkingSession): string {
    const prompts: string[] = [];

    prompts.push(`## Enhanced Reasoning Chain\n`);
    prompts.push(`**Mode:** ${session.mode} | **Confidence:** ${(session.confidence * 100).toFixed(0)}%`);
    prompts.push(`**Request:** ${session.prompt}\n`);

    if (session.triggerReason) {
      prompts.push(`**Trigger:** ${session.triggerReason}\n`);
    }

    prompts.push(`### Self-Validation Protocol\n`);
    prompts.push(`After each step, validate:`);
    prompts.push(`1. Is the reasoning logically sound?`);
    prompts.push(`2. Are assumptions explicitly stated?`);
    prompts.push(`3. Is there evidence supporting conclusions?`);
    prompts.push(`4. Are there gaps or contradictions?\n`);

    prompts.push(`### Reasoning Steps\n`);

    const stepConfigs = this.getStepConfig(session.mode);
    stepConfigs.forEach((config, i) => {
      prompts.push(`${i + 1}. **${config.name}** - ${config.description}`);
      prompts.push(`   - Checkpoint: ${config.checkpoint}`);
    });

    if (session.steps.length > 0) {
      prompts.push(`\n### Progress So Far\n`);
      for (const step of session.steps) {
        prompts.push(`**${step.type}** (Confidence: ${(this.validateStep(step).confidence * 100).toFixed(0)}%)`);
        prompts.push(`${step.content.slice(0, 200)}...`);
        if (step.insights.length > 0) {
          prompts.push(`Insights: ${step.insights.join(", ")}`);
        }
      }
    }

    return prompts.join("\n");
  }

  private getStepConfig(mode: ThinkingMode): Array<{
    name: string;
    description: string;
    checkpoint: string;
  }> {
    switch (mode) {
      case "deep":
        return [
          { name: "Decompose", description: "Break into atomic sub-problems", checkpoint: "All sub-problems identified" },
          { name: "Research", description: "Find patterns and prior solutions", checkpoint: "Relevant patterns documented" },
          { name: "Analyze", description: "Examine each component", checkpoint: "All components understood" },
          { name: "Synthesize", description: "Combine into coherent plan", checkpoint: "Plan is internally consistent" },
          { name: "Validate", description: "Check logical consistency", checkpoint: "No contradictions found" },
          { name: "Conclude", description: "Form recommendations", checkpoint: "Actionable and complete" }
        ];
      case "extended":
        return [
          { name: "Analyze", description: "Understand full scope", checkpoint: "Scope clearly defined" },
          { name: "Decompose", description: "Identify key components", checkpoint: "Components mapped" },
          { name: "Synthesize", description: "Create implementation plan", checkpoint: "Plan is feasible" },
          { name: "Validate", description: "Verify approach", checkpoint: "Approach validated" }
        ];
      default:
        return [
          { name: "Analyze", description: "Quick assessment", checkpoint: "Problem understood" },
          { name: "Conclude", description: "Direct solution", checkpoint: "Solution provided" }
        ];
    }
  }
}

export const extendedThinkingService = ExtendedThinkingService.getInstance();
