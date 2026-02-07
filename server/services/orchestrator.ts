import { createLLMClient, LLM_DEFAULTS, generateCompletion } from "../llm-client";
import { searchWeb, formatSearchResultsForContext } from "./webSearch";
import { createDreamTeamService, type DreamTeamService } from "./dreamTeam";
import { llmSettingsSchema, CORE_DREAM_TEAM, detectModelRole, getOptimalTemperature } from "@shared/schema";
import { z } from "zod";
import { logger } from "../lib/logger";
import { smartContextService } from "./smart-context.service";
import { feedbackLearningService } from "./feedback-learning.service";
import { extendedThinkingService } from "./extended-thinking.service";
import { buildEnhancedPlanningPrompt, buildEnhancedBuildingPrompt, buildEnhancedReviewPrompt, type EnhancedPromptContext } from "../prompts/enhanced-prompts";
import { type DecomposedTask } from "./task-decomposition.service";
import { projectMemoryService } from "./project-memory.service";
import { autoFixLoopService, type AutoFixSession } from "./auto-fix-loop.service";
import { type RefactoringResult } from "./refactoring-agent.service";
import { runtimeFeedbackService } from "./runtime-feedback.service";
import { localModelOptimizerService } from "./local-model-optimizer.service";
import { contextBudgetService } from "./context-budget.service";
import { fewShotCacheService } from "./few-shot-cache.service";
import { v2OrchestratorService, type V2GenerationContext, type V2GenerationResult } from "./v2-orchestrator.service";
import { getModelInstructions } from "./orchestrator/model-instructions";
import { safeParseJSON } from "./orchestrator/json-parser";
import type { PlannerMode, LLMSettings, OrchestratorTask, QualityProfile, OrchestratorPlan, ReviewSummary, OrchestratorState, OrchestratorEvent } from "./orchestrator/types";
import { PLANNING_PROMPT, BUILDING_PROMPT, FIX_PROMPT, DIAGNOSIS_PROMPT, REVIEW_PROMPT } from "./orchestrator/prompts";
import { validateCode } from "./orchestrator/validation";
import { decomposeRequest, recordToMemory, runEnhancedAutoFix as runEnhancedAutoFixOp, runUIUXAnalysis as runUIUXAnalysisOp, runRefactoringPass as runRefactoringPassOp, getProjectContext as getProjectContextOp } from "./orchestrator/enhanced-ops";
import { outputParserService } from "./output-parser.service";
import { adaptiveTemperatureService } from "./adaptive-temperature.service";
import { conversationMemoryService } from "./conversation-memory.service";
import { smartRetryService } from "./smart-retry.service";
import { promptChunkingService } from "./prompt-chunking.service";

