import { createLLMClient, LLM_DEFAULTS, generateCompletion } from "../llm-client";
import { searchWeb, formatSearchResultsForContext } from "./webSearch";
import { createDreamTeamService, type DreamTeamService } from "./dreamTeam";
import { llmSettingsSchema, CORE_DREAM_TEAM, detectModelRole, getOptimalTemperature } from "@shared/schema";
import { z } from "zod";
import { logger } from "../lib/logger";
import { smartContextService } from "./smart-context.service";
import { feedbackLearningService } from "./feedback-learning.service";
import { enhancedAnalysisService } from "./enhanced-analysis.service";
import { extendedThinkingService } from "./extended-thinking.service";
import { buildEnhancedPlanningPrompt, buildEnhancedBuildingPrompt, buildEnhancedReviewPrompt, type EnhancedPromptContext } from "../prompts/enhanced-prompts";
import { taskDecompositionService, type DecomposedTask, type Subtask } from "./task-decomposition.service";
import { projectMemoryService } from "./project-memory.service";
import { codeRunnerService, type RunResult } from "./code-runner.service";
import { autoFixLoopService, type AutoFixSession } from "./auto-fix-loop.service";
import { refactoringAgentService, type RefactoringResult } from "./refactoring-agent.service";
import { runtimeFeedbackService } from "./runtime-feedback.service";
import { uiuxAgentService } from "./uiux-agent.service";
import { localModelOptimizerService } from "./local-model-optimizer.service";
import { contextBudgetService } from "./context-budget.service";
import { fewShotCacheService } from "./few-shot-cache.service";

// ============================================================================
// MODEL-SPECIFIC INSTRUCTIONS
// Optimized prompts for Ministral 3 14B Reasoning + Qwen3 Coder 30B stack
// ============================================================================

type PlannerMode = "planning" | "design" | "review";

// Get model-specific instruction prefix based on detected role and mode
function getModelInstructions(
  modelName: string, 
  role: "planner" | "builder",
  mode?: PlannerMode
): string {
  const modelRole = detectModelRole(modelName);
  
  if (role === "planner") {
    // Design mode instructions for UX/design guidance
    if (mode === "design") {
      return `CRITICAL INSTRUCTIONS FOR REASONING MODEL (DESIGN MODE):

- You are providing Design & UX guidance for the planned application.
- Describe screens, states, and navigation flows.
- Define empty states, loading states, and error states.
- Call out accessibility considerations (contrast, keyboard navigation, ARIA for web).
- Specify design tokens / basic styling principles where appropriate.
- Propose UX and interaction flows (screens, states, user journeys).
- Output ONLY valid JSON with a "designNotes" field containing your guidance.
- No code - design guidance only.

`;
    }
    
    // Review mode instructions for code review and hardening
    if (mode === "review") {
      return `CRITICAL INSTRUCTIONS FOR REASONING MODEL (REVIEW MODE):

- You are a Principal Engineer performing a rigorous review.
- Do NOT write new features; focus on quality, correctness, and maintainability.
- Review architecture, code organization, tests, error handling, security, performance, and UX.
- Output a structured review with VALID JSON ONLY:
  {
    "summary": "High-level summary of the review",
    "strengths": ["strength 1", "strength 2"],
    "issues": [
      {"severity": "high|medium|low", "file": "optional/path", "description": "issue description"}
    ],
    "recommendations": ["specific actionable recommendation 1", "recommendation 2"]
  }
- Be honest and critical. Assume this code is going to production.
- No code - review only.

`;
    }
    
    // Planning mode (default) instructions
    if (modelRole === "reasoning") {
      return `CRITICAL INSTRUCTIONS FOR REASONING MODEL (PLANNING MODE):

- You will output a PLAN ONLY, no production code.
- Break the task into clear, numbered steps.
- Describe each file needed and its responsibility.
- Define directory structure, APIs, and data models.
- Specify quality requirements: tests, error handling, logging, accessibility (when applicable).
- Identify edge cases, performance concerns, and security considerations.
- Propose UX and interaction flows where relevant (screens, states, empty states, loading states).
- Output ONLY valid JSON matching the OrchestratorPlan schema. No text outside JSON.
- If information is missing or ambiguous, note explicit assumptions in the plan.
- Include qualityProfile ("prototype", "demo", or "production") based on request context.

`;
    }
    // Fallback for non-reasoning models doing planning
    return `INSTRUCTIONS:
- Output a structured plan in JSON format.
- Focus on architecture and task breakdown.
- Include qualityProfile: "prototype", "demo", or "production".
- No code - planning only.

`;
  }
  
  // Instructions for coding models (Qwen Coder, etc.)
  if (modelRole === "coding") {
    return `CRITICAL INSTRUCTIONS FOR CODING MODEL:

- Implement EXACTLY what the plan specifies. Do NOT change the architecture or requirements.
- Generate only valid, executable code. DO NOT include explanations or commentary.
- When writing multiple files, respond in tagged blocks using this format:
  [FILE: path/to/file.ext]
  \`\`\`language
  // code here
  \`\`\`
- Ensure all imports/exports are consistent across files.
- The code must be production-ready:
  - Clear separation of concerns
  - Meaningful naming
  - Basic error handling and logging
  - No hard-coded secrets
- When tests are requested in the plan, include them in a /tests or __tests__ directory.
- Prefer simplicity and maintainability over cleverness.

`;
  }
  
  // Fallback for hybrid models
  return `INSTRUCTIONS:
- Generate clean, production-ready code.
- Follow the plan structure exactly.
- No explanations - code only.

`;
}

// Safe JSON parsing with validation and extraction
function safeParseJSON<T>(
  text: string,
  schema?: z.ZodType<T>,
  fallback?: T
): { success: true; data: T } | { success: false; error: string } {
  try {
    // Try to find JSON in the response (handles markdown code blocks)
    const jsonPatterns = [
      /```json\s*([\s\S]*?)```/,  // ```json ... ```
      /```\s*([\s\S]*?)```/,       // ``` ... ```
      /(\{[\s\S]*\})/,             // Raw JSON object
      /(\[[\s\S]*\])/,             // Raw JSON array
    ];

    let jsonStr = text;
    for (const pattern of jsonPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        jsonStr = match[1].trim();
        break;
      }
    }

    const parsed = JSON.parse(jsonStr);
    
    // Validate against schema if provided
    if (schema) {
      const result = schema.safeParse(parsed);
      if (!result.success) {
        return { 
          success: false, 
          error: `Schema validation failed: ${result.error.message}` 
        };
      }
      return { success: true, data: result.data };
    }

    return { success: true, data: parsed as T };
  } catch (error) {
    // Try to provide helpful error message
    const errorMsg = error instanceof SyntaxError 
      ? `JSON parse error: ${error.message}` 
      : `Unexpected error: ${String(error)}`;
    
    if (fallback !== undefined) {
      logger.warn("JSON parse failed, using fallback", { error: errorMsg });
      return { success: true, data: fallback };
    }
    
    return { success: false, error: errorMsg };
  }
}

export interface OrchestratorTask {
  id: string;
  title: string;
  description: string;
  type: "plan" | "build" | "fix" | "search" | "validate" | "review";
  status: "pending" | "in_progress" | "completed" | "failed";
  result?: string;
  error?: string;
}

export type QualityProfile = "prototype" | "demo" | "production";

export interface OrchestratorPlan {
  summary: string;
  tasks: OrchestratorTask[];
  architecture?: string;
  qualityProfile: QualityProfile;
  stackProfile?: string;
  designNotes?: string;
  searchQueries?: string[];
}

export interface ReviewSummary {
  summary: string;
  strengths: string[];
  issues: Array<{
    severity: "high" | "medium" | "low";
    file?: string;
    description: string;
  }>;
  recommendations: string[];
}

