import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { templateGalleryService } from "../services/template-gallery.service";
import { codeScaffoldLibraryService } from "../services/code-scaffold-library.service";

const router = Router();

router.get("/", asyncHandler((_req, res) => {
  res.json(templateGalleryService.getTemplates());
}));

router.get("/categories", asyncHandler((_req, res) => {
  res.json(templateGalleryService.getCategories());
}));

router.get("/search", asyncHandler((req, res) => {
  const query = String(req.query.q || "");
  res.json(templateGalleryService.searchTemplates(query));
}));

router.get("/:id", asyncHandler((req, res) => {
  const template = templateGalleryService.getTemplate(req.params.id);
  if (!template) return res.status(404).json({ error: "Template not found" });
  res.json(template);
}));

router.get("/scaffolds", asyncHandler((_req, res) => {
  res.json(codeScaffoldLibraryService.getAll().map(s => ({
    id: s.id,
    name: s.name,
    description: s.description,
    category: s.category,
    tags: s.tags,
    successRate: s.successRate,
    usageCount: s.usageCount,
  })));
}));

router.get("/scaffolds/stats", asyncHandler((_req, res) => {
  res.json(codeScaffoldLibraryService.getStats());
}));

router.get("/scaffolds/match", asyncHandler((req, res) => {
  const prompt = String(req.query.prompt || "");
  if (!prompt) return res.status(400).json({ error: "prompt query param required" });
  const matches = codeScaffoldLibraryService.findRelevantScaffolds(prompt);
  res.json(matches.map(m => ({
    id: m.scaffold.id,
    name: m.scaffold.name,
    category: m.scaffold.category,
    relevance: m.relevance,
    reason: m.reason,
  })));
}));

export default router;
