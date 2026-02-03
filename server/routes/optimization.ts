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
import { userPreferenceLearningService } from "../services/user-preference-learning.service";
import { styleMemoryService } from "../services/style-memory.service";
import { feedbackLoopService } from "../services/feedback-loop.service";
import { semanticCodeSearchService } from "../services/semantic-code-search.service";
import { autoContextInjectionService } from "../services/auto-context-injection.service";
import { errorPreventionService } from "../services/error-prevention.service";
import { proactiveRefactoringService } from "../services/proactive-refactoring.service";
import { dependencyHealthService } from "../services/dependency-health.service";
import { patternLibraryService } from "../services/pattern-library.service";
import { smartTemplatesService } from "../services/smart-templates.service";
import { multiStepReasoningService } from "../services/multi-step-reasoning.service";
import { selfValidationService } from "../services/self-validation.service";
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

// Analyze imports (alias for optimize - returns analysis without modifying)
router.post("/imports/analyze", async (req, res) => {
  try {
    const { files } = req.body;
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: "files array is required" });
    }
    
    const result = await importOptimizerService.optimizeImports(files);
    res.json(result);
  } catch (error) {
    logger.error("Failed to analyze imports", { error });
    res.status(500).json({ error: "Failed to analyze imports" });
  }
});

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

// Track an operation (for external tracking)
router.post("/performance/track", async (req, res) => {
  try {
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
    
    // Override the duration with the provided value
    res.json({ 
      tracked: true, 
      operation: { name, category, duration, success, metadata } 
    });
  } catch (error) {
    logger.error("Failed to track operation", { error });
    res.status(500).json({ error: "Failed to track operation" });
  }
});

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

// ============================================
// USER PREFERENCE LEARNING ENDPOINTS
// ============================================

// Track code modification
router.post("/preferences/track", (req, res) => {
  try {
    const { projectId, originalCode, modifiedCode, filePath, changeType } = req.body;
    userPreferenceLearningService.trackModification(projectId, {
      originalCode,
      modifiedCode,
      filePath,
      changeType
    });
    res.json({ success: true });
  } catch (error) {
    logger.error("Failed to track modification", { error });
    res.status(500).json({ error: "Failed to track modification" });
  }
});

// Get learned preferences
router.get("/preferences/:projectId", (req, res) => {
  try {
    const preferences = userPreferenceLearningService.getPreferences(req.params.projectId);
    res.json(preferences);
  } catch (error) {
    logger.error("Failed to get preferences", { error });
    res.status(500).json({ error: "Failed to get preferences" });
  }
});

// Get prompt enhancements based on preferences
router.get("/preferences/:projectId/prompt-enhancements", (req, res) => {
  try {
    const enhancements = userPreferenceLearningService.getPromptEnhancements(req.params.projectId);
    res.json({ enhancements });
  } catch (error) {
    logger.error("Failed to get prompt enhancements", { error });
    res.status(500).json({ error: "Failed to get enhancements" });
  }
});

// ============================================
// STYLE MEMORY ENDPOINTS
// ============================================

// Analyze and remember style
router.post("/style-memory/analyze", (req, res) => {
  try {
    const { projectId, files } = req.body;
    const analysis = styleMemoryService.analyzeAndRemember(projectId, files);
    res.json(analysis);
  } catch (error) {
    logger.error("Failed to analyze style", { error });
    res.status(500).json({ error: "Failed to analyze style" });
  }
});

// Get style profile
router.get("/style-memory/:projectId", (req, res) => {
  try {
    const profile = styleMemoryService.getProfile(req.params.projectId);
    res.json(profile || { message: "No profile found" });
  } catch (error) {
    logger.error("Failed to get style profile", { error });
    res.status(500).json({ error: "Failed to get profile" });
  }
});

// Get style guide
router.get("/style-memory/:projectId/guide", (req, res) => {
  try {
    const guide = styleMemoryService.getStyleGuide(req.params.projectId);
    res.json({ guide });
  } catch (error) {
    logger.error("Failed to get style guide", { error });
    res.status(500).json({ error: "Failed to get guide" });
  }
});

// ============================================
// FEEDBACK LOOP ENDPOINTS
// ============================================

// Record feedback
router.post("/feedback", (req, res) => {
  try {
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
  } catch (error) {
    logger.error("Failed to record feedback", { error });
    res.status(500).json({ error: "Failed to record feedback" });
  }
});

// Get feedback stats
router.get("/feedback/stats", (req, res) => {
  try {
    const projectId = req.query.projectId as string | undefined;
    const stats = feedbackLoopService.getStats(projectId);
    res.json(stats);
  } catch (error) {
    logger.error("Failed to get feedback stats", { error });
    res.status(500).json({ error: "Failed to get stats" });
  }
});

