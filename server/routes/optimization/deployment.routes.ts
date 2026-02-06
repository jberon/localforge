import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { deploymentService } from "../../services/deployment.service";
import { z } from "zod";
import logger from "../../lib/logger";

export function registerDeploymentRoutes(router: Router): void {
  router.get("/deployment/platforms", asyncHandler((_req, res) => {
    const platforms = deploymentService.getPlatforms();
    res.json(platforms);
  }));

  const deploymentPlatformSchema = z.enum(["vercel", "netlify", "railway", "render", "replit"]);
  const frameworkSchema = z.enum(["react", "next", "vite", "express", "static", "custom"]);

  const projectDeploymentInfoSchema = z.object({
    name: z.string().min(1, "Project name is required"),
    framework: frameworkSchema,
    hasBackend: z.boolean(),
    hasDatabase: z.boolean(),
    entryPoint: z.string().min(1, "Entry point is required"),
    buildCommand: z.string().min(1, "Build command is required"),
    outputDir: z.string().min(1, "Output directory is required"),
    envVars: z.array(z.string()).default([])
  });

  const packageRequestSchema = z.object({
    projectId: z.number().int().positive("Project ID must be a positive integer"),
    platform: deploymentPlatformSchema,
    projectInfo: projectDeploymentInfoSchema
  });

  const deployRequestSchema = z.object({
    projectId: z.number().int().positive("Project ID must be a positive integer"),
    platform: deploymentPlatformSchema,
    packageId: z.string().min(1, "Package ID is required")
  });

  router.post("/deployment/recommend", asyncHandler((req, res) => {
    const result = projectDeploymentInfoSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: "Invalid request", details: result.error.flatten() });
    }
    const projectInfo = result.data;
    const recommended = deploymentService.getRecommendedPlatform(projectInfo);
    const platform = deploymentService.getPlatform(recommended);
    res.json({ recommended, platform });
  }));

  router.post("/deployment/package", asyncHandler((req, res) => {
    const result = packageRequestSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: "Invalid request", details: result.error.flatten() });
    }
    const { projectId, platform, projectInfo } = result.data;
    const pkg = deploymentService.generatePackage(projectId, platform, projectInfo);
    res.json(pkg);
  }));

  router.get("/deployment/packages/:packageId", asyncHandler((req, res) => {
    const pkg = deploymentService.getPackage(req.params.packageId as string);
    if (!pkg) {
      return res.status(404).json({ error: "Package not found" });
    }
    res.json(pkg);
  }));

  router.get("/deployment/projects/:projectId/packages", asyncHandler((req, res) => {
    const projectId = parseInt(req.params.projectId as string);
    const packages = deploymentService.getProjectPackages(projectId);
    res.json(packages);
  }));

  router.post("/deployment/deploy", asyncHandler((req, res) => {
    try {
      const result = deployRequestSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: "Invalid request", details: result.error.flatten() });
      }
      const { projectId, platform, packageId } = result.data;
      const deployment = deploymentService.startDeployment(projectId, platform, packageId);
      res.json(deployment);
    } catch (error: any) {
      if (error?.message?.includes("not found") || error?.message?.includes("required") || error?.message?.includes("mismatch")) {
        return res.status(400).json({ error: error.message });
      }
      logger.error("Failed to start deployment", { error });
      res.status(500).json({ error: "Failed to start deployment" });
    }
  }));

  router.get("/deployment/deployments/:deploymentId", asyncHandler((req, res) => {
    const deployment = deploymentService.getDeployment(req.params.deploymentId as string);
    if (!deployment) {
      return res.status(404).json({ error: "Deployment not found" });
    }
    res.json(deployment);
  }));

  router.get("/deployment/projects/:projectId/deployments", asyncHandler((req, res) => {
    const projectId = parseInt(req.params.projectId as string);
    const deployments = deploymentService.getProjectDeployments(projectId);
    res.json(deployments);
  }));

  router.get("/deployment/stats", asyncHandler((_req, res) => {
    const stats = deploymentService.getStats();
    res.json(stats);
  }));
}
