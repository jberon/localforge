import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { performanceProfilerService } from "../../services/performance-profiler.service";
import { userPreferenceLearningService } from "../../services/user-preference-learning.service";
import { styleMemoryService } from "../../services/style-memory.service";
import { feedbackLoopService } from "../../services/feedback-loop.service";

export function registerPerformanceRoutes(router: Router): void {
  router.post("/performance/track", asyncHandler(async (req, res) => {
    const { name, category, duration, success = true, metadata } = req.body;
    if (!name || !category || typeof duration !== "number") {
      return res.status(400).json({ error: "name, category, and duration are required" });
    }

    const result = await performanceProfilerService.trackOperation(
      name,
      category,
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

    const stats = performanceProfilerService.getCategoryStats(category as any, timeWindow);
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
    const { projectId, originalCode, modifiedCode, filePath, changeType } = req.body;
    userPreferenceLearningService.trackModification(projectId, {
      originalCode,
      modifiedCode,
      filePath,
      changeType
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
    const { projectId, files } = req.body;
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
    const { projectId, generationId, rating, originalPrompt, generatedCode, userComment } = req.body;
    const entry = feedbackLoopService.recordFeedback(
      projectId,
      generationId,
      rating,
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
    const { prompt, context } = req.body;
    const refinedPrompt = feedbackLoopService.refinePrompt(prompt, context);
    res.json({ refinedPrompt });
  }));
}
