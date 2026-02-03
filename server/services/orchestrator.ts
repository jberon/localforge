import { createLLMClient, LLM_DEFAULTS, generateCompletion } from "../llm-client";
import { searchWeb, formatSearchResultsForContext } from "./webSearch";
import { createDreamTeamService, type DreamTeamService } from "./dreamTeam";
import { llmSettingsSchema, CORE_DREAM_TEAM, detectModelRole, getOptimalTemperature } from "@shared/schema";
import { z } from "zod";

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
      console.warn(`JSON parse failed, using fallback: ${errorMsg}`);
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
      console.log("[Orchestrator] Falling back to single-model mode for Dream Team");
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
        console.log("[Orchestrator] Planner model unavailable, falling back to builder model");
        this.emit({ 
          type: "status", 
          message: "Reasoning model unavailable, using builder model for all tasks" 
        });
      }
      
      return isAvailable;
    } catch (error) {
      console.warn("[Orchestrator] Model availability check failed:", error);
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
          console.log("[Orchestrator] Activating fallback: using builder model for planning");
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
      
      const plan = await this.planningPhase(userRequest, existingCode);
      
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
        
        if (this.dreamTeam && this.projectId) {
          await this.dreamTeam.logActivity(this.projectId, {
            member: martin,
            action: "fixing",
            content: `Fixing ${validation.errors.length} validation error(s)`,
          });
        }
        
        const fixedCode = await this.fixLoop(code, validation.errors);
        this.state.generatedCode = fixedCode;
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

      this.emit({ type: "phase_change", phase: "complete", message: "Generation complete!" });
      this.emit({ type: "complete", code: this.state.generatedCode, summary: plan.summary, reviewSummary });

      return { success: true, code: this.state.generatedCode, summary: plan.summary };
    } catch (error: any) {
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

  private async planningPhase(userRequest: string, existingCode?: string): Promise<OrchestratorPlan> {
    const config = this.getPlannerConfig();
    const maxRetries = 2;
    
    let context = "";
    if (existingCode) {
      context = `\n\nEXISTING CODE TO MODIFY:\n${existingCode.slice(0, 2000)}...`;
    }

    this.emit({ type: "thinking", model: "planner", content: "Reading your request and identifying what kind of application you want to build..." });

    // Emit more detailed thinking as we analyze
    setTimeout(() => {
      if (!this.aborted) {
        this.emit({ type: "thinking", model: "planner", content: "Breaking down the project into components, features, and implementation steps..." });
      }
    }, 2000);

    // Get model-specific instructions based on detected model role
    const modelInstructions = getModelInstructions(config.model, "planner");
    
    // Retry loop for JSON parsing with exponential backoff
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const promptSuffix = attempt > 0 
        ? "\n\nIMPORTANT: Your previous response was not valid JSON. Respond with ONLY valid JSON, no markdown or explanations."
        : "";

      // Prepend model-specific instructions to the planning prompt
      const fullPrompt = modelInstructions + PLANNING_PROMPT + promptSuffix;

      const response = await generateCompletion(
        config,
        fullPrompt,
        userRequest + context,
        LLM_DEFAULTS.maxTokens.plan
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
      console.warn(`Plan JSON parse attempt ${attempt + 1}/${maxRetries + 1} failed: ${parseResult.error}`);
      
      if (attempt < maxRetries) {
        this.emit({ type: "thinking", model: "planner", content: "Refining the plan structure..." });
        // Exponential backoff: 500ms, 1000ms
        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt)));
      }
    }

    // All retries exhausted, fall back to simple plan
    console.warn("All planning retries exhausted, using simple plan");
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

    let context = "";
    if (this.state.webSearchResults) {
      context += `WEB SEARCH RESULTS:\n${this.state.webSearchResults}\n\n`;
    }
    if (existingCode) {
      context += `EXISTING CODE:\n${existingCode}\n\n`;
    }

    // Get model-specific instructions based on detected model role
    const modelInstructions = getModelInstructions(config.model, "builder");
    
    // Prepend model-specific instructions to the building prompt
    const prompt = modelInstructions + BUILDING_PROMPT
      .replace("{context}", context || "No additional context.")
      .replace("{plan}", JSON.stringify(plan, null, 2));

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
        { role: "system", content: prompt },
        { role: "user", content: userRequest },
      ],
      temperature: config.temperature ?? 0.4,
      max_tokens: LLM_DEFAULTS.maxTokens.fullStack,
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

  private validateCode(code: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

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

    return { valid: errors.length === 0, errors };
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
      console.warn("[Orchestrator] Review JSON parse failed, returning minimal review");
      return {
        summary: "Review completed (parsing failed)",
        strengths: [],
        issues: [],
        recommendations: [],
      };
    } catch (error) {
      console.error("[Orchestrator] Review phase error:", error);
      return {
        summary: "Review skipped due to error",
        strengths: [],
        issues: [],
        recommendations: [],
      };
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
