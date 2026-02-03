import { Router, Request, Response } from "express";
import { modelProviderService } from "../services/model-provider.service";
import { resilienceService } from "../services/resilience.service";
import { healthAlertsService } from "../services/health-alerts.service";
import { smartRetryService } from "../services/smart-retry.service";
import { generationCheckpointService } from "../services/generation-checkpoint.service";
import { autoDocumentationService } from "../services/auto-documentation.service";
import { securityScanningService } from "../services/security-scanning.service";
import { bundleOptimizerService } from "../services/bundle-optimizer.service";
import { testCoverageService } from "../services/test-coverage.service";
import { accessibilityCheckerService } from "../services/accessibility-checker.service";
import { codeDeduplicationService } from "../services/code-deduplication.service";
import { apiContractValidationService } from "../services/api-contract-validation.service";
import { importOptimizerService } from "../services/import-optimizer.service";
import { performanceProfilerService } from "../services/performance-profiler.service";
import logger from "../lib/logger";

const router = Router();

// Get M4 Pro optimization recommendations
router.get("/m4-pro-recommendations", (_req, res) => {
  try {
    const recommendations = modelProviderService.getM4ProRecommendations();
    res.json(recommendations);
  } catch (error) {
    logger.error("Failed to get M4 Pro recommendations", { error });
    res.status(500).json({ error: "Failed to get recommendations" });
  }
});

// Get resource status
router.get("/resource-status", (_req, res) => {
  try {
    const status = modelProviderService.getResourceStatus();
    res.json(status);
  } catch (error) {
    logger.error("Failed to get resource status", { error });
    res.status(500).json({ error: "Failed to get resource status" });
  }
});

// Get available models and their capabilities
router.get("/models", (_req, res) => {
  try {
    const plannerModels = modelProviderService.getModelsForRole("planner");
    const builderModels = modelProviderService.getModelsForRole("builder");
    const generalModels = modelProviderService.getModelsForRole("general");
    
    res.json({
      planner: plannerModels,
      builder: builderModels,
      general: generalModels,
    });
  } catch (error) {
    logger.error("Failed to get models", { error });
    res.status(500).json({ error: "Failed to get models" });
  }
});

// Get resilience stats (circuit breakers, bulkheads)
router.get("/resilience-stats", (_req, res) => {
  try {
    const stats = resilienceService.getStats();
    res.json(stats);
  } catch (error) {
    logger.error("Failed to get resilience stats", { error });
    res.status(500).json({ error: "Failed to get resilience stats" });
  }
});

// Get cache stats
router.get("/cache-stats", (_req, res) => {
  try {
    const stats = modelProviderService.getCacheStats();
    res.json(stats);
  } catch (error) {
    logger.error("Failed to get cache stats", { error });
    res.status(500).json({ error: "Failed to get cache stats" });
  }
});

// Reset a circuit breaker
router.post("/reset-circuit/:key", (req, res) => {
  try {
    const { key } = req.params;
    resilienceService.resetCircuit(key);
    res.json({ success: true, message: `Circuit breaker '${key}' reset` });
  } catch (error) {
    logger.error("Failed to reset circuit", { error });
    res.status(500).json({ error: "Failed to reset circuit" });
  }
});

// Health check with system info
router.get("/health", (_req, res) => {
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
});

// SSE endpoint for real-time health alerts
router.get("/alerts/stream", (req: Request, res: Response) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  // Send initial health status
  const healthStatus = healthAlertsService.getHealthStatus();
  res.write(`event: health_status\ndata: ${JSON.stringify(healthStatus)}\n\n`);

  // Listen for new alerts
  const alertHandler = (alert: any) => {
    res.write(`event: alert\ndata: ${JSON.stringify(alert)}\n\n`);
  };

  const healthHandler = (status: any) => {
    res.write(`event: health_update\ndata: ${JSON.stringify(status)}\n\n`);
  };

  healthAlertsService.on("alert", alertHandler);
  healthAlertsService.on("health_update", healthHandler);

  // Keep-alive ping every 30 seconds
  const keepAlive = setInterval(() => {
    res.write(`:ping\n\n`);
  }, 30000);

  // Cleanup on close
  req.on("close", () => {
    clearInterval(keepAlive);
    healthAlertsService.off("alert", alertHandler);
    healthAlertsService.off("health_update", healthHandler);
  });
});

