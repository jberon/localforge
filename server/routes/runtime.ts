import { Router, Request, Response } from "express";
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

/**
 * POST /api/runtime/errors - Report a runtime error
 */
router.post("/errors", asyncHandler(async (req: Request, res: Response) => {
  const { projectId, message, stack, file, line, column, source } = req.body;

  if (!projectId || !message) {
    return res.status(400).json({ error: "projectId and message are required" });
  }

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

/**
 * GET /api/runtime/errors/:projectId - Get recent errors for a project
 */
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

/**
 * POST /api/runtime/errors/:projectId/:errorId/handled - Mark error as handled
 */
router.post("/errors/:projectId/:errorId/handled", asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.projectId as string;
  const errorId = req.params.errorId as string;
  runtimeFeedbackService.markErrorHandled(projectId, errorId);
  res.json({ success: true });
}));

/**
 * POST /api/runtime/logs - Report a runtime log
 */
router.post("/logs", asyncHandler(async (req: Request, res: Response) => {
  const { projectId, level, message, args, source } = req.body;

  if (!projectId || !message) {
    return res.status(400).json({ error: "projectId and message are required" });
  }

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

/**
 * GET /api/runtime/logs/:projectId - Get logs for a project
 */
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

/**
 * GET /api/runtime/stats/:projectId - Get session statistics
 */
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

/**
 * POST /api/runtime/session/:projectId/start - Start a runtime session
 */
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

/**
 * POST /api/runtime/session/:projectId/stop - Stop a runtime session
 */
router.post("/session/:projectId/stop", asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.projectId as string;
  runtimeFeedbackService.stopSession(projectId);
  res.json({ success: true });
}));

/**
 * POST /api/runtime/session/:projectId/clear - Clear session data
 */
router.post("/session/:projectId/clear", asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.projectId as string;
  runtimeFeedbackService.clearSession(projectId);
  res.json({ success: true });
}));

/**
 * POST /api/runtime/autofix/:projectId - Trigger auto-fix for unhandled errors
 */
router.post("/autofix/:projectId", asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.projectId as string;
  const { maxIterations } = req.body;

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

/**
 * POST /api/runtime/analyze-ui/:projectId - Analyze UI/UX for a project
 */
router.post("/analyze-ui/:projectId", asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.projectId as string;
  const { files } = req.body;

  if (!files || !Array.isArray(files)) {
    return res.status(400).json({ error: "files array is required" });
  }

  const result = await uiuxAgentService.analyzeFiles(files);

  res.json({
    success: true,
    analysis: result
  });
}));

/**
 * GET /api/runtime/dependency-graph/:projectId - Get dependency graph
 */
router.get("/dependency-graph/:projectId", asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.projectId as string;
  const graph = await projectMemoryService.buildDependencyGraph(projectId);

  res.json({
    success: true,
    graph
  });
}));

/**
 * POST /api/runtime/impact/:projectId - Get change impact analysis (pass filePath in body)
 */
router.post("/impact/:projectId", asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.projectId as string;
  const { filePath } = req.body;

  if (!filePath) {
    return res.status(400).json({ error: "filePath is required in request body" });
  }

  const impact = await projectMemoryService.getChangeImpact(projectId, filePath);

  res.json({
    success: true,
    impact
  });
}));

export default router;
