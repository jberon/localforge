import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler";
import { bundleOptimizerService } from "../../services/bundle-optimizer.service";
import { testCoverageService } from "../../services/test-coverage.service";
import { accessibilityCheckerService } from "../../services/accessibility-checker.service";
import { codeDeduplicationService } from "../../services/code-deduplication.service";
import { apiContractValidationService } from "../../services/api-contract-validation.service";
import { importOptimizerService } from "../../services/import-optimizer.service";
import { dependencyHealthService } from "../../services/dependency-health.service";

const filesSchema = z.object({
  files: z.array(z.any()),
});

const dependenciesSchema = z.object({
  dependencies: z.array(z.any()),
});

const coverageTemplateSchema = z.object({
  functionName: z.string(),
  isAsync: z.boolean().optional(),
  isComponent: z.boolean().optional(),
  importPath: z.string(),
});

const checkFileSchema = z.object({
  content: z.string(),
  filePath: z.string(),
});

const packageJsonSchema = z.object({
  packageJson: z.any().optional(),
});

export function registerAnalysisRoutes(router: Router): void {
  router.post("/bundle/analyze", asyncHandler(async (req, res) => {
    const parsed = filesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { files } = parsed.data;
    const result = await bundleOptimizerService.analyzeBundle(files);
    res.json(result);
  }));

  router.post("/bundle/size-breakdown", asyncHandler((req, res) => {
    const parsed = filesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { files } = parsed.data;
    const breakdown = bundleOptimizerService.getSizeBreakdown(files);
    res.json(breakdown);
  }));

  router.post("/bundle/estimate-size", asyncHandler((req, res) => {
    const parsed = dependenciesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { dependencies } = parsed.data;
    const estimatedSize = bundleOptimizerService.estimateBundleSize(dependencies);
    res.json({ estimatedSize, estimatedKB: Math.round(estimatedSize / 1024) });
  }));

  router.post("/coverage/analyze", asyncHandler(async (req, res) => {
    const parsed = filesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { files } = parsed.data;
    const result = await testCoverageService.analyzeCoverage(files);
    res.json(result);
  }));

  router.post("/coverage/generate-template", asyncHandler((req, res) => {
    const parsed = coverageTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { functionName, isAsync, isComponent, importPath } = parsed.data;
    const template = testCoverageService.generateTestTemplate(
      functionName,
      isAsync || false,
      isComponent || false,
      importPath
    );
    res.json({ template });
  }));

  router.post("/accessibility/check", asyncHandler(async (req, res) => {
    const parsed = filesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { files } = parsed.data;
    const result = await accessibilityCheckerService.checkAccessibility(files);
    res.json(result);
  }));

  router.post("/accessibility/check-file", asyncHandler((req, res) => {
    const parsed = checkFileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { content, filePath } = parsed.data;
    const issues = accessibilityCheckerService.checkSingleFile(content, filePath);
    res.json({ issues });
  }));

  router.post("/deduplication/analyze", asyncHandler(async (req, res) => {
    const parsed = filesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { files } = parsed.data;
    const result = await codeDeduplicationService.findDuplicates(files);
    res.json(result);
  }));

  router.post("/contracts/validate", asyncHandler(async (req, res) => {
    const parsed = filesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { files } = parsed.data;
    const result = await apiContractValidationService.validateContracts(files);
    res.json(result);
  }));

  router.post("/imports/analyze", asyncHandler(async (req, res) => {
    const parsed = filesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { files } = parsed.data;
    const result = await importOptimizerService.optimizeImports(files);
    res.json(result);
  }));

  router.post("/imports/optimize", asyncHandler(async (req, res) => {
    const parsed = filesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { files } = parsed.data;
    const result = await importOptimizerService.optimizeImports(files);
    res.json(result);
  }));

  router.post("/dependency-health/analyze", asyncHandler(async (req, res) => {
    const parsed = packageJsonSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { packageJson } = parsed.data;
    const report = await dependencyHealthService.analyzePackageJson(packageJson);
    res.json(report);
  }));
}
