import { Router, Request, Response } from "express";
import { z } from "zod";
import { runtimeFeedbackService, type RuntimeError, type RuntimeLog } from "../services/runtime-feedback.service";
import { autoFixLoopService } from "../services/auto-fix-loop.service";
import { uiuxAgentService } from "../services/uiux-agent.service";
import { projectMemoryService } from "../services/project-memory.service";
import { selfTestingService } from "../services/self-testing.service";
import { dependencyGraphService } from "../services/dependency-graph.service";
import { envDetectionService } from "../services/env-detection.service";
import { promptDecomposerService } from "../services/prompt-decomposer.service";
import { projectStateService } from "../services/project-state.service";
import { initializerService } from "../services/initializer.service";
import { sequentialBuildService } from "../services/sequential-build.service";
import { twoPassContextService } from "../services/two-pass-context.service";
import { hooksService } from "../services/hooks.service";
import { modelRouterService } from "../services/model-router.service";
import { logger } from "../lib/logger";
import { asyncHandler } from "../lib/async-handler";

const router = Router();

function parseQueryString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

const reportErrorSchema = z.object({
  projectId: z.string(),
  message: z.string(),
  stack: z.string().optional(),
  file: z.string().optional(),
  line: z.number().optional(),
  column: z.number().optional(),
  source: z.string().optional(),
});

const reportLogSchema = z.object({
  projectId: z.string(),
  level: z.string().optional(),
  message: z.string(),
  args: z.any().optional(),
  source: z.string().optional(),
});

const autofixSchema = z.object({
  maxIterations: z.number().optional(),
});

const analyzeUiSchema = z.object({
  files: z.array(z.any()),
});

const impactSchema = z.object({
  filePath: z.string(),
});

router.post("/errors", asyncHandler(async (req: Request, res: Response) => {
  const parsed = reportErrorSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
  }
  const { projectId, message, stack, file, line, column, source } = parsed.data;

  const error = runtimeFeedbackService.reportError(projectId, {
    message,
    stack,
    file,
    line,
    column,
    source: (source || "browser") as "browser" | "server" | "build"
  });

  logger.info("Runtime error reported via API", { projectId, errorId: error.id });

  res.json({
    success: true,
    error: {
      id: error.id,
      type: error.type,
      severity: error.severity,
      suggestion: error.suggestion
    }
  });
}));

router.get("/errors/:projectId", asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.projectId as string;
  const unhandled = parseQueryString(req.query.unhandled as string | undefined);
  const limit = parseQueryString(req.query.limit as string | undefined);

  let errors: RuntimeError[];
  if (unhandled === "true") {
    errors = runtimeFeedbackService.getUnhandledErrors(projectId);
  } else {
    errors = runtimeFeedbackService.getRecentErrors(projectId, Number(limit) || 10);
  }

  res.json({
    success: true,
    errors,
    count: errors.length
  });
}));

router.post("/errors/:projectId/:errorId/handled", asyncHandler(async (_req: Request, res: Response) => {
  const projectId = _req.params.projectId as string;
  const errorId = _req.params.errorId as string;
  runtimeFeedbackService.markErrorHandled(projectId, errorId);
  res.json({ success: true });
}));

router.post("/logs", asyncHandler(async (req: Request, res: Response) => {
  const parsed = reportLogSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
  }
  const { projectId, level, message, args, source } = parsed.data;

  const log = runtimeFeedbackService.reportLog(projectId, {
    level: (level || "log") as "log" | "info" | "warn" | "error" | "debug",
    message,
    args,
    source: (source || "browser") as "browser" | "server"
  });

  res.json({
    success: true,
    log: {
      id: log.id,
      level: log.level
    }
  });
}));