export type { OrchestratorTask, QualityProfile, OrchestratorPlan, ReviewSummary, OrchestratorState, OrchestratorEvent, PlannerMode, LLMSettings } from "./orchestrator/types";

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

    let enhancedHistory = optimizedContext.summarizedHistory;
    if (messages.length > 6) {
      try {
        const compressed = conversationMemoryService.compressHistory(
          projectId,
          messages.map(m => ({ role: m.role as "user" | "assistant" | "system", content: m.content }))
        );
        const contextPrompt = conversationMemoryService.buildContextPrompt(compressed);
        if (contextPrompt && compressed.compressionRatio > 1.5) {
          enhancedHistory = contextPrompt;
          logger.info("[Intelligence] Conversation memory compressed", {
            projectId,
            originalTokens: compressed.totalOriginalTokens,
            compressedTokens: compressed.totalCompressedTokens,
            ratio: compressed.compressionRatio.toFixed(2),
          });
        }
      } catch (err) {
        logger.warn("[Intelligence] Conversation memory compression failed, using default", {}, err as Error);
      }
    }

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
      summarizedHistory: enhancedHistory,
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

  /**
   * Apply V2 optimizations for enhanced local LLM performance
   * This method integrates all v2.0.0 optimization services
   */
  private async applyV2Optimizations(
    prompt: string,
    taskType: "planning" | "coding" | "review" | "general",
    messages?: Array<{ role: string; content: string }>
  ): Promise<V2GenerationResult | null> {
    try {
      if (!v2OrchestratorService.isInitialized()) {
        await v2OrchestratorService.initialize(this.settings.model);
      }

      const v2Context: V2GenerationContext = {
        prompt,
        taskType,
        projectId: this.projectId,
        modelName: this.settings.model,
        messages: messages?.map(m => ({
          role: m.role as "user" | "assistant" | "system",
          content: m.content
        }))
      };

      const result = await v2OrchestratorService.prepareGeneration(v2Context);
      
      logger.info("V2 optimizations applied", {
        cacheHit: result.cacheHit,
        compressionApplied: result.compressionApplied,
        estimatedSpeedup: result.estimatedSpeedup,
        patterns: result.patterns?.length || 0,
        recommendedMaxTokens: result.metrics?.recommendedMaxTokens,
        gpuLayers: result.metrics?.gpuLayers,
        batchSize: result.metrics?.batchSize
      });

      return result;
    } catch (error) {
      logger.warn("V2 optimization failed, continuing without", {}, error as Error);
      return null;
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
    
    // v2.0.0: Apply V2 optimizations for enhanced local LLM performance
    const messagesForV2 = this.state.messages.map(m => ({ role: m.role, content: m.content }));
    const v2Result = await this.applyV2Optimizations(userRequest, "planning", messagesForV2);
    
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
    
    // v2.0.0: Determine max tokens using V2 result if available (from metrics object)
    const v2MaxTokens = v2Result?.metrics?.recommendedMaxTokens;
    const effectiveMaxTokens = v2MaxTokens || optimized.maxTokens || LLM_DEFAULTS.maxTokens.plan;
    
    // v2.0.0: Include pattern context if available from V2
    let enhancedUserPrompt = optimized.userPrompt;
    if (v2Result?.patterns && v2Result.patterns.length > 0) {
      enhancedUserPrompt = `${optimized.userPrompt}\n\nRELEVANT PATTERNS: ${v2Result.patterns.join(", ")}`;
    }
    if (v2Result?.semanticContext && v2Result.semanticContext.length > 0) {
      enhancedUserPrompt = `${enhancedUserPrompt}\n\nSEMANTIC CONTEXT:\n${v2Result.semanticContext.slice(0, 3).join("\n")}`;
    }
    
    const planTempRec = adaptiveTemperatureService.getRecommendedTemperature(
      config.model || "local-model",
      "planning"
    );
    const planTemperature = planTempRec.fallback ? optimized.temperature : planTempRec.temperature;

    const retrySessionId = smartRetryService.startSession(enhancedUserPrompt);
    let lastResponse = "";

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let currentPrompt = enhancedUserPrompt;
      
      if (attempt > 0) {
        const failureMode = smartRetryService.detectFailureMode(lastResponse, enhancedUserPrompt);
        const retryResult = smartRetryService.getRetryPrompt(
          enhancedUserPrompt,
          failureMode,
          attempt,
          lastResponse
        );
        currentPrompt = retryResult.prompt + '\n\nCRITICAL: Your response MUST be valid JSON only. No text before or after the JSON object. Start with { and end with }.';
        logger.info("[Intelligence] Smart retry for planning", {
          attempt,
          failureMode,
          strategy: retryResult.strategy,
          reasoning: retryResult.reasoning,
        });
        this.emit({ type: "thinking", model: "planner", content: `Refining approach (${retryResult.strategy})...` });
      }

      const fullPrompt = optimized.systemPrompt;

      const planConfig = { ...config, temperature: planTemperature };
      const response = await generateCompletion(
        planConfig,
        fullPrompt,
        currentPrompt,
        effectiveMaxTokens
      );
      lastResponse = response;

      const cleanedResponse = outputParserService.parse(response);

      const parseResult = safeParseJSON<{
        summary?: string;
        architecture?: string;
        qualityProfile?: string;
        stackProfile?: string;
        designNotes?: string;
        searchNeeded?: boolean;
        searchQueries?: string[];
        tasks?: Array<{ id?: string; title?: string; description?: string; type?: string }>;
      }>(cleanedResponse.extractedBlocks.length > 0 ? cleanedResponse.extractedBlocks[0].content : response);

      if (parseResult.success) {
        const parsed = parseResult.data;
        
        smartRetryService.recordAttempt(retrySessionId, {
          attempt,
          strategy: "rephrase",
          originalPrompt: enhancedUserPrompt,
          modifiedPrompt: currentPrompt,
          failureMode: "unknown",
          succeeded: true,
          durationMs: 0,
        });
        smartRetryService.completeSession(retrySessionId, true);

        adaptiveTemperatureService.recordOutcome({
          taskType: "planning",
          model: config.model || "local-model",
          temperature: planTemperature,
          success: true,
          syntaxErrors: 0,
          outputLength: response.length,
          timestamp: Date.now(),
          retryCount: attempt,
        });

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

      logger.warn("Plan JSON parse attempt failed", { attempt: attempt + 1, maxRetries: maxRetries + 1, error: parseResult.error });
      
      smartRetryService.recordAttempt(retrySessionId, {
        attempt,
        strategy: attempt === 0 ? "rephrase" : "constrain-output",
        originalPrompt: enhancedUserPrompt,
        modifiedPrompt: currentPrompt,
        failureMode: "wrong-format",
        succeeded: false,
        durationMs: 0,
      });

      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt)));
      }
    }

    smartRetryService.completeSession(retrySessionId, false);
    adaptiveTemperatureService.recordOutcome({
      taskType: "planning",
      model: config.model || "local-model",
      temperature: planTemperature,
      success: false,
      syntaxErrors: 0,
      outputLength: lastResponse.length,
      timestamp: Date.now(),
      retryCount: maxRetries + 1,
    });

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

    // v2.0.0: Apply V2 optimizations for enhanced local LLM performance
    const messagesForV2 = this.state.messages.map(m => ({ role: m.role, content: m.content }));
    const v2Result = await this.applyV2Optimizations(userRequest, "coding", messagesForV2);

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

    // v2.0.0: Determine max tokens using V2 result if available (from metrics object)
    const v2MaxTokens = v2Result?.metrics?.recommendedMaxTokens;
    const effectiveMaxTokens = v2MaxTokens || optimized.maxTokens || LLM_DEFAULTS.maxTokens.fullStack;
    
    // v2.0.0: Enhance user prompt with pattern context if available
    let enhancedUserPrompt = optimized.userPrompt;
    if (v2Result?.patterns && v2Result.patterns.length > 0) {
      enhancedUserPrompt = `${optimized.userPrompt}\n\nRELEVANT CODE PATTERNS: ${v2Result.patterns.join(", ")}`;
    }
    if (v2Result?.semanticContext && v2Result.semanticContext.length > 0) {
      enhancedUserPrompt = `${enhancedUserPrompt}\n\nSEMANTIC CODE CONTEXT:\n${v2Result.semanticContext.slice(0, 5).join("\n\n").slice(0, 2000)}`;
    }

    const tempRecommendation = adaptiveTemperatureService.getRecommendedTemperature(
      config.model || "local-model",
      "code-generation"
    );
    const effectiveTemperature = tempRecommendation.fallback ? optimized.temperature : tempRecommendation.temperature;
    
    logger.info("[Intelligence] Adaptive temperature", {
      model: config.model,
      recommended: tempRecommendation.temperature,
      confidence: tempRecommendation.confidence,
      fallback: tempRecommendation.fallback,
      effective: effectiveTemperature,
    });

    const complexity = promptChunkingService.analyzeComplexity(userRequest);
    logger.info("[Intelligence] Prompt complexity", { complexity: complexity.complexity, componentCount: complexity.componentCount });

    const stream = await client.chat.completions.create({
      model: v2Result?.selectedModel || config.model || "local-model",
      messages: [
        { role: "system", content: optimized.systemPrompt },
        { role: "user", content: enhancedUserPrompt },
      ],
      temperature: effectiveTemperature,
      max_tokens: effectiveMaxTokens,
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

    const parsed = outputParserService.parse(fullCode);
    logger.info("[Intelligence] Output parsed", {
      confidence: parsed.confidence,
      truncated: parsed.truncationDetected,
      codeBlocks: parsed.extractedBlocks.length,
      artifactsRemoved: parsed.artifactsRemoved.length,
      warnings: parsed.parseWarnings.length,
    });

    let cleanedCode: string;
    if (parsed.extractedBlocks.length > 0) {
      cleanedCode = parsed.extractedBlocks.map(b => b.content).join("\n\n").trim();
    } else {
      cleanedCode = fullCode
        .replace(/^```(?:jsx?|javascript|typescript|tsx)?\n?/gm, "")
        .replace(/```$/gm, "")
        .trim();
    }

    const hasErrors = parsed.truncationDetected || parsed.confidence < 0.5;
    adaptiveTemperatureService.recordOutcome({
      taskType: "code-generation",
      model: config.model || "local-model",
      temperature: effectiveTemperature,
      success: !hasErrors,
      syntaxErrors: parsed.extractedBlocks.filter(b => !b.isComplete).length,
      outputLength: cleanedCode.length,
      timestamp: Date.now(),
      retryCount: 0,
    });

    for (const task of plan.tasks.filter(t => t.type === "build")) {
      task.status = "completed";
      this.emit({ type: "task_complete", task });
    }
    this.emitTasksUpdated();

    return cleanedCode;
  }

  private validateCode(code: string): { valid: boolean; errors: string[]; analysisScore?: number } {
    return validateCode(code);
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

  async decomposeRequest(userRequest: string, existingCode?: string): Promise<DecomposedTask | null> {
    return decomposeRequest(this.projectId, (e) => this.emit(e), userRequest, existingCode);
  }

  async recordToMemory(
    files: Array<{ path: string; purpose: string; content?: string }>,
    decision?: { category: string; title: string; description: string; rationale: string }
  ): Promise<void> {
    return recordToMemory(this.projectId, files, decision);
  }

  async runEnhancedAutoFix(code: string): Promise<{ success: boolean; fixedCode: string; session?: AutoFixSession }> {
    return runEnhancedAutoFixOp(this.projectId, code, this.state.maxFixAttempts, (e) => this.emit(e));
  }

  async runUIUXAnalysis(
    files: Array<{ path: string; content: string }>
  ): Promise<{ score: string; issues: number; suggestions: string[] } | null> {
    return runUIUXAnalysisOp(this.projectId, files, (e) => this.emit(e));
  }

  async runRefactoringPass(
    files: Array<{ path: string; content: string }>
  ): Promise<RefactoringResult | null> {
    return runRefactoringPassOp(this.projectId, files, (e) => this.emit(e), this.dreamTeam);
  }

  async getProjectContext(): Promise<{
    summary: string;
    conventions: Array<{ name: string; description: string }>;
    recentDecisions: Array<{ title: string; description: string }>;
    fileStructure: string;
  } | null> {
    return getProjectContextOp(this.projectId);
  }
}

export function createOrchestrator(
  settings: LLMSettings,
  onEvent: (event: OrchestratorEvent) => void,
  projectId?: string
): AIOrchestrator {
  return new AIOrchestrator(settings, onEvent, projectId);
}
