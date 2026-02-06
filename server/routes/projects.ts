import { Router } from "express";
import { storage } from "../storage";
import { insertProjectSchema } from "@shared/schema";
import { z } from "zod";
import logger from "../lib/logger";
import { asyncHandler } from "../lib/async-handler";

const router = Router();

router.get("/", asyncHandler(async (req, res) => {
  const projects = await storage.getProjects();
  res.json(projects);
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const project = await storage.getProject(req.params.id as string);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }
  res.json(project);
}));

router.post("/", asyncHandler(async (req, res) => {
  const parsed = insertProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid project data", details: parsed.error.errors });
  }
  const project = await storage.createProject({
    name: parsed.data.name || "New Project",
    messages: parsed.data.messages || [],
    description: parsed.data.description,
  });
  res.json(project);
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const deleted = await storage.deleteProject(req.params.id as string);
  if (!deleted) {
    return res.status(404).json({ error: "Project not found" });
  }
  res.json({ success: true });
}));

const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  generatedCode: z.string().optional(),
});

router.put("/:id", asyncHandler(async (req, res) => {
  const parsed = updateProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
  }

  const existing = await storage.getProject(req.params.id as string);
  if (!existing) {
    return res.status(404).json({ error: "Project not found" });
  }

  const project = await storage.updateProject(req.params.id as string, parsed.data);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  res.json(project);
}));

const updateNameSchema = z.object({
  name: z.string().min(1).max(100),
});

router.patch("/:id/name", asyncHandler(async (req, res) => {
  const parsed = updateNameSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
  }

  const project = await storage.updateProject(req.params.id as string, {
    name: parsed.data.name,
  });

  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  res.json(project);
}));

const updateCodeSchema = z.object({
  generatedCode: z.string(),
});

router.patch("/:id/code", asyncHandler(async (req, res) => {
  const parsed = updateCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
  }

  const project = await storage.updateProject(req.params.id as string, {
    generatedCode: parsed.data.generatedCode,
  });

  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  res.json(project);
}));

export default router;
