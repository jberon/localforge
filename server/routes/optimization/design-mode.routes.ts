import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler";
import { designModeService, type DesignKeyword } from "../../services/design-mode.service";

const designModeToggleSchema = z.object({
  enabled: z.boolean(),
});

const designModeInferSchema = z.object({
  prompt: z.string(),
});

const designModeMockupSchema = z.object({
  projectId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  style: z.any().optional(),
  templateId: z.string().optional(),
});

const designModeComponentSchema = z.object({}).passthrough();

const designModeLayoutSchema = z.object({}).passthrough();

const designModeColorSchemeSchema = z.object({}).passthrough();

const detectKeywordsSchema = z.object({
  prompt: z.string(),
});

const enhancePromptSchema = z.object({
  prompt: z.string(),
  keywords: z.array(z.string()).optional(),
});

const keywordStylesSchema = z.object({
  keywords: z.array(z.string()),
});

export function registerDesignModeRoutes(router: Router): void {
  router.get("/design-mode", asyncHandler((_req, res) => {
    const stats = designModeService.getStats();
    res.json(stats);
  }));

  router.put("/design-mode", asyncHandler((req, res) => {
    const parsed = designModeToggleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { enabled } = parsed.data;
    designModeService.setEnabled(enabled);
    res.json({ success: true, enabled });
  }));

  router.get("/design-mode/color-schemes", asyncHandler((_req, res) => {
    const schemes = designModeService.getColorSchemes();
    res.json(schemes);
  }));

  router.get("/design-mode/templates", asyncHandler((req, res) => {
    const category = req.query.category as "landing" | "dashboard" | "form" | "blog" | "ecommerce" | "portfolio" | "saas" | undefined;
    const templates = designModeService.getTemplates(category);
    res.json(templates);
  }));

  router.get("/design-mode/templates/:templateId", asyncHandler((req, res) => {
    const template = designModeService.getTemplate(req.params.templateId as string);
    res.json(template || { error: "Template not found" });
  }));

  router.post("/design-mode/infer", asyncHandler((req, res) => {
    const parsed = designModeInferSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { prompt } = parsed.data;
    const result = designModeService.inferDesignFromPrompt(prompt);
    res.json(result);
  }));

  router.post("/design-mode/mockups", asyncHandler((req, res) => {
    const parsed = designModeMockupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { projectId, name, description, style, templateId } = parsed.data;
    const mockup = designModeService.createMockup(projectId, name, description || "", style, templateId);
    res.status(201).json(mockup);
  }));

  router.get("/design-mode/mockups/:mockupId", asyncHandler((req, res) => {
    const mockup = designModeService.getMockup(req.params.mockupId as string);
    res.json(mockup || { error: "Mockup not found" });
  }));

  router.get("/design-mode/projects/:projectId/mockups", asyncHandler((req, res) => {
    const mockups = designModeService.getProjectMockups(req.params.projectId as string);
    res.json(mockups);
  }));

  router.post("/design-mode/mockups/:mockupId/components", asyncHandler((req, res) => {
    const parsed = designModeComponentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const component = designModeService.addComponent(req.params.mockupId as string, parsed.data as any);
    res.json(component || { error: "Failed to add component" });
  }));

  router.put("/design-mode/mockups/:mockupId/layout", asyncHandler((req, res) => {
    const parsed = designModeLayoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const success = designModeService.updateLayout(req.params.mockupId as string, parsed.data);
    res.json({ success });
  }));

  router.put("/design-mode/mockups/:mockupId/colors", asyncHandler((req, res) => {
    const parsed = designModeColorSchemeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const success = designModeService.updateColorScheme(req.params.mockupId as string, parsed.data);
    res.json({ success });
  }));

  router.post("/design-mode/mockups/:mockupId/approve", asyncHandler((_req, res) => {
    const success = designModeService.approveMockup(_req.params.mockupId as string);
    res.json({ success });
  }));

  router.post("/design-mode/mockups/:mockupId/generate", asyncHandler((req, res) => {
    const code = designModeService.generateCodeFromMockup(req.params.mockupId as string);
    res.json({ code: code || null });
  }));

  router.get("/design-mode/keywords", asyncHandler((_req, res) => {
    const keywords = designModeService.getDesignKeywords();
    res.json(keywords);
  }));

  router.get("/design-mode/keywords/:keyword", asyncHandler((req, res) => {
    const keyword = designModeService.getDesignKeyword(req.params.keyword as DesignKeyword);
    if (!keyword) {
      return res.status(404).json({ error: "Keyword not found" });
    }
    res.json(keyword);
  }));

  router.post("/design-mode/detect-keywords", asyncHandler((req, res) => {
    const parsed = detectKeywordsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { prompt } = parsed.data;
    const keywords = designModeService.detectKeywordsInPrompt(prompt);
    const definitions = keywords.map(kw => designModeService.getDesignKeyword(kw)).filter(Boolean);
    res.json({ keywords, definitions });
  }));

  router.post("/design-mode/enhance-prompt", asyncHandler((req, res) => {
    const parsed = enhancePromptSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { prompt, keywords } = parsed.data;
    const enhanced = designModeService.enhancePromptWithKeywords(prompt, keywords as DesignKeyword[] | undefined);
    const detected = designModeService.detectKeywordsInPrompt(prompt);
    res.json({ enhanced, detectedKeywords: detected });
  }));

  router.post("/design-mode/keyword-styles", asyncHandler((req, res) => {
    const parsed = keywordStylesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    const { keywords } = parsed.data;
    const cssProperties = designModeService.getKeywordCSSProperties(keywords as DesignKeyword[]);
    const tailwindClasses = designModeService.getKeywordTailwindClasses(keywords as DesignKeyword[]);
    res.json({ cssProperties, tailwindClasses });
  }));
}
