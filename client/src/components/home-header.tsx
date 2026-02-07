import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeployButton } from "@/components/deploy-button";
import { ChevronDown, FlaskConical, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Project } from "@shared/schema";

type ProjectListItem = Pick<Project, "id" | "name"> & Record<string, any>;

interface HomeHeaderProps {
  activeProject: Project | undefined;
  activeProjectId: string | null;
  projects: ProjectListItem[];
  testModeActive: boolean;
  testModeConnected: boolean;
  isGenerating: boolean;
  isPlanning: boolean;
  isBuilding: boolean;
  onCreateProject: () => void;
  onSelectProject: (id: string) => void;
  isMobile?: boolean;
}

export function HomeHeader({
  activeProject,
  activeProjectId,
  projects,
  testModeActive,
  testModeConnected,
  isGenerating,
  isPlanning,
  isBuilding,
  onCreateProject,
  onSelectProject,
  isMobile,
}: HomeHeaderProps) {
  return (
    <header className={`flex items-center justify-between gap-2 px-3 border-b border-border/40 bg-muted/30 shrink-0 ${isMobile ? 'h-11 min-h-[44px]' : 'h-9 min-h-[36px] gap-4'}`}>
      <div className="flex items-center gap-2 min-w-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={`flex items-center gap-1.5 min-w-0 hover-elevate rounded-md ${isMobile ? 'px-2 py-1.5 min-h-[36px]' : 'px-1.5 py-0.5'}`} data-testid="button-project-selector">
              <span className="text-sm font-medium truncate" data-testid="text-chat-project-name">
                {activeProject?.name || "New Project"}
              </span>
              <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onClick={() => onCreateProject()} data-testid="menu-new-project">
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </DropdownMenuItem>
            {projects.length > 0 && <DropdownMenuSeparator />}
            {projects.map((project) => (
              <DropdownMenuItem
                key={project.id}
                onClick={() => onSelectProject(project.id)}
                className={project.id === activeProjectId ? "bg-accent" : ""}
                data-testid={`menu-project-${project.id}`}
              >
                <span className="truncate">{project.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {testModeActive && (
          <Badge 
            variant="secondary" 
            className={`${testModeConnected ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'} border text-xs`}
            data-testid="badge-test-mode"
            title={testModeConnected ? "Test Mode: Connected to Replit AI" : "Test Mode: Not Connected"}
          >
            <FlaskConical className="w-3 h-3 mr-1" />
            Test
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-1">
        {activeProject && (
          <DeployButton
            projectId={parseInt(activeProject.id) || 0}
            projectName={activeProject.name}
            hasBackend={true}
            hasDatabase={false}
            disabled={isGenerating || isPlanning || isBuilding}
          />
        )}
      </div>
    </header>
  );
}
