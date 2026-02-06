import { Request, Response, NextFunction, RequestHandler } from "express";
import logger from "./logger";

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<any> | any;

export function asyncHandler(handler: AsyncRouteHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch((error) => {
      logger.error("Route handler error", {
        method: req.method,
        path: req.path,
        error: error instanceof Error ? error.message : String(error),
      });
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    });
  };
}
