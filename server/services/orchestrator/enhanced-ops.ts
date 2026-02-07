import { CORE_DREAM_TEAM } from "@shared/schema";
import { logger } from "../../lib/logger";
import { taskDecompositionService, type DecomposedTask } from "../task-decomposition.service";
import { projectMemoryService, type DecisionCategory } from "../project-memory.service";
import { codeRunnerService } from "../code-runner.service";
import { autoFixLoopService, type AutoFixSession } from "../auto-fix-loop.service";
import { refactoringAgentService, type RefactoringResult } from "../refactoring-agent.service";
import { runtimeFeedbackService } from "../runtime-feedback.service";
import { uiuxAgentService } from "../uiux-agent.service";
import type { OrchestratorEvent } from "./types";
import type { DreamTeamService } from "../dreamTeam";

type EmitFn = (event: OrchestratorEvent) => void;

export async function decomposeRequest(
  projectId: string | undefined,
  emit: EmitFn,
  userRequest: string,
  existingCode?: string
): Promise<DecomposedTask | null> {
  if (!projectId) return null;

  try {
    const task = await taskDecompositionService.decomposePrompt(
      projectId,
      userRequest,
      existingCode ? { existingCode } : undefined
    );

    emit({
      type: "phase_change",
      phase: "planning",
      message: `Task decomposed into ${task.subtasks.length} subtasks`
    });

    return task;
  } catch (error) {
    logger.error("Task decomposition failed", {}, error as Error);
    return null;
  }
}

export async function recordToMemory(
  projectId: string | undefined,
  files: Array<{ path: string; purpose: string; content?: string }>,
  decision?: { category: string; title: string; description: string; rationale: string }
): Promise<void> {
  if (!projectId) return;

  try {
    for (const file of files) {
      await projectMemoryService.recordFileMetadata(projectId, file.path, {
        purpose: file.purpose,
        linesOfCode: file.content?.split("\n").length || 0
      });
    }

    if (decision) {
      await projectMemoryService.recordDecision(projectId, {
        category: decision.category as DecisionCategory,
        title: decision.title,
        description: decision.description,
        rationale: decision.rationale,
        alternatives: [],
        consequences: []
      });
    }

    await projectMemoryService.recordChange(projectId, {
      type: "creation",
      description: `Generated ${files.length} file(s)`,
      files: files.map(f => f.path),
      metrics: {
        filesChanged: files.length,
        linesAdded: files.reduce((acc, f) => acc + (f.content?.split("\n").length || 0), 0),
        linesRemoved: 0,
        tokensUsed: 0
      }
    });
  } catch (error) {
    logger.error("Failed to record to memory", {}, error as Error);
  }
}

export async function runEnhancedAutoFix(
  projectId: string | undefined,
  code: string,
  maxFixAttempts: number,
  emit: EmitFn
): Promise<{ success: boolean; fixedCode: string; session?: AutoFixSession }> {
  if (!projectId) {
    return { success: true, fixedCode: code };
  }

  try {
    runtimeFeedbackService.startSession(projectId);
    
    const session = await autoFixLoopService.startAutoFixSession(projectId, {
      maxIterations: maxFixAttempts
    });

    const result = await autoFixLoopService.runFixLoop(
      session.id,
      async () => {
        return await codeRunnerService.runTypeCheck();
      },
      async (fix, error) => {
        emit({
          type: "phase_change",
          phase: "fixing",
          message: `Applying fix for: ${error.message.slice(0, 50)}...`
        });
        return true;
      }
    );

    const unhandledErrors = runtimeFeedbackService.getUnhandledErrors(projectId);
    if (unhandledErrors.length > 0 && result.status === "completed") {
      emit({
        type: "thinking",
        model: "builder",
        content: `Runtime feedback: ${unhandledErrors.length} runtime error(s) detected`
      });
      
      const errorContext = runtimeFeedbackService.formatErrorsForLLM(projectId);
      if (errorContext) {
        for (const err of unhandledErrors.slice(0, 3)) {
          emit({
            type: "phase_change",
            phase: "fixing",
            message: `Runtime error: ${err.type} - ${err.message.slice(0, 50)}...`
          });
          
          if (err.suggestion) {
            emit({
              type: "thinking",
              model: "builder",
              content: `Suggested fix: ${err.suggestion}`
            });
          }
        }
      }
    }

    return {
      success: result.status === "completed",
      fixedCode: code,
      session: result
    };
  } catch (error) {
    logger.error("Enhanced auto-fix failed", {}, error as Error);
    return { success: false, fixedCode: code };
  }
}

