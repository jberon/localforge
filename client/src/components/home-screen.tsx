import { useState, useMemo } from "react";
import { 
  Home, 
  FolderOpen, 
  BarChart3, 
  Settings, 
  Search, 
  Plus, 
  FileCode, 
  BookOpen,
  Globe,
  FlaskConical,
  ArrowRight,
  Box,
  Paintbrush,
  Paperclip,
  Zap,
  Sparkles,
  ChevronDown,
  Clock,
  MessageSquare,
  Trash2,
  ExternalLink,
  Cpu,
  Code,
  Layers,
  Wand2,
  Shield,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Project } from "@shared/schema";

type ProjectListItem = Pick<Project, "id" | "name" | "updatedAt"> & { messageCount?: number } & Record<string, any>;

interface HomeScreenProps {
  projects: ProjectListItem[];
  onCreateProject: () => void;
  onSelectProject: (id: string) => void;
  onGenerate: (prompt: string, mode: "app" | "design") => void;
  isGenerating: boolean;
  isConnected: boolean;
  testModeActive?: boolean;
  testModeConnected?: boolean;
  onOpenSettings?: () => void;
  onNavigateAnalytics?: () => void;
}

export function HomeScreen({
  projects,
  onCreateProject,
  onSelectProject,
  onGenerate,
  isGenerating,
  isConnected,
  testModeActive = false,
  testModeConnected = false,
  onOpenSettings,
  onNavigateAnalytics,
}: HomeScreenProps) {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"app" | "design">("app");
  const [activeNav, setActiveNav] = useState("Home");
  const [projectSearch, setProjectSearch] = useState("");

  const handleSubmit = () => {
    if (prompt.trim() && !isGenerating && isConnected) {
      onGenerate(prompt.trim(), mode);
      setPrompt("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleNavClick = (label: string) => {
    if (label === "Analytics" && onNavigateAnalytics) {
      onNavigateAnalytics();
      return;
    }
    if (label === "Settings") {
      if (onOpenSettings) onOpenSettings();
      return;
    }
    setActiveNav(label);
  };

  const filteredProjects = useMemo(() => {
    if (!projectSearch.trim()) return projects;
    const q = projectSearch.toLowerCase();
    return projects.filter(p => p.name.toLowerCase().includes(q));
  }, [projects, projectSearch]);

  const recentProjects = projects
    .filter(p => p.messages && p.messages.length > 0 || p.generatedCode || (p.generatedFiles && p.generatedFiles.length > 0))
    .slice(0, 6);

  const formatTimeAgo = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const sidebarStyle = {
    "--sidebar-width": "220px",
    "--sidebar-width-icon": "3rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={sidebarStyle} data-testid="home-screen">
      <div className="flex h-screen w-full">
        <Sidebar data-testid="nav-sidebar">
          <SidebarHeader className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center" data-testid="img-logo">
                  <span className="text-white font-bold text-xs">L</span>
                </div>
              </div>
              <Button variant="ghost" size="icon" data-testid="button-nav-search">
                <Search className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-1 mt-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={onCreateProject}
                data-testid="button-create-app"
              >
                <Plus className="h-4 w-4" />
                Create App
              </Button>
              <SidebarMenuButton
                className="text-xs text-muted-foreground"
                data-testid="button-import"
              >
                Import code or design
              </SidebarMenuButton>
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={activeNav === "Home"}
                      onClick={() => handleNavClick("Home")}
                      data-testid="nav-home"
                    >
                      <Home className="h-4 w-4" />
                      <span>Home</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={activeNav === "Projects"}
                      onClick={() => handleNavClick("Projects")}
                      data-testid="nav-projects"
                    >
                      <FolderOpen className="h-4 w-4" />
                      <span>Projects</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={activeNav === "Analytics"}
                      onClick={() => handleNavClick("Analytics")}
                      data-testid="nav-analytics"
                    >
                      <BarChart3 className="h-4 w-4" />
                      <span>Analytics</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>Configuration</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={activeNav === "Settings"}
                      onClick={() => handleNavClick("Settings")}
                      data-testid="nav-settings"
                    >
                      <Settings className="h-4 w-4" />
                      <span>Settings</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t p-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeNav === "Documentation"}
                  onClick={() => setActiveNav("Documentation")}
                  data-testid="nav-learn"
                >
                  <BookOpen className="h-4 w-4" />
                  <span>Documentation</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 overflow-y-auto">
          {activeNav === "Projects" ? (
            <div className="p-6 max-w-[1000px] mx-auto">
              <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
                <h1 className="text-2xl font-semibold text-foreground" data-testid="text-projects-title">
                  All Projects
                </h1>
                <div className="flex items-center gap-2">
                  <ThemeToggle />
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={onCreateProject}
                    data-testid="button-create-project-top"
                  >
                    <Plus className="h-4 w-4" />
                    New Project
                  </Button>
                </div>
              </div>

              <div className="relative mb-6">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search projects..."
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-projects"
                />
              </div>

              {filteredProjects.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredProjects.map((project) => (
                    <Card
                      key={project.id}
                      className="overflow-visible cursor-pointer hover-elevate transition-all"
                      onClick={() => onSelectProject(project.id)}
                      data-testid={`card-project-${project.id}`}
                    >
                      <div className="h-28 bg-gradient-to-br from-muted/80 to-muted flex items-center justify-center rounded-t-md">
                        <FileCode className="h-8 w-8 text-muted-foreground/40" />
                      </div>
                      <div className="p-3 space-y-1">
                        <h3 className="text-sm font-medium text-foreground truncate" data-testid={`text-project-name-${project.id}`}>
                          {project.name}
                        </h3>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {(project.messageCount ?? 0) > 0 && (
                            <span className="flex items-center gap-1" data-testid={`text-message-count-${project.id}`}>
                              <MessageSquare className="h-3 w-3" />
                              {project.messageCount}
                            </span>
                          )}
                          <span className="flex items-center gap-1" data-testid={`text-time-ago-${project.id}`}>
                            <Clock className="h-3 w-3" />
                            {formatTimeAgo(project.updatedAt)}
                          </span>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16" data-testid="text-no-projects-found">
                  <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground mb-4">
                    {projectSearch ? "No projects match your search." : "No projects yet."}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={onCreateProject}
                    data-testid="button-create-first-project"
                  >
                    <Plus className="h-4 w-4" />
                    Create your first project
                  </Button>
                </div>
              )}
            </div>
          ) : activeNav === "Documentation" ? (
            <div className="p-6 max-w-[800px] mx-auto">
              <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setActiveNav("Home")}
                    data-testid="button-docs-back"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <h1 className="text-2xl font-semibold text-foreground" data-testid="text-docs-title">
                    Documentation
                  </h1>
                </div>
                <div>
                  <ThemeToggle />
                </div>
              </div>

              <div className="space-y-6">
                <Card className="overflow-visible">
                  <div className="p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-foreground" />
                      <h2 className="text-lg font-semibold text-foreground" data-testid="text-docs-getting-started">Getting Started</h2>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      LocalForge generates full-stack web applications from natural language descriptions. Simply describe what you want to build and LocalForge will generate the code for you.
                    </p>
                    <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                      <li>Open LM Studio and load a model (recommended: Qwen 2.5 Coder 14B or Qwen3 Coder 30B)</li>
                      <li>Start the local server in LM Studio's Developer tab</li>
                      <li>Open Settings in LocalForge and enter your server URL (usually http://localhost:1234/v1)</li>
                      <li>Describe your app idea and click Start</li>
                    </ol>
                  </div>
                </Card>

                <Card className="overflow-visible">
                  <div className="p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <Layers className="h-5 w-5 text-foreground" />
                      <h2 className="text-lg font-semibold text-foreground" data-testid="text-docs-plan-build">Plan & Build Modes</h2>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      LocalForge supports two modes for generating apps:
                    </p>
                    <div className="space-y-2">
                      <div className="p-3 rounded-md bg-muted/30">
                        <p className="text-sm font-medium text-foreground">Plan Mode</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          The AI first creates a structured task list for your review. You can approve, modify, or reject the plan before any code is generated.
                        </p>
                      </div>
                      <div className="p-3 rounded-md bg-muted/30">
                        <p className="text-sm font-medium text-foreground">Build Mode</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          The AI jumps straight into writing code. Choose Fast Mode for quick edits (10-60s) or Full Build for comprehensive generation (5-15min).
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="overflow-visible">
                  <div className="p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-5 w-5 text-foreground" />
                      <h2 className="text-lg font-semibold text-foreground" data-testid="text-docs-dual-model">Dual Model (AI Dream Team)</h2>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Configure two separate LLMs for optimal results: a reasoning model for planning and architecture, and a coding model for implementation.
                    </p>
                    <div className="space-y-2">
                      <div className="p-3 rounded-md bg-violet-500/5 border border-violet-500/20">
                        <p className="text-sm font-medium text-foreground">Planner (Reasoning)</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Recommended: Ministral 3 14B Reasoning. Handles task decomposition, architecture decisions, and project planning.
                        </p>
                      </div>
                      <div className="p-3 rounded-md bg-blue-500/5 border border-blue-500/20">
                        <p className="text-sm font-medium text-foreground">Builder (Coding)</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Recommended: Qwen3 Coder 30B or Qwen2.5 Coder 14B. Generates production-ready code with TypeScript, React, and testing.
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="overflow-visible">
                  <div className="p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-foreground" />
                      <h2 className="text-lg font-semibold text-foreground" data-testid="text-docs-auto-fix">Closed-Loop Auto-Fix</h2>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      LocalForge includes a three-stage error prevention and auto-fix system:
                    </p>
                    <div className="space-y-2">
                      <div className="p-3 rounded-md bg-muted/30">
                        <p className="text-sm font-medium text-foreground">Stage 1: Prevention</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Injects error-prevention prompts based on learned patterns before code generation begins.
                        </p>
                      </div>
                      <div className="p-3 rounded-md bg-muted/30">
                        <p className="text-sm font-medium text-foreground">Stage 2: Live Validation</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Validates generated code in real-time with syntax checking and style enforcement.
                        </p>
                      </div>
                      <div className="p-3 rounded-md bg-muted/30">
                        <p className="text-sm font-medium text-foreground">Stage 3: Auto-Fix</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Automatically retries with targeted fix prompts when errors are detected, learning from each attempt.
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="overflow-visible">
                  <div className="p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <Wand2 className="h-5 w-5 text-foreground" />
                      <h2 className="text-lg font-semibold text-foreground" data-testid="text-docs-features">Key Features</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3 rounded-md bg-muted/30">
                        <p className="text-sm font-medium text-foreground">Design Mode</p>
                        <p className="text-xs text-muted-foreground mt-1">Generate wireframes and mockups before code</p>
                      </div>
                      <div className="p-3 rounded-md bg-muted/30">
                        <p className="text-sm font-medium text-foreground">Version Control</p>
                        <p className="text-xs text-muted-foreground mt-1">Auto-save checkpoints with rollback support</p>
                      </div>
                      <div className="p-3 rounded-md bg-muted/30">
                        <p className="text-sm font-medium text-foreground">Live Preview</p>
                        <p className="text-xs text-muted-foreground mt-1">In-browser bundling with esbuild-wasm</p>
                      </div>
                      <div className="p-3 rounded-md bg-muted/30">
                        <p className="text-sm font-medium text-foreground">Export & Deploy</p>
                        <p className="text-xs text-muted-foreground mt-1">Download ZIP or deploy to Vercel, Netlify, Railway</p>
                      </div>
                      <div className="p-3 rounded-md bg-muted/30">
                        <p className="text-sm font-medium text-foreground">Autonomy Levels</p>
                        <p className="text-xs text-muted-foreground mt-1">Control AI intervention from Low to Max</p>
                      </div>
                      <div className="p-3 rounded-md bg-muted/30">
                        <p className="text-sm font-medium text-foreground">Extended Thinking</p>
                        <p className="text-xs text-muted-foreground mt-1">Deep reasoning for complex tasks</p>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center pt-12 pb-16 px-4 min-h-full relative">
              <div className="absolute top-3 right-3">
                <ThemeToggle />
              </div>

              <div className="flex items-center gap-2 mb-6">
                {testModeActive && (
                  <Badge 
                    variant="secondary" 
                    className={`${testModeConnected ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'} border`}
                    data-testid="badge-test-mode"
                  >
                    <FlaskConical className="w-3 h-3 mr-1" />
                    Test Mode
                  </Badge>
                )}
                {isConnected && (
                  <div className="flex items-center gap-1.5" data-testid="indicator-connection-status">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" data-testid="indicator-connected-dot" />
                    <span className="text-xs text-muted-foreground" data-testid="text-connection-status">Connected</span>
                  </div>
                )}
              </div>

              <div className="text-center mb-8 space-y-1">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground" data-testid="text-greeting">
                  Hi, what do you want to make?
                </h1>
              </div>

              <div className="w-full max-w-[600px] space-y-3">
                <Tabs value={mode} onValueChange={(v) => setMode(v as "app" | "design")} className="w-full">
                  <TabsList className="grid w-full grid-cols-2 h-11 p-1 bg-muted/50 rounded-xl">
                    <TabsTrigger 
                      value="app" 
                      className="flex items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all text-sm"
                      data-testid="tab-app-mode"
                    >
                      <Box className="h-4 w-4" />
                      <span className="font-medium">App</span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="design" 
                      className="flex items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all text-sm"
                      data-testid="tab-design-mode"
                    >
                      <Paintbrush className="h-4 w-4" />
                      <span className="font-medium">Design</span>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="relative bg-background border rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50 transition-all">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe your idea..."
                    className="w-full min-h-[120px] max-h-[200px] p-4 pb-14 bg-transparent border-0 resize-none focus:outline-none text-sm placeholder:text-muted-foreground/60"
                    disabled={isGenerating || !isConnected}
                    data-testid="textarea-home-prompt"
                  />

                  <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 flex-wrap">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="gap-1.5 text-xs text-muted-foreground"
                            data-testid="dropdown-build-mode"
                          >
                            <Globe className="h-3.5 w-3.5" />
                            <span>Build</span>
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem className="gap-2" data-testid="menu-item-build-fast">
                            <Zap className="h-4 w-4" />
                            <div>
                              <div className="font-medium text-sm">Fast</div>
                              <div className="text-xs text-muted-foreground">Quick edits (10-60s)</div>
                            </div>
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2" data-testid="menu-item-build-full">
                            <Sparkles className="h-4 w-4" />
                            <div>
                              <div className="font-medium text-sm">Full Build</div>
                              <div className="text-xs text-muted-foreground">Complete app (5-15min)</div>
                            </div>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <Button 
                        variant="ghost" 
                        size="icon"
                        data-testid="button-attach"
                      >
                        <Paperclip className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="flex items-center gap-1 flex-wrap">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        data-testid="button-quick-actions"
                      >
                        <Zap className="h-4 w-4" />
                      </Button>

                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={onOpenSettings}
                        data-testid="button-prompt-settings"
                      >
                        <Settings className="h-4 w-4" />
                      </Button>

                      <Button
                        onClick={handleSubmit}
                        disabled={!prompt.trim() || isGenerating || !isConnected}
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 ml-1 text-xs"
                        data-testid="button-start-generation"
                      >
                        <span className="font-medium">Start</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground flex-wrap">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="gap-1 text-xs text-muted-foreground"
                        data-testid="dropdown-app-type"
                      >
                        <Globe className="h-3.5 w-3.5" />
                        <span>Web app</span>
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem data-testid="menu-item-app-web">Web app</DropdownMenuItem>
                      <DropdownMenuItem data-testid="menu-item-app-mobile">Mobile app</DropdownMenuItem>
                      <DropdownMenuItem data-testid="menu-item-app-desktop">Desktop app</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="gap-1 text-xs text-muted-foreground"
                        data-testid="dropdown-autonomy"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>Auto</span>
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem data-testid="menu-item-autonomy-low">Low</DropdownMenuItem>
                      <DropdownMenuItem data-testid="menu-item-autonomy-medium">Medium</DropdownMenuItem>
                      <DropdownMenuItem data-testid="menu-item-autonomy-high">High</DropdownMenuItem>
                      <DropdownMenuItem data-testid="menu-item-autonomy-max">Max</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {recentProjects.length > 0 && (
                <div className="w-full max-w-[900px] mt-16">
                  <div className="flex items-center justify-between gap-2 mb-4 px-1 flex-wrap">
                    <h2 className="text-lg font-semibold text-foreground" data-testid="text-recent-apps">
                      Recent Apps
                    </h2>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="gap-1 text-xs text-muted-foreground"
                      onClick={() => setActiveNav("Projects")}
                      data-testid="button-view-all"
                    >
                      View All
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {recentProjects.map((project) => (
                      <Card
                        key={project.id}
                        className="overflow-visible cursor-pointer hover-elevate transition-all"
                        onClick={() => onSelectProject(project.id)}
                        data-testid={`card-project-${project.id}`}
                      >
                        <div className="h-32 bg-gradient-to-br from-muted/80 to-muted flex items-center justify-center rounded-t-md">
                          <FileCode className="h-10 w-10 text-muted-foreground/40" />
                        </div>
                        <div className="p-3 space-y-1">
                          <h3 className="text-sm font-medium text-foreground truncate" data-testid={`text-project-name-${project.id}`}>
                            {project.name}
                          </h3>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            {(project.messageCount ?? 0) > 0 && (
                              <span className="flex items-center gap-1" data-testid={`text-message-count-${project.id}`}>
                                <MessageSquare className="h-3 w-3" />
                                {project.messageCount}
                              </span>
                            )}
                            <span className="flex items-center gap-1" data-testid={`text-time-ago-${project.id}`}>
                              <Clock className="h-3 w-3" />
                              {formatTimeAgo(project.updatedAt)}
                            </span>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {recentProjects.length === 0 && projects.length === 0 && (
                <div className="w-full max-w-[600px] mt-16 text-center" data-testid="text-no-projects">
                  <p className="text-sm text-muted-foreground">
                    No projects yet. Describe your idea above to get started.
                  </p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </SidebarProvider>
  );
}
