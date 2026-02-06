import { Router, Request, Response } from "express";
import { enhancedAnalysisService, AnalysisResult } from "../services/enhanced-analysis.service";
import { feedbackLearningService, LearnedPattern, LearningStats } from "../services/feedback-learning.service";
import { extendedThinkingService, ThinkingMode } from "../services/extended-thinking.service";
import { smartContextService } from "../services/smart-context.service";
import { contextBudgetService } from "../services/context-budget.service";
import { CONTEXT_LIMITS, CONTEXT_ALLOCATION } from "@shared/schema";
import logger from "../lib/logger";
import { asyncHandler } from "../lib/async-handler";

const router = Router();

interface IntelligenceStatus {
  services: {
    enhancedAnalysis: { active: boolean };
    feedbackLearning: { active: boolean; patternsCount: number };
    extendedThinking: { active: boolean; mode: ThinkingMode };
    smartContext: { active: boolean };
  };
  version: string;
}

router.get("/status", asyncHandler(async (_req: Request, res: Response) => {
  const thinkingMode = extendedThinkingService.getMode();
  const learningStats = feedbackLearningService.getStats();

  const status: IntelligenceStatus = {
    services: {
      enhancedAnalysis: { active: true },
      feedbackLearning: { 
        active: true, 
        patternsCount: learningStats.learnedPatterns 
      },
      extendedThinking: { 
        active: true, 
        mode: thinkingMode 
      },
      smartContext: { active: true }
    },
    version: "1.6.6"
  };

  res.json(status);
}));

router.post("/analyze", asyncHandler(async (req: Request, res: Response) => {
  const { code, filePath } = req.body;

  if (!code) {
    return res.status(400).json({ error: "Code is required" });
  }

  const result = enhancedAnalysisService.analyzeCode(code, filePath || "unknown.tsx");
  res.json(result);
}));

router.get("/patterns", asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.query.projectId as string | undefined;
  
  let patterns: LearnedPattern[];
  if (projectId) {
    patterns = feedbackLearningService.getProjectPatterns(projectId);
  } else {
    patterns = feedbackLearningService.getAllPatterns();
  }

  res.json({ patterns });
}));

router.get("/patterns/stats", asyncHandler(async (_req: Request, res: Response) => {
  const stats = feedbackLearningService.getStats();
  res.json(stats);
}));

router.delete("/patterns/:patternId", asyncHandler(async (req: Request, res: Response) => {
  const patternId = req.params.patternId as string;
  const success = feedbackLearningService.removePattern(patternId);
  
  if (success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Pattern not found" });
  }
}));

router.post("/patterns/export", asyncHandler(async (req: Request, res: Response) => {
  const { projectId } = req.body;
  
  let patterns: LearnedPattern[];
  if (projectId) {
    patterns = feedbackLearningService.getProjectPatterns(projectId);
  } else {
    patterns = feedbackLearningService.getAllPatterns();
  }

  res.json({ 
    exportedAt: new Date().toISOString(),
    version: "1.6.6",
    patterns 
  });
}));

router.post("/patterns/import", asyncHandler(async (req: Request, res: Response) => {
  const { patterns } = req.body;
  
  if (!Array.isArray(patterns)) {
    return res.status(400).json({ error: "Patterns must be an array" });
  }

  let imported = 0;
  for (const pattern of patterns) {
    if (pattern.pattern && pattern.category) {
      feedbackLearningService.addPattern(pattern);
      imported++;
    }
  }

  res.json({ imported, total: patterns.length });
}));

router.get("/thinking/mode", asyncHandler(async (_req: Request, res: Response) => {
  const mode = extendedThinkingService.getMode();
  const configs = {
    standard: { maxSteps: 3, description: "Quick analysis" },
    extended: { maxSteps: 7, description: "Detailed reasoning" },
    deep: { maxSteps: 15, description: "Comprehensive deep thinking" }
  };

  res.json({ 
    currentMode: mode, 
    config: configs[mode],
    available: ["standard", "extended", "deep"]
  });
}));

router.post("/thinking/mode", asyncHandler(async (req: Request, res: Response) => {
  const { mode, projectId } = req.body;
  
  if (!["standard", "extended", "deep"].includes(mode)) {
    return res.status(400).json({ error: "Invalid mode" });
  }

  if (projectId) {
    extendedThinkingService.setProjectMode(projectId, mode);
  } else {
    extendedThinkingService.setMode(mode);
  }

  res.json({ success: true, mode });
}));

router.get("/thinking/sessions", asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.query.projectId as string | undefined;
  const sessions = extendedThinkingService.getSessions(projectId);
  
  res.json({ sessions });
}));

router.get("/context/:projectId", asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.projectId as string;
  const memory = smartContextService.getProjectMemory(projectId);
  
  if (!memory) {
    return res.json({ 
      projectId,
      hasContext: false,
      keyDecisions: [],
      userPreferences: {},
      filesMentioned: [],
      errorsEncountered: [],
      successfulPatterns: []
    });
  }

  res.json({
    projectId,
    hasContext: true,
    keyDecisions: memory.keyDecisions,
    userPreferences: memory.userPreferences,
    filesMentioned: memory.filesMentioned,
    errorsEncountered: memory.errorsEncountered,
    successfulPatterns: memory.successfulPatterns,
    lastUpdated: memory.lastUpdated
  });
}));

router.get("/context-budget", asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.query.projectId as string | undefined;
  const modelName = req.query.modelName as string || "default";
  
  const modelLimit = contextBudgetService.getModelContextLimit(modelName);
  const maxTokens = Math.floor(modelLimit * 0.95);
  
  const outputReserve = Math.floor(maxTokens * CONTEXT_ALLOCATION.outputBuffer);
  const breakdown = {
    systemPrompt: Math.floor(maxTokens * CONTEXT_ALLOCATION.systemPrompt),
    userMessage: Math.floor(maxTokens * CONTEXT_ALLOCATION.userMessage),
    codeContext: Math.floor(maxTokens * CONTEXT_ALLOCATION.codeContext),
    chatHistory: Math.floor(maxTokens * CONTEXT_ALLOCATION.chatHistory),
    outputReserve,
    fileContents: 0,
  };
  
  let selectedFiles: Array<{ path: string; tokens: number; relevanceScore: number; reason: string }> = [];
  
  if (projectId) {
    const files = await contextBudgetService.selectRelevantFiles(
      projectId, 
      "", 
      breakdown.codeContext
    );
    selectedFiles = files.map(f => ({
      path: f.path,
      tokens: f.tokens,
      relevanceScore: f.relevanceScore,
      reason: f.reason,
    }));
    breakdown.fileContents = files.reduce((sum, f) => sum + f.tokens, 0);
  }
  
  const usedTokens = breakdown.systemPrompt + breakdown.userMessage + breakdown.fileContents + breakdown.chatHistory;
  
  res.json({
    maxTokens,
    usedTokens,
    breakdown,
    selectedFiles,
    truncatedFiles: [],
    modelLimit,
    modelName,
  });
}));

export default router;