export async function runUIUXAnalysis(
  projectId: string | undefined,
  files: Array<{ path: string; content: string }>,
  emit: EmitFn
): Promise<{ score: string; issues: number; suggestions: string[] } | null> {
  if (!projectId || files.length === 0) return null;

  try {
    const frontendFiles = files.filter(f => 
      f.path.endsWith('.tsx') || f.path.endsWith('.jsx') || 
      f.path.endsWith('.css') || f.path.includes('component')
    );

    if (frontendFiles.length === 0) return null;

    emit({
      type: "phase_change",
      phase: "reviewing",
      message: "Analyzing UI/UX patterns..."
    });

    const analysis = await uiuxAgentService.analyzeFiles(frontendFiles);
    
    const getGrade = (s: number): string => {
      if (s >= 90) return "A";
      if (s >= 80) return "B";
      if (s >= 70) return "C";
      if (s >= 60) return "D";
      return "F";
    };
    const grade = getGrade(analysis.score);
    
    if (analysis.issuesFound.length > 0) {
      emit({
        type: "thinking",
        model: "builder",
        content: `UI/UX Analysis: Grade ${grade}, ${analysis.issuesFound.length} issue(s) found`
      });
    }

    return {
      score: grade,
      issues: analysis.issuesFound.length,
      suggestions: analysis.issuesFound.slice(0, 5).map((i: { suggestion: string }) => i.suggestion)
    };
  } catch (error) {
    logger.error("UI/UX analysis failed", {}, error as Error);
    return null;
  }
}

export async function runRefactoringPass(
  projectId: string | undefined,
  files: Array<{ path: string; content: string }>,
  emit: EmitFn,
  dreamTeam?: DreamTeamService
): Promise<RefactoringResult | null> {
  if (!projectId || files.length === 0) return null;

  try {
    const sam = CORE_DREAM_TEAM.find(m => m.id === "sam");
    
    if (dreamTeam && sam) {
      await dreamTeam.logActivity(projectId, {
        member: sam,
        action: "refactoring",
        content: `Analyzing ${files.length} file(s) for code improvements...`
      });
    }

    emit({
      type: "phase_change",
      phase: "reviewing",
      message: "Running refactoring analysis..."
    });

    const { totalMetrics } = await refactoringAgentService.refactorProject(
      projectId,
      files,
      { autoFix: false, dryRun: true }
    );

    if (totalMetrics.issuesFound > 0) {
      emit({
        type: "thinking",
        model: "builder",
        content: `Found ${totalMetrics.issuesFound} potential improvements across ${totalMetrics.filesAnalyzed} files`
      });
    }

    return {
      success: true,
      changes: [],
      summary: `Analyzed ${totalMetrics.filesAnalyzed} files, found ${totalMetrics.issuesFound} potential improvements`,
      metrics: totalMetrics
    };
  } catch (error) {
    logger.error("Refactoring pass failed", {}, error as Error);
    return null;
  }
}

export async function getProjectContext(
  projectId: string | undefined
): Promise<{
  summary: string;
  conventions: Array<{ name: string; description: string }>;
  recentDecisions: Array<{ title: string; description: string }>;
  fileStructure: string;
} | null> {
  if (!projectId) return null;

  try {
    const context = await projectMemoryService.getContextForGeneration(projectId);
    return {
      summary: context.summary,
      conventions: context.conventions.map(c => ({ name: c.name, description: c.description })),
      recentDecisions: context.recentDecisions.map(d => ({ title: d.title, description: d.description })),
      fileStructure: context.fileStructure
    };
  } catch (error) {
    logger.error("Failed to get project context", {}, error as Error);
    return null;
  }
}
