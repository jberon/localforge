import { Router } from "express";
import { checkConnection } from "../llm-client";
import { db } from "../db";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const startTime = Date.now();
  
  const checks: Record<string, { status: "healthy" | "unhealthy" | "degraded"; latencyMs?: number; error?: string }> = {};
  
  try {
    const dbStart = Date.now();
    await db.execute(sql`SELECT 1`);
    checks.database = { status: "healthy", latencyMs: Date.now() - dbStart };
  } catch (error: any) {
    checks.database = { status: "unhealthy", error: error.message };
  }
  
  try {
    const llmStart = Date.now();
    const endpoint = (req.query.endpoint as string) || "http://localhost:1234/v1";
    const result = await checkConnection(endpoint);
    checks.llm = { 
      status: result.connected ? "healthy" : "degraded", 
      latencyMs: Date.now() - llmStart,
      ...(result.error && { error: result.error })
    };
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
    version: "1.0.0",
    responseTimeMs: Date.now() - startTime,
    checks,
  });
});

router.get("/ready", async (req, res) => {
  try {
    await db.execute(sql`SELECT 1`);
    res.json({ ready: true });
  } catch (error) {
    res.status(503).json({ ready: false, error: "Database not ready" });
  }
});

router.get("/live", (req, res) => {
  res.json({ alive: true, timestamp: Date.now() });
});

export default router;
