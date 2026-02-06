import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler";
import { multiStepReasoningService } from "../../services/multi-step-reasoning.service";
import { extendedThinkingService } from "../../services/extended-thinking.service";

const decomposeSchema = z.object({
  projectId: z.string(),
  objective: z.string(),
  context: z.any().optional(),
});

const skipStepSchema = z.object({
  reason: z.string().optional(),
});

const thinkingModeSchema = z.object({
  mode: z.string(),
  projectId: z.string().optional(),
});

const shouldTriggerSchema = z.object({
  prompt: z.string(),
  projectId: z.string().optional(),
});

const analyzeComplexitySchema = z.object({
  prompt: z.string(),
});

const startSessionSchema = z.object({
  projectId: z.string(),
  prompt: z.string(),
  mode: z.string().optional(),
  triggerReason: z.string().optional(),
});

const addStepSchema = z.object({
  type: z.string(),
  content: z.string(),
  insights: z.array(z.string()).optional(),
  questions: z.array(z.string()).optional(),
});

const completeSessionSchema = z.object({
  conclusion: z.string(),
  confidence: z.number().optional(),
});

export function registerReasoningRoutes(router: Router): void {
  router.post("/reasoning/decompose", asyncHandler((req, res) => {
    const parsed = decomposeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { projectId, objective, context } = parsed.data;
    const result = multiStepReasoningService.decomposeTask(projectId, objective, context);
    res.json(result);
  }));

  router.get("/reasoning/chains/:chainId", asyncHandler((req, res) => {
    const chain = multiStepReasoningService.getChain(req.params.chainId as string);
    res.json(chain || { error: "Chain not found" });
  }));

  router.get("/reasoning/chains/:chainId/progress", asyncHandler((req, res) => {
    const progress = multiStepReasoningService.getChainProgress(req.params.chainId as string);
    res.json(progress);
  }));

  router.post("/reasoning/chains/:chainId/steps/:stepId/skip", asyncHandler((req, res) => {
    const parsed = skipStepSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { reason } = parsed.data;
    const success = multiStepReasoningService.skipStep(
      req.params.chainId as string,
      req.params.stepId as string,
      reason
    );
    res.json({ success });
  }));

  router.post("/reasoning/chains/:chainId/abort", asyncHandler((_req, res) => {
    const success = multiStepReasoningService.abortChain(_req.params.chainId as string);
    res.json({ success });
  }));

  router.get("/thinking/modes", asyncHandler((_req, res) => {
    const modes = extendedThinkingService.getAllModes();
    res.json(modes);
  }));

  router.get("/thinking", asyncHandler((req, res) => {
    const projectId = req.query.projectId as string | undefined;
    const config = extendedThinkingService.getConfig(projectId);
    res.json(config);
  }));

  router.put("/thinking", asyncHandler((req, res) => {
    const parsed = thinkingModeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { mode, projectId } = parsed.data;
    extendedThinkingService.setMode(mode, projectId);
    res.json({ success: true, mode });
  }));

  router.post("/thinking/should-trigger", asyncHandler((req, res) => {
    const parsed = shouldTriggerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { prompt, projectId } = parsed.data;
    const result = extendedThinkingService.shouldTriggerExtended(prompt, projectId);
    res.json(result);
  }));

  router.post("/thinking/analyze-complexity", asyncHandler((req, res) => {
    const parsed = analyzeComplexitySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { prompt } = parsed.data;
    const result = extendedThinkingService.analyzeComplexity(prompt);
    res.json(result);
  }));

  router.post("/thinking/sessions", asyncHandler((req, res) => {
    const parsed = startSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { projectId, prompt, mode, triggerReason } = parsed.data;
    const session = extendedThinkingService.startSession(projectId, prompt, mode, triggerReason);
    res.json(session);
  }));

  router.get("/thinking/sessions/:sessionId", asyncHandler((req, res) => {
    const session = extendedThinkingService.getSession(req.params.sessionId as string);
    res.json(session || { error: "Session not found" });
  }));

  router.post("/thinking/sessions/:sessionId/steps", asyncHandler((req, res) => {
    const parsed = addStepSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { type, content, insights, questions } = parsed.data;
    const step = extendedThinkingService.addStep(
      req.params.sessionId as string,
      type,
      content,
      insights,
      questions
    );
    res.json(step || { error: "Failed to add step" });
  }));

  router.post("/thinking/sessions/:sessionId/complete", asyncHandler((req, res) => {
    const parsed = completeSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { conclusion, confidence } = parsed.data;
    const session = extendedThinkingService.completeSession(
      req.params.sessionId as string,
      conclusion,
      confidence
    );
    res.json(session || { error: "Session not found" });
  }));

  router.get("/thinking/sessions/:sessionId/prompt", asyncHandler((req, res) => {
    const session = extendedThinkingService.getSession(req.params.sessionId as string);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    const prompt = extendedThinkingService.generateThinkingPrompt(session);
    res.json({ prompt });
  }));

  router.get("/thinking/stats", asyncHandler((_req, res) => {
    const stats = extendedThinkingService.getStats();
    res.json(stats);
  }));
}
