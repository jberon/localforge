import { Router, Request, Response } from "express";
import { localProjectBuilder, ProjectFile } from "../services/local-project-builder.service";
import { projectTemplateService } from "../services/project-template.service";
import { storage } from "../storage";
import { logger } from "../lib/logger";
import type { GeneratedFile } from "@shared/schema";

const router = Router();

router.post("/:projectId/build", async (req: Request, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
    if (!projectId) {
      return res.status(400).json({ error: "Invalid project ID" });
    }

    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const projectFiles = project.generatedFiles;
    if (!projectFiles || projectFiles.length === 0) {
      return res.status(400).json({ error: "No files found for this project" });
    }

    const files: ProjectFile[] = projectFiles.map((f: GeneratedFile) => ({
      path: f.path,
      content: f.content,
    }));

    const scaffoldedFiles = projectTemplateService.generateProjectScaffold(
      project.name,
      files
    );

    logger.info("Starting local build", { 
      projectId, 
      projectName: project.name, 
      fileCount: scaffoldedFiles.length 
    });

    const { port, projectPath } = await localProjectBuilder.buildAndRun(
      projectId,
      project.name,
      scaffoldedFiles
    );

    res.json({
      success: true,
      projectId,
      projectName: project.name,
      port,
      projectPath,
      url: `http://localhost:${port}`,
    });
  } catch (error: any) {
    logger.error("Local build failed", { projectId: req.params.projectId }, error);
    const projectId = String(req.params.projectId);
    res.status(500).json({ 
      error: "Build failed", 
      details: error.message,
      logs: localProjectBuilder.getStatus(projectId)?.logs || [],
    });
  }
});

router.get("/:projectId/build-status", async (req: Request, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
    if (!projectId) {
      return res.status(400).json({ error: "Invalid project ID" });
    }

    const status = localProjectBuilder.getStatus(projectId);
    if (!status) {
      return res.json({ 
        projectId, 
        status: "idle", 
        logs: [] 
      });
    }

    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/:projectId/stop-build", async (req: Request, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
    if (!projectId) {
      return res.status(400).json({ error: "Invalid project ID" });
    }

    await localProjectBuilder.stopProject(projectId);
    
    res.json({ 
      success: true, 
      projectId, 
      message: "Build stopped" 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/:projectId/build-logs", async (req: Request, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
    if (!projectId) {
      return res.status(400).json({ error: "Invalid project ID" });
    }

    const status = localProjectBuilder.getStatus(projectId);
    res.json({ 
      projectId, 
      logs: status?.logs || [] 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/running", async (_req: Request, res: Response) => {
  try {
    const running = localProjectBuilder.getAllRunningProjects();
    res.json({ projects: running });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/:projectId/build-stream", async (req: Request, res: Response) => {
  const projectId = String(req.params.projectId);
  if (!projectId) {
    return res.status(400).json({ error: "Invalid project ID" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let closed = false;

  const sendEvent = (event: string, data: any) => {
    if (!closed) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  const cleanup = () => {
    closed = true;
    localProjectBuilder.off("log", onLog);
    localProjectBuilder.off("statusUpdate", onStatus);
    localProjectBuilder.off("serverReady", onReady);
  };

  const onLog = ({ projectId: logProjectId, message }: { projectId: string; message: string }) => {
    if (logProjectId === projectId) {
      sendEvent("log", { message });
    }
  };

  const onStatus = ({ projectId: statusProjectId, status, port, error }: any) => {
    if (statusProjectId === projectId) {
      sendEvent("status", { status, port, error });
    }
  };

  const onReady = ({ projectId: readyProjectId, port }: { projectId: string; port: number }) => {
    if (readyProjectId === projectId) {
      sendEvent("ready", { port, url: `http://localhost:${port}` });
    }
  };

  localProjectBuilder.on("log", onLog);
  localProjectBuilder.on("statusUpdate", onStatus);
  localProjectBuilder.on("serverReady", onReady);

  req.on("close", cleanup);

  const project = await storage.getProject(projectId);
  if (!project) {
    sendEvent("error", { message: "Project not found" });
    cleanup();
    res.end();
    return;
  }

  const projectFiles = project.generatedFiles;
  if (!projectFiles || projectFiles.length === 0) {
    sendEvent("error", { message: "No files found for this project" });
    cleanup();
    res.end();
    return;
  }

  const files: ProjectFile[] = projectFiles.map((f: GeneratedFile) => ({
    path: f.path,
    content: f.content,
  }));

  const scaffoldedFiles = projectTemplateService.generateProjectScaffold(
    project.name,
    files
  );

  sendEvent("start", { fileCount: scaffoldedFiles.length });

  try {
    const { port, projectPath } = await localProjectBuilder.buildAndRun(
      projectId,
      project.name,
      scaffoldedFiles
    );

    sendEvent("complete", { port, projectPath, url: `http://localhost:${port}` });
    cleanup();
    res.end();
  } catch (error: any) {
    sendEvent("error", { message: error.message });
    cleanup();
    res.end();
  }
});

export default router;
