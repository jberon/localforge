import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { semanticCodeSearchService } from "../../services/semantic-code-search.service";
import { autoContextInjectionService } from "../../services/auto-context-injection.service";
import { errorPreventionService } from "../../services/error-prevention.service";

export function registerContextRoutes(router: Router): void {
  router.post("/context/build-graph", asyncHandler((req, res) => {
    const { projectId, files } = req.body;
    autoContextInjectionService.buildDependencyGraph(projectId, files);
    res.json({ success: true });
  }));

  router.post("/context/inject", asyncHandler((req, res) => {
    const { projectId, targetFile, files, maxTokens } = req.body;
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
    const { projectId, files } = req.body;
    const result = errorPreventionService.analyzeCode(projectId, files);
    res.json(result);
  }));

  router.post("/error-prevention/record", asyncHandler((req, res) => {
    const { projectId, error, filePath } = req.body;
    errorPreventionService.recordError(projectId, error, filePath);
    res.json({ success: true });
  }));

  router.get("/error-prevention/stats", asyncHandler((_req, res) => {
    const stats = errorPreventionService.getPatternStats();
    res.json(stats);
  }));

  router.post("/semantic-search/index", asyncHandler((req, res) => {
    const { projectId, files } = req.body;
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
    const { code, limit } = req.body;
    const results = semanticCodeSearchService.findSimilar(req.params.projectId as string, code, limit);
    res.json(results);
  }));

  router.get("/semantic-search/:projectId/stats", asyncHandler((req, res) => {
    const stats = semanticCodeSearchService.getStats(req.params.projectId as string);
    res.json(stats || { message: "No index found" });
  }));
}
