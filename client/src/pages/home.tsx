import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { ProjectSidebar } from "@/components/project-sidebar";
import { ChatPanel } from "@/components/chat-panel";
import { PreviewPanel } from "@/components/preview-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Wifi, WifiOff } from "lucide-react";
import JSZip from "jszip";
import type { Project, LLMSettings, DataModel } from "@shared/schema";

export default function Home() {
  const { toast } = useToast();
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingCode, setStreamingCode] = useState("");
  const [llmConnected, setLlmConnected] = useState<boolean | null>(null);
  const [settings, setSettings] = useState<LLMSettings>({
    endpoint: "http://localhost:1234/v1",
    model: "",
    temperature: 0.7,
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
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete project",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = useCallback(
    async (content: string, dataModel?: DataModel) => {
      let projectId = activeProjectId;
      const projectName = content.slice(0, 50) + (content.length > 50 ? "..." : "");
      
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

      setIsGenerating(true);
      setStreamingCode("");

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
          });
          
          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Failed to generate project");
          }
          
          await queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
          
          toast({
            title: "Full-Stack Project Generated!",
            description: "Check the Files tab to view and download your project.",
          });
        } else {
          // Use regular LLM streaming for frontend-only apps
          const response = await fetch(`/api/projects/${projectId}/chat`, {
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
                    } else if (data.type === "error") {
                      toast({
                        title: "Generation Failed",
                        description: data.error || "Could not connect to LM Studio",
                        variant: "destructive",
                      });
                      await queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
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
    [activeProjectId, settings, toast]
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
            <div className="flex items-center gap-2">
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
            <ResizablePanelGroup direction="horizontal">
              <ResizablePanel defaultSize={45} minSize={30}>
                <ChatPanel
                  messages={activeProject?.messages || []}
                  isLoading={isGenerating}
                  onSendMessage={handleSendMessage}
                  llmConnected={llmConnected}
                  onCheckConnection={checkConnection}
                />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={55} minSize={30}>
                <PreviewPanel
                  code={displayCode}
                  isGenerating={isGenerating}
                  onDownload={handleDownload}
                  generatedFiles={activeProject?.generatedFiles}
                  projectName={activeProject?.name || "My Project"}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
