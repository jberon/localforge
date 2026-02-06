import { Router } from "express";
import { checkConnection, isCloudProviderActive, checkCloudConnection, getCloudSettings } from "../llm-client";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { healthAlertsService } from "../services/health-alerts.service";
import { resilienceService } from "../services/resilience.service";
import { contextPruningService } from "../services/context-pruning.service";
import { asyncHandler } from "../lib/async-handler";

const router = Router();

router.get("/", asyncHandler(async (req, res) => {
  const startTime = Date.now();
  
  const checks: Record<string, { status: "healthy" | "unhealthy" | "degraded"; latencyMs?: number; error?: string }> = {};
  
  if (db) {
    try {
      const dbStart = Date.now();
      await db.execute(sql`SELECT 1`);
      checks.database = { status: "healthy", latencyMs: Date.now() - dbStart };
    } catch (error: any) {
      checks.database = { status: "unhealthy", error: error.message };
    }
  } else {
    checks.database = { status: "degraded", error: "Using in-memory storage" };
  }
  
  try {
    const llmStart = Date.now();
    if (isCloudProviderActive()) {
      const cloudResult = await checkCloudConnection();
      checks.llm = { 
        status: cloudResult.connected ? "healthy" : "degraded", 
        latencyMs: Date.now() - llmStart,
        ...(cloudResult.error && { error: cloudResult.error })
      };
    } else {
      const endpoint = (req.query.endpoint as string) || "http://localhost:1234/v1";
      const result = await checkConnection(endpoint);
      checks.llm = { 
        status: result.connected ? "healthy" : "degraded", 
        latencyMs: Date.now() - llmStart,
        ...(result.error && { error: result.error })
      };
    }
  } catch (error: any) {
    checks.llm = { status: "degraded", error: error.message };
  }
  
  const overallStatus = Object.values(checks).every(c => c.status === "healthy") 
    ? "healthy" 
    : Object.values(checks).some(c => c.status === "unhealthy")
      ? "unhealthy"
      : "degraded";
  
  const statusCode = overallStatus === "healthy" ? 200 : overallStatus === "degraded" ? 200 : 503;
  
  res.status(statusCode).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.APP_VERSION || process.env.npm_package_version || "1.0.0",
    responseTimeMs: Date.now() - startTime,
    checks,
  });
}));

router.get("/ready", asyncHandler(async (req, res) => {
  if (!db) {
    res.json({ ready: true, mode: "memory" });
    return;
  }
  
  try {
    await db.execute(sql`SELECT 1`);
    res.json({ ready: true });
  } catch (error) {
    res.status(503).json({ ready: false, error: "Database not ready" });
  }
}));

router.get("/live", (req, res) => {
  res.json({ alive: true, timestamp: Date.now() });
});

router.get("/dashboard", asyncHandler(async (req, res) => {
  const startTime = Date.now();
  
  const memUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
  const rssMB = Math.round(memUsage.rss / 1024 / 1024);
  
  const healthStatus = healthAlertsService.getHealthStatus();
  const alerts = healthAlertsService.getAlerts({ limit: 20 });
  
  const resilienceStats = resilienceService.getStats();
  
  const tokenStats = contextPruningService.getEstimationStats();
  
  let dbStatus = { connected: false, latencyMs: 0 };
  if (db) {
    try {
      const dbStart = Date.now();
      await db.execute(sql`SELECT 1`);
      dbStatus = { connected: true, latencyMs: Date.now() - dbStart };
    } catch {
      dbStatus = { connected: false, latencyMs: 0 };
    }
  }
  
  let llmStatus = { connected: false, latencyMs: 0, provider: "local", isCloud: false };
  try {
    const llmStart = Date.now();
    if (isCloudProviderActive()) {
      const cloudResult = await checkCloudConnection();
      const settings = getCloudSettings();
      llmStatus = { 
        connected: cloudResult.connected, 
        latencyMs: Date.now() - llmStart,
        provider: settings.provider,
        isCloud: true,
      };
    } else {
      const endpoint = (req.query.endpoint as string) || "http://localhost:1234/v1";
      const result = await checkConnection(endpoint);
      llmStatus = { 
        connected: result.connected, 
        latencyMs: Date.now() - llmStart,
        provider: "local",
        isCloud: false,
      };
    }
  } catch {
    llmStatus = { connected: false, latencyMs: 0, provider: "unknown", isCloud: false };
  }
  
  res.json({
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    responseTimeMs: Date.now() - startTime,
    
    memory: {
      heapUsedMB,
      heapTotalMB,
      rssMB,
      heapUsagePercent: Math.round((heapUsedMB / heapTotalMB) * 100),
    },
    
    services: {
      database: dbStatus,
      llm: llmStatus,
    },
    
    health: {
      status: healthStatus.overall,
      components: healthStatus.components,
      lastUpdated: healthStatus.lastUpdated,
    },
    
    resilience: {
      circuitBreakers: resilienceStats.circuitBreakers,
      bulkheads: resilienceStats.bulkheads,
    },
    
    tokenEstimation: {
      samples: tokenStats.samples,
      avgRatio: tokenStats.avgRatio.toFixed(2),
      totalEstimated: tokenStats.totalEstimated,
    },
    
    recentAlerts: alerts.map(a => ({
      id: a.id,
      type: a.type,
      message: a.message,
      severity: a.severity,
      timestamp: a.timestamp,
    })),
  });
}));

export default router;
