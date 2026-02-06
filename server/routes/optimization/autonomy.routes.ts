import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler";
import { autonomyLevelService } from "../../services/autonomy-level.service";

const setLevelSchema = z.object({
  level: z.string(),
  projectId: z.string().optional(),
});

const setCustomConfigSchema = z.object({
  projectId: z.string(),
  config: z.any(),
});

const canPerformSchema = z.object({
  action: z.string(),
  projectId: z.string().optional(),
});

const sessionProjectSchema = z.object({
  projectId: z.string(),
});

export function registerAutonomyRoutes(router: Router): void {
  router.get("/autonomy/levels", asyncHandler((_req, res) => {
    const levels = autonomyLevelService.getAllLevels();
    res.json(levels);
  }));

  router.get("/autonomy", asyncHandler((req, res) => {
    const projectId = req.query.projectId as string | undefined;
    const config = autonomyLevelService.getConfig(projectId);
    res.json(config);
  }));

  router.put("/autonomy", asyncHandler((req, res) => {
    const parsed = setLevelSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { level, projectId } = parsed.data;
    autonomyLevelService.setLevel(level, projectId);
    res.json({ success: true, level });
  }));

  router.put("/autonomy/custom", asyncHandler((req, res) => {
    const parsed = setCustomConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { projectId, config } = parsed.data;
    autonomyLevelService.setCustomConfig(projectId, config);
    res.json({ success: true });
  }));

  router.post("/autonomy/can-perform", asyncHandler((req, res) => {
    const parsed = canPerformSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { action, projectId } = parsed.data;
    const result = autonomyLevelService.canPerformAction(action, projectId);
    res.json(result);
  }));

  router.get("/autonomy/behavior", asyncHandler((req, res) => {
    const projectId = req.query.projectId as string | undefined;
    const behavior = autonomyLevelService.getBehavior(projectId);
    res.json(behavior);
  }));

  router.post("/autonomy/session/start", asyncHandler((req, res) => {
    const parsed = sessionProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { projectId } = parsed.data;
    autonomyLevelService.startSession(projectId);
    res.json({ success: true });
  }));

  router.post("/autonomy/session/end", asyncHandler((req, res) => {
    const parsed = sessionProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { projectId } = parsed.data;
    autonomyLevelService.endSession(projectId);
    res.json({ success: true });
  }));

  router.get("/autonomy/session/status", asyncHandler((req, res) => {
    const projectId = req.query.projectId as string;
    const active = autonomyLevelService.isSessionActive(projectId);
    const remaining = autonomyLevelService.getSessionTimeRemaining(projectId);
    res.json({ active, remainingMinutes: remaining });
  }));

  router.get("/autonomy/stats", asyncHandler((_req, res) => {
    const stats = autonomyLevelService.getStats();
    res.json(stats);
  }));
}
