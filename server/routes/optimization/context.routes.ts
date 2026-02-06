import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler";
import { semanticCodeSearchService } from "../../services/semantic-code-search.service";
import { autoContextInjectionService } from "../../services/auto-context-injection.service";
import { errorPreventionService } from "../../services/error-prevention.service";

const buildGraphSchema = z.object({
  projectId: z.string(),
  files: z.array(z.any()),
});

const injectContextSchema = z.object({
  projectId: z.string(),
  targetFile: z.string(),
  files: z.array(z.any()),
  maxTokens: z.number().optional(),
});

const errorPreventionAnalyzeSchema = z.object({
  projectId: z.string(),
  files: z.array(z.any()),
});

const errorPreventionRecordSchema = z.object({
  projectId: z.string(),
  error: z.any(),
  filePath: z.string(),
});

const semanticIndexSchema = z.object({
  projectId: z.string(),
  files: z.array(z.any()),
});

const semanticSimilarSchema = z.object({
  code: z.string(),
  limit: z.number().optional(),
});

export function registerContextRoutes(router: Router): void {
  router.post("/context/build-graph", asyncHandler((req, res) => {
    const parsed = buildGraphSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { projectId, files } = parsed.data;
    autoContextInjectionService.buildDependencyGraph(projectId, files);
    res.json({ success: true });
  }));

  router.post("/context/inject", asyncHandler((req, res) => {
    const parsed = injectContextSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { projectId, targetFile, files, maxTokens } = parsed.data;
    const result = autoContextInjectionService.injectContext(projectId, targetFile, files, maxTokens);
    res.json(result);
  }));

  router.get("/context/:projectId/related", asyncHandler((req, res) => {
    const filePath = req.query.file as string;
    const depth = parseInt(req.query.depth as string) || 2;
    const related = autoContextInjectionService.getRelatedFiles(req.params.projectId as string, filePath, depth);
    res.json({ relatedFiles: related });
  }));

  router.post("/error-prevention/analyze", asyncHandler((req, res) => {
    const parsed = errorPreventionAnalyzeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { projectId, files } = parsed.data;
    const result = errorPreventionService.analyzeCode(projectId, files);
    res.json(result);
  }));

  router.post("/error-prevention/record", asyncHandler((req, res) => {
    const parsed = errorPreventionRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { projectId, error, filePath } = parsed.data;
    errorPreventionService.recordError(projectId, error, filePath);
    res.json({ success: true });
  }));

  router.get("/error-prevention/stats", asyncHandler((_req, res) => {
    const stats = errorPreventionService.getPatternStats();
    res.json(stats);
  }));

  router.post("/semantic-search/index", asyncHandler((req, res) => {
    const parsed = semanticIndexSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { projectId, files } = parsed.data;
    const chunkCount = semanticCodeSearchService.indexProject(projectId, files);
    res.json({ success: true, chunkCount });
  }));

  router.get("/semantic-search/:projectId", asyncHandler((req, res) => {
    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 10;
    const results = semanticCodeSearchService.search(req.params.projectId as string, query, limit);
    res.json(results);
  }));

  router.post("/semantic-search/:projectId/similar", asyncHandler((req, res) => {
    const parsed = semanticSimilarSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { code, limit } = parsed.data;
    const results = semanticCodeSearchService.findSimilar(req.params.projectId as string, code, limit);
    res.json(results);
  }));

  router.get("/semantic-search/:projectId/stats", asyncHandler((req, res) => {
    const stats = semanticCodeSearchService.getStats(req.params.projectId as string);
    res.json(stats || { message: "No index found" });
  }));
}
