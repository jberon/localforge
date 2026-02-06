import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { multiStepReasoningService } from "../../services/multi-step-reasoning.service";
import { extendedThinkingService } from "../../services/extended-thinking.service";

export function registerReasoningRoutes(router: Router): void {
  router.post("/reasoning/decompose", asyncHandler((req, res) => {
    const { projectId, objective, context } = req.body;
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
    const { reason } = req.body;
    const success = multiStepReasoningService.skipStep(
      req.params.chainId as string,
      req.params.stepId as string,
      reason
    );
    res.json({ success });
  }));

  router.post("/reasoning/chains/:chainId/abort", asyncHandler((req, res) => {
    const success = multiStepReasoningService.abortChain(req.params.chainId as string);
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
    const { mode, projectId } = req.body;
    extendedThinkingService.setMode(mode, projectId);
    res.json({ success: true, mode });
  }));

  router.post("/thinking/should-trigger", asyncHandler((req, res) => {
    const { prompt, projectId } = req.body;
    const result = extendedThinkingService.shouldTriggerExtended(prompt, projectId);
    res.json(result);
  }));

  router.post("/thinking/analyze-complexity", asyncHandler((req, res) => {
    const { prompt } = req.body;
    const result = extendedThinkingService.analyzeComplexity(prompt);
    res.json(result);
  }));

  router.post("/thinking/sessions", asyncHandler((req, res) => {
    const { projectId, prompt, mode, triggerReason } = req.body;
    const session = extendedThinkingService.startSession(projectId, prompt, mode, triggerReason);
    res.json(session);
  }));

  router.get("/thinking/sessions/:sessionId", asyncHandler((req, res) => {
    const session = extendedThinkingService.getSession(req.params.sessionId as string);
    res.json(session || { error: "Session not found" });
  }));

  router.post("/thinking/sessions/:sessionId/steps", asyncHandler((req, res) => {
    const { type, content, insights, questions } = req.body;
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
    const { conclusion, confidence } = req.body;
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
