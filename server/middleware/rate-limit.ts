import { Request, Response, NextFunction } from "express";
import logger from "../lib/logger";

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}

const stores: Map<string, RateLimitStore> = new Map();

function cleanupStore(store: RateLimitStore, now: number): void {
  for (const key of Object.keys(store)) {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  }
}

export function createRateLimiter(name: string, options: RateLimitOptions) {
  const {
    windowMs,
    maxRequests,
    message = "Too many requests, please try again later.",
    keyGenerator = (req) => req.ip || "unknown",
  } = options;

  if (!stores.has(name)) {
    stores.set(name, {});
  }

  const store = stores.get(name)!;

  setInterval(() => {
    cleanupStore(store, Date.now());
  }, windowMs);

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator(req);
    const now = Date.now();

    if (!store[key] || store[key].resetTime < now) {
      store[key] = {
        count: 1,
        resetTime: now + windowMs,
      };
      return next();
    }

    store[key].count++;

    if (store[key].count > maxRequests) {
      const retryAfter = Math.ceil((store[key].resetTime - now) / 1000);
      
      logger.warn("Rate limit exceeded", {
        ip: key,
        limiter: name,
        count: store[key].count,
        maxRequests,
      });

      res.set("Retry-After", String(retryAfter));
      res.set("X-RateLimit-Limit", String(maxRequests));
      res.set("X-RateLimit-Remaining", "0");
      res.set("X-RateLimit-Reset", String(Math.ceil(store[key].resetTime / 1000)));

      return res.status(429).json({
        error: message,
        retryAfter,
      });
    }

    res.set("X-RateLimit-Limit", String(maxRequests));
    res.set("X-RateLimit-Remaining", String(maxRequests - store[key].count));
    res.set("X-RateLimit-Reset", String(Math.ceil(store[key].resetTime / 1000)));

    next();
  };
}

export const llmRateLimiter = createRateLimiter("llm", {
  windowMs: 60 * 1000,
  maxRequests: 10,
  message: "Too many LLM requests. Please wait before trying again.",
});

export const apiRateLimiter = createRateLimiter("api", {
  windowMs: 60 * 1000,
  maxRequests: 100,
  message: "Too many API requests. Please slow down.",
});

export const generationRateLimiter = createRateLimiter("generation", {
  windowMs: 60 * 1000,
  maxRequests: 5,
  message: "Too many generation requests. Please wait before generating more code.",
});
