import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { parallelGenerationService } from "../../services/parallel-generation.service";
import { liveSyntaxValidatorService } from "../../services/live-syntax-validator.service";
import { codeStyleEnforcerService } from "../../services/code-style-enforcer.service";
import { errorLearningService } from "../../services/error-learning.service";
import { contextBudgetService } from "../../services/context-budget.service";
import { closedLoopAutoFixService } from "../../services/closed-loop-autofix.service";

const router = Router();

router.post("/validate-syntax", asyncHandler(async (req, res) => {
  const { code, language } = req.body;
  if (!code) {
    return res.status(400).json({ error: "code is required" });
  }
  const result = liveSyntaxValidatorService.validateStreaming(code, language || "typescript");
  res.json(result);
}));

router.post("/format-code", asyncHandler(async (req, res) => {
  const { code, options } = req.body;
  if (!code) {
    return res.status(400).json({ error: "code is required" });
  }
  const result = codeStyleEnforcerService.formatCode(code, options);
  res.json(result);
}));

router.post("/format-files", asyncHandler(async (req, res) => {
  const { files } = req.body;
  if (!files || !Array.isArray(files)) {
    return res.status(400).json({ error: "files array is required" });
  }
  const results = codeStyleEnforcerService.formatMultipleFiles(files);
  res.json(results);
}));

router.post("/error-learning/record", asyncHandler(async (req, res) => {
  const { error: errorMsg, context, filePath } = req.body;
  if (!errorMsg) {
    return res.status(400).json({ error: "error message is required" });
  }
  errorLearningService.recordError({ errorMessage: errorMsg, code: context || "", filePath: filePath || "", wasFixed: false });
  res.json({ success: true });
}));

router.get("/error-learning/insights", asyncHandler(async (_req, res) => {
  const insights = errorLearningService.getInsights();
  res.json(insights);
}));

router.get("/error-learning/prevention-prompt", asyncHandler(async (req, res) => {
  const modelName = (req.query.model as string) || "";
  const prompt = errorLearningService.getPreventionPrompt(modelName);
  res.json({ prompt });
}));

router.get("/context-budget/preset/:model", asyncHandler(async (req, res) => {
  const preset = contextBudgetService.getM4OptimizedPreset(req.params.model as string);
  res.json(preset || { error: "No preset found for model" });
}));

router.post("/context-budget/allocate", asyncHandler(async (req, res) => {
  const { model, taskProfile } = req.body;
  if (!model || !taskProfile) {
    return res.status(400).json({ error: "model and taskProfile are required" });
  }
  const allocation = contextBudgetService.calculateM4OptimizedAllocation(model, taskProfile);
  const temperature = contextBudgetService.getOptimalTemperature(model, taskProfile);
  res.json({ allocation, temperature });
}));

router.post("/parallel/analyze", asyncHandler(async (req, res) => {
  const { files } = req.body;
  if (!files || !Array.isArray(files)) {
    return res.status(400).json({ error: "files array is required" });
  }
  const fileDescriptions = files.map((f: string | { path: string; description: string }) => 
    typeof f === "string" ? { path: f, description: `Generate ${f}` } : f
  );
  const tasks = parallelGenerationService.prepareFileTasks(fileDescriptions);
  const batches = parallelGenerationService.createBatches(tasks);
  res.json({ tasks, batches, estimatedSpeedup: `${(tasks.length / batches.length).toFixed(1)}x` });
}));

router.post("/autofix/validate-and-fix", asyncHandler(async (req, res) => {
  const { code, filePath, modelUsed, config } = req.body;
  if (!code) {
    return res.status(400).json({ error: "code is required" });
  }
  const result = closedLoopAutoFixService.validateAndFix(code, filePath, modelUsed, config);
  res.json(result);
}));

router.post("/autofix/enhance-prompt", asyncHandler(async (req, res) => {
  const { prompt, modelName, taskType, fileTypes } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "prompt is required" });
  }
  const enhancement = closedLoopAutoFixService.enhancePreGeneration(
    prompt,
    modelName,
    taskType || "build",
    fileTypes || []
  );
  res.json(enhancement);
}));

router.post("/autofix/build-fix-prompt", asyncHandler(async (req, res) => {
  const { code, errors, strategy, modelUsed } = req.body;
  if (!code || !errors) {
    return res.status(400).json({ error: "code and errors are required" });
  }
  const fixPrompt = closedLoopAutoFixService.buildFixPrompt(
    code,
    errors,
    strategy || "syntax-targeted",
    modelUsed
  );
  res.json({ fixPrompt });
}));

router.get("/autofix/statistics", asyncHandler(async (_req, res) => {
  const stats = closedLoopAutoFixService.getStatistics();
  res.json(stats);
}));

router.get("/autofix/history", asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const history = closedLoopAutoFixService.getFixHistory(limit);
  res.json({ history, count: history.length });
}));

router.get("/autofix/config", asyncHandler(async (_req, res) => {
  const config = closedLoopAutoFixService.getConfig();
  res.json(config);
}));

router.post("/autofix/config", asyncHandler(async (req, res) => {
  const config = req.body;
  closedLoopAutoFixService.configure(config);
  res.json({ success: true, config: closedLoopAutoFixService.getConfig() });
}));

router.get("/error-learning/model-report/:modelName", asyncHandler(async (req, res) => {
  const { modelName } = req.params;
  const report = errorLearningService.getModelReport(modelName as string);
  res.json(report);
}));

router.post("/autofix/validate-and-fix-multiple", asyncHandler(async (req, res) => {
  const { files, modelUsed, config } = req.body;
  if (!files || !Array.isArray(files)) {
    return res.status(400).json({ error: "files array is required" });
  }
  const results = files.map((file: { path: string; content: string }) => ({
    path: file.path,
    result: closedLoopAutoFixService.validateAndFix(file.content, file.path, modelUsed, config),
  }));
  const summary = {
    totalFiles: results.length,
    filesFixed: results.filter((r: { result: { wasFixed: boolean } }) => r.result.wasFixed).length,
    totalErrors: results.reduce((s: number, r: { result: { errorsFound: number } }) => s + r.result.errorsFound, 0),
    totalFixed: results.reduce((s: number, r: { result: { errorsFixed: number } }) => s + r.result.errorsFixed, 0),
  };
  res.json({ results, summary });
}));

export default router;
