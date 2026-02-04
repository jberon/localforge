import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { EventEmitter } from "events";
import { logger } from "../lib/logger";

export interface ProjectFile {
  path: string;
  content: string;
}

export interface BuildStatus {
  projectId: string;
  projectName: string;
  status: "idle" | "writing" | "installing" | "building" | "running" | "error" | "stopped";
  port?: number;
  logs: string[];
  error?: string;
  startTime?: number;
  pid?: number;
}

interface RunningProject {
  projectId: string;
  projectName: string;
  process: ChildProcess;
  port: number;
  logs: string[];
  status: BuildStatus["status"];
  projectPath: string;
}

class LocalProjectBuilderService extends EventEmitter {
  private runningProjects: Map<string, RunningProject> = new Map();
  private basePort = 3001;
  private usedPorts: Set<number> = new Set();
  private localForgeDir: string;

  constructor() {
    super();
    this.localForgeDir = path.join(os.homedir(), "LocalForge", "projects");
    this.ensureDirectoryExists(this.localForgeDir);
    logger.info("LocalProjectBuilder initialized", { projectsDir: this.localForgeDir });
  }

  private ensureDirectoryExists(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private getNextAvailablePort(): number {
    let port = this.basePort;
    while (this.usedPorts.has(port)) {
      port++;
    }
    this.usedPorts.add(port);
    return port;
  }

  private releasePort(port: number): void {
    this.usedPorts.delete(port);
  }

  private sanitizeProjectName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "project";
  }

  private sanitizeFilePath(filePath: string, projectPath: string): string | null {
    const normalizedPath = filePath
      .replace(/\\/g, "/")
      .replace(/^\.\//, "")
      .replace(/^\//, "");
    
    if (normalizedPath.includes("..") || path.isAbsolute(filePath)) {
      logger.warn("Rejected unsafe file path", { filePath });
      return null;
    }
    
    const fullPath = path.join(projectPath, normalizedPath);
    const resolvedPath = path.resolve(fullPath);
    const resolvedProjectPath = path.resolve(projectPath);
    
    if (!resolvedPath.startsWith(resolvedProjectPath + path.sep) && resolvedPath !== resolvedProjectPath) {
      logger.warn("Path traversal attempt blocked", { filePath, resolvedPath, projectPath });
      return null;
    }
    
    return resolvedPath;
  }

  getProjectPath(projectId: string, projectName: string): string {
    const sanitized = this.sanitizeProjectName(projectName);
    const shortId = projectId.slice(0, 8);
    return path.join(this.localForgeDir, `${sanitized}-${shortId}`);
  }

  async writeProjectFiles(
    projectId: string,
    projectName: string,
    files: ProjectFile[]
  ): Promise<string> {
    const projectPath = this.getProjectPath(projectId, projectName);
    
    this.updateStatus(projectId, projectName, "writing", undefined, ["Creating project directory..."]);

    this.ensureDirectoryExists(projectPath);

    for (const file of files) {
      const safePath = this.sanitizeFilePath(file.path, projectPath);
      if (!safePath) {
        this.appendLog(projectId, `Skipped unsafe path: ${file.path}`);
        continue;
      }
      
      const fileDir = path.dirname(safePath);
      this.ensureDirectoryExists(fileDir);
      fs.writeFileSync(safePath, file.content, "utf-8");
      this.appendLog(projectId, `Written: ${file.path}`);
    }

    this.appendLog(projectId, `Project files written to: ${projectPath}`);
    logger.info("Project files written", { projectId, projectPath, fileCount: files.length });

    return projectPath;
  }

  async installDependencies(projectId: string, projectPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const running = this.runningProjects.get(projectId);
      if (running) {
        running.status = "installing";
      }
      this.appendLog(projectId, "Installing dependencies (npm install)...");

      const npmInstall = spawn("npm", ["install"], {
        cwd: projectPath,
        shell: true,
        env: { ...process.env, NODE_ENV: "development" },
      });

      npmInstall.stdout.on("data", (data) => {
        this.appendLog(projectId, data.toString().trim());
      });

      npmInstall.stderr.on("data", (data) => {
        const msg = data.toString().trim();
        if (msg && !msg.includes("npm warn")) {
          this.appendLog(projectId, msg);
        }
      });

      npmInstall.on("close", (code) => {
        if (code === 0) {
          this.appendLog(projectId, "Dependencies installed successfully");
          resolve();
        } else {
          const error = `npm install failed with code ${code}`;
          this.appendLog(projectId, error);
          reject(new Error(error));
        }
      });

      npmInstall.on("error", (err) => {
        this.appendLog(projectId, `npm install error: ${err.message}`);
        reject(err);
      });
    });
  }

