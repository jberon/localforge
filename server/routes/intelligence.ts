import { Router, Request, Response } from "express";
import { enhancedAnalysisService, AnalysisResult } from "../services/enhanced-analysis.service";
import { feedbackLearningService, LearnedPattern, LearningStats } from "../services/feedback-learning.service";
import { extendedThinkingService, ThinkingMode } from "../services/extended-thinking.service";
import { smartContextService } from "../services/smart-context.service";
import logger from "../lib/logger";

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

router.get("/status", async (_req: Request, res: Response) => {
  try {
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
      version: "1.6.5"
    };

    res.json(status);
  } catch (error: any) {
    logger.error("Failed to get intelligence status", { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.post("/analyze", async (req: Request, res: Response) => {
  try {
    const { code, filePath } = req.body;

    if (!code) {
      return res.status(400).json({ error: "Code is required" });
    }

    const result = enhancedAnalysisService.analyzeCode(code, filePath || "unknown.tsx");
    res.json(result);
  } catch (error: any) {
    logger.error("Failed to analyze code", { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get("/patterns", async (req: Request, res: Response) => {
  try {
    const projectId = req.query.projectId as string | undefined;
    
    let patterns: LearnedPattern[];
    if (projectId) {
      patterns = feedbackLearningService.getProjectPatterns(projectId);
    } else {
      patterns = feedbackLearningService.getAllPatterns();
    }

    res.json({ patterns });
  } catch (error: any) {
    logger.error("Failed to get patterns", { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get("/patterns/stats", async (_req: Request, res: Response) => {
  try {
    const stats = feedbackLearningService.getStats();
    res.json(stats);
  } catch (error: any) {
    logger.error("Failed to get learning stats", { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.delete("/patterns/:patternId", async (req: Request, res: Response) => {
  try {
    const patternId = req.params.patternId as string;
    const success = feedbackLearningService.removePattern(patternId);
    
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Pattern not found" });
    }
  } catch (error: any) {
    logger.error("Failed to delete pattern", { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.post("/patterns/export", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.body;
    
    let patterns: LearnedPattern[];
    if (projectId) {
      patterns = feedbackLearningService.getProjectPatterns(projectId);
    } else {
      patterns = feedbackLearningService.getAllPatterns();
    }

    res.json({ 
      exportedAt: new Date().toISOString(),
      version: "1.6.5",
      patterns 
    });
  } catch (error: any) {
    logger.error("Failed to export patterns", { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.post("/patterns/import", async (req: Request, res: Response) => {
  try {
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
  } catch (error: any) {
    logger.error("Failed to import patterns", { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get("/thinking/mode", async (_req: Request, res: Response) => {
  try {
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
  } catch (error: any) {
    logger.error("Failed to get thinking mode", { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.post("/thinking/mode", async (req: Request, res: Response) => {
  try {
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
  } catch (error: any) {
    logger.error("Failed to set thinking mode", { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get("/thinking/sessions", async (req: Request, res: Response) => {
  try {
    const projectId = req.query.projectId as string | undefined;
    const sessions = extendedThinkingService.getSessions(projectId);
    
    res.json({ sessions });
  } catch (error: any) {
    logger.error("Failed to get thinking sessions", { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.get("/context/:projectId", async (req: Request, res: Response) => {
  try {
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
  } catch (error: any) {
    logger.error("Failed to get context", { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

export default router;
