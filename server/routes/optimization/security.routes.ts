import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { securityScanningService } from "../../services/security-scanning.service";

export function registerSecurityRoutes(router: Router): void {
  router.post("/security/scan", asyncHandler(async (req, res) => {
    const { files } = req.body;
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: "files array is required" });
    }

    const result = await securityScanningService.scanFiles(files);
    res.json(result);
  }));

  router.post("/security/scan-file", asyncHandler((req, res) => {
    const { content, filePath } = req.body;
    if (!content || !filePath) {
      return res.status(400).json({ error: "content and filePath are required" });
    }

    const issues = securityScanningService.scanSingleFile(content, filePath);
    res.json({ issues });
  }));
}