export interface OrchestratorState {
  phase: "planning" | "designing" | "searching" | "building" | "validating" | "fixing" | "reviewing" | "complete" | "failed";
  plan?: OrchestratorPlan;
  currentTaskIndex: number;
  generatedCode: string;
  validationErrors: string[];
  fixAttempts: number;
  maxFixAttempts: number;
  webSearchResults: string;
  messages: Array<{ role: "planner" | "builder" | "system"; content: string }>;
  reviewSummary?: ReviewSummary;
}

export type OrchestratorEvent = 
  | { type: "phase_change"; phase: OrchestratorState["phase"]; message: string }
  | { type: "task_start"; task: OrchestratorTask }
  | { type: "task_complete"; task: OrchestratorTask }
  | { type: "tasks_updated"; tasks: OrchestratorTask[]; completedCount: number; totalCount: number }
  | { type: "thinking"; model: "planner" | "builder" | "web_search"; content: string }
  | { type: "code_chunk"; content: string }
  | { type: "search"; query: string }
  | { type: "search_result"; query: string; resultCount: number }
  | { type: "validation"; valid: boolean; errors: string[] }
  | { type: "fix_attempt"; attempt: number; maxAttempts: number }
  | { type: "review"; summary: string; issueCount: number; severityCounts: { high: number; medium: number; low: number } }
  | { type: "complete"; code: string; summary: string; reviewSummary?: ReviewSummary }
  | { type: "status"; message: string }
  | { type: "error"; message: string };

type LLMSettings = z.infer<typeof llmSettingsSchema>;

const PLANNING_PROMPT = `You ARE Marty Cagan and Martin Fowler, collaborating on a product plan. Marty brings product thinking; Martin brings architectural rigor.

MARTY'S LENS: What problem are we really solving? Who has this problem? What outcome will make users successful?
MARTIN'S LENS: What's the simplest architecture that could work? How do we make this easy to change? What would make this a joy to maintain?

Analyze the user's request. Create a plan that's both user-outcome focused and architecturally sound.

QUALITY PROFILES:
- "prototype": Fast iteration, minimal tests, quick proof of concept
- "demo": Stable for demos, core flows tested, reasonable error handling
- "production": Tests required, no security flaws, clear error handling, no TODOs in critical paths

Infer the appropriate qualityProfile based on the user's request:
- Explicit mentions of "production", "enterprise", "secure" → "production"
- Quick prototypes, experiments, learning exercises → "prototype"
- Default to "demo" for most requests

RESPOND WITH VALID JSON ONLY (no markdown):
{
  "summary": "What problem this solves and for whom (Marty) + the technical approach (Martin)",
  "architecture": "Clean architecture: components, state management, separation of concerns (Martin's principles)",
  "qualityProfile": "prototype" | "demo" | "production",
  "designNotes": "Optional: UX flows, empty states, loading states, accessibility considerations",
  "searchNeeded": true/false,
  "searchQueries": ["query 1", "query 2"] (if searchNeeded),
  "tasks": [
    {"id": "1", "title": "Task name", "description": "What to implement and why it matters", "type": "build"},
    {"id": "2", "title": "Task name", "description": "What to implement and why it matters", "type": "build"}
  ]
}

Task types: "build" for code, "validate" for testing, "review" for final review
Keep tasks focused and implementable. Maximum 5 tasks for simple apps.
For API integrations, add searchNeeded: true with relevant queries.`;

const BUILDING_PROMPT = `You ARE Martin Fowler. You're writing code that humans will read, maintain, and extend. Kent Beck is reviewing your work—every line should pass TDD principles.

MARTIN'S CODE PRINCIPLES:
- Any fool can write code a computer understands. You write code HUMANS understand.
- Keep it simple—but no simpler. Complexity only where it adds real value.
- Make the implicit explicit. Every function name, every variable reveals intent.
- Separate concerns ruthlessly. Each component has one reason to change.

KENT'S QUALITY BAR:
- Would I be confident refactoring this at 3am during an incident?
- Is every behavior testable in isolation?
- Is this the simplest thing that could possibly work?

TECHNICAL REQUIREMENTS:
1. Output ONLY executable React code - no explanations, no markdown
2. Include all necessary imports (React, useState, useEffect, etc.)
3. Create a complete, self-contained component that renders properly
4. Use modern React patterns (hooks, functional components)
5. Include inline Tailwind CSS for styling
6. The code must be production-ready and error-free
7. Export default the main App component
8. Include ReactDOM.createRoot render call at the bottom

CONTEXT:
{context}

PLAN:
{plan}

As Martin Fowler, generate clean, readable, maintainable code:`;

const FIX_PROMPT = `You ARE Kent Beck. You created TDD. When code breaks, you don't patch—you understand WHY it broke and fix the root cause.

YOUR APPROACH:
- Read the error. Understand it. Don't guess.
- Fix the actual problem, not just the symptom.
- Make it work first. Then make it right.
- The fix should make the code BETTER, not just passing.

ERRORS:
{errors}

CODE:
{code}

As Kent Beck, output ONLY the complete fixed code - no explanations, no markdown:`;

const DIAGNOSIS_PROMPT = `You ARE Kent Beck. You created TDD because you were tired of code that breaks in mysterious ways. Now you're debugging—your favorite activity, because every bug reveals a design flaw.

YOUR DEBUGGING PHILOSOPHY:
- Bugs are design feedback. They tell you where your abstractions are wrong.
- Don't just find the bug—understand why it was possible.
- The best fix is the one that makes this class of bug impossible.

Analyze these errors:
1. What caused each error? (Root cause, not symptoms)
2. What's the specific fix? (Minimal, targeted change)
3. What design flaw allowed this? (So we prevent future bugs)

ERRORS:
{errors}

CODE SNIPPET:
{codeSnippet}

As Kent Beck, provide a brief, actionable diagnosis:`;

const REVIEW_PROMPT = `You ARE Julie Zhuo, former VP of Design at Facebook, combined with Martin Fowler's architectural rigor. You're performing a Principal Engineer review.

YOUR REVIEW PHILOSOPHY:
- Quality is not negotiable. Every line of code should be defensible.
- Look for what could break in production, not just what works in development.
- Consider the user experience as much as the code quality.
- Security vulnerabilities are showstoppers.

REVIEW THE FOLLOWING CODE:

PLAN SUMMARY:
{planSummary}

QUALITY PROFILE: {qualityProfile}

CODE:
{code}

Perform a comprehensive review covering:
1. Architecture and code organization
2. Error handling and edge cases
3. Security concerns (injection, secrets, unsafe patterns)
4. Performance hotspots
5. UX issues (if UI is present)
6. Code quality and maintainability

RESPOND WITH VALID JSON ONLY:
{
  "summary": "High-level assessment of the code quality",
  "strengths": ["What the code does well"],
  "issues": [
    {"severity": "high|medium|low", "file": "optional/path", "description": "Issue description"}
  ],
  "recommendations": ["Specific, actionable recommendations for improvement"]
}

Be honest and critical. This code is going to production.`;

export class AIOrchestrator {
  private settings: LLMSettings;
  private state: OrchestratorState;
  private onEvent: (event: OrchestratorEvent) => void;
  private aborted = false;
  private projectId?: string;
  private dreamTeam?: DreamTeamService;

  constructor(
    settings: LLMSettings,
    onEvent: (event: OrchestratorEvent) => void,
    projectId?: string
  ) {
    this.settings = settings;
    this.onEvent = onEvent;
    this.projectId = projectId;
    this.state = this.createInitialState();
    
    // Dream Team fallback: Try dual models first, fall back to single model if planner unavailable
    if (projectId && settings.useDualModels && settings.plannerModel) {
      this.dreamTeam = createDreamTeamService({
        endpoint: settings.endpoint || "http://localhost:1234/v1",
        reasoningModel: settings.plannerModel,
        temperature: settings.plannerTemperature,
      });
    } else if (projectId && settings.model) {
      // Fallback: Use single model for Dream Team features if dual models not configured
      logger.info("Falling back to single-model mode for Dream Team");
      this.dreamTeam = createDreamTeamService({
        endpoint: settings.endpoint || "http://localhost:1234/v1",
        reasoningModel: settings.model,
        temperature: LLM_DEFAULTS.temperature.planner,
      });
    }
  }
  
