import { Router } from "express";
import { modelProviderService } from "../services/model-provider.service";
import { resilienceService } from "../services/resilience.service";
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

export default router;
