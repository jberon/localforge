import { Router } from "express";
import {
  storage,
  z,
  llmSettingsSchema,
  generationRateLimiter,
  asyncHandler,
  createOrchestrator,
  createProductionOrchestrator,
} from "./index";
import type { OrchestratorEvent, ProductionEvent } from "./index";

const dreamTeamRequestSchema = z.object({
  content: z.string().min(1, "Request is required"),
  settings: llmSettingsSchema,
});

const productionRequestSchema = z.object({
  content: z.string().min(1, "Request is required"),
  settings: llmSettingsSchema,
});

export function registerTeamRoutes(router: Router): void {
  router.post("/:id/dream-team", generationRateLimiter, asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    try {
      const parsed = dreamTeamRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }
      
      const { content, settings } = parsed.data;
      const projectId = String(req.params.id);
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      await storage.addMessage(projectId, {
        role: "user",
        content,
      });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      let isClientConnected = true;
      req.on("close", () => {
        isClientConnected = false;
        orchestrator?.abort();
      });

      const orchestrator = createOrchestrator(settings, (event: OrchestratorEvent) => {
        if (!isClientConnected) return;
        
        switch (event.type) {
          case "phase_change":
            res.write(`data: ${JSON.stringify({ type: "phase", phase: event.phase, message: event.message })}\n\n`);
            break;
          case "thinking":
            res.write(`data: ${JSON.stringify({ type: "thinking", model: event.model, content: event.content })}\n\n`);
            break;
          case "code_chunk":
            res.write(`data: ${JSON.stringify({ type: "chunk", content: event.content })}\n\n`);
            break;
          case "task_start":
            res.write(`data: ${JSON.stringify({ type: "task_start", task: event.task })}\n\n`);
            break;
          case "task_complete":
            res.write(`data: ${JSON.stringify({ type: "task_complete", task: event.task })}\n\n`);
            break;
          case "tasks_updated":
            res.write(`data: ${JSON.stringify({ type: "tasks_updated", tasks: event.tasks, completedCount: event.completedCount, totalCount: event.totalCount })}\n\n`);
            break;
          case "search_result":
            res.write(`data: ${JSON.stringify({ type: "search", query: event.query, count: event.resultCount })}\n\n`);
            break;
          case "validation":
            res.write(`data: ${JSON.stringify({ type: "validation", valid: event.valid, errors: event.errors })}\n\n`);
            break;
          case "fix_attempt":
            res.write(`data: ${JSON.stringify({ type: "fix_attempt", attempt: event.attempt, max: event.maxAttempts })}\n\n`);
            break;
          case "status":
            res.write(`data: ${JSON.stringify({ type: "status", message: event.message })}\n\n`);
            break;
          case "complete":
            break;
          case "error":
            res.write(`data: ${JSON.stringify({ type: "error", message: event.message })}\n\n`);
            break;
        }
      }, projectId);

      const result = await orchestrator.run(content, project.generatedCode || undefined);

      if (result.success && result.code) {
        await storage.updateProject(projectId, {
          generatedCode: result.code,
          generationMetrics: {
            startTime,
            endTime: Date.now(),
            durationMs: Date.now() - startTime,
            promptLength: content.length,
            responseLength: result.code.length,
            status: "success",
            retryCount: 0,
          },
        });

        await storage.addMessage(projectId, {
          role: "assistant",
          content: `**AI Dream Team completed!**\n\n${result.summary}\n\nCheck the preview to see your app in action!`,
        });
      } else {
        await storage.addMessage(projectId, {
          role: "assistant",
          content: `Dream Team encountered an issue: ${result.summary}. Please try again or simplify your request.`,
        });
      }

      const finalProject = await storage.getProject(projectId);
      res.write(`data: ${JSON.stringify({ type: "done", project: finalProject, success: result.success })}\n\n`);
      res.end();
      
    } catch (error: any) {
      console.error("Dream Team error:", error);
      res.write(`data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`);
      res.end();
    }
  }));

  router.post("/:id/production", generationRateLimiter, asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    try {
      const parsed = productionRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }
      
      const { content, settings } = parsed.data;
      const projectId = String(req.params.id);
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      await storage.addMessage(projectId, {
        role: "user",
        content: `[Production Mode] ${content}`,
      });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      let isClientConnected = true;
      let orchestrator: ReturnType<typeof createProductionOrchestrator> | null = null;
      
      req.on("close", () => {
        isClientConnected = false;
        orchestrator?.abort();
      });

      orchestrator = createProductionOrchestrator(settings, (event: ProductionEvent) => {
        if (!isClientConnected) return;
        
        switch (event.type) {
          case "phase_change":
            res.write(`data: ${JSON.stringify({ type: "phase", phase: event.phase, message: event.message })}\n\n`);
            break;
          case "thinking":
            res.write(`data: ${JSON.stringify({ type: "thinking", model: event.model, content: event.content })}\n\n`);
            break;
          case "file_start":
            res.write(`data: ${JSON.stringify({ type: "file_start", file: event.file, purpose: event.purpose })}\n\n`);
            break;
          case "file_complete":
            res.write(`data: ${JSON.stringify({ type: "file_complete", file: event.file, size: event.size })}\n\n`);
            break;
          case "file_chunk":
            res.write(`data: ${JSON.stringify({ type: "file_chunk", file: event.file, content: event.content })}\n\n`);
            break;
          case "test_result":
            res.write(`data: ${JSON.stringify({ type: "test_result", file: event.file, passed: event.passed, error: event.error })}\n\n`);
            break;
          case "quality_issue":
            res.write(`data: ${JSON.stringify({ type: "quality_issue", issue: event.issue })}\n\n`);
            break;
          case "quality_score":
            res.write(`data: ${JSON.stringify({ type: "quality_score", score: event.score, passed: event.passed })}\n\n`);
            break;
          case "search_result":
            res.write(`data: ${JSON.stringify({ type: "search", query: event.query, count: event.resultCount })}\n\n`);
            break;
          case "fix_attempt":
            res.write(`data: ${JSON.stringify({ type: "fix_attempt", attempt: event.attempt, max: event.maxAttempts, reason: event.reason })}\n\n`);
            break;
          case "complete":
            break;
          case "error":
            res.write(`data: ${JSON.stringify({ type: "error", message: event.message })}\n\n`);
            break;
        }
      });

      const result = await orchestrator.run(content);

      if (result.success && result.files.length > 0) {
        const generatedFiles = result.files.map(f => ({
          path: f.path,
          content: f.content,
          language: f.path.endsWith('.tsx') ? 'typescript' : f.path.endsWith('.ts') ? 'typescript' : f.path.endsWith('.md') ? 'markdown' : 'text',
        }));

        await storage.updateProject(projectId, {
          generatedFiles,
          generationMetrics: {
            startTime,
            endTime: Date.now(),
            durationMs: Date.now() - startTime,
            promptLength: content.length,
            responseLength: result.files.reduce((acc, f) => acc + f.content.length, 0),
            status: "success",
            retryCount: 0,
          },
        });

        await storage.addMessage(projectId, {
          role: "assistant",
          content: `**Production Build Complete!**\n\n${result.summary}\n\n**Quality Score:** ${result.qualityScore}/100\n\n**Files Generated:** ${result.files.length}\n- ${result.files.map(f => f.path).join('\n- ')}\n\nCheck the Files tab to view and download your project!`,
        });
      } else {
        await storage.addMessage(projectId, {
          role: "assistant",
          content: `Production build encountered an issue: ${result.summary}. Please try again.`,
        });
      }

      const finalProject = await storage.getProject(projectId);
      res.write(`data: ${JSON.stringify({ 
        type: "done", 
        project: finalProject, 
        success: result.success,
        files: result.files,
        qualityScore: result.qualityScore
      })}\n\n`);
      res.end();
      
    } catch (error: any) {
      console.error("Production mode error:", error);
      res.write(`data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`);
      res.end();
    }
  }));
}
