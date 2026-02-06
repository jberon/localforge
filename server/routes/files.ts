import { Router } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler";

const router = Router();

const updateFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

router.patch("/:id/files", asyncHandler(async (req, res) => {
  const parsed = updateFileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
  }

  const project = await storage.getProject(req.params.id);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const files = project.generatedFiles || [];
  const fileIndex = files.findIndex(f => f.path === parsed.data.path);
  
  if (fileIndex >= 0) {
    files[fileIndex] = { path: parsed.data.path, content: parsed.data.content };
  } else {
    files.push({ path: parsed.data.path, content: parsed.data.content });
  }

  const updatedProject = await storage.updateProject(req.params.id, {
    generatedFiles: files,
  });

  res.json(updatedProject);
}));

router.post("/:id/files", asyncHandler(async (req, res) => {
  const parsed = updateFileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
  }

  const project = await storage.getProject(req.params.id);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const files = project.generatedFiles || [];
  const existingFile = files.find(f => f.path === parsed.data.path);
  
  if (existingFile) {
    return res.status(409).json({ error: "File already exists" });
  }

  files.push({ path: parsed.data.path, content: parsed.data.content });

  const updatedProject = await storage.updateProject(req.params.id, {
    generatedFiles: files,
  });

  res.json(updatedProject);
}));

const deleteFileSchema = z.object({
  path: z.string().min(1),
});

router.delete("/:id/files", asyncHandler(async (req, res) => {
  const parsed = deleteFileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
  }
  const filePath = parsed.data.path;
  
  const project = await storage.getProject(req.params.id);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const files = project.generatedFiles || [];
  const fileIndex = files.findIndex(f => f.path === filePath);
  
  if (fileIndex < 0) {
    return res.status(404).json({ error: "File not found" });
  }

  files.splice(fileIndex, 1);

  const updatedProject = await storage.updateProject(req.params.id, {
    generatedFiles: files,
  });

  res.json(updatedProject);
}));

export default router;
