import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler";
import { autoDocumentationService } from "../../services/auto-documentation.service";
import { proactiveRefactoringService } from "../../services/proactive-refactoring.service";

const generateDocsSchema = z.object({
  files: z.array(z.any()),
  projectName: z.string().optional(),
});

const quickReadmeSchema = z.object({
  projectName: z.string().optional(),
  description: z.string().optional(),
  features: z.array(z.string()).optional(),
});

const refactoringAnalyzeSchema = z.object({
  files: z.array(z.any()),
});

const thresholdsSchema = z.object({}).passthrough();

export function registerDocumentationRoutes(router: Router): void {
  router.post("/documentation/generate", asyncHandler(async (req, res) => {
    const parsed = generateDocsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { files, projectName } = parsed.data;
    const result = await autoDocumentationService.generateDocumentation(files, projectName);
    res.json(result);
  }));

  router.post("/documentation/quick-readme", asyncHandler((req, res) => {
    const parsed = quickReadmeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { projectName, description, features } = parsed.data;
    const readme = autoDocumentationService.generateQuickReadme(
      projectName || "Project",
      description || "A generated project",
      features || []
    );
    res.json({ readme });
  }));

  router.post("/refactoring/analyze", asyncHandler((req, res) => {
    const parsed = refactoringAnalyzeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { files } = parsed.data;
    const result = proactiveRefactoringService.analyzeForRefactoring(files);
    res.json(result);
  }));

  router.get("/refactoring/thresholds", asyncHandler((_req, res) => {
    const thresholds = proactiveRefactoringService.getThresholds();
    res.json(thresholds);
  }));

  router.put("/refactoring/thresholds", asyncHandler((req, res) => {
    const parsed = thresholdsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    proactiveRefactoringService.setThresholds(parsed.data);
    res.json({ success: true });
  }));
}
