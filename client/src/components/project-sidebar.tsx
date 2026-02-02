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
import { Label } from "@/components/ui/label";
import { Plus, Settings, Trash2, Hammer, Pencil, MoreHorizontal, Download } from "lucide-react";
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
                    No projects yet
                  </div>
                ) : (
                  projects.map((project) => (
                    <SidebarMenuItem key={project.id} className="mb-0.5">
                      {editingId === project.id ? (
                        <div className="flex items-center gap-1 px-3 py-2 rounded-lg bg-accent">
                          <Input
                            ref={inputRef}
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onBlur={saveEdit}
                            className="h-7 text-sm border-0 bg-transparent focus-visible:ring-0 px-1"
                            data-testid={`input-rename-project-${project.id}`}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center group/item">
                          <SidebarMenuButton
                            isActive={project.id === activeProjectId}
                            onClick={() => onSelectProject(project.id)}
                            className="flex-1 py-2.5"
                            data-testid={`button-project-${project.id}`}
                          >
                            <span className="truncate flex-1 text-sm">{project.name}</span>
                          </SidebarMenuButton>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0"
                                onClick={(e) => e.stopPropagation()}
                                data-testid={`button-menu-project-${project.id}`}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditing(project);
                                }}
                                data-testid={`button-edit-project-${project.id}`}
                              >
                                <Pencil className="h-4 w-4 mr-2" />
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteProject(project.id);
                                }}
                                className="text-destructive focus:text-destructive"
                                data-testid={`button-delete-project-${project.id}`}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
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
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  Temperature is automatically optimized based on what you're building.
                  Creative apps use higher values, utility apps use lower values for precision.
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
