import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { authDbTemplatesService } from "../../services/auth-db-templates.service";

const router = Router();

router.get("/auth", asyncHandler(async (_req, res) => {
  const templates = authDbTemplatesService.getAuthTemplates();
  res.json(templates);
}));

router.get("/auth/:type", asyncHandler(async (req, res) => {
  const template = authDbTemplatesService.getAuthTemplate(req.params.type as "email-password" | "social-oauth" | "jwt-token" | "session-based" | "api-key");
  if (!template) return res.status(404).json({ error: "Auth template not found" });
  res.json(template);
}));

router.get("/database", asyncHandler(async (_req, res) => {
  const templates = authDbTemplatesService.getDatabaseTemplates();
  res.json(templates);
}));

router.get("/database/:type", asyncHandler(async (req, res) => {
  const template = authDbTemplatesService.getDatabaseTemplate(req.params.type as "postgres" | "sqlite" | "mongodb" | "supabase" | "firebase");
  if (!template) return res.status(404).json({ error: "Database template not found" });
  res.json(template);
}));

router.post("/detect-intent", asyncHandler(async (req, res) => {
  const { prompt } = req.body;
  const hasAuth = authDbTemplatesService.detectAuthIntent(prompt);
  const hasDatabase = authDbTemplatesService.detectDatabaseIntent(prompt);
  res.json({ hasAuth, hasDatabase });
}));

router.post("/auth/:type/generate", asyncHandler(async (req, res) => {
  const files = authDbTemplatesService.generateAuthCode(req.params.type as "email-password" | "social-oauth" | "jwt-token" | "session-based" | "api-key");
  res.json({ files });
}));

router.post("/database/:type/generate", asyncHandler(async (req, res) => {
  const { schemaDescription } = req.body || {};
  const files = authDbTemplatesService.generateDatabaseCode(req.params.type as "postgres" | "sqlite" | "mongodb" | "supabase" | "firebase", schemaDescription);
  res.json({ files });
}));

export default router;
