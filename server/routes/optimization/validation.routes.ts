import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler";
import { selfValidationService } from "../../services/self-validation.service";
import { patternLibraryService } from "../../services/pattern-library.service";

const validateCodeSchema = z.object({
  code: z.string(),
  filePath: z.string().optional(),
});

const validationConfigSchema = z.object({}).passthrough();

const ruleToggleSchema = z.object({
  enabled: z.boolean(),
});

const patternSchema = z.object({}).passthrough();

const suggestPatternsSchema = z.object({
  code: z.string(),
  filePath: z.string().optional(),
});

const patternUsageSchema = z.object({
  successful: z.boolean(),
});

export function registerValidationRoutes(router: Router): void {
  router.post("/validation/validate", asyncHandler((req, res) => {
    const parsed = validateCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { code, filePath } = parsed.data;
    const result = selfValidationService.validate(code, filePath || "");
    res.json(result);
  }));

  router.get("/validation/config", asyncHandler((_req, res) => {
    const config = selfValidationService.getConfig();
    res.json(config);
  }));

  router.put("/validation/config", asyncHandler((req, res) => {
    const parsed = validationConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    selfValidationService.setConfig(parsed.data);
    res.json({ success: true });
  }));

  router.get("/validation/rules", asyncHandler((_req, res) => {
    const rules = selfValidationService.getRules();
    res.json(rules);
  }));

  router.put("/validation/rules/:ruleId", asyncHandler((req, res) => {
    const parsed = ruleToggleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { enabled } = parsed.data;
    selfValidationService.enableRule(req.params.ruleId as string, enabled);
    res.json({ success: true });
  }));

  router.post("/patterns", asyncHandler((req, res) => {
    const parsed = patternSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const pattern = patternLibraryService.addPattern(parsed.data as Parameters<typeof patternLibraryService.addPattern>[0]);
    res.status(201).json(pattern);
  }));

  router.get("/patterns/search", asyncHandler((req, res) => {
    const query = req.query.q as string;
    const category = req.query.category as "component" | "hook" | "utility" | "api" | "form" | "layout" | "state" | "auth" | "data-fetching" | "error-handling" | undefined;
    const results = patternLibraryService.findPatterns(query, category);
    res.json(results);
  }));

  router.get("/patterns/category/:category", asyncHandler((req, res) => {
    const patterns = patternLibraryService.getByCategory(req.params.category as "component" | "hook" | "utility" | "api" | "form" | "layout" | "state" | "auth" | "data-fetching" | "error-handling");
    res.json(patterns);
  }));

  router.get("/patterns/top", asyncHandler((req, res) => {
    const limit = parseInt(req.query.limit as string) || 10;
    const patterns = patternLibraryService.getTopPatterns(limit);
    res.json(patterns);
  }));

  router.post("/patterns/suggest", asyncHandler((req, res) => {
    const parsed = suggestPatternsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { code, filePath } = parsed.data;
    const suggestions = patternLibraryService.suggestPatterns(code, filePath || "");
    res.json(suggestions);
  }));

  router.post("/patterns/:patternId/usage", asyncHandler((req, res) => {
    const parsed = patternUsageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { successful } = parsed.data;
    patternLibraryService.recordUsage(req.params.patternId as string, successful);
    res.json({ success: true });
  }));
}
