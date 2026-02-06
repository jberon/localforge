import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler";
import { buildModeService } from "../../services/build-mode.service";

const setModeSchema = z.object({
  mode: z.string(),
  projectId: z.string().optional(),
  reason: z.string().optional(),
});

const detectModeSchema = z.object({
  prompt: z.string(),
});

const settingsSchema = z.object({}).passthrough();

export function registerBuildModeRoutes(router: Router): void {
  router.get("/build-mode", asyncHandler((req, res) => {
    const projectId = req.query.projectId as string | undefined;
    const config = buildModeService.getConfig(projectId);
    res.json(config);
  }));

  router.put("/build-mode", asyncHandler((req, res) => {
    const parsed = setModeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { mode, projectId, reason } = parsed.data;
    buildModeService.setMode(mode, projectId, reason);
    res.json({ success: true, mode });
  }));

  router.post("/build-mode/detect", asyncHandler((req, res) => {
    const parsed = detectModeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { prompt } = parsed.data;
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
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    buildModeService.setFastSettings(parsed.data);
    res.json({ success: true });
  }));

  router.get("/build-mode/full-settings", asyncHandler((_req, res) => {
    const settings = buildModeService.getFullSettings();
    res.json(settings);
  }));

  router.put("/build-mode/full-settings", asyncHandler((req, res) => {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    buildModeService.setFullSettings(parsed.data);
    res.json({ success: true });
  }));

  router.get("/build-mode/stats", asyncHandler((_req, res) => {
    const stats = buildModeService.getStats();
    res.json(stats);
  }));
}
