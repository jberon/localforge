import { Router } from "express";
import { storage } from "../storage";
import { analyticsStorage } from "../analytics-storage";
import { createLLMClient, LLM_DEFAULTS } from "../llm-client";
import { llmSettingsSchema, analyticsEventTypes } from "@shared/schema";
import type { AnalyticsEventType } from "@shared/schema";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler";
import { logger } from "../lib/logger";

const router = Router();

const trackEventSchema = z.object({
  type: z.enum(analyticsEventTypes),
  projectId: z.string().optional(),
  data: z.record(z.any()).optional(),
});

router.post("/events", asyncHandler(async (req, res) => {
  const parsed = trackEventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid event data", details: parsed.error.errors });
  }
  
  const event = await analyticsStorage.trackEvent(
    parsed.data.type,
    parsed.data.projectId,
    parsed.data.data
  );
  res.json(event);
}));

router.get("/events", asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const type = req.query.type as AnalyticsEventType | undefined;
  
  const events = await analyticsStorage.getEvents(limit, type);
  res.json(events);
}));

const feedbackRequestSchema = z.object({
  projectId: z.string(),
  rating: z.enum(["positive", "negative"]),
  comment: z.string().optional(),
  prompt: z.string(),
  generatedCode: z.string().optional(),
  templateUsed: z.string().optional(),
});

router.post("/feedback", asyncHandler(async (req, res) => {
  const parsed = feedbackRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid feedback data", details: parsed.error.errors });
  }
  
  const feedback = await analyticsStorage.submitFeedback(parsed.data);
  
  await analyticsStorage.trackEvent("feedback_submitted", parsed.data.projectId, {
    rating: parsed.data.rating,
    hasComment: !!parsed.data.comment,
  });
  
  res.json(feedback);
}));

router.get("/feedback", asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const feedbacks = await analyticsStorage.getFeedbacks(limit);
  res.json(feedbacks);
}));

router.get("/overview", asyncHandler(async (req, res) => {
  const overview = await analyticsStorage.getOverview();
  res.json(overview);
}));

router.get("/insights", asyncHandler(async (req, res) => {
  const insights = await analyticsStorage.getActiveInsights();
  res.json(insights);
}));

const generateInsightsSchema = z.object({
  settings: llmSettingsSchema,
});

router.post("/generate-insights", asyncHandler(async (req, res) => {
  const parsed = generateInsightsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
  }

  const { settings } = parsed.data;
  
  const overview = await analyticsStorage.getOverview();
  const recentFeedbacks = await analyticsStorage.getFeedbacks(50);
  const positivePrompts = await analyticsStorage.getPositiveFeedbacks();
  
  const openai = createLLMClient({
    endpoint: settings.endpoint || "http://localhost:1234/v1",
    model: settings.model,
    temperature: LLM_DEFAULTS.temperature.builder,
  });

  const analysisPrompt = `You are an analytics expert. Analyze this app usage data and provide actionable insights.

DATA SUMMARY:
- Total generations: ${overview.totalGenerations}
- Success rate: ${overview.successRate.toFixed(1)}%
- Average generation time: ${(overview.averageGenerationTime / 1000).toFixed(1)}s
- Positive feedback: ${overview.feedbackStats.positive}
- Negative feedback: ${overview.feedbackStats.negative}
- Template usage: ${JSON.stringify(overview.templateUsage)}

RECENT TRENDS (last 7 days):
${overview.recentTrends.map(t => `${t.date}: ${t.generations} generations, ${t.successes} successes`).join('\n')}

SAMPLE POSITIVE FEEDBACK PROMPTS:
${positivePrompts.slice(0, 5).map(f => `- "${f.prompt.substring(0, 100)}..."`).join('\n')}

SAMPLE NEGATIVE FEEDBACK:
${recentFeedbacks.filter(f => f.rating === 'negative').slice(0, 5).map(f => `- "${f.comment || 'No comment'}"`).join('\n')}

Based on this data, provide 3-5 specific, actionable insights. For each insight include:
1. A clear title
2. Description of what the data shows
3. Whether it's actionable (yes/no)
4. Priority (high/medium/low)
5. Type (pattern/recommendation/trend/warning)

Output as JSON array:
[{"title": "...", "description": "...", "actionable": true, "priority": "high", "type": "recommendation"}]`;

  const response = await openai.chat.completions.create({
    model: settings.model || "local-model",
    messages: [
      { role: "system", content: "You are a data analyst. Respond only with valid JSON arrays." },
      { role: "user", content: analysisPrompt },
    ],
    temperature: 0.5,
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content?.trim() || "[]";
  
  let parsedInsights: any[] = [];
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      parsedInsights = JSON.parse(jsonMatch[0]);
    }
  } catch (parseError) {
    logger.error("Failed to parse insights JSON", {}, parseError instanceof Error ? parseError : new Error(String(parseError)));
  }

  const savedInsights = [];
  for (const insight of parsedInsights) {
    if (insight.title && insight.description) {
      const saved = await analyticsStorage.saveInsight({
        type: insight.type || "recommendation",
        title: insight.title,
        description: insight.description,
        actionable: insight.actionable ?? true,
        priority: insight.priority || "medium",
        data: { source: "llm_analysis" },
        generatedAt: Date.now(),
        expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000),
      });
      savedInsights.push(saved);
    }
  }

  res.json({ 
    generated: savedInsights.length,
    insights: savedInsights 
  });
}));

