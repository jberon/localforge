import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { visualEditorService } from "../../services/visual-editor.service";

const router = Router();

router.get("/inspector-script", asyncHandler(async (_req, res) => {
  const script = visualEditorService.getInspectorScript();
  res.json({ script });
}));

router.post("/parse", asyncHandler(async (req, res) => {
  const { projectId, files } = req.body;
  const mappings = visualEditorService.parseSourceCode(projectId, files);
  res.json({ mappings, count: mappings.length });
}));

router.get("/mappings/:projectId", asyncHandler(async (req, res) => {
  const mappings = visualEditorService.getMappings(req.params.projectId as string);
  res.json({ mappings });
}));

router.post("/apply-patch", asyncHandler(async (req, res) => {
  const { projectId, patch, sourceCode } = req.body;
  const result = visualEditorService.applyPatch(projectId, patch, sourceCode);
  res.json(result);
}));

router.post("/apply-patches", asyncHandler(async (req, res) => {
  const { projectId, patches, sourceCode } = req.body;
  const results = visualEditorService.applyPatches(projectId, patches, sourceCode);
  res.json({ results });
}));

export default router;