  async startDevServer(
    projectId: string,
    projectName: string,
    projectPath: string
  ): Promise<number> {
    const existingProject = this.runningProjects.get(projectId);
    if (existingProject) {
      await this.stopProject(projectId);
    }

    const port = this.getNextAvailablePort();
    this.appendLog(projectId, `Starting dev server on port ${port}...`);

    const devServer = spawn("npm", ["run", "dev", "--", "--port", port.toString(), "--host"], {
      cwd: projectPath,
      shell: true,
      env: { ...process.env, NODE_ENV: "development", PORT: port.toString() },
    });

    const runningProject: RunningProject = {
      projectId,
      projectName,
      process: devServer,
      port,
      logs: this.runningProjects.get(projectId)?.logs || [],
      status: "building",
      projectPath,
    };

    this.runningProjects.set(projectId, runningProject);

    devServer.stdout.on("data", (data) => {
      const output = data.toString();
      this.appendLog(projectId, output.trim());
      
      if (output.includes("Local:") || output.includes("ready in") || output.includes("VITE")) {
        runningProject.status = "running";
        this.appendLog(projectId, `Dev server ready at http://localhost:${port}`);
        this.emit("serverReady", { projectId, port });
      }
    });

    devServer.stderr.on("data", (data) => {
      this.appendLog(projectId, data.toString().trim());
    });

    devServer.on("close", (code) => {
      if (runningProject.status !== "stopped") {
        runningProject.status = code === 0 ? "stopped" : "error";
        this.appendLog(projectId, `Dev server exited with code ${code}`);
      }
      this.releasePort(port);
    });

    devServer.on("error", (err) => {
      runningProject.status = "error";
      this.appendLog(projectId, `Dev server error: ${err.message}`);
      this.releasePort(port);
    });

    return port;
  }

  async buildAndRun(
    projectId: string,
    projectName: string,
    files: ProjectFile[]
  ): Promise<{ port: number; projectPath: string }> {
    try {
      const projectPath = await this.writeProjectFiles(projectId, projectName, files);
      
      const hasPackageJson = files.some((f) => f.path === "package.json" || f.path === "./package.json");
      if (hasPackageJson) {
        await this.installDependencies(projectId, projectPath);
      }

      const port = await this.startDevServer(projectId, projectName, projectPath);

      return { port, projectPath };
    } catch (error: any) {
      this.updateStatus(projectId, projectName, "error", undefined, undefined, error.message);
      throw error;
    }
  }

  async stopProject(projectId: string): Promise<void> {
    const project = this.runningProjects.get(projectId);
    if (!project) return;

    project.status = "stopped";
    this.appendLog(projectId, "Stopping dev server...");

    if (project.process && !project.process.killed) {
      project.process.kill("SIGTERM");
      
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          if (!project.process.killed) {
            project.process.kill("SIGKILL");
          }
          resolve();
        }, 3000);
      });
    }

    this.releasePort(project.port);
    this.appendLog(projectId, "Dev server stopped");
    logger.info("Project stopped", { projectId, port: project.port });
  }

  getStatus(projectId: string): BuildStatus | null {
    const project = this.runningProjects.get(projectId);
    if (!project) {
      return null;
    }

    return {
      projectId: project.projectId,
      projectName: project.projectName,
      status: project.status,
      port: project.port,
      logs: project.logs.slice(-100),
      pid: project.process?.pid,
    };
  }

  getAllRunningProjects(): BuildStatus[] {
    return Array.from(this.runningProjects.values())
      .filter((p) => p.status === "running" || p.status === "building")
      .map((p) => ({
        projectId: p.projectId,
        projectName: p.projectName,
        status: p.status,
        port: p.port,
        logs: p.logs.slice(-20),
        pid: p.process?.pid,
      }));
  }

  private updateStatus(
    projectId: string,
    projectName: string,
    status: BuildStatus["status"],
    port?: number,
    logs?: string[],
    error?: string
  ): void {
    let project = this.runningProjects.get(projectId);
    if (!project) {
      project = {
        projectId,
        projectName,
        process: null as any,
        port: port || 0,
        logs: logs || [],
        status,
        projectPath: this.getProjectPath(projectId, projectName),
      };
      this.runningProjects.set(projectId, project);
    } else {
      project.status = status;
      if (logs) project.logs = logs;
    }
    
    this.emit("statusUpdate", { projectId, status, port, error });
  }

  private appendLog(projectId: string, message: string): void {
    const project = this.runningProjects.get(projectId);
    if (project) {
      const timestamp = new Date().toLocaleTimeString();
      project.logs.push(`[${timestamp}] ${message}`);
      if (project.logs.length > 500) {
        project.logs = project.logs.slice(-500);
      }
      this.emit("log", { projectId, message });
    }
  }

  async stopAllProjects(): Promise<void> {
    const stopPromises = Array.from(this.runningProjects.keys()).map((id) =>
      this.stopProject(id)
    );
    await Promise.all(stopPromises);
    logger.info("All projects stopped");
  }
}

export const localProjectBuilder = new LocalProjectBuilderService();
