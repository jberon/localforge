import { Router, Request, Response } from "express";
import { modelProviderService } from "../services/model-provider.service";
import { resilienceService } from "../services/resilience.service";
import { healthAlertsService } from "../services/health-alerts.service";
import { smartRetryService } from "../services/smart-retry.service";
import { generationCheckpointService } from "../services/generation-checkpoint.service";
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

export default router;