// Refine prompt based on feedback
router.post("/feedback/refine-prompt", (req, res) => {
  try {
    const { prompt, context } = req.body;
    const refinedPrompt = feedbackLoopService.refinePrompt(prompt, context);
    res.json({ refinedPrompt });
  } catch (error) {
    logger.error("Failed to refine prompt", { error });
    res.status(500).json({ error: "Failed to refine prompt" });
  }
});

// ============================================
// SEMANTIC CODE SEARCH ENDPOINTS
// ============================================

// Index project for search
router.post("/semantic-search/index", (req, res) => {
  try {
    const { projectId, files } = req.body;
    const chunkCount = semanticCodeSearchService.indexProject(projectId, files);
    res.json({ success: true, chunkCount });
  } catch (error) {
    logger.error("Failed to index project", { error });
    res.status(500).json({ error: "Failed to index project" });
  }
});

// Search code
router.get("/semantic-search/:projectId", (req, res) => {
  try {
    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 10;
    const results = semanticCodeSearchService.search(req.params.projectId, query, limit);
    res.json(results);
  } catch (error) {
    logger.error("Failed to search code", { error });
    res.status(500).json({ error: "Failed to search" });
  }
});

// Find similar code
router.post("/semantic-search/:projectId/similar", (req, res) => {
  try {
    const { code, limit } = req.body;
    const results = semanticCodeSearchService.findSimilar(req.params.projectId, code, limit);
    res.json(results);
  } catch (error) {
    logger.error("Failed to find similar code", { error });
    res.status(500).json({ error: "Failed to find similar" });
  }
});

// Get search stats
router.get("/semantic-search/:projectId/stats", (req, res) => {
  try {
    const stats = semanticCodeSearchService.getStats(req.params.projectId);
    res.json(stats || { message: "No index found" });
  } catch (error) {
    logger.error("Failed to get search stats", { error });
    res.status(500).json({ error: "Failed to get stats" });
  }
});

// ============================================
// AUTO CONTEXT INJECTION ENDPOINTS
// ============================================

// Build dependency graph
router.post("/context/build-graph", (req, res) => {
  try {
    const { projectId, files } = req.body;
    autoContextInjectionService.buildDependencyGraph(projectId, files);
    res.json({ success: true });
  } catch (error) {
    logger.error("Failed to build dependency graph", { error });
    res.status(500).json({ error: "Failed to build graph" });
  }
});

// Inject context
router.post("/context/inject", (req, res) => {
  try {
    const { projectId, targetFile, files, maxTokens } = req.body;
    const result = autoContextInjectionService.injectContext(projectId, targetFile, files, maxTokens);
    res.json(result);
  } catch (error) {
    logger.error("Failed to inject context", { error });
    res.status(500).json({ error: "Failed to inject context" });
  }
});

// Get related files
router.get("/context/:projectId/related", (req, res) => {
  try {
    const filePath = req.query.file as string;
    const depth = parseInt(req.query.depth as string) || 2;
    const related = autoContextInjectionService.getRelatedFiles(req.params.projectId, filePath, depth);
    res.json({ relatedFiles: related });
  } catch (error) {
    logger.error("Failed to get related files", { error });
    res.status(500).json({ error: "Failed to get related files" });
  }
});

// ============================================
// ERROR PREVENTION ENDPOINTS
// ============================================

// Analyze code for potential errors
router.post("/error-prevention/analyze", (req, res) => {
  try {
    const { projectId, files } = req.body;
    const result = errorPreventionService.analyzeCode(projectId, files);
    res.json(result);
  } catch (error) {
    logger.error("Failed to analyze for errors", { error });
    res.status(500).json({ error: "Failed to analyze" });
  }
});

// Record an error occurrence
router.post("/error-prevention/record", (req, res) => {
  try {
    const { projectId, error, filePath } = req.body;
    errorPreventionService.recordError(projectId, error, filePath);
    res.json({ success: true });
  } catch (error) {
    logger.error("Failed to record error", { error });
    res.status(500).json({ error: "Failed to record error" });
  }
});

// Get pattern statistics
router.get("/error-prevention/stats", (_req, res) => {
  try {
    const stats = errorPreventionService.getPatternStats();
    res.json(stats);
  } catch (error) {
    logger.error("Failed to get error stats", { error });
    res.status(500).json({ error: "Failed to get stats" });
  }
});

// ============================================
// PROACTIVE REFACTORING ENDPOINTS
// ============================================

