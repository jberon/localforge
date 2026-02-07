import { Router } from "express";
import { modelProviderService } from "../services/model-provider.service";
import { resilienceService } from "../services/resilience.service";
import { smartRetryService } from "../services/smart-retry.service";
import { generationCheckpointService } from "../services/generation-checkpoint.service";
import { smartTemplatesService } from "../services/smart-templates.service";
import { asyncHandler } from "../lib/async-handler";
import { registerAlertsRoutes } from "./optimization/alerts.routes";
import { registerAutonomyRoutes } from "./optimization/autonomy.routes";
import { registerBuildModeRoutes } from "./optimization/build-mode.routes";
import { registerDesignModeRoutes } from "./optimization/design-mode.routes";
import { registerDeploymentRoutes } from "./optimization/deployment.routes";
import { registerPerformanceRoutes } from "./optimization/performance.routes";
import { registerReasoningRoutes } from "./optimization/reasoning.routes";
import { registerContextRoutes } from "./optimization/context.routes";
import { registerDocumentationRoutes } from "./optimization/documentation.routes";
import { registerAnalysisRoutes } from "./optimization/analysis.routes";
import { registerSecurityRoutes } from "./optimization/security.routes";
import { registerValidationRoutes } from "./optimization/validation.routes";
import { registerIntelligenceRoutes } from "./optimization/intelligence.routes";

const router = Router();

// Get M4 Pro optimization recommendations
router.get("/m4-pro-recommendations", asyncHandler((_req, res) => {
  const recommendations = modelProviderService.getM4ProRecommendations();
  res.json(recommendations);
}));

// Get resource status
router.get("/resource-status", asyncHandler((_req, res) => {
  const status = modelProviderService.getResourceStatus();
  res.json(status);
}));

// Get available models and their capabilities
router.get("/models", asyncHandler((_req, res) => {
  const plannerModels = modelProviderService.getModelsForRole("planner");
  const builderModels = modelProviderService.getModelsForRole("builder");
  const generalModels = modelProviderService.getModelsForRole("general");

  res.json({
    planner: plannerModels,
    builder: builderModels,
    general: generalModels,
  });
}));

// Get resilience stats (circuit breakers, bulkheads)
router.get("/resilience-stats", asyncHandler((_req, res) => {
  const stats = resilienceService.getStats();
  res.json(stats);
}));

// Get cache stats
router.get("/cache-stats", asyncHandler((_req, res) => {
  const stats = modelProviderService.getCacheStats();
  res.json(stats);
}));

// Reset a circuit breaker
router.post("/reset-circuit/:key", asyncHandler((req, res) => {
  const key = req.params.key as string;
  resilienceService.resetCircuit(key);
  res.json({ success: true, message: `Circuit breaker '${key}' reset` });
}));

// Health check with system info
router.get("/health", asyncHandler((_req, res) => {
  const resourceStatus = modelProviderService.getResourceStatus();
  const resilienceStats = resilienceService.getStats();
  const cacheStats = modelProviderService.getCacheStats();

  const openCircuits = Object.values(resilienceStats.circuitBreakers)
    .filter(cb => cb.state === "open").length;

  const status = {
    status: openCircuits === 0 ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    resources: {
      activeRequests: resourceStatus.activeRequests,
      queuedRequests: resourceStatus.queuedRequests,
      estimatedWaitMs: resourceStatus.estimatedWaitMs,
      gpuMemoryUsedMB: resourceStatus.gpuMemoryUsedMB,
    },
    resilience: {
      openCircuits,
      totalCircuits: Object.keys(resilienceStats.circuitBreakers).length,
    },
    cache: {
      hitRate: cacheStats.hits / Math.max(1, cacheStats.hits + cacheStats.misses),
      totalHits: cacheStats.hits,
      totalMisses: cacheStats.misses,
      deduplicated: cacheStats.deduplicated,
    },
  };

  res.json(status);
}));

