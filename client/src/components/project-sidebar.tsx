import { useState, useRef, useEffect } from "react";
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
import { Plus, Settings, Trash2, Hammer, Pencil, MoreHorizontal, Download, RefreshCw, Check, X, Loader2 } from "lucide-react";
import type { Project, LLMSettings } from "@shared/schema";

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tempSettings, setTempSettings] = useState(settings);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "checking">("checking");

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    setTempSettings(settings);
  }, [settings]);

  const fetchModels = async (endpoint: string) => {
    setIsLoadingModels(true);
    setConnectionStatus("checking");
    try {
      const response = await fetch(`/api/llm/models?endpoint=${encodeURIComponent(endpoint)}`);
      const data = await response.json();
      if (data.success && data.models) {
        setAvailableModels(data.models);
        setConnectionStatus("connected");
      } else {
        setAvailableModels([]);
        setConnectionStatus("disconnected");
      }
    } catch {
      setAvailableModels([]);
      setConnectionStatus("disconnected");
    } finally {
      setIsLoadingModels(false);
    }
  };

  useEffect(() => {
    if (settingsOpen) {
      fetchModels(tempSettings.endpoint);
    }
  }, [settingsOpen]);

  const handleEndpointChange = (endpoint: string) => {
    setTempSettings({ ...tempSettings, endpoint });
  };

  const handleRefreshConnection = () => {
    fetchModels(tempSettings.endpoint);
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
      <SidebarHeader className="p-4 pt-8 pl-20 electron-drag-region">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Hammer className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold">LocalForge</span>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={onNewProject}
            data-testid="button-new-project"
            className="electron-no-drag"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <ScrollArea className="h-[calc(100vh-180px)]">
              <SidebarMenu className="px-2">
                {projects.length === 0 ? (
                  <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No projects yet.
                    <br />
                    Click + to create one.
                  </div>
                ) : (
                  projects.map((project) => (
                    <SidebarMenuItem key={project.id}>
                      {editingId === project.id ? (
                        <div className="flex items-center gap-1 px-2 py-1">
                          <Input
                            ref={inputRef}
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onBlur={saveEdit}
                            className="h-7 text-sm"
                            data-testid="input-project-name"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center group">
                          <SidebarMenuButton
                            isActive={project.id === activeProjectId}
                            onClick={() => onSelectProject(project.id)}
                            className="flex-1"
                            data-testid={`button-project-${project.id}`}
                          >
                            <span className="truncate">{project.name}</span>
                          </SidebarMenuButton>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                data-testid={`button-project-menu-${project.id}`}
                              >
                                <MoreHorizontal className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => startEditing(project)}>
                                <Pencil className="h-3 w-3 mr-2" />
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => onDeleteProject(project.id)}
                                className="text-destructive"
                              >
                                <Trash2 className="h-3 w-3 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
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
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                LM Studio Settings
              </DialogTitle>
              <DialogDescription>
                Configure your connection to LM Studio. Make sure LM Studio is running with the local server started.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="endpoint">API Endpoint</Label>
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
                        Disconnected
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Input
                    id="endpoint"
                    value={tempSettings.endpoint}
                    onChange={(e) => handleEndpointChange(e.target.value)}
                    placeholder="http://localhost:1234/v1"
                    data-testid="input-endpoint"
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleRefreshConnection}
                    disabled={isLoadingModels}
                    data-testid="button-refresh-connection"
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoadingModels ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Default LM Studio endpoint is http://localhost:1234/v1
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                {availableModels.length > 0 ? (
                  <Select
                    value={tempSettings.model || "auto"}
                    onValueChange={(value) => setTempSettings({ ...tempSettings, model: value === "auto" ? "" : value })}
                  >
                    <SelectTrigger data-testid="select-model">
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto (use loaded model)</SelectItem>
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
                    placeholder="Leave empty to use loaded model"
                    data-testid="input-model"
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  {availableModels.length > 0 
                    ? `${availableModels.length} model${availableModels.length === 1 ? '' : 's'} available`
                    : "Connect to LM Studio to see available models"}
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
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
          data-testid="button-download-desktop"
        >
          <Download className="h-4 w-4 mr-2" />
          Download Desktop App
        </Button>
        <div className="text-center mt-2">
          <p className="text-xs text-muted-foreground">
            Built by Josh Beron
          </p>
          <p className="text-[10px] text-muted-foreground/60" data-testid="version-number">
            v1.1.0
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
