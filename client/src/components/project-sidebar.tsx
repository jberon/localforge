import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupContent,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Plus, Settings, Trash2, Hammer, Pencil, MoreHorizontal, Download, RefreshCw, Check, X, Loader2, Brain, Code, ChevronDown, ChevronUp, Globe, Eye, EyeOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { Project, LLMSettings } from "@shared/schema";
import { APP_VERSION, APP_NAME } from "@shared/version";

interface ProjectSidebarProps {
  projects: Project[];
  activeProjectId: string | null;
  settings: LLMSettings;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, name: string) => void;
  onUpdateSettings: (settings: LLMSettings) => void;
}

interface ModelsResponse {
  success: boolean;
  models?: string[];
  error?: string;
}

export function ProjectSidebar({
  projects,
  activeProjectId,
  settings,
  onSelectProject,
  onNewProject,
  onDeleteProject,
  onRenameProject,
  onUpdateSettings,
}: ProjectSidebarProps) {
  const queryClient = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tempSettings, setTempSettings] = useState(settings);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [debouncedEndpoint, setDebouncedEndpoint] = useState(tempSettings.endpoint);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    setTempSettings(settings);
    setDebouncedEndpoint(settings.endpoint);
  }, [settings]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedEndpoint(tempSettings.endpoint);
    }, 500);
    return () => clearTimeout(timer);
  }, [tempSettings.endpoint]);

  const { data: modelsData, isLoading: isLoadingModels, refetch: refetchModels } = useQuery<ModelsResponse>({
    queryKey: ["/api/llm/models", debouncedEndpoint],
    queryFn: async () => {
      const response = await fetch(`/api/llm/models?endpoint=${encodeURIComponent(debouncedEndpoint)}`);
      return response.json();
    },
    enabled: settingsOpen,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const availableModels = modelsData?.models || [];
  const connectionStatus = isLoadingModels ? "checking" : modelsData?.success ? "connected" : "disconnected";

  useEffect(() => {
    if (connectionStatus === "connected" && tempSettings.model && !availableModels.includes(tempSettings.model)) {
      setTempSettings(prev => ({ ...prev, model: "" }));
    }
  }, [availableModels, connectionStatus, tempSettings.model]);

  const handleEndpointChange = (endpoint: string) => {
    setTempSettings({ ...tempSettings, endpoint });
  };

  const handleRefreshConnection = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/llm/models", debouncedEndpoint] });
    refetchModels();
  };

  const handleSaveSettings = () => {
    onUpdateSettings(tempSettings);
    setSettingsOpen(false);
  };

  const startEditing = (project: Project) => {
    setEditingId(project.id);
    setEditingName(project.name);
  };

  const saveEdit = () => {
    if (editingId && editingName.trim()) {
      onRenameProject(editingId, editingName.trim());
    }
    setEditingId(null);
    setEditingName("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      saveEdit();
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  };

  return (
    <Sidebar className="border-r">
      <SidebarHeader className="p-4 pt-8 electron-drag-region">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0">
            <Hammer className="h-4 w-4 text-white" />
          </div>
          <span className="font-semibold text-base">LocalForge</span>
        </div>
        <Button
          variant="ghost"
          onClick={onNewProject}
          data-testid="button-new-project"
          className="w-full justify-center h-9 border border-dashed border-muted-foreground/30 hover:border-muted-foreground/50 electron-no-drag"
        >
          <Plus className="h-4 w-4 mr-2" />
          <span className="text-sm">New Project</span>
        </Button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <ScrollArea className="h-[calc(100vh-220px)]">
              <SidebarMenu className="px-2 space-y-1">
                {projects.length === 0 ? (
                  <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No projects yet.
                    <br />
                    Create one to get started.
                  </div>
                ) : (
                  projects.map((project) => (
                    <SidebarMenuItem key={project.id} className="list-none">
                      {editingId === project.id ? (
                        <div className="flex items-center gap-1 px-2 py-1">
                          <Input
                            ref={inputRef}
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onBlur={saveEdit}
                            className="h-8 text-sm"
                            data-testid="input-project-name"
                          />
                        </div>
                      ) : (
                        <SidebarMenuButton
                          isActive={project.id === activeProjectId}
                          onClick={() => onSelectProject(project.id)}
                          className="flex items-center justify-between w-full px-3 py-2 h-auto min-h-[36px] group/project"
                          data-testid={`button-project-${project.id}`}
                        >
                          <span className="truncate text-sm flex-1">{project.name}</span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <div
                                role="button"
                                onClick={(e) => e.stopPropagation()}
                                className="h-6 w-6 flex items-center justify-center rounded opacity-0 group-hover/project:opacity-100 hover:bg-accent transition-opacity flex-shrink-0"
                                data-testid={`button-project-menu-${project.id}`}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </div>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => startEditing(project)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => onDeleteProject(project.id)}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </SidebarMenuButton>
                      )}
                    </SidebarMenuItem>
                  ))
                )}
              </SidebarMenu>
            </ScrollArea>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 border-t">
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 h-9"
              data-testid="button-settings"
            >
              <Settings className="h-4 w-4" />
              <span className="text-sm">Settings</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                LM Studio Connection
              </DialogTitle>
              <DialogDescription>
                Connect to your local LM Studio server to generate apps.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-4">
              {connectionStatus === "disconnected" && (
                <div className="p-3 rounded-lg bg-muted/50 border text-sm space-y-2">
                  <p className="font-medium">Quick Setup:</p>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-xs">
                    <li>Open LM Studio and go to the <strong>Developer</strong> tab</li>
                    <li>Make sure <strong>Status: Running</strong> is enabled</li>
                    <li>Copy the URL shown under "Reachable at:" (usually http://127.0.0.1:1234)</li>
                    <li>Paste it below and add <strong>/v1</strong> at the end</li>
                  </ol>
                </div>
              )}
              
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Label htmlFor="endpoint">Server URL</Label>
                  <div className="flex items-center gap-2">
                    {connectionStatus === "checking" && (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Checking...
                      </Badge>
                    )}
                    {connectionStatus === "connected" && (
                      <Badge variant="outline" className="gap-1 text-xs text-green-600 border-green-500/50">
                        <Check className="h-3 w-3" />
                        Connected
                      </Badge>
                    )}
                    {connectionStatus === "disconnected" && (
                      <Badge variant="outline" className="gap-1 text-xs text-red-600 border-red-500/50">
                        <X className="h-3 w-3" />
                        Not Connected
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Input
                    id="endpoint"
                    value={tempSettings.endpoint}
                    onChange={(e) => handleEndpointChange(e.target.value)}
                    placeholder="http://127.0.0.1:1234/v1"
                    data-testid="input-endpoint"
                    className="flex-1 font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleRefreshConnection}
                    disabled={isLoadingModels}
                    data-testid="button-refresh-connection"
                    title="Test connection"
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoadingModels ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Copy from LM Studio's "Reachable at:" and add <strong>/v1</strong>
                </p>
              </div>

              {/* Dual Model Toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <Brain className="h-4 w-4 text-violet-500" />
                    <Code className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Dual Model Mode</Label>
                    <p className="text-xs text-muted-foreground">Use separate models for planning and building</p>
                  </div>
                </div>
                <Button
                  variant={tempSettings.useDualModels ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTempSettings({ 
                    ...tempSettings, 
                    useDualModels: !tempSettings.useDualModels,
                    plannerModel: tempSettings.plannerModel || tempSettings.model,
                    builderModel: tempSettings.builderModel || tempSettings.model,
                  })}
                  data-testid="button-toggle-dual-models"
                >
                  {tempSettings.useDualModels ? "On" : "Off"}
                </Button>
              </div>

              {!tempSettings.useDualModels ? (
                <>
                  {/* Single Model Mode */}
                  <div className="space-y-2">
                    <Label htmlFor="model">Model (API Identifier)</Label>
                    {availableModels.length > 0 ? (
                      <Select
                        value={tempSettings.model || "auto"}
                        onValueChange={(value) => setTempSettings({ ...tempSettings, model: value === "auto" ? "" : value })}
                      >
                        <SelectTrigger data-testid="select-model">
                          <SelectValue placeholder="Select a model" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto (use first loaded model)</SelectItem>
                          {availableModels.map((model) => (
                            <SelectItem key={model} value={model}>
                              {model}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id="model"
                        value={tempSettings.model}
                        onChange={(e) => setTempSettings({ ...tempSettings, model: e.target.value })}
                        placeholder="e.g. openai/gpt-oss-20b"
                        data-testid="input-model"
                        className="font-mono text-sm"
                      />
                    )}
                    <p className="text-xs text-muted-foreground">
                      {availableModels.length > 0 
                        ? `${availableModels.length} model${availableModels.length === 1 ? '' : 's'} loaded in LM Studio`
                        : "Find the API Model Identifier in LM Studio's model info panel"}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <Label>Temperature</Label>
                      <span className="text-sm text-muted-foreground font-mono">
                        {tempSettings.temperature.toFixed(2)}
                      </span>
                    </div>
                    <Slider
                      value={[tempSettings.temperature]}
                      onValueChange={([value]) => setTempSettings({ ...tempSettings, temperature: value })}
                      min={0}
                      max={1}
                      step={0.05}
                      data-testid="slider-temperature"
                    />
                    <p className="text-xs text-muted-foreground">
                      Lower values produce more focused, deterministic outputs. Higher values are more creative.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  {/* Dual Model Mode - Planner */}
                  <div className="space-y-3 p-3 rounded-lg border bg-violet-500/5 border-violet-500/20">
                    <div className="flex items-center gap-2">
                      <Brain className="h-4 w-4 text-violet-500" />
                      <Label className="text-sm font-medium">Planner Model</Label>
                    </div>
                    <p className="text-xs text-muted-foreground -mt-1">
                      Analyzes requests and creates structured plans. Best with reasoning-focused models.
                    </p>
                    {availableModels.length > 0 ? (
                      <Select
                        value={tempSettings.plannerModel || "auto"}
                        onValueChange={(value) => setTempSettings({ ...tempSettings, plannerModel: value === "auto" ? "" : value })}
                      >
                        <SelectTrigger data-testid="select-planner-model">
                          <SelectValue placeholder="Select planner model" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto (use first loaded model)</SelectItem>
                          {availableModels.map((model) => (
                            <SelectItem key={model} value={model}>{model}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={tempSettings.plannerModel}
                        onChange={(e) => setTempSettings({ ...tempSettings, plannerModel: e.target.value })}
                        placeholder="e.g. qwen2.5-32b-instruct"
                        className="font-mono text-sm"
                      />
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">Temperature</span>
                      <span className="text-xs font-mono">{(tempSettings.plannerTemperature ?? 0.3).toFixed(2)}</span>
                    </div>
                    <Slider
                      value={[tempSettings.plannerTemperature ?? 0.3]}
                      onValueChange={([value]) => setTempSettings({ ...tempSettings, plannerTemperature: value })}
                      min={0}
                      max={1}
                      step={0.05}
                      data-testid="slider-planner-temperature"
                    />
                  </div>

                  {/* Dual Model Mode - Builder */}
                  <div className="space-y-3 p-3 rounded-lg border bg-blue-500/5 border-blue-500/20">
                    <div className="flex items-center gap-2">
                      <Code className="h-4 w-4 text-blue-500" />
                      <Label className="text-sm font-medium">Builder Model</Label>
                    </div>
                    <p className="text-xs text-muted-foreground -mt-1">
                      Generates code from plans. Best with code-specialized models.
                    </p>
                    {availableModels.length > 0 ? (
                      <Select
                        value={tempSettings.builderModel || "auto"}
                        onValueChange={(value) => setTempSettings({ ...tempSettings, builderModel: value === "auto" ? "" : value })}
                      >
                        <SelectTrigger data-testid="select-builder-model">
                          <SelectValue placeholder="Select builder model" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto (use first loaded model)</SelectItem>
                          {availableModels.map((model) => (
                            <SelectItem key={model} value={model}>{model}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={tempSettings.builderModel}
                        onChange={(e) => setTempSettings({ ...tempSettings, builderModel: e.target.value })}
                        placeholder="e.g. qwen2.5-coder-32b-instruct"
                        className="font-mono text-sm"
                      />
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">Temperature</span>
                      <span className="text-xs font-mono">{(tempSettings.builderTemperature ?? 0.5).toFixed(2)}</span>
                    </div>
                    <Slider
                      value={[tempSettings.builderTemperature ?? 0.5]}
                      onValueChange={([value]) => setTempSettings({ ...tempSettings, builderTemperature: value })}
                      min={0}
                      max={1}
                      step={0.05}
                      data-testid="slider-builder-temperature"
                    />
                  </div>
                </>
              )}

              {/* Web Search Section */}
              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-emerald-500" />
                  <Label className="text-sm font-medium">Web Search (Serper.dev)</Label>
                </div>
                <p className="text-xs text-muted-foreground -mt-2">
                  Enable web search to get up-to-date information for questions about current events, prices, or live data.
                </p>

                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
                  <div>
                    <Label className="text-sm font-medium">Enable Web Search</Label>
                    <p className="text-xs text-muted-foreground">
                      When enabled, the AI will search the web when it needs current information
                    </p>
                  </div>
                  <Switch
                    checked={tempSettings.webSearchEnabled ?? false}
                    onCheckedChange={(checked) => setTempSettings({ ...tempSettings, webSearchEnabled: checked })}
                    data-testid="switch-web-search"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="serper-api-key">Serper.dev API Key</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        id="serper-api-key"
                        type={showApiKey ? "text" : "password"}
                        value={tempSettings.serperApiKey ?? ""}
                        onChange={(e) => setTempSettings({ ...tempSettings, serperApiKey: e.target.value })}
                        placeholder="Enter your Serper.dev API key"
                        data-testid="input-serper-api-key"
                        className="font-mono text-sm pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowApiKey(!showApiKey)}
                        data-testid="button-toggle-api-key-visibility"
                      >
                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Get your free API key at{" "}
                    <a
                      href="https://serper.dev"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      serper.dev
                    </a>
                    . Stored locally on this machine.
                  </p>
                </div>
              </div>

            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSettingsOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveSettings} data-testid="button-save-settings">
                Save Settings
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-2"
          onClick={() => window.open('https://github.com/jberon/localforge/releases/latest', '_blank')}
          data-testid="button-github-releases"
        >
          <Download className="h-4 w-4 mr-2" />
          Check for Updates
        </Button>
        <div className="text-center mt-2">
          <p className="text-xs text-muted-foreground">
            Built by Josh Beron
          </p>
          <p className="text-[10px] text-muted-foreground/60" data-testid="version-number">
            v{APP_VERSION}
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