// Get current alerts
router.get("/alerts", (req, res) => {
  try {
    const severity = req.query.severity as string | undefined;
    const acknowledged = req.query.acknowledged === "true" ? true : 
                         req.query.acknowledged === "false" ? false : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

    const alerts = healthAlertsService.getAlerts({ 
      severity: severity as any, 
      acknowledged, 
      limit 
    });
    res.json(alerts);
  } catch (error) {
    logger.error("Failed to get alerts", { error });
    res.status(500).json({ error: "Failed to get alerts" });
  }
});

// Acknowledge an alert
router.post("/alerts/:id/acknowledge", (req, res) => {
  try {
    const { id } = req.params;
    const success = healthAlertsService.acknowledgeAlert(id);
    res.json({ success });
  } catch (error) {
    logger.error("Failed to acknowledge alert", { error });
    res.status(500).json({ error: "Failed to acknowledge alert" });
  }
});

// Acknowledge all alerts
router.post("/alerts/acknowledge-all", (_req, res) => {
  try {
    healthAlertsService.acknowledgeAllAlerts();
    res.json({ success: true });
  } catch (error) {
    logger.error("Failed to acknowledge all alerts", { error });
    res.status(500).json({ error: "Failed to acknowledge alerts" });
  }
});

// Get hot-swap status and history
router.get("/hot-swap", (_req, res) => {
  try {
    res.json({
      enabled: modelProviderService.isHotSwapEnabled(),
      threshold: modelProviderService.getHotSwapThreshold(),
      memoryPressure: modelProviderService.getMemoryPressure(),
      history: modelProviderService.getHotSwapHistory(),
    });
  } catch (error) {
    logger.error("Failed to get hot-swap status", { error });
    res.status(500).json({ error: "Failed to get hot-swap status" });
  }
});

// Configure hot-swap
router.post("/hot-swap/configure", (req, res) => {
  try {
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
  } catch (error) {
    logger.error("Failed to configure hot-swap", { error });
    res.status(500).json({ error: "Failed to configure hot-swap" });
  }
});

// Get available retry strategies
router.get("/retry-strategies", (_req, res) => {
  try {
    const strategies = smartRetryService.getAvailableStrategies();
    res.json(strategies);
  } catch (error) {
    logger.error("Failed to get retry strategies", { error });
    res.status(500).json({ error: "Failed to get retry strategies" });
  }
});

// Get checkpoint stats for a project
router.get("/checkpoints/:projectId/stats", (req, res) => {
  try {
    const { projectId } = req.params;
    const stats = generationCheckpointService.getCheckpointStats(projectId);
    res.json(stats);
  } catch (error) {
    logger.error("Failed to get checkpoint stats", { error });
    res.status(500).json({ error: "Failed to get checkpoint stats" });
  }
});

// List checkpoints for a project
router.get("/checkpoints/:projectId", (req, res) => {
  try {
    const { projectId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const includeAutoSaves = req.query.includeAutoSaves !== "false";
    
    const checkpoints = generationCheckpointService.getCheckpoints(projectId, { 
      limit, 
      includeAutoSaves 
    });
    res.json(checkpoints);
  } catch (error) {
    logger.error("Failed to get checkpoints", { error });
    res.status(500).json({ error: "Failed to get checkpoints" });
  }
});

// Clear auto-save checkpoints
router.delete("/checkpoints/:projectId/auto-saves", (req, res) => {
  try {
    const { projectId } = req.params;
    const deletedCount = generationCheckpointService.clearAutoSaves(projectId);
    res.json({ success: true, deletedCount });
  } catch (error) {
    logger.error("Failed to clear auto-saves", { error });
    res.status(500).json({ error: "Failed to clear auto-saves" });
  }
});

// ==================== AUTO-DOCUMENTATION ====================

// Generate documentation for project files
router.post("/documentation/generate", async (req, res) => {
  try {
    const { files, projectName } = req.body;
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: "files array is required" });
    }
    
    const result = await autoDocumentationService.generateDocumentation(files, projectName);
    res.json(result);
  } catch (error) {
    logger.error("Failed to generate documentation", { error });
    res.status(500).json({ error: "Failed to generate documentation" });
  }
});

