import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { Plus, Folder, Settings, Trash2, Hammer } from "lucide-react";
import type { Project, LLMSettings } from "@shared/schema";

interface ProjectSidebarProps {
  projects: Project[];
  activeProjectId: string | null;
  settings: LLMSettings;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onDeleteProject: (id: string) => void;
  onUpdateSettings: (settings: LLMSettings) => void;
}

export function ProjectSidebar({
  projects,
  activeProjectId,
  settings,
  onSelectProject,
  onNewProject,
  onDeleteProject,
  onUpdateSettings,
}: ProjectSidebarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tempSettings, setTempSettings] = useState(settings);

  const handleSaveSettings = () => {
    onUpdateSettings(tempSettings);
    setSettingsOpen(false);
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <Hammer className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-semibold text-sm">LocalForge</h1>
            <p className="text-xs text-muted-foreground">AI App Builder</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <div className="flex items-center justify-between px-2">
            <SidebarGroupLabel>Projects</SidebarGroupLabel>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={onNewProject}
              data-testid="button-new-project"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <SidebarGroupContent>
            <ScrollArea className="h-[calc(100vh-220px)]">
              <SidebarMenu>
                {projects.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <Folder className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-xs text-muted-foreground">No projects yet</p>
                    <p className="text-xs text-muted-foreground">Create one to get started</p>
                  </div>
                ) : (
                  projects.map((project) => (
                    <SidebarMenuItem key={project.id}>
                      <SidebarMenuButton
                        isActive={project.id === activeProjectId}
                        onClick={() => onSelectProject(project.id)}
                        className="group"
                        data-testid={`button-project-${project.id}`}
                      >
                        <Folder className="h-4 w-4" />
                        <div className="flex-1 min-w-0">
                          <span className="truncate block text-sm">{project.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(project.updatedAt)}
                          </span>
                        </div>
                        <span
                          role="button"
                          tabIndex={0}
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-md hover-elevate cursor-pointer"
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
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))
                )}
              </SidebarMenu>
            </ScrollArea>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t p-2">
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2"
              data-testid="button-settings"
            >
              <Settings className="h-4 w-4" />
              LLM Settings
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
        <p className="text-xs text-muted-foreground text-center mt-3">
          made by Josh Beron
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
