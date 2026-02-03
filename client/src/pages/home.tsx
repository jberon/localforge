import { useState, useCallback, useEffect, useMemo, useRef, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { ProjectSidebar } from "@/components/project-sidebar";
import { ChatPanel } from "@/components/chat-panel";
import { PreviewPanel } from "@/components/preview-panel";
import { GenerationWizard } from "@/components/generation-wizard";
import { ThemeToggle } from "@/components/theme-toggle";
import { EmptyState } from "@/components/empty-state";
import { SuccessCelebration } from "@/components/success-celebration";
import { OnboardingModal } from "@/components/onboarding-modal";
import { PlanReviewPanel } from "@/components/plan-review-panel";
import { DreamTeamSettings } from "@/components/dream-team-settings";
import { DreamTeamPanel } from "@/components/dream-team-panel";
import { VersionHistory } from "@/components/version-history";
import { CommandPalette } from "@/components/command-palette";
import { ErrorRecovery } from "@/components/error-recovery";
import { QuickUndo } from "@/components/quick-undo";
import { AIThinkingPanel } from "@/components/ai-thinking-panel";
import { ProjectTeamPanel } from "@/components/project-team-panel";
import { TaskProgressPanel, type TaskItem } from "@/components/task-progress-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/hooks/use-theme";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useLLMConnection } from "@/hooks/use-llm-connection";
import { useProjectMutations } from "@/hooks/use-project-mutations";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { trackEvent } from "@/lib/analytics";
import { classifyRequest, shouldUsePlanner, getIntentDescription, type RequestIntent } from "@/lib/request-classifier";
import { Wifi, WifiOff, BarChart3, Brain, Hammer, Zap, Users, Globe, Settings, PanelRight, PanelRightClose, FolderTree } from "lucide-react";
import { FileExplorer } from "@/components/file-explorer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Link } from "wouter";
import JSZip from "jszip";
import type { Project, LLMSettings, DataModel, DualModelSettings as DualModelSettingsType, Plan, DreamTeamSettings as DreamTeamSettingsType, DreamTeamDiscussion, GeneratedFile } from "@shared/schema";
import { defaultDreamTeamPersonas } from "@shared/schema";
import type { Attachment } from "@/hooks/use-file-attachments";

// Memoized panel components to prevent unnecessary re-renders
const MemoizedChatPanel = memo(ChatPanel);
const MemoizedPreviewPanel = memo(PreviewPanel);
const MemoizedFileExplorer = memo(FileExplorer);
const MemoizedProjectTeamPanel = memo(ProjectTeamPanel);
const MemoizedAIThinkingPanel = memo(AIThinkingPanel);

