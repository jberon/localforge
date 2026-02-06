import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { autoDocumentationService } from "../../services/auto-documentation.service";
import { proactiveRefactoringService } from "../../services/proactive-refactoring.service";

export function registerDocumentationRoutes(router: Router): void {
  router.post("/documentation/generate", asyncHandler(async (req, res) => {
    const { files, projectName } = req.body;
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: "files array is required" });
    }

    const result = await autoDocumentationService.generateDocumentation(files, projectName);
    res.json(result);
  }));

  router.post("/documentation/quick-readme", asyncHandler((req, res) => {
    const { projectName, description, features } = req.body;
    const readme = autoDocumentationService.generateQuickReadme(
      projectName || "Project",
      description || "A generated project",
      features || []
    );
    res.json({ readme });
  }));

  router.post("/refactoring/analyze", asyncHandler((req, res) => {
    const { files } = req.body;
    const result = proactiveRefactoringService.analyzeForRefactoring(files);
    res.json(result);
  }));

  router.get("/refactoring/thresholds", asyncHandler((_req, res) => {
    const thresholds = proactiveRefactoringService.getThresholds();
    res.json(thresholds);
  }));

  router.put("/refactoring/thresholds", asyncHandler((req, res) => {
    proactiveRefactoringService.setThresholds(req.body);
    res.json({ success: true });
  }));
}