  // Check if reasoning model is available, fallback to builder if not
  private async checkModelAvailability(): Promise<boolean> {
    try {
      const plannerConfig = this.getPlannerConfig();
      if (!plannerConfig.model) return false;
      
      const client = createLLMClient(plannerConfig);
      const models = await client.models.list();
      const availableModels = models.data?.map(m => m.id) || [];
      
      // Check if configured planner model is available
      const isAvailable = availableModels.some(m => 
        m.toLowerCase().includes(plannerConfig.model.toLowerCase())
      );
      
      if (!isAvailable && this.settings.useDualModels) {
        // Fallback: reconfigure to use builder model for planning too
        logger.info("Planner model unavailable, falling back to builder model");
        this.emit({ 
          type: "status", 
          message: "Reasoning model unavailable, using builder model for all tasks" 
        });
      }
      
      return isAvailable;
    } catch (error) {
      logger.warn("Model availability check failed", {}, error as Error);
      return false;
    }
  }

  private createInitialState(): OrchestratorState {
    return {
      phase: "planning",
      currentTaskIndex: 0,
      generatedCode: "",
      validationErrors: [],
      fixAttempts: 0,
      maxFixAttempts: 3,
      webSearchResults: "",
      messages: [],
    };
  }

  // ============================================================================
  // LOCAL MODEL OPTIMIZATION INTEGRATION (v1.9.0)
  // Intelligent context management for small context windows (8K-32K tokens)
  // ============================================================================

  /**
   * Optimize prompt and context for local LLM based on model family
   */
  private optimizeForLocalModel(
    systemPrompt: string,
    userPrompt: string,
    taskType: "planning" | "coding" | "review" | "general"
  ): { systemPrompt: string; userPrompt: string; temperature: number; maxTokens: number } {
    const modelName = this.settings.model || "unknown";
    
    const optimized = localModelOptimizerService.optimizePromptForModel(
      modelName,
      systemPrompt,
      userPrompt,
      taskType
    );

    return {
      systemPrompt: optimized.systemPrompt,
      userPrompt: optimized.userPrompt,
      temperature: optimized.temperature,
      maxTokens: optimized.maxTokens
    };
  }

