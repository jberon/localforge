import { useState } from "react";
import type { AgentMode } from "@/components/plan-build-mode-toggle";
import type { PlanTask } from "@/components/plan-mode-task-list";
import type { TaskItem } from "@/components/task-progress-panel";
import type { RequestIntent } from "@/lib/request-classifier";

export function usePlanBuild() {
  const [agentMode, setAgentMode] = useState<AgentMode>("plan");
  const [planTasks, setPlanTasks] = useState<PlanTask[]>([]);
  const [planSummary, setPlanSummary] = useState<string>("");
  const [planArchitecture, setPlanArchitecture] = useState<string>("");
  const [currentPlanTaskIndex, setCurrentPlanTaskIndex] = useState(-1);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [streamingPlan, setStreamingPlan] = useState("");
  const [detectedIntent, setDetectedIntent] = useState<RequestIntent | null>(null);
  const [autoRouting, setAutoRouting] = useState(true);
  const [orchestratorPhase, setOrchestratorPhase] = useState<string | null>(null);
  const [orchestratorThinking, setOrchestratorThinking] = useState<{model: string; content: string} | null>(null);
  const [orchestratorTasks, setOrchestratorTasks] = useState<{ tasks: TaskItem[]; completedCount: number; totalCount: number }>({ tasks: [], completedCount: 0, totalCount: 0 });

  return {
    agentMode, setAgentMode,
    planTasks, setPlanTasks,
    planSummary, setPlanSummary,
    planArchitecture, setPlanArchitecture,
    currentPlanTaskIndex, setCurrentPlanTaskIndex,
    isPlanning, setIsPlanning,
    isBuilding, setIsBuilding,
    isApproving, setIsApproving,
    streamingPlan, setStreamingPlan,
    detectedIntent, setDetectedIntent,
    autoRouting, setAutoRouting,
    orchestratorPhase, setOrchestratorPhase,
    orchestratorThinking, setOrchestratorThinking,
    orchestratorTasks, setOrchestratorTasks,
  };
}
