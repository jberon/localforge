import logger from "./logger";
import { serviceRegistry } from "./service-registry";

let isShuttingDown = false;

export function isShutdownInProgress(): boolean {
  return isShuttingDown;
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
    logger.error("[shutdown] Unhandled rejection:", { reason });
  });
}
