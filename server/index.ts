import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { securityHeaders } from "./middleware/security";
import logger from "./lib/logger";
import { healthAlertsService } from "./services/health-alerts.service";
import { performanceProfilerService } from "./services/performance-profiler.service";
import { llmCacheService } from "./services/llm-cache.service";
import { localEmbeddingService } from "./services/local-embedding.service";
import { quantizationDetectorService } from "./services/quantization-detector.service";
import { speculativeDecodingService } from "./services/speculative-decoding.service";
import { runtimeFeedbackService } from "./services/runtime-feedback.service";
import { modelProviderService } from "./services/model-provider.service";
import { smartContextService } from "./services/smart-context.service";
import { semanticCodeSearchService } from "./services/semantic-code-search.service";
import { buildModeService } from "./services/build-mode.service";
import { designModeService } from "./services/design-mode.service";
import { feedbackLoopService } from "./services/feedback-loop.service";
import { multiStepReasoningService } from "./services/multi-step-reasoning.service";
import { patternLibraryService } from "./services/pattern-library.service";
import { smartRetryService } from "./services/smart-retry.service";
import { userPreferenceLearningService } from "./services/user-preference-learning.service";
import { validationPipelineService } from "./services/validation-pipeline.service";
import { discussionModeService } from "./services/discussion-mode.service";
import { visualEditorService } from "./services/visual-editor.service";
import { modelRouterService } from "./services/model-router.service";
import { selfTestingService } from "./services/self-testing.service";
import { imageImportService } from "./services/image-import.service";
import { authDbTemplatesService } from "./services/auth-db-templates.service";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(securityHeaders);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
    limit: "10mb",
  }),
);

app.use(express.urlencoded({ extended: false, limit: "10mb" }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  logger.info(`[${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    logger.error("Internal Server Error", { status, path: _req.path }, err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  
  // In production (desktop app), bind to localhost only for security
  // In development, bind to 0.0.0.0 for external access
  const host = process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0";
  
  httpServer.listen(port, host, () => {
    log(`serving on ${host}:${port}`);
  });

  const shutdown = () => {
    log("Shutting down gracefully...");

    const destroyables = [
      { name: "HealthAlerts", svc: healthAlertsService },
      { name: "PerformanceProfiler", svc: performanceProfilerService },
      { name: "LLMCache", svc: llmCacheService },
      { name: "LocalEmbedding", svc: localEmbeddingService },
      { name: "QuantizationDetector", svc: quantizationDetectorService },
      { name: "SpeculativeDecoding", svc: speculativeDecodingService },
      { name: "RuntimeFeedback", svc: runtimeFeedbackService },
      { name: "ModelProvider", svc: modelProviderService },
      { name: "SmartContext", svc: smartContextService },
      { name: "SemanticCodeSearch", svc: semanticCodeSearchService },
      { name: "BuildMode", svc: buildModeService },
      { name: "DesignMode", svc: designModeService },
      { name: "FeedbackLoop", svc: feedbackLoopService },
      { name: "MultiStepReasoning", svc: multiStepReasoningService },
      { name: "PatternLibrary", svc: patternLibraryService },
      { name: "SmartRetry", svc: smartRetryService },
      { name: "UserPreferenceLearning", svc: userPreferenceLearningService },
      { name: "ValidationPipeline", svc: validationPipelineService },
      { name: "DiscussionMode", svc: discussionModeService },
      { name: "VisualEditor", svc: visualEditorService },
      { name: "ModelRouter", svc: modelRouterService },
      { name: "SelfTesting", svc: selfTestingService },
      { name: "ImageImport", svc: imageImportService },
      { name: "AuthDbTemplates", svc: authDbTemplatesService },
    ];

    for (const { name, svc } of destroyables) {
      try {
        if (svc && typeof (svc as any).destroy === "function") {
          (svc as any).destroy();
          log(`${name} destroyed`);
        }
      } catch (e) {
        log(`Failed to destroy ${name}: ${e}`);
      }
    }

    httpServer.close(() => {
      log("Server closed");
      process.exit(0);
    });
    setTimeout(() => {
      log("Forcing shutdown");
      process.exit(1);
    }, 5000);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
})();
