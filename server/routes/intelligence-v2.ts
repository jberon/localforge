import { Router, Request, Response } from "express";
import { asyncHandler } from "../lib/async-handler";
import logger from "../lib/logger";
import { outcomeLearningService } from "../services/outcome-learning.service";
import { semanticContextService } from "../services/semantic-context.service";
import { predictiveErrorPreventionService } from "../services/predictive-error-prevention.service";
import { adaptiveDecompositionService } from "../services/adaptive-decomposition.service";
import { crossProjectKnowledgeService } from "../services/cross-project-knowledge.service";
import { speculativeGenerationService } from "../services/speculative-generation.service";

const router = Router();

router.post("/outcome-learning/record", asyncHandler(async (req: Request, res: Response) => {
  try {
    const { model, taskType, tier, qualityScore, testsPassed, userAccepted, durationMs, tokensUsed, errorCount, refinementsNeeded } = req.body;
    if (!model || !taskType || !tier) {
      return res.status(400).json({ error: "model, taskType, and tier are required" });
    }
    outcomeLearningService.recordOutcome({ model, taskType, tier, qualityScore, testsPassed, userAccepted, durationMs, tokensUsed, errorCount, refinementsNeeded });
    res.json({ data: { success: true } });
  } catch (error) {
    logger.error("Failed to record outcome", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to record outcome" });
  }
}));

router.get("/outcome-learning/leaderboard", asyncHandler(async (_req: Request, res: Response) => {
  try {
    const leaderboard = outcomeLearningService.getLeaderboard();
    res.json({ data: leaderboard });
  } catch (error) {
    logger.error("Failed to get leaderboard", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get leaderboard" });
  }
}));

router.get("/outcome-learning/insights", asyncHandler(async (_req: Request, res: Response) => {
  try {
    const insights = outcomeLearningService.getInsights();
    res.json({ data: insights });
  } catch (error) {
    logger.error("Failed to get insights", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get insights" });
  }
}));

router.get("/outcome-learning/best-model", asyncHandler(async (req: Request, res: Response) => {
  try {
    const taskType = req.query.taskType as string;
    const candidatesStr = req.query.candidates as string;
    if (!taskType || !candidatesStr) {
      return res.status(400).json({ error: "taskType and candidates query params are required" });
    }
    const candidates = candidatesStr.split(",").map(c => c.trim()).filter(Boolean);
    const result = outcomeLearningService.getBestModel(taskType, candidates);
    if (!result) {
      return res.status(404).json({ error: "No model data found for the given task type and candidates" });
    }
    res.json({ data: result });
  } catch (error) {
    logger.error("Failed to get best model", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get best model" });
  }
}));

router.post("/semantic-context/index", asyncHandler(async (req: Request, res: Response) => {
  try {
    const { projectId, files } = req.body;
    if (!projectId || !files || !Array.isArray(files)) {
      return res.status(400).json({ error: "projectId and files array are required" });
    }
    await semanticContextService.indexProject(projectId, files);
    res.json({ data: { success: true, projectId } });
  } catch (error) {
    logger.error("Failed to index project", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to index project" });
  }
}));

router.post("/semantic-context/retrieve", asyncHandler(async (req: Request, res: Response) => {
  try {
    const { projectId, query, topK } = req.body;
    if (!projectId || !query) {
      return res.status(400).json({ error: "projectId and query are required" });
    }
    const results = await semanticContextService.retrieve(projectId, query, topK);
    res.json({ data: results });
  } catch (error) {
    logger.error("Failed to retrieve context", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to retrieve context" });
  }
}));

router.get("/semantic-context/stats/:projectId", asyncHandler(async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string;
    const stats = semanticContextService.getIndexStats(projectId);
    if (!stats) {
      return res.status(404).json({ error: "No index found for project" });
    }
    res.json({ data: stats });
  } catch (error) {
    logger.error("Failed to get index stats", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get index stats" });
  }
}));

router.delete("/semantic-context/:projectId", asyncHandler(async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string;
    semanticContextService.invalidateProject(projectId);
    res.json({ data: { success: true, projectId } });
  } catch (error) {
    logger.error("Failed to invalidate project index", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to invalidate project index" });
  }
}));

router.post("/error-prevention/assess", asyncHandler(async (req: Request, res: Response) => {
  try {
    const { prompt, model } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "prompt is required" });
    }
    const assessment = predictiveErrorPreventionService.assessRisk(prompt, model);
    res.json({ data: assessment });
  } catch (error) {
    logger.error("Failed to assess risk", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to assess risk" });
  }
}));

router.post("/error-prevention/record", asyncHandler(async (req: Request, res: Response) => {
  try {
    const { prompt, errorCategory, errorCount, model } = req.body;
    if (!prompt || !errorCategory || errorCount === undefined) {
      return res.status(400).json({ error: "prompt, errorCategory, and errorCount are required" });
    }
    predictiveErrorPreventionService.recordOutcome(prompt, errorCategory, errorCount, model);
    res.json({ data: { success: true } });
  } catch (error) {
    logger.error("Failed to record error outcome", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to record error outcome" });
  }
}));

router.post("/error-prevention/learn", asyncHandler(async (req: Request, res: Response) => {
  try {
    const { name, promptExample, errorCategory, scaffolding } = req.body;
    if (!name || !promptExample || !errorCategory || !scaffolding) {
      return res.status(400).json({ error: "name, promptExample, errorCategory, and scaffolding are required" });
    }
    const patternId = predictiveErrorPreventionService.learnNewPattern(name, promptExample, errorCategory, scaffolding);
    res.json({ data: { patternId } });
  } catch (error) {
    logger.error("Failed to learn pattern", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to learn pattern" });
  }
}));

router.get("/error-prevention/stats", asyncHandler(async (_req: Request, res: Response) => {
  try {
    const stats = predictiveErrorPreventionService.getStats();
    res.json({ data: stats });
  } catch (error) {
    logger.error("Failed to get prevention stats", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get prevention stats" });
  }
}));

router.get("/error-prevention/preventive-prompt", asyncHandler(async (req: Request, res: Response) => {
  try {
    const prompt = req.query.prompt as string;
    if (!prompt) {
      return res.status(400).json({ error: "prompt query param is required" });
    }
    const preventivePrompt = predictiveErrorPreventionService.getPreventivePrompt(prompt);
    res.json({ data: { preventivePrompt } });
  } catch (error) {
    logger.error("Failed to get preventive prompt", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get preventive prompt" });
  }
}));

router.post("/adaptive-decomposition/strategy", asyncHandler(async (req: Request, res: Response) => {
  try {
    const { model, taskType, promptComplexity } = req.body;
    if (!model || !taskType || promptComplexity === undefined) {
      return res.status(400).json({ error: "model, taskType, and promptComplexity are required" });
    }
    const strategy = adaptiveDecompositionService.getOptimalStrategy(model, taskType, promptComplexity);
    res.json({ data: strategy });
  } catch (error) {
    logger.error("Failed to get strategy", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get strategy" });
  }
}));

router.post("/adaptive-decomposition/record", asyncHandler(async (req: Request, res: Response) => {
  try {
    const { strategyId, model, taskType, promptComplexity, stepCount, qualityScore, completionRate, totalDurationMs, tokensUsed, errorsEncountered } = req.body;
    if (!strategyId || !model || !taskType) {
      return res.status(400).json({ error: "strategyId, model, and taskType are required" });
    }
    adaptiveDecompositionService.recordOutcome({ strategyId, model, taskType, promptComplexity, stepCount, qualityScore, completionRate, totalDurationMs, tokensUsed, errorsEncountered });
    res.json({ data: { success: true } });
  } catch (error) {
    logger.error("Failed to record decomposition outcome", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to record decomposition outcome" });
  }
}));

router.get("/adaptive-decomposition/profiles", asyncHandler(async (_req: Request, res: Response) => {
  try {
    const profiles = adaptiveDecompositionService.getAllProfiles();
    res.json({ data: profiles });
  } catch (error) {
    logger.error("Failed to get profiles", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get profiles" });
  }
}));

router.get("/adaptive-decomposition/recommendation/:model", asyncHandler(async (req: Request, res: Response) => {
  try {
    const model = req.params.model as string;
    const recommendation = adaptiveDecompositionService.getRecommendation(model);
    res.json({ data: recommendation });
  } catch (error) {
    logger.error("Failed to get recommendation", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get recommendation" });
  }
}));

router.get("/adaptive-decomposition/thresholds", asyncHandler(async (_req: Request, res: Response) => {
  try {
    const thresholds = adaptiveDecompositionService.getDecompositionThresholds();
    res.json({ data: thresholds });
  } catch (error) {
    logger.error("Failed to get thresholds", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get thresholds" });
  }
}));

router.post("/knowledge/extract", asyncHandler(async (req: Request, res: Response) => {
  try {
    const { projectId, files, qualityScore } = req.body;
    if (!projectId || !files || !Array.isArray(files) || qualityScore === undefined) {
      return res.status(400).json({ error: "projectId, files array, and qualityScore are required" });
    }
    const patterns = crossProjectKnowledgeService.extractPatterns(projectId, files, qualityScore);
    res.json({ data: { patterns, count: patterns.length } });
  } catch (error) {
    logger.error("Failed to extract patterns", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to extract patterns" });
  }
}));

router.post("/knowledge/search", asyncHandler(async (req: Request, res: Response) => {
  try {
    const { query, category } = req.body;
    if (!query) {
      return res.status(400).json({ error: "query is required" });
    }
    const patterns = crossProjectKnowledgeService.searchPatterns(query, category);
    res.json({ data: patterns });
  } catch (error) {
    logger.error("Failed to search patterns", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to search patterns" });
  }
}));

router.get("/knowledge/context", asyncHandler(async (req: Request, res: Response) => {
  try {
    const prompt = req.query.prompt as string;
    const maxTokensStr = req.query.maxTokens as string | undefined;
    if (!prompt) {
      return res.status(400).json({ error: "prompt query param is required" });
    }
    const maxTokens = maxTokensStr ? parseInt(maxTokensStr, 10) : undefined;
    const context = crossProjectKnowledgeService.getPatternContext(prompt, maxTokens);
    res.json({ data: { context } });
  } catch (error) {
    logger.error("Failed to get pattern context", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get pattern context" });
  }
}));

router.post("/knowledge/record-outcome", asyncHandler(async (req: Request, res: Response) => {
  try {
    const { patternId, success } = req.body;
    if (!patternId || success === undefined) {
      return res.status(400).json({ error: "patternId and success are required" });
    }
    crossProjectKnowledgeService.recordPatternOutcome(patternId, success);
    res.json({ data: { success: true } });
  } catch (error) {
    logger.error("Failed to record pattern outcome", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to record pattern outcome" });
  }
}));

router.get("/knowledge/stats", asyncHandler(async (_req: Request, res: Response) => {
  try {
    const stats = crossProjectKnowledgeService.getLibraryStats();
    res.json({ data: stats });
  } catch (error) {
    logger.error("Failed to get library stats", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get library stats" });
  }
}));

router.delete("/knowledge/:patternId", asyncHandler(async (req: Request, res: Response) => {
  try {
    const patternId = req.params.patternId as string;
    const removed = crossProjectKnowledgeService.removePattern(patternId);
    if (!removed) {
      return res.status(404).json({ error: "Pattern not found" });
    }
    res.json({ data: { success: true } });
  } catch (error) {
    logger.error("Failed to remove pattern", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to remove pattern" });
  }
}));

router.post("/speculative/configure", asyncHandler(async (req: Request, res: Response) => {
  try {
    const config = req.body;
    speculativeGenerationService.configure(config);
    res.json({ data: speculativeGenerationService.getConfig() });
  } catch (error) {
    logger.error("Failed to configure speculative generation", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to configure speculative generation" });
  }
}));

router.get("/speculative/config", asyncHandler(async (_req: Request, res: Response) => {
  try {
    const config = speculativeGenerationService.getConfig();
    res.json({ data: config });
  } catch (error) {
    logger.error("Failed to get speculative config", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get speculative config" });
  }
}));

router.post("/speculative/generate", asyncHandler(async (req: Request, res: Response) => {
  try {
    const { prompt, context } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "prompt is required" });
    }
    const result = await speculativeGenerationService.generate(prompt, context);
    res.json({ data: result });
  } catch (error) {
    logger.error("Failed to generate candidates", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to generate candidates" });
  }
}));

router.post("/speculative/select", asyncHandler(async (req: Request, res: Response) => {
  try {
    const { sessionId, candidateId } = req.body;
    if (!sessionId || !candidateId) {
      return res.status(400).json({ error: "sessionId and candidateId are required" });
    }
    const candidate = speculativeGenerationService.selectCandidate(sessionId, candidateId);
    if (!candidate) {
      return res.status(404).json({ error: "Session or candidate not found" });
    }
    res.json({ data: candidate });
  } catch (error) {
    logger.error("Failed to select candidate", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to select candidate" });
  }
}));

router.get("/speculative/session/:sessionId", asyncHandler(async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.sessionId as string;
    const session = speculativeGenerationService.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    res.json({ data: session });
  } catch (error) {
    logger.error("Failed to get session", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get session" });
  }
}));

router.get("/speculative/sessions", asyncHandler(async (req: Request, res: Response) => {
  try {
    const limitStr = req.query.limit as string | undefined;
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;
    const sessions = speculativeGenerationService.getRecentSessions(limit);
    res.json({ data: sessions });
  } catch (error) {
    logger.error("Failed to get sessions", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get sessions" });
  }
}));

router.get("/speculative/stats", asyncHandler(async (_req: Request, res: Response) => {
  try {
    const stats = speculativeGenerationService.getStats();
    res.json({ data: stats });
  } catch (error) {
    logger.error("Failed to get speculative stats", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get speculative stats" });
  }
}));

router.get("/status", asyncHandler(async (_req: Request, res: Response) => {
  try {
    const outcomeInsights = outcomeLearningService.getInsights();
    const outcomeLeaderboard = outcomeLearningService.getLeaderboard();
    const errorPreventionStats = predictiveErrorPreventionService.getStats();
    const decompositionProfiles = adaptiveDecompositionService.getAllProfiles();
    const knowledgeStats = crossProjectKnowledgeService.getLibraryStats();
    const speculativeStats = speculativeGenerationService.getStats();
    const speculativeConfig = speculativeGenerationService.getConfig();

    res.json({
      data: {
        outcomeLearning: {
          active: true,
          leaderboardSize: outcomeLeaderboard.length,
          topPerformers: outcomeInsights.topPerformers,
          weakSpots: outcomeInsights.weakSpots.length,
        },
        semanticContext: {
          active: true,
        },
        errorPrevention: {
          active: true,
          totalPatterns: errorPreventionStats.totalPatterns,
          totalAssessments: errorPreventionStats.totalAssessments,
          preventionRate: errorPreventionStats.preventionRate,
        },
        adaptiveDecomposition: {
          active: true,
          profileCount: decompositionProfiles.length,
        },
        crossProjectKnowledge: {
          active: true,
          totalPatterns: knowledgeStats.totalPatterns,
          avgQualityScore: knowledgeStats.avgQualityScore,
          categories: knowledgeStats.categories,
        },
        speculativeGeneration: {
          active: true,
          enabled: speculativeConfig.enabled,
          totalSessions: speculativeStats.totalSessions,
          avgQualityImprovement: speculativeStats.avgQualityImprovement,
        },
        version: "2.0.0",
      },
    });
  } catch (error) {
    logger.error("Failed to get intelligence v2 status", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get intelligence v2 status" });
  }
}));

export default router;