const analyticsQuerySchema = z.object({
  query: z.string().min(1),
  settings: llmSettingsSchema,
});

router.post("/query", asyncHandler(async (req, res) => {
  const parsed = analyticsQuerySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
  }

  const { query, settings } = parsed.data;
  
  const overview = await analyticsStorage.getOverview();
  
  const openai = createLLMClient({
    endpoint: settings.endpoint || "http://localhost:1234/v1",
    model: settings.model,
    temperature: LLM_DEFAULTS.temperature.planner,
  });

  const queryPrompt = `You are an analytics assistant. Answer the user's question about their app generation data.

CURRENT DATA:
- Total generations: ${overview.totalGenerations}
- Success rate: ${overview.successRate.toFixed(1)}%
- Successful: ${overview.successfulGenerations}, Failed: ${overview.failedGenerations}
- Average generation time: ${(overview.averageGenerationTime / 1000).toFixed(1)} seconds
- Template usage: ${JSON.stringify(overview.templateUsage)}

RECENT TRENDS (last 7 days):
${overview.recentTrends.map(t => `${t.date}: ${t.generations} generations, ${t.successes} successful`).join('\n')}

USER QUESTION: "${query}"

Provide a clear, helpful answer based on the data. Be specific with numbers when relevant. Keep the response concise but informative.`;

  const response = await openai.chat.completions.create({
    model: settings.model || "local-model",
    messages: [
      { role: "system", content: "You are a helpful analytics assistant. Give clear, data-driven answers." },
      { role: "user", content: queryPrompt },
    ],
    temperature: 0.3,
    max_tokens: 500,
  });

  const answer = response.choices[0]?.message?.content?.trim() || "I couldn't analyze that question. Try asking about success rates, templates, or trends.";
  
  res.json({ 
    answer,
    data: overview,
    visualization: "number"
  });
}));

