import { Settings, Sun, Moon, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface MinimalHeaderProps {
  appName?: string;
  isDarkMode?: boolean;
  onToggleTheme?: () => void;
  onOpenSettings?: () => void;
  testModeActive?: boolean;
  testModeConnected?: boolean;
  isConnected?: boolean;
}

export function MinimalHeader({
  appName = "LocalForge",
  isDarkMode = false,
  onToggleTheme,
  onOpenSettings,
  testModeActive = false,
  testModeConnected = false,
  isConnected = false,
}: MinimalHeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 bg-background/80 backdrop-blur-xl border-b border-border/40">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center">
            <span className="text-white font-bold text-sm">L</span>
          </div>
          <span className="font-semibold text-lg tracking-tight">{appName}</span>
        </div>
        
        {testModeActive && (
          <Badge 
            variant="secondary" 
            className={`ml-2 ${testModeConnected ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'} border`}
            data-testid="badge-test-mode"
          >
            <FlaskConical className="w-3 h-3 mr-1" />
            Test Mode
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-1">
        {isConnected && (
          <div className="flex items-center gap-2 mr-3">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs text-muted-foreground">Connected</span>
          </div>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-9 w-9 rounded-lg"
              onClick={onToggleTheme}
              data-testid="button-theme-toggle"
            >
              {isDarkMode ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isDarkMode ? "Light mode" : "Dark mode"}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-9 w-9 rounded-lg"
              onClick={onOpenSettings}
              data-testid="button-header-settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
