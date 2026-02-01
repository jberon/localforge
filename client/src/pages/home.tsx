import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { DualModelSettings } from "@/components/dual-model-settings";
import { DreamTeamSettings } from "@/components/dream-team-settings";
import { DreamTeamPanel } from "@/components/dream-team-panel";
import { VersionHistory } from "@/components/version-history";
import { CommandPalette } from "@/components/command-palette";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/hooks/use-theme";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { trackEvent } from "@/lib/analytics";
import { classifyRequest, shouldUsePlanner, getIntentDescription, type RequestIntent } from "@/lib/request-classifier";
import { Wifi, WifiOff, BarChart3, Brain, Hammer, Zap, Users } from "lucide-react";
import { Link } from "wouter";
import JSZip from "jszip";
import type { Project, LLMSettings, DataModel, DualModelSettings as DualModelSettingsType, Plan, DreamTeamSettings as DreamTeamSettingsType, DreamTeamDiscussion } from "@shared/schema";
import { defaultDreamTeamPersonas } from "@shared/schema";

export default function Home() {
  const { toast } = useToast();
  const { isDarkMode, toggleTheme } = useTheme();
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationPhase, setGenerationPhase] = useState<string | null>(null);
  const [streamingCode, setStreamingCode] = useState("");
  const [llmConnected, setLlmConnected] = useState<boolean | null>(null);
  const [loadedModel, setLoadedModel] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [settings, setSettings] = useState<LLMSettings>({
    endpoint: "http://localhost:1234/v1",
    model: "",
    temperature: 0.7,
  });
  
  // Plan & Build mode state
  const planBuildMode = true; // Always use intelligent mode
  const [isPlanning, setIsPlanning] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [streamingPlan, setStreamingPlan] = useState("");
  const [detectedIntent, setDetectedIntent] = useState<RequestIntent | null>(null);
  const [autoRouting, setAutoRouting] = useState(true);
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
    pauseOnMajorDecisions: true,
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

  // Check LLM connection status
  const checkConnection = useCallback(async () => {
    try {
      const response = await fetch("/api/llm/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: settings.endpoint }),
      });
      const data = await response.json();
      setLlmConnected(data.connected);
      if (data.connected && data.models?.length > 0) {
        // Use configured model if set, otherwise show first available
        const activeModel = settings.model || data.models[0];
        setLoadedModel(activeModel);
      } else {
        setLoadedModel(null);
      }
    } catch {
      setLlmConnected(false);
      setLoadedModel(null);
    }
  }, [settings.endpoint, settings.model]);

  useEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, 30000);
    return () => clearInterval(interval);
  }, [checkConnection]);

  const createProjectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/projects", {
        name: "New Project",
        messages: [],
      });
      return response.json();
    },
    onSuccess: (newProject: Project) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setActiveProjectId(newProject.id);
      trackEvent("project_created", newProject.id);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create project",
        variant: "destructive",
      });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/projects/${id}`);
      return id;
    },
    onSuccess: (deletedId: string) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      if (activeProjectId === deletedId) {
        setActiveProjectId(null);
      }
      trackEvent("project_deleted", deletedId);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete project",
        variant: "destructive",
      });
    },
  });

  const renameProjectMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const response = await apiRequest("PATCH", `/api/projects/${id}/name`, { name });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to rename project",
        variant: "destructive",
      });
    },
  });

  // Keyboard shortcuts (Cmd on Mac, Ctrl on Windows/Linux)
  const shortcuts = useMemo(() => [
    {
      key: "n",
      cmdOrCtrl: true,
      action: () => createProjectMutation.mutate(),
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
  ], [createProjectMutation, activeProject, toast]);

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

  const handleSendMessage = useCallback(
    async (content: string, dataModel?: DataModel, templateTemperature?: number, overrideSettings?: LLMSettings) => {
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
          toast({
            title: "Full-Stack Project Generated!",
            description: "Check the Files tab to view and download your project.",
          });
        } else {
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
        toast({
          title: "Error",
          description: error.message || "Failed to generate app",
          variant: "destructive",
        });
      } finally {
        setIsGenerating(false);
        setGenerationPhase(null);
        setStreamingCode("");
      }
    },
    [activeProjectId, settings, toast, projects]
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
      const builderSettings: LLMSettings = dualModelSettings.builder;
      
      if (usePlanner) {
        await handleCreatePlan(content, dataModel);
      } else {
        await handleSendMessage(content, dataModel, undefined, builderSettings);
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
    async (content: string, dataModel?: DataModel, templateTemperature?: number) => {
      if (!planBuildMode || !autoRouting) {
        // Use standard generation when Plan & Build mode is off
        return handleSendMessage(content, dataModel, templateTemperature);
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
      const builderSettings: LLMSettings = dualModelSettings.builder;

      if (usePlanner) {
        // Route to planner model for planning/reasoning requests
        await handleCreatePlan(content, dataModel);
      } else if (classification.intent === "refine" && hasExistingCode) {
        // Use builder settings for refinements
        await handleSendMessage(content, dataModel, undefined, builderSettings);
      } else {
        // Use builder model directly for direct build requests
        await handleSendMessage(content, dataModel, undefined, builderSettings);
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
          onNewProject={() => createProjectMutation.mutate()}
          onDeleteProject={(id) => deleteProjectMutation.mutate(id)}
          onRenameProject={(id, name) => renameProjectMutation.mutate({ id, name })}
          onUpdateSettings={(newSettings) => {
            setSettings(newSettings);
            checkConnection();
          }}
        />
        
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-2 px-4 py-2 border-b bg-background">
            <div className="flex items-center gap-3">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              {activeProject && (
                <span className="text-sm font-medium truncate max-w-xs">
                  {activeProject.name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
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
              <DualModelSettings
                settings={dualModelSettings}
                onSettingsChange={setDualModelSettings}
              />
              <DreamTeamSettings
                settings={dreamTeamSettings}
                onSettingsChange={setDreamTeamSettings}
              />
              {dreamTeamSettings.enabled && activeProject && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => startDreamTeamDiscussion(
                    `Project Review: ${activeProject.name}`,
                    `The current project "${activeProject.name}" needs expert review. ${activeProject.lastPrompt ? `Last request: "${activeProject.lastPrompt}". ` : ""}Please discuss the current approach and provide recommendations.`
                  )}
                  disabled={isDiscussionGenerating || !llmConnected}
                  data-testid="button-consult-dream-team"
                >
                  <Users className="w-4 h-4 mr-2" />
                  Consult Team
                </Button>
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
                  className="gap-1.5 text-xs border-yellow-500/50 text-yellow-600 dark:text-yellow-400 cursor-pointer hover-elevate"
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
                  {loadedModel && (
                    <span className="text-xs text-muted-foreground truncate max-w-[180px]" title={`Model: ${loadedModel}`}>
                      {loadedModel}
                    </span>
                  )}
                </div>
              )}
              <ThemeToggle />
            </div>
          </header>
          
          <main className="flex-1 overflow-hidden">
            {projects.length === 0 && !activeProject ? (
              <EmptyState onCreateProject={() => createProjectMutation.mutate()} />
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
              <ResizablePanelGroup direction="horizontal">
                <ResizablePanel defaultSize={40} minSize={25}>
                  <ChatPanel
                    messages={activeProject?.messages || []}
                    isLoading={isGenerating || isPlanning}
                    loadingPhase={generationPhase}
                    onSendMessage={handleIntelligentGenerate}
                    llmConnected={llmConnected}
                    onCheckConnection={checkConnection}
                  />
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={60} minSize={35}>
                  <PreviewPanel
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
              </ResizablePanelGroup>
            )}
          </main>
        </div>
      </div>
      <SuccessCelebration show={showCelebration} onComplete={() => setShowCelebration(false)} />
      <OnboardingModal />
      <CommandPalette
        onNewProject={() => createProjectMutation.mutate()}
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
