import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler";
import { parallelGenerationService } from "../../services/parallel-generation.service";
import { liveSyntaxValidatorService } from "../../services/live-syntax-validator.service";
import { codeStyleEnforcerService } from "../../services/code-style-enforcer.service";
import { errorLearningService } from "../../services/error-learning.service";
import { contextBudgetService } from "../../services/context-budget.service";
import { closedLoopAutoFixService } from "../../services/closed-loop-autofix.service";

const router = Router();

const validateSyntaxSchema = z.object({
  code: z.string(),
  language: z.string().optional(),
});

router.post("/validate-syntax", asyncHandler(async (req, res) => {
  const parsed = validateSyntaxSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
  }
  const { code, language } = parsed.data;
  const result = liveSyntaxValidatorService.validateStreaming(code, language || "typescript");
  res.json(result);
}));

const formatCodeSchema = z.object({
  code: z.string(),
  options: z.any().optional(),
});

router.post("/format-code", asyncHandler(async (req, res) => {
  const parsed = formatCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
  }
  const { code, options } = parsed.data;
  const result = codeStyleEnforcerService.formatCode(code, options);
  res.json(result);
}));

const formatFilesSchema = z.object({
  files: z.array(z.any()),
});

router.post("/format-files", asyncHandler(async (req, res) => {
  const parsed = formatFilesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
  }
  const { files } = parsed.data;
  const results = codeStyleEnforcerService.formatMultipleFiles(files);
  res.json(results);
}));

const errorLearningRecordSchema = z.object({
  error: z.string(),
  context: z.string().optional(),
  filePath: z.string().optional(),
});

router.post("/error-learning/record", asyncHandler(async (req, res) => {
  const parsed = errorLearningRecordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
  }
  const { error: errorMsg, context, filePath } = parsed.data;
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

const contextBudgetAllocateSchema = z.object({
  model: z.string(),
  taskProfile: z.string(),
});

router.post("/context-budget/allocate", asyncHandler(async (req, res) => {
  const parsed = contextBudgetAllocateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
  }
  const { model, taskProfile } = parsed.data;
  const allocation = contextBudgetService.calculateM4OptimizedAllocation(model, taskProfile);
  const temperature = contextBudgetService.getOptimalTemperature(model, taskProfile);
  res.json({ allocation, temperature });
}));

const parallelAnalyzeSchema = z.object({
  files: z.array(z.any()),
});

router.post("/parallel/analyze", asyncHandler(async (req, res) => {
  const parsed = parallelAnalyzeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
  }
  const { files } = parsed.data;
  const fileDescriptions = files.map((f: string | { path: string; description: string }) => 
    typeof f === "string" ? { path: f, description: `Generate ${f}` } : f
  );
  const tasks = parallelGenerationService.prepareFileTasks(fileDescriptions);
  const batches = parallelGenerationService.createBatches(tasks);
  res.json({ tasks, batches, estimatedSpeedup: `${(tasks.length / batches.length).toFixed(1)}x` });
}));

const autofixValidateSchema = z.object({
  code: z.string(),
  filePath: z.string().optional(),
  modelUsed: z.string().optional(),
  config: z.any().optional(),
});

router.post("/autofix/validate-and-fix", asyncHandler(async (req, res) => {
  const parsed = autofixValidateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
  }
  const { code, filePath, modelUsed, config } = parsed.data;
  const result = closedLoopAutoFixService.validateAndFix(code, filePath, modelUsed, config);
  res.json(result);
}));

const autofixEnhancePromptSchema = z.object({
  prompt: z.string(),
  modelName: z.string().optional(),
  taskType: z.string().optional(),
  fileTypes: z.array(z.string()).optional(),
});

router.post("/autofix/enhance-prompt", asyncHandler(async (req, res) => {
  const parsed = autofixEnhancePromptSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
  }
  const { prompt, modelName, taskType, fileTypes } = parsed.data;
  const enhancement = closedLoopAutoFixService.enhancePreGeneration(
    prompt,
    modelName,
    taskType || "build",
    fileTypes || []
  );
  res.json(enhancement);
}));

const autofixBuildFixPromptSchema = z.object({
  code: z.string(),
  errors: z.any(),
  strategy: z.string().optional(),
  modelUsed: z.string().optional(),
});

router.post("/autofix/build-fix-prompt", asyncHandler(async (req, res) => {
  const parsed = autofixBuildFixPromptSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
  }
  const { code, errors, strategy, modelUsed } = parsed.data;
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

const autofixConfigSchema = z.object({}).passthrough();

router.post("/autofix/config", asyncHandler(async (req, res) => {
  const parsed = autofixConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
  }
  const config = parsed.data;
  closedLoopAutoFixService.configure(config);
  res.json({ success: true, config: closedLoopAutoFixService.getConfig() });
}));

router.get("/error-learning/model-report/:modelName", asyncHandler(async (req, res) => {
  const { modelName } = req.params;
  const report = errorLearningService.getModelReport(modelName as string);
  res.json(report);
}));

const autofixValidateMultipleSchema = z.object({
  files: z.array(z.object({ path: z.string(), content: z.string() })),
  modelUsed: z.string().optional(),
  config: z.any().optional(),
});

router.post("/autofix/validate-and-fix-multiple", asyncHandler(async (req, res) => {
  const parsed = autofixValidateMultipleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
  }
  const { files, modelUsed, config } = parsed.data;
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
