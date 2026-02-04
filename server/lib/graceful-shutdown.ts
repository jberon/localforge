const activeRequests: AbortController[] = [];
let isShuttingDown = false;

export function registerRequest(): AbortController {
  const controller = new AbortController();
  activeRequests.push(controller);
  return controller;
}

export function unregisterRequest(controller: AbortController): void {
  const index = activeRequests.indexOf(controller);
  if (index > -1) {
    activeRequests.splice(index, 1);
  }
}

export function isShutdownInProgress(): boolean {
  return isShuttingDown;
}

export function getActiveRequestCount(): number {
  return activeRequests.length;
}

export interface PoolLike {
  end(): Promise<void>;
}

export function setupGracefulShutdown(pool?: PoolLike): void {
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`[shutdown] ${signal} received, initiating graceful shutdown`);
    console.log(`[shutdown] Aborting ${activeRequests.length} active requests`);

    for (const controller of activeRequests) {
      controller.abort();
    }

    const waitForRequests = new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (activeRequests.length === 0) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 5000);
    });

    await waitForRequests;

    if (pool) {
      console.log("[shutdown] Closing database pool");
      await pool.end();
    }

    console.log("[shutdown] Graceful shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("uncaughtException", (error) => {
    console.error("[shutdown] Uncaught exception:", error);
    shutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[shutdown] Unhandled rejection:", reason);
  });
}
