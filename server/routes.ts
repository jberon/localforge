import type { Express } from "express";
import { createServer, type Server } from "http";

import projectRoutes from "./routes/projects";
import fileRoutes from "./routes/files";
import versionRoutes from "./routes/versions";
import packageRoutes from "./routes/package";
import llmRoutes from "./routes/llm";
import analyticsRoutes from "./routes/analytics";
import generationRoutes from "./routes/generation";
import dreamTeamRoutes from "./routes/dream-team";
import healthRoutes from "./routes/health";
import databaseRoutes from "./routes/database";
import optimizationRoutes from "./routes/optimization";
import localBuildRoutes from "./routes/local-build";
import intelligenceRoutes from "./routes/intelligence";
import runtimeRoutes from "./routes/runtime";
import discussionRoutes from "./routes/discussion";
import { apiRateLimiter } from "./middleware/rate-limit";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.use("/api/projects", apiRateLimiter, projectRoutes);
  
  app.use("/api/projects", fileRoutes);
  
  app.use("/api/projects", versionRoutes);
  
  app.use("/api/projects", packageRoutes);
  
  app.use("/api/projects", generationRoutes);
  
  app.use("/api/llm", apiRateLimiter, llmRoutes);
  
  app.use("/api/analytics", apiRateLimiter, analyticsRoutes);
  
  app.use("/api/dream-team", apiRateLimiter, dreamTeamRoutes);
  
  app.use("/api/health", healthRoutes);
  
  app.use("/api/database", apiRateLimiter, databaseRoutes);
  
  app.use("/api/optimization", apiRateLimiter, optimizationRoutes);
  
  app.use("/api/local-build", apiRateLimiter, localBuildRoutes);
  
  app.use("/api/intelligence", apiRateLimiter, intelligenceRoutes);
  
  app.use("/api/runtime", apiRateLimiter, runtimeRoutes);
  
  app.use("/api/discussion", apiRateLimiter, discussionRoutes);

  return httpServer;
}