router.get("/logs/:projectId", asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.projectId as string;
  const level = parseQueryString(req.query.level as string | undefined);
  const since = parseQueryString(req.query.since as string | undefined);
  const limit = parseQueryString(req.query.limit as string | undefined);

  const logs = runtimeFeedbackService.getLogs(projectId, {
    level: level as RuntimeLog["level"],
    since: since ? Number(since) : undefined,
    limit: limit ? Number(limit) : undefined
  });

  res.json({
    success: true,
    logs,
    count: logs.length
  });
}));

router.get("/stats/:projectId", asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.projectId as string;
  const stats = runtimeFeedbackService.getSessionStats(projectId);

  if (!stats) {
    return res.json({
      success: true,
      stats: {
        errorCount: 0,
        warningCount: 0,
        unhandledCount: 0,
        recentErrorTypes: {}
      }
    });
  }

  res.json({
    success: true,
    stats
  });
}));

router.post("/session/:projectId/start", asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.projectId as string;
  const session = runtimeFeedbackService.startSession(projectId);
  
  res.json({
    success: true,
    session: {
      id: session.id,
      status: session.status,
      startedAt: session.startedAt
    }
  });
}));

router.post("/session/:projectId/stop", asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.projectId as string;
  runtimeFeedbackService.stopSession(projectId);
  res.json({ success: true });
}));

router.post("/session/:projectId/clear", asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.projectId as string;
  runtimeFeedbackService.clearSession(projectId);
  res.json({ success: true });
}));

router.post("/autofix/:projectId", asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.projectId as string;
  const parsed = autofixSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
  }
  const { maxIterations } = parsed.data;

  const unhandledErrors = runtimeFeedbackService.getUnhandledErrors(projectId);
  
  if (unhandledErrors.length === 0) {
    return res.json({
      success: true,
      message: "No unhandled errors to fix",
      fixed: 0
    });
  }

  const session = await autoFixLoopService.startAutoFixSession(projectId, {
    maxIterations: maxIterations || 5
  });

  res.json({
    success: true,
    sessionId: session.id,
    errorsToFix: unhandledErrors.length,
    message: `Started auto-fix session with ${unhandledErrors.length} errors`
  });
}));

router.post("/analyze-ui/:projectId", asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.projectId as string;
  const parsed = analyzeUiSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
  }
  const { files } = parsed.data;

  const result = await uiuxAgentService.analyzeFiles(files);

  res.json({
    success: true,
    analysis: result
  });
}));

router.get("/dependency-graph/:projectId", asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.projectId as string;
  const graph = await projectMemoryService.buildDependencyGraph(projectId);

  res.json({
    success: true,
    graph
  });
}));

router.post("/impact/:projectId", asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.projectId as string;
  const parsed = impactSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
  }
  const { filePath } = parsed.data;

  const impact = await projectMemoryService.getChangeImpact(projectId, filePath);

  res.json({
    success: true,
    impact
  });
}));

const autoHealSchema = z.object({
  code: z.string().min(1),
  errors: z.array(z.object({
    message: z.string(),
    stack: z.string().optional(),
    line: z.number().optional(),
    type: z.string().optional(),
  })),
  settings: z.object({
    endpoint: z.string().optional(),
    model: z.string().optional(),
    temperature: z.number().optional(),
    provider: z.string().optional(),
    apiKey: z.string().optional(),
  }).optional(),
});

