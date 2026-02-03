import { Router } from "express";
import { storage } from "../storage";
import { z } from "zod";

const router = Router();

router.get("/:id/versions", async (req, res) => {
  try {
    const versions = await storage.getProjectVersions(req.params.id);
    res.json(versions);
  } catch (error) {
    console.error("Error fetching versions:", error);
    res.status(500).json({ error: "Failed to fetch versions" });
  }
});

const createVersionSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  isAutoSave: z.boolean().optional(),
});

router.post("/:id/versions", async (req, res) => {
  try {
    const parsed = createVersionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }

    const version = await storage.createVersion(
      req.params.id,
      parsed.data.name,
      parsed.data.description,
      parsed.data.isAutoSave
    );

    if (!version) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.status(201).json(version);
  } catch (error) {
    console.error("Error creating version:", error);
    res.status(500).json({ error: "Failed to create version" });
  }
});

router.post("/:id/versions/:versionId/restore", async (req, res) => {
  try {
    const project = await storage.restoreVersion(req.params.id, req.params.versionId);
    
    if (!project) {
      return res.status(404).json({ error: "Version or project not found" });
    }

    res.json(project);
  } catch (error) {
    console.error("Error restoring version:", error);
    res.status(500).json({ error: "Failed to restore version" });
  }
});

router.delete("/:id/versions/:versionId", async (req, res) => {
  try {
    const versions = await storage.getProjectVersions(req.params.id);
    const versionExists = versions.some(v => v.id === req.params.versionId);
    
    if (!versionExists) {
      return res.status(404).json({ error: "Version not found for this project" });
    }
    
    const deleted = await storage.deleteVersion(req.params.versionId);
    
    if (!deleted) {
      return res.status(404).json({ error: "Version not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting version:", error);
    res.status(500).json({ error: "Failed to delete version" });
  }
});

export default router;
