import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { promptChunkingService } from "../../services/prompt-chunking.service";
import { outputParserService } from "../../services/output-parser.service";
import { adaptiveTemperatureService } from "../../services/adaptive-temperature.service";
import { conversationMemoryService } from "../../services/conversation-memory.service";
import { smartRetryService } from "../../services/smart-retry.service";
import { codeQualityPipelineService } from "../../services/code-quality-pipeline.service";

export function registerIntelligenceRoutes(router: Router): void {

  router.get("/intelligence/stats", asyncHandler((_req, res) => {
    res.json({
      promptChunking: promptChunkingService.getStats(),
      outputParser: outputParserService.getStats(),
      adaptiveTemperature: adaptiveTemperatureService.getStats(),
      conversationMemory: conversationMemoryService.getStats(),
      smartRetry: smartRetryService.getStats(),
      codeQuality: codeQualityPipelineService.getStats(),
    });
  }));

  router.post("/intelligence/analyze-complexity", asyncHandler((req, res) => {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "prompt is required" });
    }
    const analysis = promptChunkingService.analyzeComplexity(prompt);
    res.json(analysis);
  }));

  router.post("/intelligence/chunk-prompt", asyncHandler((req, res) => {
    const { prompt, config } = req.body;
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "prompt is required" });
    }
    const result = promptChunkingService.chunkPrompt(prompt, config);
    res.json(result);
  }));

  router.post("/intelligence/parse-output", asyncHandler((req, res) => {
    const { output, config } = req.body;
    if (!output || typeof output !== "string") {
      return res.status(400).json({ error: "output is required" });
    }
    const parsed = outputParserService.parse(output, config);
    res.json(parsed);
  }));

  router.get("/intelligence/temperature/profiles", asyncHandler((_req, res) => {
    const profiles = adaptiveTemperatureService.getProfiles();
    res.json(profiles);
  }));

  router.get("/intelligence/temperature/recommend", asyncHandler((req, res) => {
    const { model, taskType } = req.query;
    if (!model || !taskType) {
      return res.status(400).json({ error: "model and taskType query params required" });
    }
    const recommendation = adaptiveTemperatureService.getRecommendedTemperature(
      model as string,
      taskType as any
    );
    res.json(recommendation);
  }));

  router.post("/intelligence/temperature/record", asyncHandler((req, res) => {
    const signal = req.body;
    if (!signal.taskType || !signal.model || signal.temperature === undefined) {
      return res.status(400).json({ error: "taskType, model, and temperature required" });
    }
    adaptiveTemperatureService.recordOutcome(signal);
    res.json({ success: true });
  }));

  router.get("/intelligence/temperature/model/:model", asyncHandler((req, res) => {
    const stats = adaptiveTemperatureService.getModelStats(req.params.model as string);
    res.json(stats);
  }));

  router.post("/intelligence/memory/compress", asyncHandler((req, res) => {
    const { projectId, messages, config } = req.body;
    if (!projectId || !messages) {
      return res.status(400).json({ error: "projectId and messages required" });
    }
    const compressed = conversationMemoryService.compressHistory(projectId, messages, config);
    res.json(compressed);
  }));

  router.get("/intelligence/memory/project/:projectId", asyncHandler((req, res) => {
    const state = conversationMemoryService.getProjectState(req.params.projectId as string);
    if (!state) {
      return res.status(404).json({ error: "No project state found" });
    }
    res.json(state);
  }));

  router.post("/intelligence/memory/context-prompt", asyncHandler((req, res) => {
    const { projectId, messages, config } = req.body;
    if (!projectId || !messages) {
      return res.status(400).json({ error: "projectId and messages required" });
    }
    const compressed = conversationMemoryService.compressHistory(projectId, messages, config);
    const contextPrompt = conversationMemoryService.buildContextPrompt(compressed);
    res.json({ contextPrompt, compressionRatio: compressed.compressionRatio });
  }));

  router.post("/intelligence/retry/detect-failure", asyncHandler((req, res) => {
    const { output, originalPrompt } = req.body;
    if (!originalPrompt) {
      return res.status(400).json({ error: "originalPrompt required" });
    }
    const failureMode = smartRetryService.detectFailureMode(output || "", originalPrompt);
    res.json({ failureMode });
  }));

  router.post("/intelligence/retry/get-prompt", asyncHandler((req, res) => {
    const { originalPrompt, failureMode, attempt, previousOutput, config } = req.body;
    if (!originalPrompt || !failureMode) {
      return res.status(400).json({ error: "originalPrompt and failureMode required" });
    }
    const result = smartRetryService.getRetryPrompt(
      originalPrompt,
      failureMode,
      attempt || 1,
      previousOutput,
      config
    );
    res.json(result);
  }));

  router.get("/intelligence/retry/stats", asyncHandler((_req, res) => {
    const stats = smartRetryService.getStats();
    res.json(stats);
  }));

  router.post("/intelligence/quality/analyze", asyncHandler(async (req, res) => {
    const { code, language } = req.body;
    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "code is required" });
    }
    const report = await codeQualityPipelineService.analyzeAndFix(code, { language });
    res.json(report);
  }));

  router.get("/intelligence/quality/stats", asyncHandler((_req, res) => {
    res.json(codeQualityPipelineService.getStats());
  }));
}
