import { Request, Response, NextFunction } from "express";

export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  
  res.setHeader("X-XSS-Protection", "1; mode=block");
  
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  
  next();
}

export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, "")
    .trim();
}

export function validateContentType(expectedType: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "GET" || req.method === "DELETE" || req.method === "HEAD") {
      return next();
    }
    
    const contentType = req.get("Content-Type");
    if (!contentType || !contentType.includes(expectedType)) {
      return res.status(415).json({
        error: `Unsupported Media Type. Expected ${expectedType}`,
      });
    }
    
    next();
  };
}

export function noCache(req: Request, res: Response, next: NextFunction) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  next();
}