// Get hot-swap status and history
router.get("/hot-swap", asyncHandler((_req, res) => {
  res.json({
    enabled: modelProviderService.isHotSwapEnabled(),
    threshold: modelProviderService.getHotSwapThreshold(),
    memoryPressure: modelProviderService.getMemoryPressure(),
    history: modelProviderService.getHotSwapHistory(),
  });
}));

// Configure hot-swap
router.post("/hot-swap/configure", asyncHandler((req, res) => {
  const { enabled, threshold } = req.body;

  if (typeof enabled === "boolean") {
    modelProviderService.setHotSwapEnabled(enabled);
  }
  if (typeof threshold === "number") {
    modelProviderService.setHotSwapThreshold(threshold);
  }

  res.json({
    enabled: modelProviderService.isHotSwapEnabled(),
    threshold: modelProviderService.getHotSwapThreshold(),
  });
}));

// Get available retry strategies
router.get("/retry-strategies", asyncHandler((_req, res) => {
  const stats = smartRetryService.getStats();
  res.json(stats.strategyEffectiveness);
}));

// Get checkpoint stats for a project
router.get("/checkpoints/:projectId/stats", asyncHandler((req, res) => {
  const projectId = req.params.projectId as string;
  const stats = generationCheckpointService.getCheckpointStats(projectId);
  res.json(stats);
}));

// List checkpoints for a project
router.get("/checkpoints/:projectId", asyncHandler((req, res) => {
  const projectId = req.params.projectId as string;
  const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
  const includeAutoSaves = req.query.includeAutoSaves !== "false";

  const checkpoints = generationCheckpointService.getCheckpoints(projectId, { 
    limit, 
    includeAutoSaves 
  });
  res.json(checkpoints);
}));

// Clear auto-save checkpoints
router.delete("/checkpoints/:projectId/auto-saves", asyncHandler((req, res) => {
  const projectId = req.params.projectId as string;
  const deletedCount = generationCheckpointService.clearAutoSaves(projectId);
  res.json({ success: true, deletedCount });
}));

// ==================== SMART TEMPLATES ====================

// Add template
router.post("/templates", asyncHandler((req, res) => {
  const template = smartTemplatesService.addTemplate(req.body);
  res.status(201).json(template);
}));

// Search templates
router.get("/templates/search", asyncHandler((req, res) => {
  const query = req.query.q as string;
  const category = req.query.category as string | undefined;
  const templates = smartTemplatesService.findTemplates(query, category as Parameters<typeof smartTemplatesService.findTemplates>[1]);
  res.json(templates);
}));

// Get templates by category
router.get("/templates/category/:category", asyncHandler((req, res) => {
  const templates = smartTemplatesService.getByCategory(req.params.category as Parameters<typeof smartTemplatesService.getByCategory>[0]);
  res.json(templates);
}));

// Get popular templates
router.get("/templates/popular", asyncHandler((req, res) => {
  const limit = parseInt(req.query.limit as string) || 10;
  const templates = smartTemplatesService.getPopularTemplates(limit);
  res.json(templates);
}));

// Generate from template
router.post("/templates/:templateId/generate", asyncHandler((req, res) => {
  const { variables, projectId } = req.body;
  const result = smartTemplatesService.generateFromTemplate(
    req.params.templateId as string,
    variables,
    projectId
  );
  res.json(result);
}));

// Analyze project for template adaptation
router.post("/templates/analyze-project", asyncHandler((req, res) => {
  const { projectId, files } = req.body;
  const analysis = smartTemplatesService.analyzeProject(projectId, files);
  res.json(analysis);
}));

// Register extracted route modules
registerAlertsRoutes(router);
registerAutonomyRoutes(router);
registerBuildModeRoutes(router);
registerDesignModeRoutes(router);
registerDeploymentRoutes(router);
registerPerformanceRoutes(router);
registerReasoningRoutes(router);
registerContextRoutes(router);
registerDocumentationRoutes(router);
registerAnalysisRoutes(router);
registerSecurityRoutes(router);
registerValidationRoutes(router);
registerIntelligenceRoutes(router);

// Mount extracted sub-route modules
import subRoutes from "./optimization/index";
router.use("/", subRoutes);

export default router;
