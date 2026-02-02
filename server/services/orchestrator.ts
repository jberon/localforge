import { createLLMClient, LLM_DEFAULTS, generateCompletion } from "../llm-client";
import { searchWeb, formatSearchResultsForContext } from "./webSearch";
import { llmSettingsSchema } from "@shared/schema";
import { z } from "zod";

export interface OrchestratorTask {
  id: string;
  title: string;
  description: string;
  type: "plan" | "build" | "fix" | "search" | "validate";
  status: "pending" | "in_progress" | "completed" | "failed";
  result?: string;
  error?: string;
}

export interface OrchestratorPlan {
  summary: string;
  tasks: OrchestratorTask[];
  architecture?: string;
  searchQueries?: string[];
}

export interface OrchestratorState {
  phase: "planning" | "searching" | "building" | "validating" | "fixing" | "complete" | "failed";
  plan?: OrchestratorPlan;
  currentTaskIndex: number;
  generatedCode: string;
  validationErrors: string[];
  fixAttempts: number;
  maxFixAttempts: number;
  webSearchResults: string;
  messages: Array<{ role: "planner" | "builder" | "system"; content: string }>;
}

export type OrchestratorEvent = 
  | { type: "phase_change"; phase: OrchestratorState["phase"]; message: string }
  | { type: "task_start"; task: OrchestratorTask }
  | { type: "task_complete"; task: OrchestratorTask }
  | { type: "thinking"; model: "planner" | "builder" | "web_search"; content: string }
  | { type: "code_chunk"; content: string }
  | { type: "search"; query: string }
  | { type: "search_result"; query: string; resultCount: number }
  | { type: "validation"; valid: boolean; errors: string[] }
  | { type: "fix_attempt"; attempt: number; maxAttempts: number }
  | { type: "complete"; code: string; summary: string }
  | { type: "error"; message: string };

type LLMSettings = z.infer<typeof llmSettingsSchema>;

const PLANNING_PROMPT = `You are an expert software architect. Analyze the user's request and create a structured implementation plan.

RESPOND WITH VALID JSON ONLY (no markdown):
{
  "summary": "Brief description of what will be built",
  "architecture": "Technical approach (React components, state management, styling)",
  "searchNeeded": true/false,
  "searchQueries": ["query 1", "query 2"] (if searchNeeded),
  "tasks": [
    {"id": "1", "title": "Task name", "description": "What to implement", "type": "build"},
    {"id": "2", "title": "Task name", "description": "What to implement", "type": "build"}
  ]
}

Task types: "build" for code, "validate" for testing
Keep tasks focused and implementable. Maximum 5 tasks for simple apps.
For API integrations, add searchNeeded: true with relevant queries.`;

const BUILDING_PROMPT = `You are an expert React developer. Generate complete, working code based on the plan.

RULES:
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

Generate the complete app now:`;

const FIX_PROMPT = `You are a code fixer. Fix the errors in this code.

ERRORS:
{errors}

CODE:
{code}

Output ONLY the complete fixed code - no explanations, no markdown:`;

const DIAGNOSIS_PROMPT = `You are a debugging expert. Analyze these code errors and explain:
1. What caused each error
2. The specific fix needed
3. Any patterns or root causes

ERRORS:
{errors}

CODE SNIPPET (relevant portion):
{codeSnippet}

Provide a brief, actionable diagnosis:`;

export class AIOrchestrator {
  private settings: LLMSettings;
  private state: OrchestratorState;
  private onEvent: (event: OrchestratorEvent) => void;
  private aborted = false;

  constructor(
    settings: LLMSettings,
    onEvent: (event: OrchestratorEvent) => void
  ) {
    this.settings = settings;
    this.onEvent = onEvent;
    this.state = this.createInitialState();
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
      return {
        endpoint: this.settings.endpoint || "http://localhost:1234/v1",
        model: this.settings.plannerModel || this.settings.model || "",
        temperature: this.settings.plannerTemperature ?? LLM_DEFAULTS.temperature.planner,
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
      return {
        endpoint: this.settings.endpoint || "http://localhost:1234/v1",
        model: this.settings.builderModel || this.settings.model || "",
        temperature: this.settings.builderTemperature ?? LLM_DEFAULTS.temperature.builder,
      };
    }
    return {
      endpoint: this.settings.endpoint || "http://localhost:1234/v1",
      model: this.settings.model || "",
      temperature: LLM_DEFAULTS.temperature.builder,
    };
  }

  async run(userRequest: string, existingCode?: string): Promise<{ success: boolean; code: string; summary: string }> {
    this.state = this.createInitialState();
    this.aborted = false;

    try {
      this.emit({ type: "phase_change", phase: "planning", message: "Planner is analyzing your request..." });
      const plan = await this.planningPhase(userRequest, existingCode);
      
      if (this.aborted) throw new Error("Aborted");
      this.state.plan = plan;

      if (plan.searchQueries && plan.searchQueries.length > 0 && this.settings.webSearchEnabled && this.settings.serperApiKey) {
        this.emit({ type: "phase_change", phase: "searching", message: "Searching for relevant information..." });
        await this.searchPhase(plan.searchQueries);
      }

      if (this.aborted) throw new Error("Aborted");
      this.emit({ type: "phase_change", phase: "building", message: "Builder is generating code..." });
      const code = await this.buildingPhase(plan, userRequest, existingCode);
      this.state.generatedCode = code;

      if (this.aborted) throw new Error("Aborted");
      this.emit({ type: "phase_change", phase: "validating", message: "Validating generated code..." });
      const validation = this.validateCode(code);
      this.emit({ type: "validation", valid: validation.valid, errors: validation.errors });

      if (!validation.valid) {
        this.emit({ type: "phase_change", phase: "fixing", message: "Auto-fixing detected issues..." });
        const fixedCode = await this.fixLoop(code, validation.errors);
        this.state.generatedCode = fixedCode;
      }

      this.emit({ type: "phase_change", phase: "complete", message: "Generation complete!" });
      this.emit({ type: "complete", code: this.state.generatedCode, summary: plan.summary });

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

    const response = await generateCompletion(
      config,
      PLANNING_PROMPT,
      userRequest + context,
      LLM_DEFAULTS.maxTokens.plan
    );

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this.createSimplePlan(userRequest);
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      const tasks: OrchestratorTask[] = (parsed.tasks || []).map((t: any, i: number) => ({
        id: t.id || String(i + 1),
        title: t.title || `Task ${i + 1}`,
        description: t.description || "",
        type: t.type || "build",
        status: "pending" as const,
      }));

      return {
        summary: parsed.summary || "Building your application",
        architecture: parsed.architecture || "",
        searchQueries: parsed.searchNeeded ? (parsed.searchQueries || []) : [],
        tasks,
      };
    } catch {
      return this.createSimplePlan(userRequest);
    }
  }

  private createSimplePlan(userRequest: string): OrchestratorPlan {
    return {
      summary: `Building: ${userRequest.slice(0, 100)}`,
      tasks: [
        { id: "1", title: "Generate App", description: userRequest, type: "build", status: "pending" },
        { id: "2", title: "Validate", description: "Check code quality", type: "validate", status: "pending" },
      ],
    };
  }

  private async searchPhase(queries: string[]) {
    if (!this.settings.serperApiKey) return;

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

    const prompt = BUILDING_PROMPT
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
}

export function createOrchestrator(
  settings: LLMSettings,
  onEvent: (event: OrchestratorEvent) => void
): AIOrchestrator {
  return new AIOrchestrator(settings, onEvent);
}
