import { Router } from "express";
import { storage } from "../storage";
import { insertProjectSchema } from "@shared/schema";
import { z } from "zod";
import logger from "../lib/logger";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const projects = await storage.getProjects();
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const project = await storage.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch project" });
  }
});

router.post("/", async (req, res) => {
  try {
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
  } catch (error: any) {
    logger.error("Error creating project", {}, error);
    res.status(500).json({ error: "Failed to create project" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const deleted = await storage.deleteProject(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Project not found" });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete project" });
  }
});

const updateNameSchema = z.object({
  name: z.string().min(1).max(100),
});

router.patch("/:id/name", async (req, res) => {
  try {
    const parsed = updateNameSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }

    const project = await storage.updateProject(req.params.id, {
      name: parsed.data.name,
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json(project);
  } catch (error: any) {
    logger.error("Error updating project name", {}, error);
    res.status(500).json({ error: "Failed to update project name" });
  }
});

const updateCodeSchema = z.object({
  generatedCode: z.string(),
});

router.patch("/:id/code", async (req, res) => {
  try {
    const parsed = updateCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }

    const project = await storage.updateProject(req.params.id, {
      generatedCode: parsed.data.generatedCode,
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json(project);
  } catch (error: any) {
    logger.error("Error updating project code", {}, error);
    res.status(500).json({ error: "Failed to update project code" });
  }
});

export default router;
