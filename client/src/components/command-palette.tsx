import { useCallback, useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Plus,
  Download,
  Settings,
  Sparkles,
  Trash2,
  Play,
  Save,
  FileCode,
  Users,
  Zap,
  Eye,
  RefreshCw,
  FolderOpen,
  HelpCircle,
  Moon,
  Sun,
} from "lucide-react";

interface CommandAction {
  id: string;
  label: string;
  shortcut?: string;
  icon: typeof Plus;
  action: () => void;
  group: "project" | "generation" | "view" | "settings";
}

interface CommandPaletteProps {
  onNewProject: () => void;
  onDownload?: () => void;
  onOpenSettings: () => void;
  onOpenDreamTeam: () => void;
  onRefreshConnection: () => void;
  onToggleTheme: () => void;
  onConsultTeam?: () => void;
  hasActiveProject?: boolean;
  isGenerating?: boolean;
  isDarkMode?: boolean;
}

export function CommandPalette({
  onNewProject,
  onDownload,
  onOpenSettings,
  onOpenDreamTeam,
  onRefreshConnection,
  onToggleTheme,
  onConsultTeam,
  hasActiveProject,
  isGenerating,
  isDarkMode,
}: CommandPaletteProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = useCallback((command: () => void) => {
    setOpen(false);
    command();
  }, []);

  const actions: CommandAction[] = [
    {
      id: "new-project",
      label: "New Project",
      shortcut: "⌘N",
      icon: Plus,
      action: onNewProject,
      group: "project",
    },
    {
      id: "download",
      label: "Download Project",
      shortcut: "⌘D",
      icon: Download,
      action: onDownload || (() => {}),
      group: "project",
    },
    {
      id: "settings",
      label: "Open Settings",
      shortcut: "⌘,",
      icon: Settings,
      action: onOpenSettings,
      group: "settings",
    },
    {
      id: "dream-team",
      label: "AI Dream Team Settings",
      icon: Users,
      action: onOpenDreamTeam,
      group: "settings",
    },
    {
      id: "refresh-connection",
      label: "Refresh LM Studio Connection",
      icon: RefreshCw,
      action: onRefreshConnection,
      group: "settings",
    },
    {
      id: "toggle-theme",
      label: isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode",
      icon: isDarkMode ? Sun : Moon,
      action: onToggleTheme,
      group: "view",
    },
  ];

  if (hasActiveProject && onConsultTeam) {
    actions.push({
      id: "consult-team",
      label: "Consult AI Dream Team",
      icon: Sparkles,
      action: onConsultTeam,
      group: "generation",
    });
  }

  const projectActions = actions.filter((a) => a.group === "project");
  const generationActions = actions.filter((a) => a.group === "generation");
  const viewActions = actions.filter((a) => a.group === "view");
  const settingsActions = actions.filter((a) => a.group === "settings");

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." data-testid="input-command-palette" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        
        <CommandGroup heading="Project">
          {projectActions.map((action) => (
            <CommandItem
              key={action.id}
              onSelect={() => runCommand(action.action)}
              disabled={action.id === "download" && !hasActiveProject}
              data-testid={`command-${action.id}`}
            >
              <action.icon className="mr-2 h-4 w-4" />
              <span>{action.label}</span>
              {action.shortcut && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {action.shortcut}
                </span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>

        {generationActions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="AI">
              {generationActions.map((action) => (
                <CommandItem
                  key={action.id}
                  onSelect={() => runCommand(action.action)}
                  disabled={isGenerating}
                  data-testid={`command-${action.id}`}
                >
                  <action.icon className="mr-2 h-4 w-4" />
                  <span>{action.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="View">
          {viewActions.map((action) => (
            <CommandItem
              key={action.id}
              onSelect={() => runCommand(action.action)}
              data-testid={`command-${action.id}`}
            >
              <action.icon className="mr-2 h-4 w-4" />
              <span>{action.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Settings">
          {settingsActions.map((action) => (
            <CommandItem
              key={action.id}
              onSelect={() => runCommand(action.action)}
              data-testid={`command-${action.id}`}
            >
              <action.icon className="mr-2 h-4 w-4" />
              <span>{action.label}</span>
              {action.shortcut && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {action.shortcut}
                </span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Help">
          <CommandItem
            onSelect={() => runCommand(() => {
              localStorage.removeItem("localforge_onboarding_completed");
              window.location.reload();
            })}
            data-testid="command-show-tutorial"
          >
            <HelpCircle className="mr-2 h-4 w-4" />
            <span>Show Tutorial</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>

      <div className="border-t px-3 py-2">
        <p className="text-xs text-muted-foreground text-center">
          Press <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">⌘K</kbd> to open this menu anytime
        </p>
      </div>
    </CommandDialog>
  );
}
