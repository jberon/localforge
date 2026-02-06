import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { selfTestingService } from "../../services/self-testing.service";

const router = Router();

router.post("/generate", asyncHandler(async (req, res) => {
  const { projectId, code, appType } = req.body;
  const suite = selfTestingService.generateTestSuite(projectId, code, appType);
  res.status(201).json(suite);
}));

router.get("/suites/:suiteId", asyncHandler(async (req, res) => {
  const suite = selfTestingService.getTestSuite(req.params.suiteId as string);
  if (!suite) return res.status(404).json({ error: "Suite not found" });
  res.json(suite);
}));

router.get("/projects/:projectId/suites", asyncHandler(async (req, res) => {
  const suites = selfTestingService.getProjectSuites(req.params.projectId as string);
  res.json(suites);
}));

router.put("/suites/:suiteId/scenarios/:scenarioId", asyncHandler(async (req, res) => {
  const { status, result } = req.body;
  const success = selfTestingService.updateScenarioStatus(
    req.params.suiteId as string, req.params.scenarioId as string, status, result
  );
  res.json({ success });
}));

router.post("/suites/:suiteId/fix-suggestions", asyncHandler(async (req, res) => {
  const suggestions = selfTestingService.generateFixSuggestions(req.params.suiteId as string);
  res.json(suggestions);
}));

router.get("/stats", asyncHandler(async (_req, res) => {
  const stats = selfTestingService.getStats();
  res.json(stats);
}));

export default router;