// Generate quick README
router.post("/documentation/quick-readme", (req, res) => {
  try {
    const { projectName, description, features } = req.body;
    const readme = autoDocumentationService.generateQuickReadme(
      projectName || "Project",
      description || "A generated project",
      features || []
    );
    res.json({ readme });
  } catch (error) {
    logger.error("Failed to generate quick README", { error });
    res.status(500).json({ error: "Failed to generate README" });
  }
});

// ==================== SECURITY SCANNING ====================

// Scan files for security issues
router.post("/security/scan", async (req, res) => {
  try {
    const { files } = req.body;
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: "files array is required" });
    }
    
    const result = await securityScanningService.scanFiles(files);
    res.json(result);
  } catch (error) {
    logger.error("Failed to scan for security issues", { error });
    res.status(500).json({ error: "Failed to scan for security issues" });
  }
});

// Scan single file
router.post("/security/scan-file", (req, res) => {
  try {
    const { content, filePath } = req.body;
    if (!content || !filePath) {
      return res.status(400).json({ error: "content and filePath are required" });
    }
    
    const issues = securityScanningService.scanSingleFile(content, filePath);
    res.json({ issues });
  } catch (error) {
    logger.error("Failed to scan file", { error });
    res.status(500).json({ error: "Failed to scan file" });
  }
});

// ==================== BUNDLE OPTIMIZER ====================

// Analyze bundle for optimization opportunities
router.post("/bundle/analyze", async (req, res) => {
  try {
    const { files } = req.body;
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: "files array is required" });
    }
    
    const result = await bundleOptimizerService.analyzeBundle(files);
    res.json(result);
  } catch (error) {
    logger.error("Failed to analyze bundle", { error });
    res.status(500).json({ error: "Failed to analyze bundle" });
  }
});

// Get size breakdown
router.post("/bundle/size-breakdown", (req, res) => {
  try {
    const { files } = req.body;
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: "files array is required" });
    }
    
    const breakdown = bundleOptimizerService.getSizeBreakdown(files);
    res.json(breakdown);
  } catch (error) {
    logger.error("Failed to get size breakdown", { error });
    res.status(500).json({ error: "Failed to get size breakdown" });
  }
});

// Estimate bundle size from dependencies
router.post("/bundle/estimate-size", (req, res) => {
  try {
    const { dependencies } = req.body;
    if (!dependencies || !Array.isArray(dependencies)) {
      return res.status(400).json({ error: "dependencies array is required" });
    }
    
    const estimatedSize = bundleOptimizerService.estimateBundleSize(dependencies);
    res.json({ estimatedSize, estimatedKB: Math.round(estimatedSize / 1024) });
  } catch (error) {
    logger.error("Failed to estimate bundle size", { error });
    res.status(500).json({ error: "Failed to estimate bundle size" });
  }
});

// ==================== TEST COVERAGE ====================

// Analyze test coverage
router.post("/coverage/analyze", async (req, res) => {
  try {
    const { files } = req.body;
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: "files array is required" });
    }
    
    const result = await testCoverageService.analyzeCoverage(files);
    res.json(result);
  } catch (error) {
    logger.error("Failed to analyze test coverage", { error });
    res.status(500).json({ error: "Failed to analyze test coverage" });
  }
});

// Generate test template
router.post("/coverage/generate-template", (req, res) => {
  try {
    const { functionName, isAsync, isComponent, importPath } = req.body;
    if (!functionName || !importPath) {
      return res.status(400).json({ error: "functionName and importPath are required" });
    }
    
    const template = testCoverageService.generateTestTemplate(
      functionName,
      isAsync || false,
      isComponent || false,
      importPath
    );
    res.json({ template });
  } catch (error) {
    logger.error("Failed to generate test template", { error });
    res.status(500).json({ error: "Failed to generate test template" });
  }
});

// ==================== ACCESSIBILITY CHECKER ====================

