import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { buildModeService } from "../../services/build-mode.service";

export function registerBuildModeRoutes(router: Router): void {
  router.get("/build-mode", asyncHandler((req, res) => {
    const projectId = req.query.projectId as string | undefined;
    const config = buildModeService.getConfig(projectId);
    res.json(config);
  }));

  router.put("/build-mode", asyncHandler((req, res) => {
    const { mode, projectId, reason } = req.body;
    buildModeService.setMode(mode, projectId, reason);
    res.json({ success: true, mode });
  }));

  router.post("/build-mode/detect", asyncHandler((req, res) => {
    const { prompt } = req.body;
    const mode = buildModeService.autoDetectMode(prompt);
    res.json({ suggestedMode: mode });
  }));

  router.get("/build-mode/prompt-modifiers", asyncHandler((req, res) => {
    const projectId = req.query.projectId as string | undefined;
    const modifiers = buildModeService.getPromptModifiers(projectId);
    res.json(modifiers);
  }));

  router.get("/build-mode/fast-settings", asyncHandler((_req, res) => {
    const settings = buildModeService.getFastSettings();
    res.json(settings);
  }));

  router.put("/build-mode/fast-settings", asyncHandler((req, res) => {
    buildModeService.setFastSettings(req.body);
    res.json({ success: true });
  }));

  router.get("/build-mode/full-settings", asyncHandler((_req, res) => {
    const settings = buildModeService.getFullSettings();
    res.json(settings);
  }));

  router.put("/build-mode/full-settings", asyncHandler((req, res) => {
    buildModeService.setFullSettings(req.body);
    res.json({ success: true });
  }));

  router.get("/build-mode/stats", asyncHandler((_req, res) => {
    const stats = buildModeService.getStats();
    res.json(stats);
  }));
}
