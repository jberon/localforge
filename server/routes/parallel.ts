import { Router, Request, Response } from "express";
import { modelPoolManager } from "../services/model-pool-manager.service";
import { parallelPipelineService } from "../services/parallel-pipeline.service";

const router = Router();

router.get("/pool/discover", async (_req: Request, res: Response) => {
  try {
    const models = await modelPoolManager.discoverModels();
    const result: Record<string, unknown[]> = {};
    for (const [endpoint, modelList] of Array.from(models.entries())) {
      result[endpoint] = modelList;
    }
    res.json({ success: true, models: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Discovery failed",
    });
  }
});

router.get("/pool/stats", (_req: Request, res: Response) => {
  res.json(modelPoolManager.getStats());
});

router.get("/pool/slots", (_req: Request, res: Response) => {
  res.json(modelPoolManager.getSlots());
});

router.post("/pool/configure", (req: Request, res: Response) => {
  const { endpoints, maxSlotsPerModel, roleAssignments } = req.body;

  if (endpoints && Array.isArray(endpoints)) {
    modelPoolManager.configure({ endpoints });
  }
  if (typeof maxSlotsPerModel === "number") {
    modelPoolManager.setMaxSlotsPerModel(maxSlotsPerModel);
  }
  if (roleAssignments && typeof roleAssignments === "object") {
    for (const [model, role] of Object.entries(roleAssignments)) {
      if (["planner", "builder", "reviewer", "any"].includes(role as string)) {
        modelPoolManager.setRoleAssignment(model, role as "planner" | "builder" | "reviewer" | "any");
      }
    }
  }

  res.json({ success: true, stats: modelPoolManager.getStats() });
});

router.post("/pool/start-discovery", (req: Request, res: Response) => {
  const { intervalMs } = req.body;
  modelPoolManager.startDiscovery(intervalMs);
  res.json({ success: true, message: "Discovery started" });
});

router.post("/pool/stop-discovery", (_req: Request, res: Response) => {
  modelPoolManager.stopDiscovery();
  res.json({ success: true, message: "Discovery stopped" });
});

router.post("/pool/role", (req: Request, res: Response) => {
  const { model, role } = req.body;
  if (!model || !role) {
    return res.status(400).json({ error: "model and role are required" });
  }
  if (!["planner", "builder", "reviewer", "any"].includes(role)) {
    return res.status(400).json({ error: "role must be planner, builder, reviewer, or any" });
  }
  modelPoolManager.setRoleAssignment(model, role);
  res.json({ success: true });
});

router.get("/pipeline/config", (_req: Request, res: Response) => {
  res.json(parallelPipelineService.getConfig());
});

router.post("/pipeline/configure", (req: Request, res: Response) => {
  const config = req.body;
  parallelPipelineService.configure(config);
  res.json({ success: true, config: parallelPipelineService.getConfig() });
});

router.get("/pipeline/state", (_req: Request, res: Response) => {
  res.json(parallelPipelineService.getExecutionState());
});

export default router;
