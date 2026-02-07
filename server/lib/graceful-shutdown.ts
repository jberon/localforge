import logger from "./logger";
import { serviceRegistry } from "./service-registry";
import { llmConnectionPool } from "./llm-connection-pool";

let isShuttingDown = false;
let unhandledRejectionCount = 0;
const MAX_UNHANDLED_REJECTIONS = 10;
const REJECTION_WINDOW_MS = 60000;
let rejectionWindowStart = Date.now();

export function isShutdownInProgress(): boolean {
  return isShuttingDown;
}

export function getUnhandledRejectionCount(): number {
  return unhandledRejectionCount;
}

export interface ShutdownOptions {
  httpServer?: { close(cb: () => void): void };
  pool?: { end(): Promise<void> };
  forceTimeoutMs?: number;
}

export function setupGracefulShutdown(options: ShutdownOptions = {}): void {
  const { httpServer, pool, forceTimeoutMs = 5000 } = options;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`[shutdown] ${signal} received, initiating graceful shutdown`);

    const serviceNames = serviceRegistry.getRegisteredNames();
    logger.info(`[shutdown] Destroying ${serviceNames.length} registered services`);
    serviceRegistry.destroyAll();

    logger.info("[shutdown] Destroying LLM connection pool");
    llmConnectionPool.destroy();

    if (pool) {
      logger.info("[shutdown] Closing database pool");
      try {
        await pool.end();
      } catch (e) {
        logger.error("[shutdown] Failed to close database pool", { error: e });
      }
    }

    if (httpServer) {
      httpServer.close(() => {
        logger.info("[shutdown] Server closed");
        process.exit(0);
      });
      setTimeout(() => {
        logger.info("[shutdown] Forcing shutdown");
        process.exit(1);
      }, forceTimeoutMs);
    } else {
      logger.info("[shutdown] Graceful shutdown complete");
      process.exit(0);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("uncaughtException", (error) => {
    logger.error("[shutdown] Uncaught exception:", { error });
    shutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason) => {
    const now = Date.now();
    if (now - rejectionWindowStart > REJECTION_WINDOW_MS) {
      unhandledRejectionCount = 0;
      rejectionWindowStart = now;
    }
    unhandledRejectionCount++;
    logger.error("[shutdown] Unhandled rejection:", { reason, count: unhandledRejectionCount });

    if (unhandledRejectionCount >= MAX_UNHANDLED_REJECTIONS) {
      logger.error(`[shutdown] ${MAX_UNHANDLED_REJECTIONS} unhandled rejections in ${REJECTION_WINDOW_MS}ms window, initiating shutdown`);
      shutdown("excessive-unhandled-rejections");
    }
  });
}
