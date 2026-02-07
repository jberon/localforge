import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler";
import { performanceProfilerService } from "../../services/performance-profiler.service";
import { userPreferenceLearningService } from "../../services/user-preference-learning.service";
import { styleMemoryService } from "../../services/style-memory.service";
import { feedbackLoopService } from "../../services/feedback-loop.service";

const trackPerformanceSchema = z.object({
  name: z.string(),
  category: z.string(),
  duration: z.number(),
  success: z.boolean().optional(),
  metadata: z.any().optional(),
});

const preferencesTrackSchema = z.object({
  projectId: z.string(),
  originalCode: z.string(),
  modifiedCode: z.string(),
  filePath: z.string(),
  changeType: z.string(),
});

const styleMemoryAnalyzeSchema = z.object({
  projectId: z.string(),
  files: z.array(z.any()),
});

const feedbackSchema = z.object({
  projectId: z.string(),
  generationId: z.string(),
  rating: z.number(),
  originalPrompt: z.string(),
  generatedCode: z.string(),
  userComment: z.string().optional(),
});

const refinePromptSchema = z.object({
  prompt: z.string(),
  context: z.any().optional(),
});

export function registerPerformanceRoutes(router: Router): void {
  router.post("/performance/track", asyncHandler(async (req, res) => {
    const parsed = trackPerformanceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { name, category, duration, success = true, metadata } = parsed.data;

    const result = await performanceProfilerService.trackOperation(
      name,
      category as "llm_generation" | "file_operation" | "database_query" | "api_request" | "validation" | "bundling" | "parsing",
      async () => new Promise(resolve => setTimeout(resolve, 0)),
      metadata
    );

    res.json({ 
      tracked: true, 
      operation: { name, category, duration, success, metadata } 
    });
  }));

  router.get("/performance/stats", asyncHandler((req, res) => {
    const timeWindow = req.query.timeWindow 
      ? parseInt(req.query.timeWindow as string) 
      : 3600000;

    const stats = performanceProfilerService.getStats(timeWindow);
    res.json(stats);
  }));

  router.get("/performance/category/:category", asyncHandler((req, res) => {
    const category = req.params.category as string;
    const timeWindow = req.query.timeWindow 
      ? parseInt(req.query.timeWindow as string) 
      : 3600000;

    const stats = performanceProfilerService.getCategoryStats(category as "llm_generation" | "file_operation" | "database_query" | "api_request" | "validation" | "bundling" | "parsing", timeWindow);
    res.json(stats || { message: "No data for this category" });
  }));

  router.get("/performance/active", asyncHandler((_req, res) => {
    const operations = performanceProfilerService.getActiveOperations();
    res.json(operations);
  }));

  router.get("/performance/export", asyncHandler((req, res) => {
    const format = (req.query.format as "json" | "csv") || "json";
    const data = performanceProfilerService.exportMetrics(format);

    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=performance-metrics.csv");
    }

    res.send(data);
  }));

  router.delete("/performance/metrics", asyncHandler((_req, res) => {
    performanceProfilerService.clearMetrics();
    res.json({ success: true, message: "Metrics cleared" });
  }));

  router.post("/preferences/track", asyncHandler((req, res) => {
    const parsed = preferencesTrackSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { projectId, originalCode, modifiedCode, filePath, changeType } = parsed.data;
    userPreferenceLearningService.trackModification(projectId, {
      originalCode,
      modifiedCode,
      filePath,
      changeType: changeType as "addition" | "deletion" | "modification"
    });
    res.json({ success: true });
  }));

  router.get("/preferences/:projectId", asyncHandler((req, res) => {
    const preferences = userPreferenceLearningService.getPreferences(req.params.projectId as string);
    res.json(preferences);
  }));

  router.get("/preferences/:projectId/prompt-enhancements", asyncHandler((req, res) => {
    const enhancements = userPreferenceLearningService.getPromptEnhancements(req.params.projectId as string);
    res.json({ enhancements });
  }));

  router.post("/style-memory/analyze", asyncHandler((req, res) => {
    const parsed = styleMemoryAnalyzeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { projectId, files } = parsed.data;
    const analysis = styleMemoryService.analyzeAndRemember(projectId, files);
    res.json(analysis);
  }));

  router.get("/style-memory/:projectId", asyncHandler((req, res) => {
    const profile = styleMemoryService.getProfile(req.params.projectId as string);
    res.json(profile || { message: "No profile found" });
  }));

  router.get("/style-memory/:projectId/guide", asyncHandler((req, res) => {
    const guide = styleMemoryService.getStyleGuide(req.params.projectId as string);
    res.json({ guide });
  }));

  router.post("/feedback", asyncHandler((req, res) => {
    const parsed = feedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { projectId, generationId, rating, originalPrompt, generatedCode, userComment } = parsed.data;
    const ratingValue = rating >= 4 ? "positive" : rating <= 2 ? "negative" : "neutral";
    const entry = feedbackLoopService.recordFeedback(
      projectId,
      generationId,
      ratingValue,
      originalPrompt,
      generatedCode,
      userComment
    );
    res.json(entry);
  }));

  router.get("/feedback/stats", asyncHandler((req, res) => {
    const projectId = req.query.projectId as string | undefined;
    const stats = feedbackLoopService.getStats(projectId);
    res.json(stats);
  }));

  router.post("/feedback/refine-prompt", asyncHandler((req, res) => {
    const parsed = refinePromptSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { prompt, context } = parsed.data;
    const refinedPrompt = feedbackLoopService.refinePrompt(prompt, context);
    res.json({ refinedPrompt });
  }));
}
