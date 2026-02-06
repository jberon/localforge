import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { selfValidationService } from "../../services/self-validation.service";
import { patternLibraryService } from "../../services/pattern-library.service";

export function registerValidationRoutes(router: Router): void {
  router.post("/validation/validate", asyncHandler((req, res) => {
    const { code, filePath } = req.body;
    const result = selfValidationService.validate(code, filePath);
    res.json(result);
  }));

  router.get("/validation/config", asyncHandler((_req, res) => {
    const config = selfValidationService.getConfig();
    res.json(config);
  }));

  router.put("/validation/config", asyncHandler((req, res) => {
    selfValidationService.setConfig(req.body);
    res.json({ success: true });
  }));

  router.get("/validation/rules", asyncHandler((_req, res) => {
    const rules = selfValidationService.getRules();
    res.json(rules);
  }));

  router.put("/validation/rules/:ruleId", asyncHandler((req, res) => {
    const { enabled } = req.body;
    selfValidationService.enableRule(req.params.ruleId as string, enabled);
    res.json({ success: true });
  }));

  router.post("/patterns", asyncHandler((req, res) => {
    const pattern = patternLibraryService.addPattern(req.body);
    res.status(201).json(pattern);
  }));

  router.get("/patterns/search", asyncHandler((req, res) => {
    const query = req.query.q as string;
    const category = req.query.category as any;
    const results = patternLibraryService.findPatterns(query, category);
    res.json(results);
  }));

  router.get("/patterns/category/:category", asyncHandler((req, res) => {
    const patterns = patternLibraryService.getByCategory(req.params.category as string as any);
    res.json(patterns);
  }));

  router.get("/patterns/top", asyncHandler((req, res) => {
    const limit = parseInt(req.query.limit as string) || 10;
    const patterns = patternLibraryService.getTopPatterns(limit);
    res.json(patterns);
  }));

  router.post("/patterns/suggest", asyncHandler((req, res) => {
    const { code, filePath } = req.body;
    const suggestions = patternLibraryService.suggestPatterns(code, filePath);
    res.json(suggestions);
  }));

  router.post("/patterns/:patternId/usage", asyncHandler((req, res) => {
    const { successful } = req.body;
    patternLibraryService.recordUsage(req.params.patternId as string, successful);
    res.json({ success: true });
  }));
}
