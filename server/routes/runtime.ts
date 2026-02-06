import { Router, Request, Response } from "express";
import { z } from "zod";
import { runtimeFeedbackService, type RuntimeError, type RuntimeLog } from "../services/runtime-feedback.service";
import { autoFixLoopService } from "../services/auto-fix-loop.service";
import { uiuxAgentService } from "../services/uiux-agent.service";
import { projectMemoryService } from "../services/project-memory.service";
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
    source: source || "browser"
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
    level: level || "log",
    message,
    args,
    source: source || "browser"
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

export default router;
