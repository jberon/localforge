import { useState, useEffect } from "react";
import { Zap, Hammer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";

type BuildMode = "fast" | "full";

interface BuildModeConfig {
  mode: BuildMode;
  maxTokens: number;
  temperature: number;
  enabledServices: string[];
  estimatedTime: string;
  description: string;
}

interface BuildSpeedToggleProps {
  projectId?: string;
  onModeChange?: (mode: BuildMode) => void;
}

export function BuildSpeedToggle({ projectId, onModeChange }: BuildSpeedToggleProps) {
  const [config, setConfig] = useState<BuildModeConfig | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, [projectId]);

  const fetchConfig = async () => {
    try {
      const url = projectId 
        ? `/api/optimization/build-mode?projectId=${projectId}` 
        : "/api/optimization/build-mode";
      const response = await fetch(url);
      const data = await response.json();
      setConfig(data);
    } catch (error) {
      console.error("Failed to fetch build mode config:", error);
    }
  };

  const setMode = async (mode: BuildMode) => {
    setLoading(true);
    try {
      await apiRequest("PUT", "/api/optimization/build-mode", { mode, projectId });
      await fetchConfig();
      onModeChange?.(mode);
    } catch (error) {
      console.error("Failed to set build mode:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!config) return null;

  return (
    <div className="flex items-center gap-2" data-testid="build-speed-toggle">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={config.mode === "fast" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("fast")}
            disabled={loading}
            className="gap-1.5"
            data-testid="button-fast-mode"
          >
            <Zap className="h-3.5 w-3.5" />
            Fast
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="font-medium">Fast Mode</p>
          <p className="text-xs text-muted-foreground">
            Quick, targeted edits. Completes in 10-60 seconds.
          </p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={config.mode === "full" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("full")}
            disabled={loading}
            className="gap-1.5"
            data-testid="button-full-mode"
          >
            <Hammer className="h-3.5 w-3.5" />
            Full Build
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="font-medium">Full Build Mode</p>
          <p className="text-xs text-muted-foreground">
            Comprehensive generation with all automation. Takes 5-15 minutes.
          </p>
        </TooltipContent>
      </Tooltip>

      <Badge variant="secondary" className="text-xs" data-testid="badge-estimated-time">
        {config.estimatedTime}
      </Badge>
    </div>
  );
}
