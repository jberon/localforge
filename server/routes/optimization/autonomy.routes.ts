import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { autonomyLevelService } from "../../services/autonomy-level.service";

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
    const { level, projectId } = req.body;
    autonomyLevelService.setLevel(level, projectId);
    res.json({ success: true, level });
  }));

  router.put("/autonomy/custom", asyncHandler((req, res) => {
    const { projectId, config } = req.body;
    autonomyLevelService.setCustomConfig(projectId, config);
    res.json({ success: true });
  }));

  router.post("/autonomy/can-perform", asyncHandler((req, res) => {
    const { action, projectId } = req.body;
    const result = autonomyLevelService.canPerformAction(action, projectId);
    res.json(result);
  }));

  router.get("/autonomy/behavior", asyncHandler((req, res) => {
    const projectId = req.query.projectId as string | undefined;
    const behavior = autonomyLevelService.getBehavior(projectId);
    res.json(behavior);
  }));

  router.post("/autonomy/session/start", asyncHandler((req, res) => {
    const { projectId } = req.body;
    autonomyLevelService.startSession(projectId);
    res.json({ success: true });
  }));

  router.post("/autonomy/session/end", asyncHandler((req, res) => {
    const { projectId } = req.body;
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