export default function Home() {
  const { toast } = useToast();
  const { isDarkMode, toggleTheme } = useTheme();
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationPhase, setGenerationPhase] = useState<string | null>(null);
  const [streamingCode, setStreamingCode] = useState("");
  const [showCelebration, setShowCelebration] = useState(false);
  const [lastError, setLastError] = useState<{ message: string; prompt?: string } | null>(null);
  const [showQuickUndo, setShowQuickUndo] = useState(false);
  const [showFileExplorer, setShowFileExplorer] = useState(true);
  const [selectedFile, setSelectedFile] = useState<GeneratedFile | null>(null);
  const generationRequestRef = useRef<string | null>(null);
  const [settings, setSettings] = useState<LLMSettings>({
    endpoint: "http://localhost:1234/v1",
    model: "",
    temperature: 0.7,
    useDualModels: true,
    plannerModel: "",
    plannerTemperature: 0.3,
    builderModel: "",
    builderTemperature: 0.5,
    webSearchEnabled: false,
    serperApiKey: "",
    productionMode: true,
  });
  
  // Web search permission state
  const [webSearchPermissionPending, setWebSearchPermissionPending] = useState<{
    message: string;
    needsApiKey: boolean;
    pendingContent: string;
  } | null>(null);
  
  // Plan & Build mode state
  const planBuildMode = true; // Always use intelligent mode
  const [isPlanning, setIsPlanning] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [streamingPlan, setStreamingPlan] = useState("");
  const [detectedIntent, setDetectedIntent] = useState<RequestIntent | null>(null);
  const [autoRouting, setAutoRouting] = useState(true);
  const [orchestratorPhase, setOrchestratorPhase] = useState<string | null>(null);
  const [orchestratorThinking, setOrchestratorThinking] = useState<{model: string; content: string} | null>(null);
  const [orchestratorTasks, setOrchestratorTasks] = useState<{ tasks: TaskItem[]; completedCount: number; totalCount: number }>({ tasks: [], completedCount: 0, totalCount: 0 });
  const [dualModelSettings, setDualModelSettings] = useState<DualModelSettingsType>({
    mode: "auto",
    planner: {
      endpoint: "http://localhost:1234/v1",
      model: "",
      temperature: 0.2,  // Optimized for M4 Pro - lower for structured planning
    },
    builder: {
      endpoint: "http://localhost:1234/v1",
      model: "",
      temperature: 0.4,  // Optimized for M4 Pro - balanced for code generation
    },
  });

  const [dreamTeamSettings, setDreamTeamSettings] = useState<DreamTeamSettingsType>({
    enabled: true,
    pauseOnMajorDecisions: false, // Disabled by default - Dream Team works autonomously
    discussionDepth: "balanced",
    personas: [...defaultDreamTeamPersonas],
  });
  const [activeDiscussion, setActiveDiscussion] = useState<DreamTeamDiscussion | null>(null);
  const [isDiscussionGenerating, setIsDiscussionGenerating] = useState(false);
  const [pendingGeneration, setPendingGeneration] = useState<{
    content: string;
    dataModel?: DataModel;
    usePlanner: boolean;
  } | null>(null);

  const startDreamTeamDiscussion = useCallback(async (topic: string, context: string) => {
    if (!dreamTeamSettings.enabled) return;
    
    const enabledPersonas = dreamTeamSettings.personas.filter(p => p.enabled);
    if (enabledPersonas.length === 0) return;

    setIsDiscussionGenerating(true);
    try {
      const response = await fetch("/api/dream-team/discuss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          context,
          personas: enabledPersonas.map(p => ({
            id: p.id,
            name: p.name,
            title: p.title,
            focus: p.focus,
            personality: p.personality,
          })),
          discussionDepth: dreamTeamSettings.discussionDepth,
          endpoint: settings.endpoint,
          temperature: 0.7,
        }),
      });
      
      if (response.ok) {
        const discussion = await response.json();
        setActiveDiscussion(discussion);
      }
    } catch (error) {
      console.error("Dream Team discussion error:", error);
    } finally {
      setIsDiscussionGenerating(false);
    }
  }, [dreamTeamSettings, settings.endpoint]);

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const activeProject = projects.find((p) => p.id === activeProjectId);

  const {
    isConnected: llmConnected,
    loadedModel,
    availableModels,
    isChecking: isCheckingConnection,
    checkConnection,
  } = useLLMConnection({
    endpoint: settings.endpoint,
    model: settings.model,
    pollInterval: 30000,
  });

  useEffect(() => {
    if (llmConnected) {
      setLastError(null);
    }
  }, [llmConnected]);

  // Clear quick undo when project changes
  useEffect(() => {
    setShowQuickUndo(false);
  }, [activeProjectId]);

  const {
    createProject,
    deleteProject,
    renameProject,
    updateProjectName,
    isCreating: isCreatingProject,
  } = useProjectMutations({
    onProjectCreated: (project) => setActiveProjectId(project.id),
    onProjectDeleted: (deletedId) => {
      if (activeProjectId === deletedId) {
        setActiveProjectId(null);
      }
    },
    activeProjectId,
  });

  // Keyboard shortcuts (Cmd on Mac, Ctrl on Windows/Linux)
  const shortcuts = useMemo(() => [
    {
      key: "n",
      cmdOrCtrl: true,
      action: () => createProject(),
      description: "New project",
    },
    {
      key: "s",
      cmdOrCtrl: true,
      action: () => {
        if (activeProject) {
          toast({
            title: "Project saved",
            description: "All changes are automatically saved.",
          });
        } else {
          toast({
            title: "No project selected",
            description: "Select or create a project first.",
          });
        }
      },
      description: "Save project",
    },
  ], [createProject, activeProject, toast]);

  useKeyboardShortcuts(shortcuts);

  // Generate a smart project name from prompt
  const generateProjectName = (prompt: string): string => {
    // Common app type patterns
    const patterns = [
      { regex: /(?:build|create|make)\s+(?:a\s+)?(.+?)(?:\s+app|\s+application|\s+website|\s+tool)?$/i, group: 1 },
      { regex: /^(.+?)(?:\s+app|\s+application|\s+website|\s+tool)$/i, group: 1 },
    ];

    for (const { regex, group } of patterns) {
      const match = prompt.match(regex);
      if (match && match[group]) {
        const name = match[group].trim();
        // Capitalize first letter of each word
        return name
          .split(/\s+/)
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(" ")
          .slice(0, 40);
      }
    }

    // Fallback: use first 40 chars of prompt
    const truncated = prompt.slice(0, 40);
    return truncated.charAt(0).toUpperCase() + truncated.slice(1) + (prompt.length > 40 ? "..." : "");
  };

  // AI Dream Team Orchestrator - uses dual models autonomously
  const handleOrchestratorGeneration = useCallback(
    async (projectId: string, content: string) => {
      setOrchestratorPhase("planning");
      setOrchestratorThinking(null);
      setGenerationPhase("AI Dream Team analyzing...");
      
      const response = await fetch(`/api/projects/${projectId}/dream-team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, settings }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      let accumulatedCode = "";
      let buffer = "";

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
                
                if (data.type === "phase") {
                  setOrchestratorPhase(data.phase);
                  setGenerationPhase(data.message);
                } else if (data.type === "thinking") {
                  setOrchestratorThinking({ model: data.model, content: data.content });
                } else if (data.type === "chunk") {
                  accumulatedCode += data.content;
                  const cleaned = accumulatedCode
                    .replace(/^```(?:jsx?|javascript|typescript|tsx)?\n?/gm, "")
                    .replace(/```$/gm, "");
                  setStreamingCode(cleaned);
                } else if (data.type === "validation") {
                  if (!data.valid) {
                    setGenerationPhase(`Fixing ${data.errors.length} issue(s)...`);
                  }
                } else if (data.type === "fix_attempt") {
                  setGenerationPhase(`Auto-fix attempt ${data.attempt}/${data.max}...`);
                } else if (data.type === "tasks_updated") {
                  setOrchestratorTasks({
                    tasks: data.tasks.map((t: any) => ({
                      id: t.id,
                      title: t.title,
                      description: t.description,
                      status: t.status,
                    })),
                    completedCount: data.completedCount,
                    totalCount: data.totalCount,
                  });
                } else if (data.type === "search") {
                  setGenerationPhase(`Web search: ${data.query}`);
                  setOrchestratorThinking({ model: "web_search", content: `Searching: ${data.query}` });
                } else if (data.type === "search_result") {
                  setGenerationPhase(`Found ${data.results?.length || 0} results for: ${data.query}`);
                } else if (data.type === "done") {
                  await queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
                  if (data.success) {
                    setShowCelebration(true);
                    setShowQuickUndo(true);
                    toast({
                      title: "AI Dream Team Complete!",
                      description: "Your app was built by the planning & building models working together.",
                    });
                  }
                  return data.project;
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
    },
    [settings, toast]
  );

  // Production Mode - Multi-file TypeScript projects with tests
  const handleProductionGeneration = useCallback(
    async (projectId: string, content: string) => {
      setOrchestratorPhase("planning");
      setOrchestratorThinking(null);
      setGenerationPhase("Production Mode: Designing architecture...");
      
      const response = await fetch(`/api/projects/${projectId}/production`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, settings }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      let buffer = "";
      let qualityScore = 0;

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
                
                if (data.type === "phase") {
                  setOrchestratorPhase(data.phase);
                  setGenerationPhase(data.message);
                } else if (data.type === "thinking") {
                  setOrchestratorThinking({ model: data.model, content: data.content });
                } else if (data.type === "file_start") {
                  setGenerationPhase(`Generating ${data.file}...`);
                } else if (data.type === "file_complete") {
                  setGenerationPhase(`Completed ${data.file} (${Math.round(data.size / 1024)}KB)`);
                } else if (data.type === "quality_score") {
                  qualityScore = data.score;
                  setGenerationPhase(`Quality Score: ${data.score}/100`);
                } else if (data.type === "test_result") {
                  setGenerationPhase(`Test ${data.passed ? '✓' : '✗'} ${data.file}`);
                } else if (data.type === "fix_attempt") {
                  setGenerationPhase(`Auto-fix attempt ${data.attempt}/${data.max}: ${data.reason}`);
                } else if (data.type === "file_chunk") {
                  // Streaming file content - update progress indicator
                  setGenerationPhase(`Writing ${data.file}... (${Math.round((data.progress || 0) * 100)}%)`);
                } else if (data.type === "quality_issue") {
                  // Log quality issues for debugging
                  console.log(`Quality issue in ${data.file}: ${data.issue} (severity: ${data.severity})`);
                } else if (data.type === "search") {
                  setGenerationPhase(`Web search: ${data.query}`);
                  setOrchestratorThinking({ model: "web_search", content: `Searching: ${data.query}` });
                } else if (data.type === "done") {
                  await queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
                  if (data.success) {
                    setShowCelebration(true);
                    setShowQuickUndo(true);
                    toast({
                      title: "Production Build Complete!",
                      description: `Quality Score: ${qualityScore}/100. ${data.files?.length || 0} files generated with tests.`,
                    });
                  }
                  return data.project;
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
    },
    [settings, toast]
  );

  const handleSendMessage = useCallback(
    async (content: string, dataModel?: DataModel, attachments?: Attachment[], templateTemperature?: number, overrideSettings?: LLMSettings) => {
      // Request deduplication - prevent duplicate calls using in-flight lock
      if (generationRequestRef.current !== null || isGenerating) {
        console.log("Blocking duplicate generation request");
        return;
      }
      
      // Set lock immediately before any async work
      const requestId = Date.now().toString();
      generationRequestRef.current = requestId;
      setLastError(null);
      setShowQuickUndo(false);
      
      let projectId = activeProjectId;
      const projectName = generateProjectName(content);
      
      if (!projectId) {
        const response = await apiRequest("POST", "/api/projects", {
          name: projectName,
          messages: [],
        });
        const newProject = await response.json();
        await queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
        projectId = newProject.id;
        setActiveProjectId(projectId);
      } else {
        // Update project name if it's still the default "New Project"
        const currentProject = projects.find(p => p.id === projectId);
        if (currentProject?.name === "New Project") {
          await apiRequest("PATCH", `/api/projects/${projectId}/name`, { name: projectName });
          await queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
        }
      }

      setIsGenerating(true);
      setStreamingCode("");
      setGenerationPhase("Analyzing request...");
      setOrchestratorTasks({ tasks: [], completedCount: 0, totalCount: 0 });

      // Track generation started
      trackEvent("generation_started", projectId || undefined, {
        promptLength: content.length,
        hasDataModel: !!dataModel,
        isFullStack: dataModel?.enableDatabase && dataModel?.entities.length > 0,
      });

      try {
        // If dataModel has entities and database is enabled, use full-stack generation
        if (dataModel && dataModel.enableDatabase && dataModel.entities.length > 0) {
          setGenerationPhase("Building full-stack application...");
          
          // Add user message first
          await apiRequest("POST", `/api/projects/${projectId}/chat`, {
            content,
            settings,
          }).catch(() => {});

          setGenerationPhase("Generating database schema...");
          
          // Then generate full-stack project
          const response = await apiRequest("POST", `/api/projects/${projectId}/generate-fullstack`, {
            projectName,
            dataModel,
            prompt: content,
          });
          
          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Failed to generate project");
          }
          
          await queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
          
          // Track successful full-stack generation
          trackEvent("generation_completed", projectId || undefined, {
            type: "fullstack",
            entityCount: dataModel.entities.length,
          });
          
          setShowCelebration(true);
          setShowQuickUndo(true);
          toast({
            title: "Full-Stack Project Generated!",
            description: "Check the Files tab to view and download your project.",
          });
        } else {
          // Production Mode - Multi-file TypeScript projects with tests
          if (settings.productionMode && settings.useDualModels && settings.plannerModel && settings.builderModel && projectId) {
            setGenerationPhase("Production Mode initializing...");
            try {
              await handleProductionGeneration(projectId, content);
            } finally {
              setIsGenerating(false);
              setGenerationPhase(null);
              setOrchestratorPhase(null);
              setOrchestratorThinking(null);
              generationRequestRef.current = null;
            }
            return;
          }
          
          // Use AI Dream Team (orchestrator) when dual models are enabled
          if (settings.useDualModels && settings.plannerModel && settings.builderModel && projectId) {
            setGenerationPhase("AI Dream Team initializing...");
            try {
              await handleOrchestratorGeneration(projectId, content);
            } finally {
              setIsGenerating(false);
              setGenerationPhase(null);
              setOrchestratorPhase(null);
              setOrchestratorThinking(null);
              generationRequestRef.current = null;
            }
            return;
          }
          
          setGenerationPhase("Generating code...");
          
          // Use regular LLM streaming for frontend-only apps
          // Use override settings (from Smart Mode) if provided, otherwise use default settings
          // Temperature priority: overrideSettings > templateTemperature > default settings
          const baseSettings = overrideSettings || settings;
          const effectiveSettings = {
            ...baseSettings,
            temperature: templateTemperature ?? baseSettings.temperature,
          };
          const response = await fetch(`/api/projects/${projectId}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, settings: effectiveSettings }),
          });

          // Check for non-SSE error responses
          if (!response.ok && !response.headers.get("content-type")?.includes("text/event-stream")) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Server error: ${response.status}`);
          }

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();

          if (!reader) {
            throw new Error("No response body");
          }

          let accumulatedCode = "";
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            
            // Process complete SSE events (separated by \n\n)
            const events = buffer.split("\n\n");
            buffer = events.pop() || ""; // Keep incomplete event in buffer

            for (const event of events) {
              const lines = event.split("\n");
              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    
                    if (data.type === "chunk") {
                      // Update phase on first chunk
                      if (!accumulatedCode) {
                        setGenerationPhase("Writing code...");
                      }
                      accumulatedCode += data.content;
                      // Clean markdown as we go for preview
                      const cleaned = accumulatedCode
                        .replace(/^```(?:jsx?|javascript|typescript|tsx)?\n?/gm, "")
                        .replace(/```$/gm, "");
                      setStreamingCode(cleaned);
                    } else if (data.type === "done") {
                      setGenerationPhase("Finalizing...");
                      await queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
                      // Track successful frontend generation
                      trackEvent("generation_completed", projectId || undefined, {
                        type: "frontend",
                        codeLength: accumulatedCode.length,
                      });
                    } else if (data.type === "web_search_permission") {
                      // Show permission dialog
                      setWebSearchPermissionPending({
                        message: data.message,
                        needsApiKey: data.needsApiKey,
                        pendingContent: content,
                      });
                    } else if (data.type === "status") {
                      // Update generation phase with status message
                      setGenerationPhase(data.message);
                    } else if (data.type === "error") {
                      toast({
                        title: "Generation Failed",
                        description: data.error || "Could not connect to LM Studio",
                        variant: "destructive",
                      });
                      await queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
                      // Track failed generation
                      trackEvent("generation_failed", projectId || undefined, {
                        error: data.error,
                      });
                    }
                  } catch {
                    // Ignore parse errors for incomplete JSON
                  }
                }
              }
            }
          }
        }
      } catch (error: any) {
        const errorMessage = error.message || "Failed to generate app";
        setLastError({ message: errorMessage, prompt: content });
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
        trackEvent("generation_failed", projectId || undefined, {
          error: errorMessage,
        });
      } finally {
        setIsGenerating(false);
        setGenerationPhase(null);
        setStreamingCode("");
        generationRequestRef.current = null;
      }
    },
    [activeProjectId, settings, toast, projects, isGenerating]
  );

  // Plan & Build mode handlers
  const handleCreatePlan = useCallback(async (prompt: string, dataModel?: DataModel) => {
    let projectId = activeProjectId;
    const projectName = generateProjectName(prompt);
    
    if (!projectId) {
      const response = await apiRequest("POST", "/api/projects", {
        name: projectName,
        messages: [],
      });
      const newProject = await response.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      projectId = newProject.id;
      setActiveProjectId(projectId);
    }

    setIsPlanning(true);
    setStreamingPlan("");
    setGenerationPhase("Creating plan...");

    try {
      const response = await fetch(`/api/projects/${projectId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          plannerSettings: dualModelSettings.planner,
        }),
      });

      // Check for non-SSE error responses
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

        const text = decoder.decode(value);
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "chunk") {
                setStreamingPlan((prev) => prev + data.content);
              } else if (data.type === "plan") {
                await queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
                toast({
                  title: "Plan Created",
                  description: "Review the plan and approve it to start building.",
                });
              } else if (data.type === "error") {
                throw new Error(data.error);
              }
            } catch (parseError) {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error: any) {
      toast({
        title: "Planning Error",
        description: error.message || "Failed to create plan",
        variant: "destructive",
      });
    } finally {
      setIsPlanning(false);
      setGenerationPhase(null);
      setStreamingPlan("");
    }
  }, [activeProjectId, dualModelSettings.planner, toast]);

  const handleDreamTeamResponse = useCallback(async (response: string) => {
    if (!activeDiscussion) return;
    
    setActiveDiscussion(null);
    
    // Resume pending generation if user approves
    if (pendingGeneration && (response === "proceed" || response.toLowerCase().includes("proceed"))) {
      const { content, dataModel, usePlanner } = pendingGeneration;
      setPendingGeneration(null);
      
      // Use full builder settings from dual model settings when in Smart Mode
      const builderSettings: LLMSettings = {
        ...settings,
        ...dualModelSettings.builder,
      };
      
      if (usePlanner) {
        await handleCreatePlan(content, dataModel);
      } else {
        await handleSendMessage(content, dataModel, undefined, undefined, builderSettings);
      }
    } else if (pendingGeneration) {
      // User chose to explore alternatives or cancel - clear pending
      setPendingGeneration(null);
      toast({
        title: "Generation paused",
        description: "You can modify your request and try again.",
      });
    }
  }, [activeDiscussion, pendingGeneration, dualModelSettings.builder, handleCreatePlan, handleSendMessage, toast]);

  const handleApprovePlan = useCallback(async () => {
    if (!activeProjectId) return;
    
    setIsApproving(true);
    try {
      await apiRequest("POST", `/api/projects/${activeProjectId}/plan/approve`);
      await queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Plan Approved",
        description: "Ready to start building!",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to approve plan",
        variant: "destructive",
      });
    } finally {
      setIsApproving(false);
    }
  }, [activeProjectId, toast]);

  const handleRejectPlan = useCallback(async () => {
    if (!activeProjectId) return;
    
    try {
      // Clear the plan using the dedicated endpoint
      await apiRequest("DELETE", `/api/projects/${activeProjectId}/plan`);
      await queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setDetectedIntent(null);
      toast({
        title: "Plan Rejected",
        description: "You can create a new plan with different requirements.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reject plan",
        variant: "destructive",
      });
    }
  }, [activeProjectId, toast]);

  const handleStartBuild = useCallback(async () => {
    if (!activeProjectId) return;
    
    setIsBuilding(true);
    setStreamingCode("");

    try {
      const response = await fetch(`/api/projects/${activeProjectId}/build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          builderSettings: dualModelSettings.builder,
        }),
      });

      // Check for non-SSE error responses
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

        const text = decoder.decode(value);
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "chunk") {
                setStreamingCode((prev) => prev + data.content);
              } else if (data.type === "done") {
                await queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
                setShowCelebration(true);
                setShowQuickUndo(true);
                toast({
                  title: "Build Complete!",
                  description: "Your app has been generated successfully.",
                });
              } else if (data.type === "error") {
                throw new Error(data.error);
              }
            } catch (parseError) {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error: any) {
      toast({
        title: "Build Error",
        description: error.message || "Failed to build app",
        variant: "destructive",
      });
    } finally {
      setIsBuilding(false);
    }
  }, [activeProjectId, dualModelSettings.builder, toast]);

  // Intelligent routing handler - automatically routes to plan or build based on request analysis
  const handleIntelligentGenerate = useCallback(
    async (content: string, dataModel?: DataModel, attachments?: Attachment[], templateTemperature?: number) => {
      if (!planBuildMode || !autoRouting) {
        // Use standard generation when Plan & Build mode is off
        return handleSendMessage(content, dataModel, attachments, templateTemperature);
      }

      // Classify the request to determine intent
      const classification = classifyRequest(content);
      setDetectedIntent(classification.intent);
      
      const hasExistingCode = !!(activeProject?.generatedCode || streamingCode);
      const usePlanner = shouldUsePlanner(content, hasExistingCode);

      // Trigger Dream Team consultation for major decisions if enabled
      if (dreamTeamSettings.enabled && dreamTeamSettings.pauseOnMajorDecisions && usePlanner) {
        // Store the pending generation for later continuation
        setPendingGeneration({
          content,
          dataModel,
          usePlanner: true,
        });
        
        // Start the discussion and return early - generation will continue after user responds
        await startDreamTeamDiscussion(
          `New App Request: ${content.slice(0, 100)}${content.length > 100 ? "..." : ""}`,
          `User wants to build: "${content}". This is a new project request that will trigger the planner. The team should discuss the approach before proceeding.`
        );
        
        toast({
          title: "Dream Team Consultation",
          description: "Your expert advisors are reviewing the approach. Generation will continue after you respond.",
        });
        
        return; // Pause here - handleDreamTeamResponse will resume generation
      }

      // Show what model is being used
      toast({
        title: `${getIntentDescription(classification.intent)}`,
        description: `Detected ${classification.intent} intent (${Math.round(classification.confidence * 100)}% confidence)`,
      });

      // Use full builder settings (endpoint, model, temperature) from dual model settings when in Smart Mode
      const builderSettings: LLMSettings = {
        ...settings,
        ...dualModelSettings.builder,
      };

      if (usePlanner) {
        // Route to planner model for planning/reasoning requests
        await handleCreatePlan(content, dataModel);
      } else if (classification.intent === "refine" && hasExistingCode) {
        // Use builder settings for refinements
        await handleSendMessage(content, dataModel, attachments, undefined, builderSettings);
      } else {
        // Use builder model directly for direct build requests
        await handleSendMessage(content, dataModel, attachments, undefined, builderSettings);
      }
    },
    [planBuildMode, autoRouting, activeProject, streamingCode, handleSendMessage, handleCreatePlan, toast, dualModelSettings.builder, dreamTeamSettings, startDreamTeamDiscussion, setPendingGeneration]
  );

  const handleDownload = useCallback(async () => {
    const projectName = (activeProject?.name || "my-app").replace(/[^a-z0-9]/gi, "-").toLowerCase();

    // If we have generated files, download as ZIP
    if (activeProject?.generatedFiles && activeProject.generatedFiles.length > 0) {
      const zip = new JSZip();
      
      for (const file of activeProject.generatedFiles) {
        zip.file(file.path, file.content);
      }
      
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Track ZIP download
      trackEvent("code_downloaded", activeProject.id, {
        type: "zip",
        fileCount: activeProject.generatedFiles.length,
      });

      toast({
        title: "Project Downloaded!",
        description: "Extract the ZIP and follow the README to run your app.",
      });
      return;
    }

    // Otherwise, download as single HTML file
    const codeToDownload = activeProject?.generatedCode || streamingCode;
    if (!codeToDownload) return;

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${activeProject?.name || "My App"}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 16px; }
    * { box-sizing: border-box; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    ${codeToDownload}
  </script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Track HTML download
    if (activeProject?.id) {
      trackEvent("code_downloaded", activeProject.id, {
        type: "html",
        codeLength: codeToDownload.length,
      });
    }

    toast({
      title: "Downloaded!",
      description: "Open the HTML file in any browser to run your app.",
    });
  }, [activeProject, streamingCode, toast]);

  const displayCode = isGenerating ? streamingCode : (activeProject?.generatedCode || "");

  const handleRetryFromError = useCallback((prompt?: string) => {
    if (prompt) {
      handleIntelligentGenerate(prompt);
    } else if (lastError?.prompt) {
      handleIntelligentGenerate(lastError.prompt);
    }
    setLastError(null);
  }, [handleIntelligentGenerate, lastError]);

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <ProjectSidebar
          projects={projects}
          activeProjectId={activeProjectId}
          settings={settings}
          onSelectProject={setActiveProjectId}
          onNewProject={() => createProject()}
          onDeleteProject={(id) => deleteProject(id)}
          onRenameProject={(id, name) => renameProject(id, name)}
          onUpdateSettings={(newSettings) => {
            setSettings(newSettings);
            setDualModelSettings(prev => ({
              ...prev,
              planner: {
                ...prev.planner,
                endpoint: newSettings.endpoint,
                model: newSettings.model,
              },
              builder: {
                ...prev.builder,
                endpoint: newSettings.endpoint,
                model: newSettings.model,
              },
            }));
            checkConnection();
          }}
        />
        
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-2 px-4 py-2 pt-4 border-b bg-background electron-drag-region min-h-[52px] overflow-x-auto">
            <div className="flex items-center gap-3 shrink-0">
              <SidebarTrigger data-testid="button-sidebar-toggle" className="electron-no-drag" />
              {activeProject && (
                <span className="text-sm font-medium truncate max-w-[120px]">
                  {activeProject.name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {detectedIntent && (
                <Badge 
                  variant="secondary" 
                  className="text-xs gap-1"
                  data-testid="badge-detected-intent"
                >
                  {detectedIntent === "plan" && <Brain className="h-3 w-3 text-purple-500" />}
                  {detectedIntent === "build" && <Hammer className="h-3 w-3 text-orange-500" />}
                  {detectedIntent === "refine" && <Hammer className="h-3 w-3 text-blue-500" />}
                  {detectedIntent === "question" && <Brain className="h-3 w-3 text-green-500" />}
                  {detectedIntent}
                </Badge>
              )}
              <DreamTeamSettings
                settings={dreamTeamSettings}
                onSettingsChange={setDreamTeamSettings}
              />
              {activeProject && showQuickUndo && (
                <QuickUndo 
                  projectId={activeProject.id} 
                  onUndo={() => {
                    setShowQuickUndo(false);
                    queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/projects", activeProject.id] });
                  }}
                />
              )}
              {activeProject && (
                <VersionHistory 
                  projectId={activeProject.id} 
                  onRestore={() => {
                    queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/projects", activeProject.id] });
                  }}
                />
              )}
              <Button variant="ghost" size="sm" asChild data-testid="button-analytics">
                <Link href="/analytics">
                  <BarChart3 className="h-4 w-4 mr-1" />
                  Analytics
                </Link>
              </Button>
              {llmConnected === false && (
                <Badge 
                  variant="outline" 
                  className="gap-1.5 text-xs border-yellow-500/50 text-yellow-600 dark:text-yellow-400 cursor-pointer hover-elevate electron-no-drag"
                  onClick={checkConnection}
                  data-testid="badge-connection-status"
                >
                  <WifiOff className="h-3 w-3" />
                  LM Studio offline
                </Badge>
              )}
              {llmConnected === true && (
                <div className="flex items-center gap-1.5" data-testid="indicator-connected">
                  <div className="w-2 h-2 bg-green-500 rounded-full" title="LM Studio connected" />
                  {settings.useDualModels && (settings.plannerModel || settings.builderModel) ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {settings.plannerModel && (
                        <span className="flex items-center gap-1 truncate max-w-[140px]" title={`Planner: ${settings.plannerModel}`}>
                          <Brain className="h-3 w-3 text-purple-400" />
                          {settings.plannerModel.split('/').pop()}
                        </span>
                      )}
                      {settings.plannerModel && settings.builderModel && <span className="text-muted-foreground/30">|</span>}
                      {settings.builderModel && (
                        <span className="flex items-center gap-1 truncate max-w-[140px]" title={`Builder: ${settings.builderModel}`}>
                          <Hammer className="h-3 w-3 text-amber-400" />
                          {settings.builderModel.split('/').pop()}
                        </span>
                      )}
                    </div>
                  ) : loadedModel ? (
                    <span className="text-xs text-muted-foreground truncate max-w-[180px]" title={`Model: ${loadedModel}`}>
                      {loadedModel}
                    </span>
                  ) : availableModels.length > 0 ? (
                    <span className="text-xs text-muted-foreground truncate max-w-[180px]" title={`${availableModels.length} models available`}>
                      {availableModels.length} models
                    </span>
                  ) : null}
                </div>
              )}
              <ThemeToggle />
              {!showFileExplorer && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowFileExplorer(true)}
                  title="Show Files"
                  data-testid="button-show-files"
                >
                  <PanelRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </header>
          
          <main className="flex-1 overflow-hidden">
            {projects.length === 0 && !activeProject ? (
              <EmptyState onCreateProject={() => createProject()} />
            ) : !displayCode && !isGenerating && !isPlanning && (!activeProject?.messages || activeProject.messages.length === 0) && !activeProject?.plan && (!activeProject?.generatedFiles || activeProject.generatedFiles.length === 0) ? (
              <GenerationWizard
                onGenerate={handleIntelligentGenerate}
                isGenerating={isGenerating || isPlanning}
                llmConnected={llmConnected}
                onCheckConnection={checkConnection}
                settings={settings}
                planBuildMode={planBuildMode}
              />
            ) : activeProject?.plan && !displayCode && !isBuilding ? (
              <div className="h-full max-w-3xl mx-auto">
                <PlanReviewPanel
                  plan={activeProject.plan}
                  onApprove={handleApprovePlan}
                  onReject={handleRejectPlan}
                  onBuild={handleStartBuild}
                  isApproving={isApproving}
                  isBuilding={isBuilding}
                />
              </div>
            ) : (
              <div className="relative h-full">
                <ResizablePanelGroup key={`layout-${showFileExplorer}`} direction="horizontal">
                {/* Left Panel: Chat */}
                <ResizablePanel defaultSize={30} minSize={20} maxSize={45}>
                  <div className="flex flex-col h-full border-r">
                    {lastError && !isGenerating && (
                      <div className="p-4 border-b">
                        <ErrorRecovery
                          error={lastError.message}
                          originalPrompt={lastError.prompt}
                          onRetry={handleRetryFromError}
                          onCheckConnection={checkConnection}
                          isRetrying={isGenerating}
                        />
                      </div>
                    )}
                    
                    {/* AI Thinking Panel - Shows real-time LLM reasoning */}
                    {(isGenerating || isPlanning) && (
                      <div className="px-2 py-2 shrink-0">
                        <MemoizedAIThinkingPanel
                          phase={orchestratorPhase}
                          thinking={orchestratorThinking}
                          generationPhase={generationPhase}
                          isActive={isGenerating || isPlanning}
                          streamingCode={streamingCode}
                        />
                      </div>
                    )}
                    
                    {/* Task Progress Panel - Shows tasks from planner */}
                    {orchestratorTasks.tasks.length > 0 && (
                      <div className="px-2 pb-2 shrink-0">
                        <TaskProgressPanel
                          tasks={orchestratorTasks.tasks}
                          completedCount={orchestratorTasks.completedCount}
                          totalCount={orchestratorTasks.totalCount}
                          isVisible={true}
                        />
                      </div>
                    )}
                    
                    <div className="flex-1 overflow-hidden">
                      <MemoizedChatPanel
                        messages={activeProject?.messages || []}
                        isLoading={isGenerating || isPlanning}
                        loadingPhase={generationPhase}
                        onSendMessage={handleIntelligentGenerate}
                        llmConnected={llmConnected}
                        onCheckConnection={checkConnection}
                      />
                    </div>
                  </div>
                </ResizablePanel>
                <ResizableHandle withHandle />
                
                {/* Center Panel: Preview/App */}
                <ResizablePanel defaultSize={showFileExplorer ? 50 : 70} minSize={30}>
                  <MemoizedPreviewPanel
                    code={displayCode}
                    isGenerating={isGenerating}
                    onDownload={handleDownload}
                    generatedFiles={activeProject?.generatedFiles}
                    projectName={activeProject?.name || "My Project"}
                    lastPrompt={activeProject?.lastPrompt}
                    dataModel={activeProject?.dataModel}
                    validation={activeProject?.validation}
                    projectId={activeProjectId || undefined}
                    settings={settings}
                    onRegenerate={(prompt, dataModel) => {
                      if (activeProject && dataModel) {
                        handleSendMessage(prompt, dataModel);
                      }
                    }}
                    onCodeUpdate={(newCode) => {
                      setStreamingCode(newCode);
                      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
                    }}
                    onFilesUpdate={() => {
                      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
                    }}
                  />
                </ResizablePanel>
                
                {/* Right Panel: Files (Collapsible) */}
                {showFileExplorer && (
                  <>
                    <ResizableHandle withHandle />
                    <ResizablePanel defaultSize={20} minSize={15} maxSize={35}>
                      <div className="flex flex-col h-full border-l bg-background">
                        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
                          <div className="flex items-center gap-2">
                            <FolderTree className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">Files</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setShowFileExplorer(false)}
                            data-testid="button-collapse-files"
                          >
                            <PanelRightClose className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                          {/* Dream Team Panel - Shows team and activity log */}
                          {settings.useDualModels && (
                            <div className="p-2 border-b">
                              <MemoizedProjectTeamPanel
                                projectId={activeProjectId}
                                llmSettings={{
                                  endpoint: settings.endpoint,
                                  plannerModel: settings.plannerModel,
                                  builderModel: settings.builderModel,
                                }}
                              />
                            </div>
                          )}
                          
                          {/* File Explorer */}
                          {activeProject?.generatedFiles && activeProject.generatedFiles.length > 0 ? (
                            <MemoizedFileExplorer
                              files={activeProject.generatedFiles}
                              selectedFile={selectedFile}
                              onSelectFile={setSelectedFile}
                              isGenerating={isGenerating}
                              className="h-full"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                              <FolderTree className="h-8 w-8 text-muted-foreground/50 mb-2" />
                              <p className="text-sm text-muted-foreground">
                                No files generated yet
                              </p>
                              <p className="text-xs text-muted-foreground/70 mt-1">
                                Start a conversation to generate your app
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </ResizablePanel>
                  </>
                )}
              </ResizablePanelGroup>
              
              {/* Right Edge Toggle - shows when file explorer is collapsed */}
              {!showFileExplorer && (
                <button
                  onClick={() => setShowFileExplorer(true)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-6 h-20 bg-muted/80 hover:bg-muted border-l border-y rounded-l-md transition-colors"
                  title="Show Files"
                  data-testid="button-edge-show-files"
                >
                  <PanelRight className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
              </div>
            )}
          </main>
        </div>
      </div>
      <SuccessCelebration show={showCelebration} onComplete={() => setShowCelebration(false)} />
      <OnboardingModal />
      
      {/* Web Search Permission Dialog */}
      <AlertDialog 
        open={!!webSearchPermissionPending} 
        onOpenChange={(open) => !open && setWebSearchPermissionPending(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-emerald-500" />
              Enable Web Search?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>{webSearchPermissionPending?.message}</p>
              {webSearchPermissionPending?.needsApiKey && (
                <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-md p-3">
                  <p className="text-amber-700 dark:text-amber-300 font-medium">API Key Required</p>
                  <p className="text-amber-600 dark:text-amber-400 text-sm mt-1">
                    Click the Settings button in the left sidebar, scroll to "Web Search" section, and add your Serper.dev API key. Get a free key at serper.dev
                  </p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Web search uses Serper.dev to fetch current information from the internet.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => {
                // Continue without web search
                setWebSearchPermissionPending(null);
                toast({
                  title: "Continuing without web search",
                  description: "Results may not include the latest information",
                });
              }}
              data-testid="button-skip-web-search"
            >
              Continue Without
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (webSearchPermissionPending?.needsApiKey) {
                  // Open settings
                  toast({
                    title: "Add API Key",
                    description: "Open Settings to add your Serper.dev API key",
                  });
                } else {
                  // Enable web search and retry
                  const newSettings = { ...settings, webSearchEnabled: true };
                  setSettings(newSettings);
                  toast({
                    title: "Web Search Enabled",
                    description: "Retrying your request with web search...",
                  });
                  // Retry the message
                  if (webSearchPermissionPending?.pendingContent) {
                    setTimeout(() => {
                      handleSendMessage(webSearchPermissionPending.pendingContent);
                    }, 500);
                  }
                }
                setWebSearchPermissionPending(null);
              }}
              data-testid="button-enable-web-search"
            >
              {webSearchPermissionPending?.needsApiKey ? (
                "Got it"
              ) : (
                <>
                  <Globe className="h-4 w-4 mr-2" />
                  Enable & Continue
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <CommandPalette
        onNewProject={() => createProject()}
        onDownload={activeProject ? handleDownload : undefined}
        onOpenSettings={() => {}}
        onOpenDreamTeam={() => {}}
        onRefreshConnection={checkConnection}
        onToggleTheme={toggleTheme}
        onConsultTeam={dreamTeamSettings.enabled && activeProject ? () => startDreamTeamDiscussion(activeProject.name, "General consultation") : undefined}
        hasActiveProject={!!activeProject}
        isGenerating={isGenerating || isPlanning}
        isDarkMode={isDarkMode}
      />
      {activeDiscussion && (
        <DreamTeamPanel
          settings={dreamTeamSettings}
          discussion={activeDiscussion}
          onUserResponse={handleDreamTeamResponse}
          onDismiss={() => setActiveDiscussion(null)}
          isGenerating={isDiscussionGenerating}
        />
      )}
    </SidebarProvider>
  );
}
