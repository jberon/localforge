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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { trackEvent } from "@/lib/analytics";
import { classifyRequest, shouldUsePlanner, getIntentDescription, type RequestIntent } from "@/lib/request-classifier";
import { Wifi, WifiOff, BarChart3, Brain, Hammer, Zap } from "lucide-react";
import { Link } from "wouter";
import JSZip from "jszip";
import type { Project, LLMSettings, DataModel, DualModelSettings as DualModelSettingsType, Plan } from "@shared/schema";

export default function Home() {
  const { toast } = useToast();
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingCode, setStreamingCode] = useState("");
  const [llmConnected, setLlmConnected] = useState<boolean | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [settings, setSettings] = useState<LLMSettings>({
    endpoint: "http://localhost:1234/v1",
    model: "",
    temperature: 0.7,
  });
  
  // Plan & Build mode state
  const [planBuildMode, setPlanBuildMode] = useState(false);
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
      temperature: 0.3,
    },
    builder: {
      endpoint: "http://localhost:1234/v1",
      model: "",
      temperature: 0.5,
    },
  });

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
    } catch {
      setLlmConnected(false);
    }
  }, [settings.endpoint]);

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

  // Keyboard shortcuts (Cmd+N on Mac, Ctrl+N on Windows/Linux)
  const shortcuts = useMemo(() => [
    {
      key: "n",
      cmdOrCtrl: true,
      action: () => createProjectMutation.mutate(),
      description: "New project",
    },
  ], [createProjectMutation]);

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

      // Track generation started
      trackEvent("generation_started", projectId || undefined, {
        promptLength: content.length,
        hasDataModel: !!dataModel,
        isFullStack: dataModel?.enableDatabase && dataModel?.entities.length > 0,
      });

      try {
        // If dataModel has entities and database is enabled, use full-stack generation
        if (dataModel && dataModel.enableDatabase && dataModel.entities.length > 0) {
          // Add user message first
          await apiRequest("POST", `/api/projects/${projectId}/chat`, {
            content,
            settings,
          }).catch(() => {});

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
                      accumulatedCode += data.content;
                      // Clean markdown as we go for preview
                      const cleaned = accumulatedCode
                        .replace(/^```(?:jsx?|javascript|typescript|tsx)?\n?/gm, "")
                        .replace(/```$/gm, "");
                      setStreamingCode(cleaned);
                    } else if (data.type === "done") {
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
      setStreamingPlan("");
    }
  }, [activeProjectId, dualModelSettings.planner, toast]);

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
    [planBuildMode, autoRouting, activeProject, streamingCode, handleSendMessage, handleCreatePlan, toast, dualModelSettings.builder]
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
              <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/50">
                <Zap className={`h-3.5 w-3.5 ${planBuildMode ? "text-amber-500" : "text-muted-foreground"}`} />
                <Switch
                  id="plan-build-mode"
                  checked={planBuildMode}
                  onCheckedChange={setPlanBuildMode}
                  data-testid="switch-plan-build-mode"
                />
                <Label 
                  htmlFor="plan-build-mode" 
                  className={`text-xs cursor-pointer ${planBuildMode ? "text-foreground" : "text-muted-foreground"}`}
                >
                  Smart Mode
                </Label>
                {planBuildMode && (
                  <Badge 
                    variant="outline" 
                    className="text-[10px] px-1.5 py-0 h-4 text-amber-600 border-amber-500/30"
                    data-testid="badge-auto-routing"
                  >
                    Auto
                  </Badge>
                )}
              </div>
              {planBuildMode && (
                <>
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
                </>
              )}
              <Button variant="ghost" size="sm" asChild data-testid="button-analytics">
                <Link href="/analytics">
                  <BarChart3 className="h-4 w-4 mr-1" />
                  Analytics
                </Link>
              </Button>
              <Badge 
                variant={llmConnected ? "default" : "secondary"} 
                className="gap-1.5 text-xs"
                data-testid="badge-connection-status"
              >
                {llmConnected ? (
                  <>
                    <Wifi className="h-3 w-3" />
                    Connected
                  </>
                ) : llmConnected === false ? (
                  <>
                    <WifiOff className="h-3 w-3" />
                    Disconnected
                  </>
                ) : (
                  <>
                    <Wifi className="h-3 w-3 animate-pulse" />
                    Checking...
                  </>
                )}
              </Badge>
              <ThemeToggle />
            </div>
          </header>
          
          <main className="flex-1 overflow-hidden">
            {projects.length === 0 && !activeProject ? (
              <EmptyState onCreateProject={() => createProjectMutation.mutate()} />
            ) : !displayCode && !isGenerating && !isPlanning && (!activeProject?.messages || activeProject.messages.length === 0) && !activeProject?.plan ? (
              <GenerationWizard
                onGenerate={planBuildMode ? handleIntelligentGenerate : handleSendMessage}
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
                    onSendMessage={planBuildMode ? handleIntelligentGenerate : handleSendMessage}
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
                  />
                </ResizablePanel>
              </ResizablePanelGroup>
            )}
          </main>
        </div>
      </div>
      <SuccessCelebration show={showCelebration} onComplete={() => setShowCelebration(false)} />
      <OnboardingModal />
    </SidebarProvider>
  );
}
