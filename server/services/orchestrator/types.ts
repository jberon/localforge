import { llmSettingsSchema } from "@shared/schema";
import { z } from "zod";

export type PlannerMode = "planning" | "design" | "review";

export type LLMSettings = z.infer<typeof llmSettingsSchema>;

export interface OrchestratorTask {
  id: string;
  title: string;
  description: string;
  type: "plan" | "build" | "fix" | "search" | "validate" | "review";
  status: "pending" | "in_progress" | "completed" | "failed";
  result?: string;
  error?: string;
}

export type QualityProfile = "prototype" | "demo" | "production";

export interface OrchestratorPlan {
  summary: string;
  tasks: OrchestratorTask[];
  architecture?: string;
  qualityProfile: QualityProfile;
  stackProfile?: string;
  designNotes?: string;
  searchQueries?: string[];
}

export interface ReviewSummary {
  summary: string;
  strengths: string[];
  issues: Array<{
    severity: "high" | "medium" | "low";
    file?: string;
    description: string;
  }>;
  recommendations: string[];
}

export interface OrchestratorState {
  phase: "planning" | "designing" | "searching" | "building" | "validating" | "fixing" | "reviewing" | "complete" | "failed";
  plan?: OrchestratorPlan;
  currentTaskIndex: number;
  generatedCode: string;
  validationErrors: string[];
  fixAttempts: number;
  maxFixAttempts: number;
  webSearchResults: string;
  messages: Array<{ role: "planner" | "builder" | "system"; content: string }>;
  reviewSummary?: ReviewSummary;
}

export type OrchestratorEvent = 
  | { type: "phase_change"; phase: OrchestratorState["phase"]; message: string }
  | { type: "task_start"; task: OrchestratorTask }
  | { type: "task_complete"; task: OrchestratorTask }
  | { type: "tasks_updated"; tasks: OrchestratorTask[]; completedCount: number; totalCount: number }
  | { type: "thinking"; model: "planner" | "builder" | "web_search"; content: string }
  | { type: "code_chunk"; content: string }
  | { type: "search"; query: string }
  | { type: "search_result"; query: string; resultCount: number }
  | { type: "validation"; valid: boolean; errors: string[] }
  | { type: "fix_attempt"; attempt: number; maxAttempts: number }
  | { type: "review"; summary: string; issueCount: number; severityCounts: { high: number; medium: number; low: number } }
  | { type: "complete"; code: string; summary: string; reviewSummary?: ReviewSummary }
  | { type: "status"; message: string }
  | { type: "error"; message: string };
