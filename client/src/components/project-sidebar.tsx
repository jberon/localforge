import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
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
import { Label } from "@/components/ui/label";
import { Plus, Folder, Settings, Trash2, Hammer, Pencil, Check, X, Code, MessageSquare } from "lucide-react";
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

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const handleSaveSettings = () => {
    onUpdateSettings(tempSettings);
    setSettingsOpen(false);
  };

  const startEditing = (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
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

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-sm">
            <Hammer className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-semibold text-base tracking-tight">LocalForge</h1>
            <p className="text-xs text-muted-foreground">AI App Builder</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <div className="flex items-center justify-between px-3 py-2">
            <SidebarGroupLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Projects
            </SidebarGroupLabel>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={onNewProject}
              data-testid="button-new-project"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <SidebarGroupContent>
            <ScrollArea className="h-[calc(100vh-240px)]">
              <SidebarMenu className="px-2 space-y-1">
                {projects.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
                      <Folder className="h-6 w-6 text-muted-foreground/50" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">No projects yet</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Create one to get started</p>
                  </div>
                ) : (
                  projects.map((project) => (
                    <SidebarMenuItem key={project.id}>
                      {editingId === project.id ? (
                        <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-accent">
                          <Input
                            ref={inputRef}
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onBlur={saveEdit}
                            className="h-7 text-sm"
                            data-testid={`input-rename-project-${project.id}`}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0"
                            onClick={saveEdit}
                            data-testid={`button-save-rename-${project.id}`}
                          >
                            <Check className="h-3.5 w-3.5 text-green-500" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0"
                            onClick={cancelEdit}
                            data-testid={`button-cancel-rename-${project.id}`}
                          >
                            <X className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      ) : (
                        <SidebarMenuButton
                          isActive={project.id === activeProjectId}
                          onClick={() => onSelectProject(project.id)}
                          className="group py-2.5 px-3"
                          data-testid={`button-project-${project.id}`}
                        >
                          <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
                            project.id === activeProjectId 
                              ? "bg-primary/10 text-primary" 
                              : "bg-muted text-muted-foreground"
                          }`}>
                            <Folder className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0 ml-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-medium">{project.name}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground">
                                {formatDate(project.updatedAt)}
                              </span>
                              {project.messages.length > 0 && (
                                <div className="flex items-center gap-0.5 text-muted-foreground">
                                  <MessageSquare className="h-3 w-3" />
                                  <span className="text-xs">{project.messages.length}</span>
                                </div>
                              )}
                              {project.generatedCode && (
                                <div className="flex items-center text-green-600 dark:text-green-400">
                                  <Code className="h-3 w-3" />
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span
                              role="button"
                              tabIndex={0}
                              className="h-6 w-6 flex items-center justify-center rounded-md hover-elevate cursor-pointer"
                              onClick={(e) => startEditing(project, e)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  startEditing(project, e as any);
                                }
                              }}
                              data-testid={`button-edit-project-${project.id}`}
                            >
                              <Pencil className="h-3 w-3" />
                            </span>
                            <span
                              role="button"
                              tabIndex={0}
                              className="h-6 w-6 flex items-center justify-center rounded-md hover-elevate cursor-pointer text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteProject(project.id);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.stopPropagation();
                                  onDeleteProject(project.id);
                                }
                              }}
                              data-testid={`button-delete-project-${project.id}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </span>
                          </div>
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

      <SidebarFooter className="border-t p-3">
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 h-9"
              data-testid="button-settings"
            >
              <Settings className="h-4 w-4" />
              <span className="text-sm">LLM Settings</span>
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>LLM Settings</DialogTitle>
              <DialogDescription>
                Configure your local LLM connection. Make sure LM Studio is running with the local server started.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="endpoint">API Endpoint</Label>
                <Input
                  id="endpoint"
                  value={tempSettings.endpoint}
                  onChange={(e) => setTempSettings({ ...tempSettings, endpoint: e.target.value })}
                  placeholder="http://localhost:1234/v1"
                  data-testid="input-endpoint"
                />
                <p className="text-xs text-muted-foreground">
                  Default LM Studio endpoint is http://localhost:1234/v1
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="model">Model Name (optional)</Label>
                <Input
                  id="model"
                  value={tempSettings.model}
                  onChange={(e) => setTempSettings({ ...tempSettings, model: e.target.value })}
                  placeholder="Leave empty to use default loaded model"
                  data-testid="input-model"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="temperature">Temperature: {tempSettings.temperature}</Label>
                <Input
                  id="temperature"
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={tempSettings.temperature}
                  onChange={(e) => setTempSettings({ ...tempSettings, temperature: parseFloat(e.target.value) })}
                  data-testid="input-temperature"
                />
                <p className="text-xs text-muted-foreground">
                  Lower values produce more focused output, higher values more creative
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
        <p className="text-xs text-muted-foreground text-center mt-2">
          made by Josh Beron
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
