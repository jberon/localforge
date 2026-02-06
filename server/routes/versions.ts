import { Router } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler";

const router = Router();

router.get("/:id/versions", asyncHandler(async (req, res) => {
  const versions = await storage.getProjectVersions(req.params.id as string);
  res.json(versions);
}));

const createVersionSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  isAutoSave: z.boolean().optional(),
});

router.post("/:id/versions", asyncHandler(async (req, res) => {
  const parsed = createVersionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
  }

  const version = await storage.createVersion(
    req.params.id as string,
    parsed.data.name,
    parsed.data.description,
    parsed.data.isAutoSave
  );

  if (!version) {
    return res.status(404).json({ error: "Project not found" });
  }

  res.status(201).json(version);
}));

router.post("/:id/versions/:versionId/restore", asyncHandler(async (req, res) => {
  const project = await storage.restoreVersion(req.params.id as string, req.params.versionId as string);
  
  if (!project) {
    return res.status(404).json({ error: "Version or project not found" });
  }

  res.json(project);
}));

router.delete("/:id/versions/:versionId", asyncHandler(async (req, res) => {
  const versions = await storage.getProjectVersions(req.params.id as string);
  const versionExists = versions.some(v => v.id === (req.params.versionId as string));
  
  if (!versionExists) {
    return res.status(404).json({ error: "Version not found for this project" });
  }
  
  const deleted = await storage.deleteVersion(req.params.versionId as string);
  
  if (!deleted) {
    return res.status(404).json({ error: "Version not found" });
  }

  res.json({ success: true });
}));

export default router;