router.get("/code-inventory", asyncHandler(async (req, res) => {
  const allProjects = await storage.getProjects();
  
  const detectLanguage = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const extMap: Record<string, string> = {
      'js': 'JavaScript', 'jsx': 'React JSX', 'ts': 'TypeScript', 'tsx': 'React TSX',
      'html': 'HTML', 'css': 'CSS', 'scss': 'SCSS', 'json': 'JSON', 'md': 'Markdown',
      'py': 'Python', 'sql': 'SQL', 'sh': 'Shell', 'yml': 'YAML', 'yaml': 'YAML',
      'env': 'Environment', 'dockerfile': 'Docker',
    };
    return extMap[ext] || 'Other';
  };

  const countLines = (content: string): number => content.split('\n').length;

  const projectInventory = allProjects.map(project => {
    const files: Array<{ path: string; language: string; lines: number; size: number }> = [];
    let totalLines = 0;
    let totalSize = 0;
    const languageCounts: Record<string, number> = {};

    if (project.generatedFiles && Array.isArray(project.generatedFiles)) {
      for (const file of project.generatedFiles as Array<{ path: string; content: string }>) {
        const language = detectLanguage(file.path);
        const lines = countLines(file.content);
        const size = file.content.length;
        
        files.push({ path: file.path, language, lines, size });
        totalLines += lines;
        totalSize += size;
        languageCounts[language] = (languageCounts[language] || 0) + lines;
      }
    }

    if (project.generatedCode && project.generatedCode.length > 0) {
      const lines = countLines(project.generatedCode);
      const size = project.generatedCode.length;
      files.push({ path: 'app.jsx', language: 'React JSX', lines, size });
      totalLines += lines;
      totalSize += size;
      languageCounts['React JSX'] = (languageCounts['React JSX'] || 0) + lines;
    }

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      files,
      totalFiles: files.length,
      totalLines,
      totalSize,
      languageCounts,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      hasCode: totalLines > 0,
      prompt: project.lastPrompt || project.messages?.[0]?.content?.substring(0, 200),
    };
  });

  const totalProjects = projectInventory.length;
  const projectsWithCode = projectInventory.filter(p => p.hasCode).length;
  const totalFiles = projectInventory.reduce((sum, p) => sum + p.totalFiles, 0);
  const totalLines = projectInventory.reduce((sum, p) => sum + p.totalLines, 0);
  const totalSize = projectInventory.reduce((sum, p) => sum + p.totalSize, 0);
  
  const languageBreakdown: Record<string, { lines: number; files: number; projects: number }> = {};
  for (const project of projectInventory) {
    for (const [lang, lines] of Object.entries(project.languageCounts)) {
      if (!languageBreakdown[lang]) {
        languageBreakdown[lang] = { lines: 0, files: 0, projects: 0 };
      }
      languageBreakdown[lang].lines += lines;
      languageBreakdown[lang].files += project.files.filter(f => f.language === lang).length;
      languageBreakdown[lang].projects += 1;
    }
  }

  res.json({
    summary: {
      totalProjects,
      projectsWithCode,
      totalFiles,
      totalLines,
      totalSize,
      averageLinesPerProject: projectsWithCode > 0 ? Math.round(totalLines / projectsWithCode) : 0,
    },
    languageBreakdown,
    projects: projectInventory.sort((a, b) => b.updatedAt - a.updatedAt),
  });
}));

router.get("/export-manifest", asyncHandler(async (req, res) => {
  const allProjects = await storage.getProjects();
  
  const manifest = {
    exportedAt: new Date().toISOString(),
    version: process.env.APP_VERSION || process.env.npm_package_version || "1.0.0",
    generator: "LocalForge",
    totalProjects: allProjects.length,
    projects: allProjects.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      prompt: p.lastPrompt || p.messages?.[0]?.content,
      hasFullStack: p.generatedFiles && (Array.isArray(p.generatedFiles) ? p.generatedFiles.length : 0) > 0,
      hasSingleFile: !!p.generatedCode,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
  };

  res.json(manifest);
}));

router.get("/successful-prompts", asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 10;
  const positiveFeedbacks = await analyticsStorage.getPositiveFeedbacks();
  
  const successfulPrompts = positiveFeedbacks
    .slice(0, limit)
    .map(f => ({
      prompt: f.prompt,
      template: f.templateUsed,
      timestamp: f.timestamp,
    }));
  
  res.json(successfulPrompts);
}));

export default router;
