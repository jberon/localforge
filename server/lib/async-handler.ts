import { Request, Response, NextFunction, RequestHandler } from "express";

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<any> | any;

export function asyncHandler(handler: AsyncRouteHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch((error) => {
      next(error);
    });
  };
}