// Analyze for refactoring opportunities
router.post("/refactoring/analyze", (req, res) => {
  try {
    const { files } = req.body;
    const result = proactiveRefactoringService.analyzeForRefactoring(files);
    res.json(result);
  } catch (error) {
    logger.error("Failed to analyze for refactoring", { error });
    res.status(500).json({ error: "Failed to analyze" });
  }
});

// Get/set thresholds
router.get("/refactoring/thresholds", (_req, res) => {
  try {
    const thresholds = proactiveRefactoringService.getThresholds();
    res.json(thresholds);
  } catch (error) {
    logger.error("Failed to get thresholds", { error });
    res.status(500).json({ error: "Failed to get thresholds" });
  }
});

router.put("/refactoring/thresholds", (req, res) => {
  try {
    proactiveRefactoringService.setThresholds(req.body);
    res.json({ success: true });
  } catch (error) {
    logger.error("Failed to set thresholds", { error });
    res.status(500).json({ error: "Failed to set thresholds" });
  }
});

// ============================================
// DEPENDENCY HEALTH ENDPOINTS
// ============================================

// Analyze package.json
router.post("/dependency-health/analyze", async (req, res) => {
  try {
    const { packageJson } = req.body;
    const report = await dependencyHealthService.analyzePackageJson(packageJson);
    res.json(report);
  } catch (error) {
    logger.error("Failed to analyze dependencies", { error });
    res.status(500).json({ error: "Failed to analyze" });
  }
});

// ============================================
// PATTERN LIBRARY ENDPOINTS
// ============================================

// Add pattern
router.post("/patterns", (req, res) => {
  try {
    const pattern = patternLibraryService.addPattern(req.body);
    res.status(201).json(pattern);
  } catch (error) {
    logger.error("Failed to add pattern", { error });
    res.status(500).json({ error: "Failed to add pattern" });
  }
});

// Search patterns
router.get("/patterns/search", (req, res) => {
  try {
    const query = req.query.q as string;
    const category = req.query.category as any;
    const results = patternLibraryService.findPatterns(query, category);
    res.json(results);
  } catch (error) {
    logger.error("Failed to search patterns", { error });
    res.status(500).json({ error: "Failed to search" });
  }
});

// Get patterns by category
router.get("/patterns/category/:category", (req, res) => {
  try {
    const patterns = patternLibraryService.getByCategory(req.params.category as any);
    res.json(patterns);
  } catch (error) {
    logger.error("Failed to get patterns", { error });
    res.status(500).json({ error: "Failed to get patterns" });
  }
});

// Get top patterns
router.get("/patterns/top", (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const patterns = patternLibraryService.getTopPatterns(limit);
    res.json(patterns);
  } catch (error) {
    logger.error("Failed to get top patterns", { error });
    res.status(500).json({ error: "Failed to get patterns" });
  }
});

// Suggest patterns for code
router.post("/patterns/suggest", (req, res) => {
  try {
    const { code, filePath } = req.body;
    const suggestions = patternLibraryService.suggestPatterns(code, filePath);
    res.json(suggestions);
  } catch (error) {
    logger.error("Failed to suggest patterns", { error });
    res.status(500).json({ error: "Failed to suggest" });
  }
});

// Record pattern usage
router.post("/patterns/:patternId/usage", (req, res) => {
  try {
    const { successful } = req.body;
    patternLibraryService.recordUsage(req.params.patternId, successful);
    res.json({ success: true });
  } catch (error) {
    logger.error("Failed to record usage", { error });
    res.status(500).json({ error: "Failed to record" });
  }
});

// ============================================
// SMART TEMPLATES ENDPOINTS
// ============================================

// Add template
router.post("/templates", (req, res) => {
  try {
    const template = smartTemplatesService.addTemplate(req.body);
    res.status(201).json(template);
  } catch (error) {
    logger.error("Failed to add template", { error });
    res.status(500).json({ error: "Failed to add template" });
  }
});

// Search templates
router.get("/templates/search", (req, res) => {
  try {
    const query = req.query.q as string;
    const category = req.query.category as any;
    const templates = smartTemplatesService.findTemplates(query, category);
    res.json(templates);
  } catch (error) {
    logger.error("Failed to search templates", { error });
    res.status(500).json({ error: "Failed to search" });
  }
});

// Get templates by category
router.get("/templates/category/:category", (req, res) => {
  try {
    const templates = smartTemplatesService.getByCategory(req.params.category as any);
    res.json(templates);
  } catch (error) {
    logger.error("Failed to get templates", { error });
    res.status(500).json({ error: "Failed to get templates" });
  }
});