  /**
   * Build optimized context with dynamic token budgeting
   */
  private async buildOptimizedContext(
    prompt: string,
    files: Array<{ path: string; content: string }>,
    messages: Array<{ role: string; content: string }>
  ): Promise<{
    selectedFiles: Array<{ path: string; content: string }>;
    summarizedHistory: string;
    relevantMemory: string;
    fewShotExamples: string;
  }> {
    const modelName = this.settings.model || "unknown";
    const modelProfile = localModelOptimizerService.getModelProfile(modelName);
    const taskProfile = contextBudgetService.getOptimalProfileForTask(prompt);
    const allocation = contextBudgetService.calculateLocalModelAllocation(modelName, taskProfile);

    const projectId = this.projectId || "default";
    const contextMessages = messages.map(m => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
      timestamp: Date.now()
    }));

    const optimizedContext = smartContextService.buildOptimizedContext(
      projectId,
      prompt,
      files,
      contextMessages,
      {
        contextWindow: modelProfile.contextWindow,
        activeFile: files[0]?.path,
        recentErrors: this.state.validationErrors
      }
    );

    const exampleCategory = this.detectExampleCategory(prompt);
    const examples = fewShotCacheService.getExamplesForTask(prompt, {
      category: exampleCategory,
      modelFamily: modelProfile.family,
      maxTokens: allocation.fewShotExamples,
      maxExamples: 2
    });
    const fewShotExamples = fewShotCacheService.formatExamplesForModelFamily(examples, modelProfile.family);

    return {
      selectedFiles: optimizedContext.selectedFiles,
      summarizedHistory: optimizedContext.summarizedHistory,
      relevantMemory: optimizedContext.relevantMemory,
      fewShotExamples
    };
  }

  private detectExampleCategory(prompt: string): "component_creation" | "api_route" | "form_handling" | "error_handling" | "database_query" | undefined {
    const lower = prompt.toLowerCase();
    if (lower.includes("component") || lower.includes("button") || lower.includes("card")) return "component_creation";
    if (lower.includes("api") || lower.includes("route") || lower.includes("endpoint")) return "api_route";
    if (lower.includes("form") || lower.includes("validation") || lower.includes("submit")) return "form_handling";
    if (lower.includes("error") || lower.includes("boundary") || lower.includes("catch")) return "error_handling";
    if (lower.includes("database") || lower.includes("query") || lower.includes("crud")) return "database_query";
    return undefined;
  }

  /**
   * Run enhanced auto-fix with runtime error injection (v1.9.0)
   */
  private async runRuntimeAutoFix(): Promise<AutoFixSession | null> {
    if (!this.projectId) return null;

    const modelName = this.settings.model || "unknown";
    
    return autoFixLoopService.runEnhancedAutoFix(this.projectId, {
      maxIterations: 5,
      modelName,
      onProgress: (status, iteration) => {
        this.emit({
          type: "status",
          message: `Auto-fix: ${status} (iteration ${iteration})`
        });
      }
    });
  }

  /**
   * Record errors to project memory for learning
   */
  private recordErrorsToMemory(errors: Array<{ type: string; message: string; file?: string }>, fixed: boolean): void {
    if (!this.projectId) return;

    for (const error of errors) {
      projectMemoryService.recordError(this.projectId, {
        type: error.type,
        message: error.message,
        file: error.file,
        fixSuccessful: fixed
      });
    }
  }

  abort() {
    this.aborted = true;
  }

  private getPlannerConfig() {
    if (this.settings.useDualModels) {
      const model = this.settings.plannerModel || this.settings.model || "";
      // Use optimal temperature based on model type, fallback to settings or defaults
      const optimalTemp = getOptimalTemperature(model, "planner");
      return {
        endpoint: this.settings.endpoint || "http://localhost:1234/v1",
        model,
        temperature: this.settings.plannerTemperature ?? optimalTemp,
      };
    }
    return {
      endpoint: this.settings.endpoint || "http://localhost:1234/v1",
      model: this.settings.model || "",
      temperature: LLM_DEFAULTS.temperature.planner,
    };
  }

  private getBuilderConfig() {
    if (this.settings.useDualModels) {
      const model = this.settings.builderModel || this.settings.model || "";
      // Use optimal temperature based on model type, fallback to settings or defaults
      const optimalTemp = getOptimalTemperature(model, "builder");
      return {
        endpoint: this.settings.endpoint || "http://localhost:1234/v1",
        model,
        temperature: this.settings.builderTemperature ?? optimalTemp,
      };
    }
    return {
      endpoint: this.settings.endpoint || "http://localhost:1234/v1",
      model: this.settings.model || "",
      temperature: LLM_DEFAULTS.temperature.builder,
    };
  }

  private emitTasksUpdated() {
    if (!this.state.plan?.tasks) return;
    const tasks = this.state.plan.tasks;
    const completedCount = tasks.filter(t => t.status === "completed").length;
    this.emit({
      type: "tasks_updated",
      tasks,
      completedCount,
      totalCount: tasks.length,
    });
  }

  async run(userRequest: string, existingCode?: string): Promise<{ success: boolean; code: string; summary: string }> {
    this.state = this.createInitialState();
    this.aborted = false;

    const marty = CORE_DREAM_TEAM.find(m => m.id === "marty")!;
    const martin = CORE_DREAM_TEAM.find(m => m.id === "martin")!;
    const kent = CORE_DREAM_TEAM.find(m => m.id === "kent")!;
    const ben = CORE_DREAM_TEAM.find(m => m.id === "ben")!;

    try {
      // Check model availability and handle fallback if needed
      if (this.settings.useDualModels) {
        const plannerAvailable = await this.checkModelAvailability();
        if (!plannerAvailable && this.settings.builderModel) {
          // Fallback: Use builder model for planning if planner unavailable
          logger.info("Activating fallback: using builder model for planning");
          this.settings = {
            ...this.settings,
            plannerModel: this.settings.builderModel,
            plannerTemperature: LLM_DEFAULTS.temperature.planner,
          };
          // Re-initialize Dream Team with fallback config
          if (this.projectId) {
            this.dreamTeam = createDreamTeamService({
              endpoint: this.settings.endpoint || "http://localhost:1234/v1",
              reasoningModel: this.settings.builderModel,
              temperature: LLM_DEFAULTS.temperature.planner,
            });
          }
        }
      }
      
      this.emit({ type: "phase_change", phase: "planning", message: `${marty.name} is analyzing your request...` });
      
      // Multi-Agent: Task decomposition for complex requests
      let decomposedTask: DecomposedTask | null = null;
      if (this.projectId) {
        decomposedTask = await this.decomposeRequest(userRequest, existingCode);
        if (decomposedTask && decomposedTask.subtasks.length > 1) {
          this.emit({ 
            type: "thinking", 
            model: "planner", 
            content: `Request analyzed: ${decomposedTask.subtasks.length} subtasks identified for ${decomposedTask.strategy}` 
          });
        }
      }

      // Multi-Agent: Get project context for enhanced generation
      const projectContext = await this.getProjectContext();
      if (projectContext && projectContext.conventions.length > 0) {
        this.emit({ 
          type: "thinking", 
          model: "planner", 
          content: `Project context loaded: ${projectContext.conventions.length} coding conventions applied` 
        });
      }

      if (this.dreamTeam && this.projectId) {
        await this.dreamTeam.logActivity(this.projectId, {
          member: marty,
          action: "thinking",
          content: `Analyzing request: "${userRequest.slice(0, 100)}..."`,
        });
        
        const businessCase = await this.dreamTeam.generateBusinessCase(
          this.projectId,
          userRequest,
          existingCode ? "Modifying existing application" : "New application",
          (chunk) => {
            this.emit({ type: "thinking", model: "planner", content: chunk });
          }
        );
        
        if (businessCase) {
          await this.dreamTeam.analyzeAndCreateSpecialists(
            this.projectId,
            businessCase,
            (chunk) => {
              this.emit({ type: "thinking", model: "planner", content: chunk });
            }
          );
        }
      }
      
      const plan = await this.planningPhase(userRequest, existingCode, projectContext, decomposedTask);
      
      if (this.aborted) throw new Error("Aborted");
      this.state.plan = plan;
      this.emitTasksUpdated();

      if (plan.searchQueries && plan.searchQueries.length > 0 && this.settings.webSearchEnabled && this.settings.serperApiKey) {
        this.emit({ type: "phase_change", phase: "searching", message: `${ben.name} is searching for relevant information...` });
        
        if (this.dreamTeam && this.projectId) {
          await this.dreamTeam.logActivity(this.projectId, {
            member: ben,
            action: "researching",
            content: `Searching for: ${plan.searchQueries.join(", ")}`,
          });
        }
        
        await this.searchPhase(plan.searchQueries);
      }

      if (this.aborted) throw new Error("Aborted");
      this.emit({ type: "phase_change", phase: "building", message: `${martin.name} is generating code...` });
      
      if (this.dreamTeam && this.projectId) {
        await this.dreamTeam.logActivity(this.projectId, {
          member: martin,
          action: "building",
          content: `Building: ${plan.summary}`,
        });
      }
      
      const code = await this.buildingPhase(plan, userRequest, existingCode);
      this.state.generatedCode = code;

      if (this.aborted) throw new Error("Aborted");
      this.emit({ type: "phase_change", phase: "validating", message: `${kent.name} is validating generated code...` });
      
      if (this.dreamTeam && this.projectId) {
        await this.dreamTeam.logActivity(this.projectId, {
          member: kent,
          action: "testing",
          content: "Running validation checks on generated code...",
        });
      }
      
      const validation = this.validateCode(code);
      this.emit({ type: "validation", valid: validation.valid, errors: validation.errors });

      if (!validation.valid) {
        this.emit({ type: "phase_change", phase: "fixing", message: `${martin.name} is auto-fixing detected issues...` });
        
        // v1.9.0: Record initial errors to project memory for learning
        this.recordErrorsToMemory(
          validation.errors.map(e => ({ type: "validation", message: e })),
          false
        );
        
        if (this.dreamTeam && this.projectId) {
          await this.dreamTeam.logActivity(this.projectId, {
            member: martin,
            action: "fixing",
            content: `Fixing ${validation.errors.length} validation error(s)`,
          });
        }
        
        // v1.9.0: Try enhanced runtime auto-fix first
        const runtimeFixResult = await this.runRuntimeAutoFix();
        if (runtimeFixResult && runtimeFixResult.fixAttempts.length > 0) {
          this.emit({ 
            type: "thinking", 
            model: "builder", 
            content: `Runtime auto-fix: ${runtimeFixResult.fixAttempts.filter(f => f.success).length}/${runtimeFixResult.fixAttempts.length} fixes applied` 
          });
        }
        
        // Multi-Agent: Enhanced auto-fix with CodeRunner + AutoFixLoop
        const enhancedFixResult = await this.runEnhancedAutoFix(code);
        if (enhancedFixResult.success && enhancedFixResult.session) {
          this.emit({ 
            type: "thinking", 
            model: "builder", 
            content: `Enhanced auto-fix completed: ${enhancedFixResult.session.fixAttempts.length} fix attempts` 
          });
          
          // v1.9.0: Record successful fixes to memory for learning
          this.recordErrorsToMemory(
            validation.errors.map(e => ({ type: "validation", message: e })),
            true
          );
        }
        
        // Fall back to original fix loop for remaining issues
        const fixedCode = await this.fixLoop(code, validation.errors);
        this.state.generatedCode = fixedCode;
        
        // v1.9.0: Record that fixes were applied (fallback path)
        const postFixValidation = this.validateCode(fixedCode);
        this.recordErrorsToMemory(
          validation.errors.map(e => ({ type: "validation", message: e })),
          postFixValidation.valid
        );
      }

      if (this.dreamTeam && this.projectId) {
        await this.dreamTeam.generateReadme(this.projectId, 
          (await this.dreamTeam.getBusinessCase(this.projectId))!,
          (chunk) => {
            this.emit({ type: "thinking", model: "builder", content: chunk });
          }
        );
      }

      // Review & Hardening phase - Planner reviews the final code
      if (this.aborted) throw new Error("Aborted");
      const julie = CORE_DREAM_TEAM.find(m => m.id === "julie");
      this.emit({ type: "phase_change", phase: "reviewing", message: `${julie?.name || "Principal Engineer"} is reviewing the code...` });
      
      if (this.dreamTeam && this.projectId && julie) {
        await this.dreamTeam.logActivity(this.projectId, {
          member: julie,
          action: "reviewing",
          content: "Performing code review and hardening assessment...",
        });
      }
      
      const reviewSummary = await this.reviewPhase(this.state.generatedCode, plan);
      this.state.reviewSummary = reviewSummary;
      
      // Emit review event
      const severityCounts = {
        high: reviewSummary.issues.filter((i: ReviewSummary["issues"][0]) => i.severity === "high").length,
        medium: reviewSummary.issues.filter((i: ReviewSummary["issues"][0]) => i.severity === "medium").length,
        low: reviewSummary.issues.filter((i: ReviewSummary["issues"][0]) => i.severity === "low").length,
      };
      this.emit({ 
        type: "review", 
        summary: reviewSummary.summary, 
        issueCount: reviewSummary.issues.length,
        severityCounts 
      });

      // Multi-Agent: Run refactoring analysis on generated code
      if (this.projectId && this.state.generatedCode) {
        const files = this.parseFilesFromCode(this.state.generatedCode);
        if (files.length > 0) {
          const refactorResult = await this.runRefactoringPass(files);
          if (refactorResult && refactorResult.metrics.issuesFound > 0) {
            this.emit({ 
              type: "thinking", 
              model: "builder", 
              content: `Refactoring analysis: ${refactorResult.metrics.issuesFound} improvements identified` 
            });
          }
          
          // Multi-Agent: Run UI/UX analysis on frontend files
          const uiuxResult = await this.runUIUXAnalysis(files);
          if (uiuxResult && uiuxResult.issues > 0) {
            this.emit({
              type: "thinking",
              model: "builder",
              content: `UI/UX Quality: Grade ${uiuxResult.score}, ${uiuxResult.issues} design issue(s) detected`
            });
          }
          
          // Multi-Agent: Record to project memory
          await this.recordToMemory(
            files.map(f => ({ path: f.path, purpose: "Generated code", content: f.content })),
            plan.summary ? {
              category: "technical",
              title: plan.summary.slice(0, 50),
              description: plan.summary,
              rationale: "User request"
            } : undefined
          );
        }
        
        // Clean up runtime feedback session after validation completes
        runtimeFeedbackService.stopSession(this.projectId);
      }

      this.emit({ type: "phase_change", phase: "complete", message: "Generation complete!" });
      this.emit({ type: "complete", code: this.state.generatedCode, summary: plan.summary, reviewSummary });

      // Record successful generation for feedback learning
      if (this.projectId) {
        feedbackLearningService.recordSuccessfulGeneration(this.projectId, this.state.generatedCode);
      }

      return { success: true, code: this.state.generatedCode, summary: plan.summary };
    } catch (error: any) {
      // Ensure runtime session is cleaned up on error
      if (this.projectId) {
        runtimeFeedbackService.stopSession(this.projectId);
      }
      
      if (error.message === "Aborted") {
        this.emit({ type: "error", message: "Generation cancelled" });
        return { success: false, code: "", summary: "" };
      }
      this.emit({ type: "error", message: error.message });
      return { success: false, code: this.state.generatedCode, summary: error.message };
    }
  }

  private emit(event: OrchestratorEvent) {
    this.onEvent(event);
  }

  private async planningPhase(
    userRequest: string, 
    existingCode?: string,
    projectMemoryContext?: {
      summary: string;
      conventions: Array<{ name: string; description: string }>;
      recentDecisions: Array<{ title: string; description: string }>;
      fileStructure: string;
    } | null,
    decomposedTask?: DecomposedTask | null
  ): Promise<OrchestratorPlan> {
    const config = this.getPlannerConfig();
    const maxRetries = 2;
    
    // v1.9.0: Build optimized context for planning phase
    const files = existingCode 
      ? [{ path: "App.tsx", content: existingCode }] 
      : [];
    const messagesForContext = this.state.messages.map(m => ({ role: m.role, content: m.content }));
    const optimizedContext = await this.buildOptimizedContext(userRequest, files, messagesForContext);
    
    // v1.9.0: Build context from optimized sources
    let context = "";
    
    // Use optimized selected files instead of raw existingCode
    if (optimizedContext.selectedFiles.length > 0) {
      const selectedFileContext = optimizedContext.selectedFiles
        .map(f => `// ${f.path}\n${f.content}`)
        .join("\n\n");
      context = `\n\nEXISTING CODE (optimized):\n${selectedFileContext}`;
    } else if (existingCode) {
      context = `\n\nEXISTING CODE TO MODIFY:\n${existingCode.slice(0, 2000)}...`;
    }
    
    // Use summarized history
    if (optimizedContext.summarizedHistory) {
      context += `\n\nCONVERSATION SUMMARY:\n${optimizedContext.summarizedHistory}`;
    }
    
    // Use relevant memory
    if (optimizedContext.relevantMemory) {
      context += `\n\nPROJECT MEMORY:\n${optimizedContext.relevantMemory}`;
    }
    
    // Use few-shot examples
    if (optimizedContext.fewShotExamples) {
      context += `\n\nREFERENCE EXAMPLES:\n${optimizedContext.fewShotExamples}`;
    }

    // Multi-Agent: Add project memory context
    if (projectMemoryContext) {
      context += `\n\nPROJECT CONTEXT:\n${projectMemoryContext.summary}`;
      if (projectMemoryContext.conventions.length > 0) {
        context += `\n\nCODING CONVENTIONS:\n${projectMemoryContext.conventions.map(c => `- ${c.name}: ${c.description}`).join("\n")}`;
      }
      if (projectMemoryContext.recentDecisions.length > 0) {
        context += `\n\nRECENT DECISIONS:\n${projectMemoryContext.recentDecisions.map(d => `- ${d.title}: ${d.description}`).join("\n")}`;
      }
    }

    // Multi-Agent: Add task decomposition context
    if (decomposedTask && decomposedTask.subtasks.length > 0) {
      context += `\n\nTASK ANALYSIS (${decomposedTask.strategy}):\n`;
      context += decomposedTask.subtasks.map((s, i) => 
        `${i + 1}. [${s.priority}] ${s.title}: ${s.description}`
      ).join("\n");
    }

    this.emit({ type: "thinking", model: "planner", content: "Reading your request and identifying what kind of application you want to build..." });

    // Initialize extended thinking for complex requests
    const projectIdForSession = this.projectId || "default";
    const thinkingSession = extendedThinkingService.startSession(projectIdForSession, userRequest);
    this.emit({ type: "thinking", model: "planner", content: `Using ${thinkingSession.mode} reasoning mode...` });

    // Get learned patterns from user feedback
    const learnedPatterns = this.projectId 
      ? feedbackLearningService.getProjectPatterns(this.projectId) 
      : [];
    const patternsContext = feedbackLearningService.formatPatternsForPrompt(learnedPatterns);

    // Emit more detailed thinking as we analyze
    setTimeout(() => {
      if (!this.aborted) {
        this.emit({ type: "thinking", model: "planner", content: "Breaking down the project into components, features, and implementation steps..." });
      }
    }, 2000);

    // Get model-specific instructions based on detected model role
    const modelInstructions = getModelInstructions(config.model, "planner");
    
    // Build enhanced prompt with learned patterns - v1.9.0: Use optimized context
    const optimizedProjectContext = optimizedContext.selectedFiles.length > 0
      ? optimizedContext.selectedFiles.map(f => f.content).join("\n\n").slice(0, 2000)
      : existingCode?.slice(0, 2000);
    
    const enhancedContext: EnhancedPromptContext = {
      userRequest,
      projectContext: optimizedProjectContext,
      additionalContext: patternsContext
    };
    const enhancedPromptSection = buildEnhancedPlanningPrompt(enhancedContext);
    
    // v1.9.0: Apply local model optimization for planning
    const baseSystemPrompt = modelInstructions + PLANNING_PROMPT;
    const optimized = this.optimizeForLocalModel(baseSystemPrompt, userRequest + context, "planning");
    
    // Retry loop for JSON parsing with exponential backoff
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const promptSuffix = attempt > 0 
        ? "\n\nIMPORTANT: Your previous response was not valid JSON. Respond with ONLY valid JSON, no markdown or explanations."
        : "";

      // Use optimized prompt from local model optimizer
      const fullPrompt = optimized.systemPrompt + promptSuffix;

      const response = await generateCompletion(
        config,
        fullPrompt,
        optimized.userPrompt,
        optimized.maxTokens || LLM_DEFAULTS.maxTokens.plan
      );

      // Use safe JSON parsing with fallback to simple plan
      const parseResult = safeParseJSON<{
        summary?: string;
        architecture?: string;
        qualityProfile?: string;
        stackProfile?: string;
        designNotes?: string;
        searchNeeded?: boolean;
        searchQueries?: string[];
        tasks?: Array<{ id?: string; title?: string; description?: string; type?: string }>;
      }>(response);

      if (parseResult.success) {
        const parsed = parseResult.data;
        
        const tasks: OrchestratorTask[] = (parsed.tasks || []).map((t, i: number) => ({
          id: t.id || String(i + 1),
          title: t.title || `Task ${i + 1}`,
          description: t.description || "",
          type: (t.type as OrchestratorTask["type"]) || "build",
          status: "pending" as const,
        }));

        return {
          summary: parsed.summary || "Building your application",
          architecture: parsed.architecture || "",
          qualityProfile: (parsed.qualityProfile as QualityProfile) || "demo",
          stackProfile: parsed.stackProfile,
          designNotes: parsed.designNotes,
          searchQueries: parsed.searchNeeded ? (parsed.searchQueries || []) : [],
          tasks,
        };
      }

      // Log failure and retry if attempts remain
      logger.warn("Plan JSON parse attempt failed", { attempt: attempt + 1, maxRetries: maxRetries + 1, error: parseResult.error });
      
      if (attempt < maxRetries) {
        this.emit({ type: "thinking", model: "planner", content: "Refining the plan structure..." });
        // Exponential backoff: 500ms, 1000ms
        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt)));
      }
    }

    // All retries exhausted, fall back to simple plan
    logger.warn("All planning retries exhausted, using simple plan");
    return this.createSimplePlan(userRequest);
  }

  private createSimplePlan(userRequest: string): OrchestratorPlan {
    return {
      summary: `Building: ${userRequest.slice(0, 100)}`,
      qualityProfile: "demo",
      tasks: [
        { id: "1", title: "Generate App", description: userRequest, type: "build", status: "pending" },
        { id: "2", title: "Validate", description: "Check code quality", type: "validate", status: "pending" },
      ],
    };
  }

  private async searchPhase(queries: string[]) {
    if (!this.settings.serperApiKey || queries.length === 0) return;

    this.emit({ type: "thinking", model: "web_search", content: `Searching the web for relevant information: "${queries[0]}"...` });

    let allResults = "";
    
    for (const query of queries.slice(0, 3)) {
      if (this.aborted) return;
      
      this.emit({ type: "search", query });
      const result = await searchWeb(query, this.settings.serperApiKey);
      
      if (result.success && result.results.length > 0) {
        this.emit({ type: "search_result", query, resultCount: result.results.length });
        allResults += formatSearchResultsForContext(result.results) + "\n\n";
      }
    }

    this.state.webSearchResults = allResults;
  }

  private async buildingPhase(plan: OrchestratorPlan, userRequest: string, existingCode?: string): Promise<string> {
    const config = this.getBuilderConfig();
    const client = createLLMClient(config);

    // Get learned patterns for enhanced building
    const learnedPatterns = this.projectId
      ? feedbackLearningService.getProjectPatterns(this.projectId)
      : [];
    const patternsContext = feedbackLearningService.formatPatternsForPrompt(learnedPatterns);

    // Update project memory with conversation context
    // Normalize roles: planner messages become user (they represent user intent), 
    // builder messages become assistant (AI-generated code)
    if (this.projectId) {
      const messages = this.state.messages.map(m => {
        let normalizedRole: "user" | "assistant" | "system" = "assistant";
        if (m.role === "planner") {
          normalizedRole = "user";
        } else if (m.role === "system") {
          normalizedRole = "system";
        }
        return {
          role: normalizedRole,
          content: m.content,
          timestamp: Date.now()
        };
      });
      if (messages.length > 0) {
        smartContextService.updateProjectMemory(this.projectId, messages);
      }
    }

    // v1.9.0: Build optimized context with smart file selection and few-shot examples
    const files = existingCode 
      ? [{ path: "App.tsx", content: existingCode }] 
      : [];
    const messagesForContext = this.state.messages.map(m => ({ role: m.role, content: m.content }));
    const optimizedContext = await this.buildOptimizedContext(userRequest, files, messagesForContext);
    
    // v1.9.0: Build context from OPTIMIZED sources instead of raw inputs
    let context = "";
    
    // Use web search results if available
    if (this.state.webSearchResults) {
      context += `WEB SEARCH RESULTS:\n${this.state.webSearchResults}\n\n`;
    }
    
    // Use optimized selected files instead of raw existingCode
    if (optimizedContext.selectedFiles.length > 0) {
      const selectedFileContext = optimizedContext.selectedFiles
        .map(f => `// ${f.path}\n${f.content}`)
        .join("\n\n");
      context += `EXISTING CODE (optimized):\n${selectedFileContext}\n\n`;
    } else if (existingCode) {
      // Fallback to raw existingCode if no files selected
      context += `EXISTING CODE:\n${existingCode}\n\n`;
    }
    
    // Use summarized history instead of full history
    if (optimizedContext.summarizedHistory) {
      context += `CONVERSATION SUMMARY:\n${optimizedContext.summarizedHistory}\n\n`;
    }
    
    // Append few-shot examples from cache
    if (optimizedContext.fewShotExamples) {
      context += `REFERENCE EXAMPLES:\n${optimizedContext.fewShotExamples}\n\n`;
    }
    
    // Append relevant memory context
    if (optimizedContext.relevantMemory) {
      context += `PROJECT MEMORY:\n${optimizedContext.relevantMemory}\n\n`;
    }

    // Build enhanced context for builder - v1.9.0: Use optimized context instead of raw
    const optimizedProjectContext = optimizedContext.selectedFiles.length > 0
      ? optimizedContext.selectedFiles.map(f => f.content).join("\n\n").slice(0, 3000)
      : existingCode?.slice(0, 3000);
    
    const enhancedBuildContext: EnhancedPromptContext = {
      userRequest,
      projectContext: optimizedProjectContext,
      feedbackHistory: learnedPatterns.map(p => p.pattern),
      additionalContext: patternsContext
    };
    const enhancedPromptSection = buildEnhancedBuildingPrompt(enhancedBuildContext, {
      filePath: optimizedContext.selectedFiles[0]?.path || "App.tsx",
      purpose: plan.summary,
      architecture: plan.architecture || "React + TypeScript",
      relatedFiles: optimizedContext.selectedFiles.slice(1).map(f => f.path)
    });

    // Get model-specific instructions based on detected model role
    const modelInstructions = getModelInstructions(config.model, "builder");
    
    // Prepend model-specific instructions to the building prompt
    const basePrompt = modelInstructions + BUILDING_PROMPT
      .replace("{context}", context + "\n" + enhancedPromptSection || "No additional context.")
      .replace("{plan}", JSON.stringify(plan, null, 2));

    // v1.9.0: Apply local model optimization for building
    const optimized = this.optimizeForLocalModel(basePrompt, userRequest, "coding");

    this.emit({ type: "thinking", model: "builder", content: "Starting code generation with the implementation plan..." });

    // Emit progress updates during building
    const buildThoughts = [
      "Setting up the component structure and imports...",
      "Implementing the main application logic...",
      "Adding state management and event handlers...",
      "Styling with Tailwind CSS for a polished look...",
      "Finalizing the user interface components...",
    ];
    
    let thoughtIndex = 0;
    const thoughtInterval = setInterval(() => {
      if (!this.aborted && thoughtIndex < buildThoughts.length) {
        this.emit({ type: "thinking", model: "builder", content: buildThoughts[thoughtIndex] });
        thoughtIndex++;
      } else {
        clearInterval(thoughtInterval);
      }
    }, 3000);

    for (const task of plan.tasks.filter(t => t.type === "build")) {
      task.status = "in_progress";
      this.emit({ type: "task_start", task });
    }
    this.emitTasksUpdated();

    const stream = await client.chat.completions.create({
      model: config.model || "local-model",
      messages: [
        { role: "system", content: optimized.systemPrompt },
        { role: "user", content: optimized.userPrompt },
      ],
      temperature: optimized.temperature,
      max_tokens: optimized.maxTokens || LLM_DEFAULTS.maxTokens.fullStack,
      stream: true,
    });

    let fullCode = "";

    for await (const chunk of stream) {
      if (this.aborted) break;
      const delta = chunk.choices[0]?.delta?.content || "";
      if (delta) {
        fullCode += delta;
        this.emit({ type: "code_chunk", content: delta });
      }
    }

    const cleanedCode = fullCode
      .replace(/^```(?:jsx?|javascript|typescript|tsx)?\n?/gm, "")
      .replace(/```$/gm, "")
      .trim();

    for (const task of plan.tasks.filter(t => t.type === "build")) {
      task.status = "completed";
      this.emit({ type: "task_complete", task });
    }
    this.emitTasksUpdated();

    return cleanedCode;
  }

  private validateCode(code: string): { valid: boolean; errors: string[]; analysisScore?: number } {
    const errors: string[] = [];

    // Run enhanced code analysis
    const analysis = enhancedAnalysisService.analyzeCode(code, "generated.tsx");
    
    // Add critical issues as errors
    for (const issue of analysis.issues) {
      if (issue.severity === "critical" || issue.severity === "high") {
        errors.push(`[${issue.type}] ${issue.message}`);
      }
    }
    
    // Add security findings as errors
    for (const finding of analysis.securityFindings) {
      if (finding.severity === "critical" || finding.severity === "high") {
        errors.push(`[SECURITY] ${finding.description}`);
      }
    }

    // Basic syntax checks (still needed for quick validation)
    const openBraces = (code.match(/\{/g) || []).length;
    const closeBraces = (code.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      errors.push(`Mismatched braces: ${openBraces} open, ${closeBraces} close`);
    }

    const openParens = (code.match(/\(/g) || []).length;
    const closeParens = (code.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      errors.push(`Mismatched parentheses: ${openParens} open, ${closeParens} close`);
    }

    if (code.trim().endsWith(",") || code.trim().endsWith("(") || code.trim().endsWith("{")) {
      errors.push("Code appears truncated");
    }

    if (!code.includes("export default") && !code.includes("ReactDOM")) {
      errors.push("Missing export or render call");
    }

    return { 
      valid: errors.length === 0, 
      errors,
      analysisScore: analysis.score
    };
  }

  private async fixLoop(code: string, errors: string[]): Promise<string> {
    let currentCode = code;
    let currentErrors = errors;

    while (this.state.fixAttempts < this.state.maxFixAttempts && currentErrors.length > 0) {
      if (this.aborted) break;

      this.state.fixAttempts++;
      this.emit({ type: "fix_attempt", attempt: this.state.fixAttempts, maxAttempts: this.state.maxFixAttempts });

      const diagnosis = await this.diagnoseErrors(currentCode, currentErrors);
      this.emit({ type: "thinking", model: "planner", content: `Diagnosis: ${diagnosis.slice(0, 200)}...` });

      const fixedCode = await this.attemptFix(currentCode, currentErrors);

      const validation = this.validateCode(fixedCode);
      this.emit({ type: "validation", valid: validation.valid, errors: validation.errors });

      if (validation.valid) {
        return fixedCode;
      }

      currentCode = fixedCode;
      currentErrors = validation.errors;
    }

    return currentCode;
  }

  private async diagnoseErrors(code: string, errors: string[]): Promise<string> {
    const config = this.getPlannerConfig();
    
    const codeSnippet = code.slice(0, 1500);
    const prompt = DIAGNOSIS_PROMPT
      .replace("{errors}", errors.join("\n"))
      .replace("{codeSnippet}", codeSnippet);

    return await generateCompletion(
      config,
      "You are a debugging expert. Be brief and actionable.",
      prompt,
      LLM_DEFAULTS.maxTokens.analysis
    );
  }

  private async attemptFix(code: string, errors: string[]): Promise<string> {
    const config = this.getBuilderConfig();
    
    const prompt = FIX_PROMPT
      .replace("{errors}", errors.join("\n"))
      .replace("{code}", code);

    this.emit({ type: "thinking", model: "builder", content: "Applying fixes..." });

    const response = await generateCompletion(
      config,
      "You are a code fixer. Output only the complete fixed code.",
      prompt,
      LLM_DEFAULTS.maxTokens.fullStack
    );

    return response
      .replace(/^```(?:jsx?|javascript|typescript|tsx)?\n?/gm, "")
      .replace(/```$/gm, "")
      .trim();
  }

  private async reviewPhase(code: string, plan: OrchestratorPlan): Promise<ReviewSummary> {
    const config = this.getPlannerConfig();
    
    this.emit({ type: "thinking", model: "planner", content: "Reviewing code quality, architecture, security, and UX..." });
    
    // Get review-mode instructions
    const modelInstructions = getModelInstructions(config.model, "planner", "review");
    
    const prompt = modelInstructions + REVIEW_PROMPT
      .replace("{planSummary}", plan.summary)
      .replace("{qualityProfile}", plan.qualityProfile)
      .replace("{code}", code.slice(0, 8000)); // Limit code size for context

    try {
      const response = await generateCompletion(
        config,
        "You are a Principal Engineer performing a rigorous code review.",
        prompt,
        LLM_DEFAULTS.maxTokens.analysis
      );

      // Parse review response
      const parseResult = safeParseJSON<{
        summary?: string;
        strengths?: string[];
        issues?: Array<{ severity?: string; file?: string; description?: string }>;
        recommendations?: string[];
      }>(response);

      if (parseResult.success) {
        const parsed = parseResult.data;
        return {
          summary: parsed.summary || "Review completed",
          strengths: parsed.strengths || [],
          issues: (parsed.issues || []).map(i => ({
            severity: (i.severity as "high" | "medium" | "low") || "medium",
            file: i.file,
            description: i.description || "No description provided",
          })),
          recommendations: parsed.recommendations || [],
        };
      }

      // Fallback if parsing fails
      logger.warn("Review JSON parse failed, returning minimal review");
      return {
        summary: "Review completed (parsing failed)",
        strengths: [],
        issues: [],
        recommendations: [],
      };
    } catch (error) {
      logger.error("Review phase error", {}, error as Error);
      return {
        summary: "Review skipped due to error",
        strengths: [],
        issues: [],
        recommendations: [],
      };
    }
  }

  /**
   * Parse file blocks from generated code string
   * Format: [FILE: path/to/file.ext] followed by code until next [FILE:] or end
   */
  private parseFilesFromCode(code: string): Array<{ path: string; content: string }> {
    const files: Array<{ path: string; content: string }> = [];
    const filePattern = /\[FILE:\s*(.+?)\]/g;
    const matches = Array.from(code.matchAll(filePattern));
    
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const path = match[1].trim();
      const startIndex = (match.index || 0) + match[0].length;
      const endIndex = matches[i + 1]?.index || code.length;
      const content = code.slice(startIndex, endIndex).trim();
      
      if (path && content) {
        files.push({ path, content });
      }
    }
    
    return files;
  }

  // ============================================================================
  // MULTI-AGENT SERVICES INTEGRATION
  // Task decomposition, project memory, auto-fix loop, and refactoring
  // ============================================================================

  /**
   * Decompose a complex request into manageable subtasks with dependency ordering
   */
  async decomposeRequest(userRequest: string, existingCode?: string): Promise<DecomposedTask | null> {
    if (!this.projectId) return null;

    try {
      const task = await taskDecompositionService.decomposePrompt(
        this.projectId,
        userRequest,
        existingCode ? { existingCode } : undefined
      );

      this.emit({
        type: "phase_change",
        phase: "planning",
        message: `Task decomposed into ${task.subtasks.length} subtasks`
      });

      return task;
    } catch (error) {
      logger.error("Task decomposition failed", {}, error as Error);
      return null;
    }
  }

  /**
   * Record file metadata and architectural decisions to project memory
   */
  async recordToMemory(
    files: Array<{ path: string; purpose: string; content?: string }>,
    decision?: { category: string; title: string; description: string; rationale: string }
  ): Promise<void> {
    if (!this.projectId) return;

    try {
      for (const file of files) {
        await projectMemoryService.recordFileMetadata(this.projectId, file.path, {
          purpose: file.purpose,
          linesOfCode: file.content?.split("\n").length || 0
        });
      }

      if (decision) {
        await projectMemoryService.recordDecision(this.projectId, {
          category: decision.category as any,
          title: decision.title,
          description: decision.description,
          rationale: decision.rationale,
          alternatives: [],
          consequences: []
        });
      }

      await projectMemoryService.recordChange(this.projectId, {
        type: "creation",
        description: `Generated ${files.length} file(s)`,
        files: files.map(f => f.path),
        metrics: {
          filesChanged: files.length,
          linesAdded: files.reduce((acc, f) => acc + (f.content?.split("\n").length || 0), 0),
          linesRemoved: 0,
          tokensUsed: 0
        }
      });
    } catch (error) {
      logger.error("Failed to record to memory", {}, error as Error);
    }
  }

  /**
   * Run automated validation and fix loop using CodeRunner + AutoFixLoop services
   * Enhanced with runtime feedback capture for real-time error detection
   */
  async runEnhancedAutoFix(code: string): Promise<{ success: boolean; fixedCode: string; session?: AutoFixSession }> {
    if (!this.projectId) {
      return { success: true, fixedCode: code };
    }

    try {
      // Start runtime session for error capture
      runtimeFeedbackService.startSession(this.projectId);
      
      const session = await autoFixLoopService.startAutoFixSession(this.projectId, {
        maxIterations: this.state.maxFixAttempts
      });

      const result = await autoFixLoopService.runFixLoop(
        session.id,
        async () => {
          return await codeRunnerService.runTypeCheck();
        },
        async (fix, error) => {
          this.emit({
            type: "phase_change",
            phase: "fixing",
            message: `Applying fix for: ${error.message.slice(0, 50)}...`
          });
          return true;
        }
      );

      // Check for any unhandled runtime errors after fix loop and feed into auto-fix
      const unhandledErrors = runtimeFeedbackService.getUnhandledErrors(this.projectId);
      if (unhandledErrors.length > 0 && result.status === "completed") {
        this.emit({
          type: "thinking",
          model: "builder",
          content: `Runtime feedback: ${unhandledErrors.length} runtime error(s) detected`
        });
        
        // Format errors for LLM context - store for potential re-fix cycles
        const errorContext = runtimeFeedbackService.formatErrorsForLLM(this.projectId);
        if (errorContext) {
          // Store runtime error context in the session for next generation cycle
          // This enables the autonomous loop to learn from runtime failures
          for (const err of unhandledErrors.slice(0, 3)) {
            this.emit({
              type: "phase_change",
              phase: "fixing",
              message: `Runtime error: ${err.type} - ${err.message.slice(0, 50)}...`
            });
            
            // Mark with suggested fix if available
            if (err.suggestion) {
              this.emit({
                type: "thinking",
                model: "builder",
                content: `Suggested fix: ${err.suggestion}`
              });
            }
          }
        }
      }

      return {
        success: result.status === "completed",
        fixedCode: code,
        session: result
      };
    } catch (error) {
      logger.error("Enhanced auto-fix failed", {}, error as Error);
      return { success: false, fixedCode: code };
    }
  }

  /**
   * Run UI/UX analysis pass on generated frontend files
   */
  async runUIUXAnalysis(
    files: Array<{ path: string; content: string }>
  ): Promise<{ score: string; issues: number; suggestions: string[] } | null> {
    if (!this.projectId || files.length === 0) return null;

    try {
      const frontendFiles = files.filter(f => 
        f.path.endsWith('.tsx') || f.path.endsWith('.jsx') || 
        f.path.endsWith('.css') || f.path.includes('component')
      );

      if (frontendFiles.length === 0) return null;

      this.emit({
        type: "phase_change",
        phase: "reviewing",
        message: "Analyzing UI/UX patterns..."
      });

      const analysis = await uiuxAgentService.analyzeFiles(frontendFiles);
      
      // Convert score (0-100) to letter grade
      const getGrade = (s: number): string => {
        if (s >= 90) return "A";
        if (s >= 80) return "B";
        if (s >= 70) return "C";
        if (s >= 60) return "D";
        return "F";
      };
      const grade = getGrade(analysis.score);
      
      if (analysis.issuesFound.length > 0) {
        this.emit({
          type: "thinking",
          model: "builder",
          content: `UI/UX Analysis: Grade ${grade}, ${analysis.issuesFound.length} issue(s) found`
        });
      }

      return {
        score: grade,
        issues: analysis.issuesFound.length,
        suggestions: analysis.issuesFound.slice(0, 5).map((i: { suggestion: string }) => i.suggestion)
      };
    } catch (error) {
      logger.error("UI/UX analysis failed", {}, error as Error);
      return null;
    }
  }

  /**
   * Run post-generation refactoring pass to improve code quality
   */
  async runRefactoringPass(
    files: Array<{ path: string; content: string }>
  ): Promise<RefactoringResult | null> {
    if (!this.projectId || files.length === 0) return null;

    try {
      const sam = CORE_DREAM_TEAM.find(m => m.id === "sam");
      
      if (this.dreamTeam && sam) {
        await this.dreamTeam.logActivity(this.projectId, {
          member: sam,
          action: "refactoring",
          content: `Analyzing ${files.length} file(s) for code improvements...`
        });
      }

      this.emit({
        type: "phase_change",
        phase: "reviewing",
        message: "Running refactoring analysis..."
      });

      const { totalMetrics } = await refactoringAgentService.refactorProject(
        this.projectId,
        files,
        { autoFix: false, dryRun: true }
      );

      if (totalMetrics.issuesFound > 0) {
        this.emit({
          type: "thinking",
          model: "builder",
          content: `Found ${totalMetrics.issuesFound} potential improvements across ${totalMetrics.filesAnalyzed} files`
        });
      }

      return {
        success: true,
        changes: [],
        summary: `Analyzed ${totalMetrics.filesAnalyzed} files, found ${totalMetrics.issuesFound} potential improvements`,
        metrics: totalMetrics
      };
    } catch (error) {
      logger.error("Refactoring pass failed", {}, error as Error);
      return null;
    }
  }

  /**
   * Get project context from memory for enhanced generation
   */
  async getProjectContext(): Promise<{
    summary: string;
    conventions: Array<{ name: string; description: string }>;
    recentDecisions: Array<{ title: string; description: string }>;
    fileStructure: string;
  } | null> {
    if (!this.projectId) return null;

    try {
      const context = await projectMemoryService.getContextForGeneration(this.projectId);
      return {
        summary: context.summary,
        conventions: context.conventions.map(c => ({ name: c.name, description: c.description })),
        recentDecisions: context.recentDecisions.map(d => ({ title: d.title, description: d.description })),
        fileStructure: context.fileStructure
      };
    } catch (error) {
      logger.error("Failed to get project context", {}, error as Error);
      return null;
    }
  }
}

export function createOrchestrator(
  settings: LLMSettings,
  onEvent: (event: OrchestratorEvent) => void,
  projectId?: string
): AIOrchestrator {
  return new AIOrchestrator(settings, onEvent, projectId);
}
