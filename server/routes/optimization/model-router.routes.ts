import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { modelRouterService } from "../../services/model-router.service";

const router = Router();

router.get("/config", asyncHandler(async (_req, res) => {
  const config = modelRouterService.getConfig();
  res.json(config);
}));

router.put("/config", asyncHandler(async (req, res) => {
  const updates = req.body;
  modelRouterService.configure(updates);
  const config = modelRouterService.getConfig();
  res.json(config);
}));

router.post("/analyze", asyncHandler(async (req, res) => {
  const { prompt, context } = req.body;
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "prompt string is required" });
  }
  const analysis = modelRouterService.analyzeTask(prompt, context);
  res.json(analysis);
}));

router.post("/route", asyncHandler(async (req, res) => {
  const { prompt, context } = req.body;
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "prompt string is required" });
  }
  const decision = modelRouterService.routeTask(prompt, context);
  const explanation = modelRouterService.getRoutingExplanation(decision);
  res.json({ ...decision, explanation });
}));

router.get("/stats", asyncHandler(async (_req, res) => {
  const stats = modelRouterService.getRoutingStats();
  res.json(stats);
}));

export default router;
