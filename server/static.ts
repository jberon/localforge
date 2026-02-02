import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export function serveStatic(app: Express) {
  // Get the directory of this file at runtime
  // Works in both ESM and CJS bundled contexts
  let baseDir: string;
  
  if (typeof __dirname !== 'undefined') {
    // CommonJS context (bundled with esbuild)
    baseDir = __dirname;
  } else {
    // ESM context
    baseDir = path.dirname(fileURLToPath(import.meta.url));
  }
  
  // In bundled mode, the server is at dist/index.cjs and public is at dist/public
  // We need to find the public folder relative to the bundle location
  let distPath = path.resolve(baseDir, "public");
  
  // If not found, try looking in the same directory as the entry point
  if (!fs.existsSync(distPath)) {
    // Try process.cwd() based paths for Electron
    const cwdPath = path.resolve(process.cwd(), "dist", "public");
    if (fs.existsSync(cwdPath)) {
      distPath = cwdPath;
    }
  }
  
  // Also try relative to the main module for Electron packaged apps
  const electronProcess = process as NodeJS.Process & { resourcesPath?: string };
  if (!fs.existsSync(distPath) && electronProcess.resourcesPath) {
    const resourcePath = path.resolve(electronProcess.resourcesPath, "dist", "public");
    if (fs.existsSync(resourcePath)) {
      distPath = resourcePath;
    }
  }
  
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }
  
  console.log(`[static] Serving static files from: ${distPath}`);

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
