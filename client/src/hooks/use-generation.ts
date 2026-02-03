import { useState, useCallback, useRef } from "react";
import { queryClient } from "@/lib/queryClient";
import type { TaskItem } from "@/components/task-progress-panel";
import type { LLMSettings } from "@shared/schema";

interface GenerationState {
  isGenerating: boolean;
  generationPhase: string | null;
  streamingCode: string;
  orchestratorPhase: string | null;
  orchestratorThinking: { model: string; content: string } | null;
  orchestratorTasks: { tasks: TaskItem[]; completedCount: number; totalCount: number };
}

interface UseGenerationOptions {
  settings: LLMSettings;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

interface UseGenerationReturn extends GenerationState {
  cancelGeneration: () => void;
  resetState: () => void;
  generateWithDreamTeam: (projectId: string, content: string) => Promise<any>;
  generateProduction: (projectId: string, content: string) => Promise<any>;
  generateStandard: (projectId: string, content: string, effectiveSettings: LLMSettings) => Promise<any>;
}

const initialState: GenerationState = {
  isGenerating: false,
  generationPhase: null,
  streamingCode: "",
  orchestratorPhase: null,
  orchestratorThinking: null,
  orchestratorTasks: { tasks: [], completedCount: 0, totalCount: 0 },
};

export function useGeneration({ settings, onSuccess, onError }: UseGenerationOptions): UseGenerationReturn {
  const [state, setState] = useState<GenerationState>(initialState);
  const abortControllerRef = useRef<AbortController | null>(null);

  const cancelGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState((prev) => ({
      ...prev,
      isGenerating: false,
      generationPhase: null,
    }));
  }, []);

  const resetState = useCallback(() => {
    setState(initialState);
  }, []);

  const processSSEEvent = useCallback((data: any) => {
    if (data.type === "phase") {
      setState((prev) => ({
        ...prev,
        orchestratorPhase: data.phase,
        generationPhase: data.message,
      }));
    } else if (data.type === "thinking") {
      setState((prev) => ({
        ...prev,
        orchestratorThinking: { model: data.model, content: data.content },
      }));
    } else if (data.type === "chunk") {
      setState((prev) => {
        const newCode = prev.streamingCode + data.content;
        const cleaned = newCode
          .replace(/^```(?:jsx?|javascript|typescript|tsx)?\n?/gm, "")
          .replace(/```$/gm, "");
        return { ...prev, streamingCode: cleaned };
      });
    } else if (data.type === "validation" && !data.valid) {
      setState((prev) => ({
        ...prev,
        generationPhase: `Fixing ${data.errors.length} issue(s)...`,
      }));
    } else if (data.type === "fix_attempt") {
      setState((prev) => ({
        ...prev,
        generationPhase: `Auto-fix attempt ${data.attempt}/${data.max}...`,
      }));
    } else if (data.type === "tasks_updated") {
      setState((prev) => ({
        ...prev,
        orchestratorTasks: {
          tasks: data.tasks.map((t: any) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            status: t.status,
          })),
          completedCount: data.completedCount,
          totalCount: data.totalCount,
        },
      }));
    } else if (data.type === "search" || data.type === "search_result") {
      setState((prev) => ({
        ...prev,
        generationPhase: `Web search: ${data.query}`,
        orchestratorThinking: { model: "web_search", content: `Searching: ${data.query}` },
      }));
    } else if (data.type === "file_start" || data.type === "file_complete") {
      setState((prev) => ({
        ...prev,
        generationPhase: data.type === "file_start" 
          ? `Generating ${data.file}...`
          : `Completed ${data.file}`,
      }));
    } else if (data.type === "quality_score") {
      setState((prev) => ({
        ...prev,
        generationPhase: `Quality Score: ${data.score}/100`,
      }));
    } else if (data.type === "status") {
      setState((prev) => ({
        ...prev,
        generationPhase: data.message,
      }));
    }
  }, []);

  const streamFromEndpoint = useCallback(
    async (url: string, body: any): Promise<any> => {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setState((prev) => ({
        ...prev,
        isGenerating: true,
        streamingCode: "",
        orchestratorTasks: { tasks: [], completedCount: 0, totalCount: 0 },
      }));

      let result: any = null;
      let buffer = "";

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok && !response.headers.get("content-type")?.includes("text/event-stream")) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Server error: ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error("No response body");
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() || "";

          for (const event of events) {
            const lines = event.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  processSSEEvent(data);

                  if (data.type === "done") {
                    result = data;
                    await queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
                    if (data.success) {
                      onSuccess?.();
                    }
                  } else if (data.type === "error") {
                    throw new Error(data.message || data.error);
                  }
                } catch (e) {
                  if (e instanceof SyntaxError) continue;
                  throw e;
                }
              }
            }
          }
        }

        return result;
      } catch (error: any) {
        if (error.name === "AbortError") {
          return null;
        }
        onError?.(error);
        throw error;
      } finally {
        if (abortControllerRef.current === controller) {
          setState((prev) => ({
            ...prev,
            isGenerating: false,
            generationPhase: null,
            orchestratorPhase: null,
            orchestratorThinking: null,
          }));
          abortControllerRef.current = null;
        }
      }
    },
    [processSSEEvent, onSuccess, onError]
  );

  const generateWithDreamTeam = useCallback(
    async (projectId: string, content: string) => {
      setState((prev) => ({
        ...prev,
        orchestratorPhase: "planning",
        generationPhase: "AI Dream Team analyzing...",
      }));

      return streamFromEndpoint(`/api/projects/${projectId}/dream-team`, {
        content,
        settings,
      });
    },
    [settings, streamFromEndpoint]
  );

  const generateProduction = useCallback(
    async (projectId: string, content: string) => {
      setState((prev) => ({
        ...prev,
        orchestratorPhase: "planning",
        generationPhase: "Production Mode: Designing architecture...",
      }));

      return streamFromEndpoint(`/api/projects/${projectId}/production`, {
        content,
        settings,
      });
    },
    [settings, streamFromEndpoint]
  );

  const generateStandard = useCallback(
    async (projectId: string, content: string, effectiveSettings: LLMSettings) => {
      setState((prev) => ({
        ...prev,
        isGenerating: true,
        generationPhase: "Generating code...",
        streamingCode: "",
      }));

      return streamFromEndpoint(`/api/projects/${projectId}/chat`, {
        content,
        settings: effectiveSettings,
      });
    },
    [streamFromEndpoint]
  );

  return {
    ...state,
    cancelGeneration,
    resetState,
    generateWithDreamTeam,
    generateProduction,
    generateStandard,
  };
}
