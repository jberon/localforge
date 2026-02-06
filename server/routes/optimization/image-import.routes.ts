import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { imageImportService } from "../../services/image-import.service";

const router = Router();

router.post("/create", asyncHandler(async (req, res) => {
  const { projectId, sourceType, fileName, imageData } = req.body;
  const importRecord = imageImportService.createImport(projectId, sourceType, fileName, imageData);
  res.status(201).json(importRecord);
}));

router.post("/:importId/analyze", asyncHandler(async (req, res) => {
  const prompt = imageImportService.generateAnalysisPrompt(req.params.importId as string);
  if (!prompt) return res.status(404).json({ error: "Import not found" });
  res.json({ prompt });
}));

router.post("/:importId/result", asyncHandler(async (req, res) => {
  const { elements } = req.body;
  const success = imageImportService.setAnalysisResult(req.params.importId as string, elements);
  res.json({ success });
}));

router.post("/:importId/generate-prompt", asyncHandler(async (req, res) => {
  const prompt = imageImportService.generateCodePrompt(req.params.importId as string);
  if (!prompt) return res.status(404).json({ error: "Import not found or not analyzed" });
  res.json({ prompt });
}));

router.get("/:importId", asyncHandler(async (req, res) => {
  const importRecord = imageImportService.getImport(req.params.importId as string);
  if (!importRecord) return res.status(404).json({ error: "Import not found" });
  res.json(importRecord);
}));

router.get("/projects/:projectId", asyncHandler(async (req, res) => {
  const imports = imageImportService.getProjectImports(req.params.projectId as string);
  res.json(imports);
}));

export default router;
