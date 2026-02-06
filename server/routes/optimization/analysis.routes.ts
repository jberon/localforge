import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { bundleOptimizerService } from "../../services/bundle-optimizer.service";
import { testCoverageService } from "../../services/test-coverage.service";
import { accessibilityCheckerService } from "../../services/accessibility-checker.service";
import { codeDeduplicationService } from "../../services/code-deduplication.service";
import { apiContractValidationService } from "../../services/api-contract-validation.service";
import { importOptimizerService } from "../../services/import-optimizer.service";
import { dependencyHealthService } from "../../services/dependency-health.service";

export function registerAnalysisRoutes(router: Router): void {
  router.post("/bundle/analyze", asyncHandler(async (req, res) => {
    const { files } = req.body;
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: "files array is required" });
    }

    const result = await bundleOptimizerService.analyzeBundle(files);
    res.json(result);
  }));

  router.post("/bundle/size-breakdown", asyncHandler((req, res) => {
    const { files } = req.body;
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: "files array is required" });
    }

    const breakdown = bundleOptimizerService.getSizeBreakdown(files);
    res.json(breakdown);
  }));

  router.post("/bundle/estimate-size", asyncHandler((req, res) => {
    const { dependencies } = req.body;
    if (!dependencies || !Array.isArray(dependencies)) {
      return res.status(400).json({ error: "dependencies array is required" });
    }

    const estimatedSize = bundleOptimizerService.estimateBundleSize(dependencies);
    res.json({ estimatedSize, estimatedKB: Math.round(estimatedSize / 1024) });
  }));

  router.post("/coverage/analyze", asyncHandler(async (req, res) => {
    const { files } = req.body;
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: "files array is required" });
    }

    const result = await testCoverageService.analyzeCoverage(files);
    res.json(result);
  }));

  router.post("/coverage/generate-template", asyncHandler((req, res) => {
    const { functionName, isAsync, isComponent, importPath } = req.body;
    if (!functionName || !importPath) {
      return res.status(400).json({ error: "functionName and importPath are required" });
    }

    const template = testCoverageService.generateTestTemplate(
      functionName,
      isAsync || false,
      isComponent || false,
      importPath
    );
    res.json({ template });
  }));

  router.post("/accessibility/check", asyncHandler(async (req, res) => {
    const { files } = req.body;
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: "files array is required" });
    }

    const result = await accessibilityCheckerService.checkAccessibility(files);
    res.json(result);
  }));

  router.post("/accessibility/check-file", asyncHandler((req, res) => {
    const { content, filePath } = req.body;
    if (!content || !filePath) {
      return res.status(400).json({ error: "content and filePath are required" });
    }

    const issues = accessibilityCheckerService.checkSingleFile(content, filePath);
    res.json({ issues });
  }));

  router.post("/deduplication/analyze", asyncHandler(async (req, res) => {
    const { files } = req.body;
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: "files array is required" });
    }

    const result = await codeDeduplicationService.findDuplicates(files);
    res.json(result);
  }));

  router.post("/contracts/validate", asyncHandler(async (req, res) => {
    const { files } = req.body;
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: "files array is required" });
    }

    const result = await apiContractValidationService.validateContracts(files);
    res.json(result);
  }));

  router.post("/imports/analyze", asyncHandler(async (req, res) => {
    const { files } = req.body;
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: "files array is required" });
    }

    const result = await importOptimizerService.optimizeImports(files);
    res.json(result);
  }));

  router.post("/imports/optimize", asyncHandler(async (req, res) => {
    const { files } = req.body;
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: "files array is required" });
    }

    const result = await importOptimizerService.optimizeImports(files);
    res.json(result);
  }));

  router.post("/dependency-health/analyze", asyncHandler(async (req, res) => {
    const { packageJson } = req.body;
    const report = await dependencyHealthService.analyzePackageJson(packageJson);
    res.json(report);
  }));
}
