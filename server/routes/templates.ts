import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { templateGalleryService } from "../services/template-gallery.service";

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

export default router;