// Check accessibility
router.post("/accessibility/check", async (req, res) => {
  try {
    const { files } = req.body;
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: "files array is required" });
    }
    
    const result = await accessibilityCheckerService.checkAccessibility(files);
    res.json(result);
  } catch (error) {
    logger.error("Failed to check accessibility", { error });
    res.status(500).json({ error: "Failed to check accessibility" });
  }
});

// Check single file
router.post("/accessibility/check-file", (req, res) => {
  try {
    const { content, filePath } = req.body;
    if (!content || !filePath) {
      return res.status(400).json({ error: "content and filePath are required" });
    }
    
    const issues = accessibilityCheckerService.checkSingleFile(content, filePath);
    res.json({ issues });
  } catch (error) {
    logger.error("Failed to check file accessibility", { error });
    res.status(500).json({ error: "Failed to check file accessibility" });
  }
});

// ==================== CODE DEDUPLICATION ====================

// Find duplicate code
router.post("/deduplication/analyze", async (req, res) => {
  try {
    const { files } = req.body;
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: "files array is required" });
    }
    
    const result = await codeDeduplicationService.findDuplicates(files);
    res.json(result);
  } catch (error) {
    logger.error("Failed to analyze duplicates", { error });
    res.status(500).json({ error: "Failed to analyze duplicates" });
  }
});

// ==================== API CONTRACT VALIDATION ====================

// Validate API contracts
router.post("/contracts/validate", async (req, res) => {
  try {
    const { files } = req.body;
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: "files array is required" });
    }
    
    const result = await apiContractValidationService.validateContracts(files);
    res.json(result);
  } catch (error) {
    logger.error("Failed to validate contracts", { error });
    res.status(500).json({ error: "Failed to validate contracts" });
  }
});

// ==================== IMPORT OPTIMIZER ====================

// Optimize imports
router.post("/imports/optimize", async (req, res) => {
  try {
    const { files } = req.body;
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: "files array is required" });
    }
    
    const result = await importOptimizerService.optimizeImports(files);
    res.json(result);
  } catch (error) {
    logger.error("Failed to optimize imports", { error });
    res.status(500).json({ error: "Failed to optimize imports" });
  }
});

// ==================== PERFORMANCE PROFILER ====================

// Get performance stats
router.get("/performance/stats", (req, res) => {
  try {
    const timeWindow = req.query.timeWindow 
      ? parseInt(req.query.timeWindow as string) 
      : 3600000;
    
    const stats = performanceProfilerService.getStats(timeWindow);
    res.json(stats);
  } catch (error) {
    logger.error("Failed to get performance stats", { error });
    res.status(500).json({ error: "Failed to get performance stats" });
  }
});

// Get category-specific stats
router.get("/performance/category/:category", (req, res) => {
  try {
    const { category } = req.params;
    const timeWindow = req.query.timeWindow 
      ? parseInt(req.query.timeWindow as string) 
      : 3600000;
    
    const stats = performanceProfilerService.getCategoryStats(category as any, timeWindow);
    res.json(stats || { message: "No data for this category" });
  } catch (error) {
    logger.error("Failed to get category stats", { error });
    res.status(500).json({ error: "Failed to get category stats" });
  }
});

// Get active operations
router.get("/performance/active", (_req, res) => {
  try {
    const operations = performanceProfilerService.getActiveOperations();
    res.json(operations);
  } catch (error) {
    logger.error("Failed to get active operations", { error });
    res.status(500).json({ error: "Failed to get active operations" });
  }
});

// Export metrics
router.get("/performance/export", (req, res) => {
  try {
    const format = (req.query.format as "json" | "csv") || "json";
    const data = performanceProfilerService.exportMetrics(format);
    
    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=performance-metrics.csv");
    }
    
    res.send(data);
  } catch (error) {
    logger.error("Failed to export metrics", { error });
    res.status(500).json({ error: "Failed to export metrics" });
  }
});

// Clear metrics
router.delete("/performance/metrics", (_req, res) => {
  try {
    performanceProfilerService.clearMetrics();
    res.json({ success: true, message: "Metrics cleared" });
  } catch (error) {
    logger.error("Failed to clear metrics", { error });
    res.status(500).json({ error: "Failed to clear metrics" });
  }
});

export default router;