// Get popular templates
router.get("/templates/popular", (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const templates = smartTemplatesService.getPopularTemplates(limit);
    res.json(templates);
  } catch (error) {
    logger.error("Failed to get popular templates", { error });
    res.status(500).json({ error: "Failed to get templates" });
  }
});

// Generate from template
router.post("/templates/:templateId/generate", (req, res) => {
  try {
    const { variables, projectId } = req.body;
    const result = smartTemplatesService.generateFromTemplate(
      req.params.templateId,
      variables,
      projectId
    );
    res.json(result);
  } catch (error) {
    logger.error("Failed to generate from template", { error });
    res.status(500).json({ error: "Failed to generate" });
  }
});

// Analyze project for template adaptation
router.post("/templates/analyze-project", (req, res) => {
  try {
    const { projectId, files } = req.body;
    const analysis = smartTemplatesService.analyzeProject(projectId, files);
    res.json(analysis);
  } catch (error) {
    logger.error("Failed to analyze project", { error });
    res.status(500).json({ error: "Failed to analyze" });
  }
});

// ============================================
// MULTI-STEP REASONING ENDPOINTS
// ============================================

// Decompose task
router.post("/reasoning/decompose", (req, res) => {
  try {
    const { projectId, objective, context } = req.body;
    const result = multiStepReasoningService.decomposeTask(projectId, objective, context);
    res.json(result);
  } catch (error) {
    logger.error("Failed to decompose task", { error });
    res.status(500).json({ error: "Failed to decompose" });
  }
});

// Get chain
router.get("/reasoning/chains/:chainId", (req, res) => {
  try {
    const chain = multiStepReasoningService.getChain(req.params.chainId);
    res.json(chain || { error: "Chain not found" });
  } catch (error) {
    logger.error("Failed to get chain", { error });
    res.status(500).json({ error: "Failed to get chain" });
  }
});

// Get chain progress
router.get("/reasoning/chains/:chainId/progress", (req, res) => {
  try {
    const progress = multiStepReasoningService.getChainProgress(req.params.chainId);
    res.json(progress);
  } catch (error) {
    logger.error("Failed to get progress", { error });
    res.status(500).json({ error: "Failed to get progress" });
  }
});

// Skip step
router.post("/reasoning/chains/:chainId/steps/:stepId/skip", (req, res) => {
  try {
    const { reason } = req.body;
    const success = multiStepReasoningService.skipStep(
      req.params.chainId,
      req.params.stepId,
      reason
    );
    res.json({ success });
  } catch (error) {
    logger.error("Failed to skip step", { error });
    res.status(500).json({ error: "Failed to skip" });
  }
});

// Abort chain
router.post("/reasoning/chains/:chainId/abort", (req, res) => {
  try {
    const success = multiStepReasoningService.abortChain(req.params.chainId);
    res.json({ success });
  } catch (error) {
    logger.error("Failed to abort chain", { error });
    res.status(500).json({ error: "Failed to abort" });
  }
});

// ============================================
// SELF-VALIDATION ENDPOINTS
// ============================================

// Validate code
router.post("/validation/validate", (req, res) => {
  try {
    const { code, filePath } = req.body;
    const result = selfValidationService.validate(code, filePath);
    res.json(result);
  } catch (error) {
    logger.error("Failed to validate code", { error });
    res.status(500).json({ error: "Failed to validate" });
  }
});

// Get validation config
router.get("/validation/config", (_req, res) => {
  try {
    const config = selfValidationService.getConfig();
    res.json(config);
  } catch (error) {
    logger.error("Failed to get config", { error });
    res.status(500).json({ error: "Failed to get config" });
  }
});

// Set validation config
router.put("/validation/config", (req, res) => {
  try {
    selfValidationService.setConfig(req.body);
    res.json({ success: true });
  } catch (error) {
    logger.error("Failed to set config", { error });
    res.status(500).json({ error: "Failed to set config" });
  }
});

// Get validation rules
router.get("/validation/rules", (_req, res) => {
  try {
    const rules = selfValidationService.getRules();
    res.json(rules);
  } catch (error) {
    logger.error("Failed to get rules", { error });
    res.status(500).json({ error: "Failed to get rules" });
  }
});

// Enable/disable rule
router.put("/validation/rules/:ruleId", (req, res) => {
  try {
    const { enabled } = req.body;
    selfValidationService.enableRule(req.params.ruleId, enabled);
    res.json({ success: true });
  } catch (error) {
    logger.error("Failed to update rule", { error });
    res.status(500).json({ error: "Failed to update rule" });
  }
});

export default router;