router.post("/auto-heal/:projectId", asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.projectId as string;
  const parsed = autoHealSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
  }

  const { code, errors, settings } = parsed.data;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let isClientConnected = true;
  req.on("close", () => { isClientConnected = false; });

  const errorSummary = errors.map((e, i) => {
    let desc = `Error ${i + 1}: ${e.message}`;
    if (e.line) desc += ` (line ${e.line})`;
    if (e.type) desc += ` [${e.type}]`;
    return desc;
  }).join("\n");

  const fixPrompt = `You are fixing runtime errors in a React application. The code was generated and is running in a browser preview, but it has runtime errors.

## Runtime Errors Detected
${errorSummary}

## Current Code
\`\`\`jsx
${code}
\`\`\`

## Instructions
1. Analyze each runtime error carefully
2. Fix ONLY the issues causing these specific errors
3. Do NOT change unrelated code
4. Return the COMPLETE fixed code (not just the changed parts)
5. If an error is about a missing import, add the import
6. If an error is about undefined variables/functions, define them or fix the reference
7. If an error is about incorrect JSX, fix the JSX syntax
8. Wrap the code in a single code fence

Output ONLY the fixed code, no explanations.`;

  res.write(`data: ${JSON.stringify({ type: "status", message: `Analyzing ${errors.length} runtime error(s)...` })}\n\n`);

  try {
    const { getActiveLLMClient, LLM_DEFAULTS } = await import("../llm-client");

    const { client: openai, isCloud } = getActiveLLMClient(settings || undefined);

    const stream = await openai.chat.completions.create({
      model: isCloud ? "gpt-4o-mini" : (settings?.model || "local-model"),
      messages: [
        { role: "system", content: fixPrompt },
        { role: "user", content: `Fix the ${errors.length} runtime error(s) listed above. Return the complete fixed code.` },
      ],
      temperature: 0.2,
      max_tokens: LLM_DEFAULTS.maxTokens.quickApp,
      stream: true,
    });

    const chunks: string[] = [];

    for await (const chunk of stream) {
      if (!isClientConnected) break;
      const delta = chunk.choices[0]?.delta?.content || "";
      if (delta) {
        chunks.push(delta);
        res.write(`data: ${JSON.stringify({ type: "chunk", content: delta })}\n\n`);
      }
    }

    const fullContent = chunks.join("");
    let fixedCode = fullContent
      .replace(/^```(?:jsx?|javascript|typescript|tsx)?\n?/gm, "")
      .replace(/```$/gm, "")
      .trim();

    if (fixedCode && fixedCode.length > 50) {
      const { codeQualityPipelineService } = await import("../services/code-quality-pipeline.service");
      const qualityReport = await codeQualityPipelineService.analyzeAndFix(fixedCode);
      if (qualityReport.totalIssuesFixed > 0) {
        fixedCode = qualityReport.fixedCode;
      }

      for (const error of errors) {
        runtimeFeedbackService.reportError(projectId, {
          message: error.message,
          stack: error.stack,
          line: error.line,
          source: "browser" as "browser" | "server" | "build",
        });
      }

      res.write(`data: ${JSON.stringify({ type: "fixed_code", code: fixedCode, errorsFixed: errors.length, qualityScore: qualityReport.overallScore })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "done", success: true })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ type: "done", success: false, message: "Could not generate a fix" })}\n\n`);
    }
  } catch (error: any) {
    logger.error("Auto-heal failed", { projectId, error: error.message });
    res.write(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`);
  }

  res.end();
}));

router.post("/test-suite/:projectId", asyncHandler(async (req: Request, res: Response) => {
  const projectId = String(req.params.projectId);
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: "code is required" });
  }

  const suite = selfTestingService.generateTestSuite(projectId, code);

  const executableScenarios = suite.scenarios.map(scenario => ({
    id: scenario.id,
    name: scenario.name,
    type: scenario.type,
    steps: scenario.steps.map(step => ({
      action: mapStepToAction(step),
      target: step.target,
      value: step.value,
      assertion: step.assertion,
    })),
    status: "pending" as const,
  }));

  res.json({
    suiteId: suite.id,
    projectId,
    scenarios: executableScenarios,
    coverage: suite.coverage,
  });
}));

router.post("/test-results/:projectId", asyncHandler(async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { suiteId, results } = req.body;

  if (!suiteId || !results) {
    return res.status(400).json({ error: "suiteId and results are required" });
  }

  for (const result of results) {
    selfTestingService.updateScenarioStatus(
      suiteId,
      result.scenarioId,
      result.passed ? "passed" : "failed",
      {
        passed: result.passed,
        duration: result.duration,
        errors: result.errors || [],
        warnings: [],
        suggestions: [],
      }
    );
  }

  const fixes = selfTestingService.generateFixSuggestions(suiteId);
  res.json({ suiteId, fixes, resultsRecorded: results.length });
}));

function mapStepToAction(step: { action: string; target: string; value?: string; assertion?: string }): string {
  const action = step.action.toLowerCase();
  if (action.includes("verify") || action.includes("check") || action.includes("assert")) {
    if (action.includes("text") || action.includes("content")) return "check_text";
    if (action.includes("visible") || action.includes("display")) return "check_visible";
    if (action.includes("count") || action.includes("number")) return "check_count";
    if (action.includes("accessible") || action.includes("a11y")) return "check_accessible";
    if (action.includes("error")) return "check_no_errors";
    return "check_exists";
  }
  if (action.includes("click") || action.includes("press") || action.includes("tap")) return "click";
  if (action.includes("type") || action.includes("input") || action.includes("fill")) return "input";
  return "check_exists";
}

router.post("/analyze-complexity", asyncHandler(async (_req: Request, res: Response) => {
  const { prompt, existingCode } = _req.body;

  if (!prompt || typeof prompt !== "string") {
    return res.json({ shouldDecompose: false, complexityScore: 0, steps: [], reason: "No prompt provided" });
  }

  const decomposition = promptDecomposerService.decompose(prompt);

  if (decomposition.shouldDecompose) {
    const sequentialPrompts = promptDecomposerService.buildSequentialPrompts(decomposition, existingCode);
    return res.json({
      ...decomposition,
      sequentialPrompts,
    });
  }

  res.json(decomposition);
}));

router.post("/detect-env/:projectId", asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.body;

  if (!code || typeof code !== "string") {
    return res.json({ variables: [], hasSecrets: false, setupInstructions: "" });
  }

  const result = envDetectionService.detectEnvVars(code);
  res.json(result);
}));

router.post("/dependency-graph/:projectId", asyncHandler(async (req: Request, res: Response) => {
  const projectId = String(req.params.projectId);
  const { files } = req.body;

  if (!Array.isArray(files) || files.length === 0) {
    return res.json({ nodes: [], entryPoints: [] });
  }

  const graph = dependencyGraphService.buildGraph(projectId, files);

  const nodes = Array.from(graph.nodes.values()).map(n => ({
    path: n.path,
    imports: n.imports,
    exports: n.exports,
    importedBy: n.importedBy,
    depth: n.depth,
  }));

  res.json({ nodes, entryPoints: graph.entryPoints });
}));

router.post("/dependency-context/:projectId", asyncHandler(async (req: Request, res: Response) => {
  const projectId = String(req.params.projectId);
  const { targetFile, files, userMessage, maxTokens } = req.body;

  if (!Array.isArray(files) || !targetFile) {
    return res.json({ primaryFile: targetFile, contextFiles: [], totalTokenEstimate: 0 });
  }

  const selection = dependencyGraphService.getContextForRefinement(
    projectId, targetFile, files, maxTokens || 4000
  );

  res.json(selection);
}));

router.get("/project-state/:projectId", asyncHandler(async (req: Request, res: Response) => {
  const projectId = String(req.params.projectId);
  const state = projectStateService.getState(projectId);
  if (!state) {
    return res.json({ exists: false, state: null });
  }
  res.json({ exists: true, state });
}));

router.post("/project-state/:projectId", asyncHandler(async (req: Request, res: Response) => {
  const projectId = String(req.params.projectId);
  const { action, description, code, linesChanged, featuresAffected, successful } = req.body;

  if (action === "init") {
    const state = projectStateService.initializeState(projectId);
    return res.json(state);
  }

  if (action === "generation" && code) {
    const features = projectStateService.detectFeaturesFromCode(code);
    const state = projectStateService.recordGeneration(
      projectId,
      description || "Code generation",
      code,
      featuresAffected || features,
      successful !== false
    );
    return res.json(state);
  }

  if (action === "refinement") {
    const state = projectStateService.recordRefinement(
      projectId,
      description || "Code refinement",
      linesChanged || 0,
      featuresAffected || [],
      successful !== false
    );
    return res.json(state);
  }

  res.status(400).json({ error: "Invalid action. Use 'init', 'generation', or 'refinement'" });
}));

router.post("/health-check/:projectId", asyncHandler(async (req: Request, res: Response) => {
  const projectId = String(req.params.projectId);
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: "code is required" });
  }

  const healthCheck = selfTestingService.generateHealthCheck(projectId, code);

  if (healthCheck.isBroken) {
    projectStateService.updateHealth(projectId, {
      renders: false,
      errors: healthCheck.issues,
    });
  } else {
    projectStateService.updateHealth(projectId, {
      renders: true,
      errors: [],
    });
  }

  res.json(healthCheck);
}));

router.post("/feature-manifest/:projectId", asyncHandler(async (req: Request, res: Response) => {
  const projectId = String(req.params.projectId);
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "prompt is required" });
  }

  const manifest = initializerService.generateManifest(projectId, prompt);
  res.json(manifest);
}));

router.get("/feature-manifest/:projectId", asyncHandler(async (req: Request, res: Response) => {
  const projectId = String(req.params.projectId);
  const manifest = initializerService.getManifest(projectId);
  if (!manifest) {
    return res.json({ exists: false, manifest: null });
  }
  res.json({ exists: true, manifest });
}));

router.post("/feature-manifest/:projectId/mark", asyncHandler(async (req: Request, res: Response) => {
  const projectId = String(req.params.projectId);
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: "code is required" });
  }

  const manifest = initializerService.markFeaturesByCode(projectId, code);
  if (!manifest) {
    return res.json({ exists: false, manifest: null });
  }

  res.json({ exists: true, manifest });
}));

router.post("/sequential-build/:projectId", asyncHandler(async (req: Request, res: Response) => {
  const projectId = String(req.params.projectId);
  const { prompt, steps } = req.body;

  if (!prompt || !Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ error: "prompt and steps array are required" });
  }

  const pipeline = sequentialBuildService.createPipeline(projectId, prompt, steps);
  res.json(pipeline);
}));

router.get("/sequential-build/:pipelineId/progress", asyncHandler(async (req: Request, res: Response) => {
  const pipelineId = String(req.params.pipelineId);
  const progress = sequentialBuildService.getPipelineProgress(pipelineId);
  if (!progress) {
    return res.json({ exists: false, progress: null });
  }
  res.json({ exists: true, progress });
}));

router.post("/sequential-build/:pipelineId/next", asyncHandler(async (req: Request, res: Response) => {
  const pipelineId = String(req.params.pipelineId);
  const next = sequentialBuildService.getNextStep(pipelineId);
  if (!next) {
    return res.json({ hasNext: false, step: null });
  }
  res.json({ hasNext: true, ...next });
}));

router.post("/sequential-build/:pipelineId/complete", asyncHandler(async (req: Request, res: Response) => {
  const pipelineId = String(req.params.pipelineId);
  const { stepId, code, qualityScore, healthPassed } = req.body;

  if (!stepId || !code) {
    return res.status(400).json({ error: "stepId and code are required" });
  }

  const pipeline = sequentialBuildService.completeStep(pipelineId, stepId, {
    code,
    qualityScore: qualityScore || 0,
    healthPassed: healthPassed !== false,
  });

  if (!pipeline) {
    return res.status(404).json({ error: "Pipeline or step not found" });
  }

  res.json(pipeline);
}));

router.post("/sequential-build/:pipelineId/fail", asyncHandler(async (req: Request, res: Response) => {
  const pipelineId = String(req.params.pipelineId);
  const { stepId, error } = req.body;

  if (!stepId || !error) {
    return res.status(400).json({ error: "stepId and error are required" });
  }

  const pipeline = sequentialBuildService.failStep(pipelineId, stepId, error);
  if (!pipeline) {
    return res.status(404).json({ error: "Pipeline or step not found" });
  }

  res.json(pipeline);
}));

router.post("/context-reduce/:projectId", asyncHandler(async (req: Request, res: Response) => {
  const projectId = String(req.params.projectId);
  const { targetFile, userMessage, relatedFiles, maxTokenBudget } = req.body;

  if (!targetFile || !userMessage || !Array.isArray(relatedFiles)) {
    return res.status(400).json({ error: "targetFile, userMessage, and relatedFiles array are required" });
  }

  const reduction = twoPassContextService.reduceContext(
    projectId,
    targetFile,
    userMessage,
    relatedFiles,
    maxTokenBudget || 3000
  );

  res.json(reduction);
}));

router.get("/hooks/:projectId", asyncHandler(async (req: Request, res: Response) => {
  const projectId = String(req.params.projectId);
  const hooks = hooksService.getHooks(projectId);
  res.json(hooks);
}));

router.post("/hooks/:projectId", asyncHandler(async (req: Request, res: Response) => {
  const projectId = String(req.params.projectId);
  const { event, action } = req.body;

  if (!event || !action) {
    return res.status(400).json({ error: "event and action are required" });
  }

  const hook = hooksService.addHook(projectId, event, action);
  res.json(hook);
}));

router.delete("/hooks/:projectId/:hookId", asyncHandler(async (req: Request, res: Response) => {
  const projectId = String(req.params.projectId);
  const hookId = String(req.params.hookId);

  const removed = hooksService.removeHook(projectId, hookId);
  res.json({ removed });
}));

router.post("/hooks/:projectId/toggle", asyncHandler(async (req: Request, res: Response) => {
  const projectId = String(req.params.projectId);
  const { hookId, enabled } = req.body;

  if (!hookId || typeof enabled !== "boolean") {
    return res.status(400).json({ error: "hookId and enabled (boolean) are required" });
  }

  const toggled = hooksService.toggleHook(projectId, hookId, enabled);
  res.json({ toggled });
}));

router.post("/hooks/:projectId/fire", asyncHandler(async (req: Request, res: Response) => {
  const projectId = String(req.params.projectId);
  const { event, context } = req.body;

  if (!event) {
    return res.status(400).json({ error: "event is required" });
  }

  const results = await hooksService.fireHooks(projectId, event, context || {});
  res.json({ results, count: results.length });
}));

router.get("/hooks/:projectId/history", asyncHandler(async (req: Request, res: Response) => {
  const projectId = String(req.params.projectId);
  const limit = parseInt(String(req.query.limit || "20"), 10);
  const history = hooksService.getExecutionHistory(projectId, limit);
  res.json({ history });
}));

router.get("/pipelines/:projectId", asyncHandler(async (req: Request, res: Response) => {
  const projectId = String(req.params.projectId);
  const pipeline = sequentialBuildService.getPipelineForProject(projectId);
  if (!pipeline) {
    return res.json({ active: false });
  }
  const progress = sequentialBuildService.getPipelineProgress(pipeline.id);
  res.json({ active: true, ...progress });
}));

router.get("/model-stats", asyncHandler(async (_req, res) => {
  const stats = modelRouterService.getModelPerformanceStats();
  const routingStats = modelRouterService.getRoutingStats();
  const config = modelRouterService.getConfig();
  res.json({
    performanceStats: stats,
    routingStats,
    config: {
      enabled: config.enabled,
      autoRouting: config.autoRouting,
      fastModel: config.fastModel,
      balancedModel: config.balancedModel,
      powerfulModel: config.powerfulModel,
    },
  });
}));

export default router;
