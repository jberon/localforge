import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, Hammer, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type AgentMode = "plan" | "build";

interface PlanBuildModeToggleProps {
  mode: AgentMode;
  onModeChange: (mode: AgentMode) => void;
  disabled?: boolean;
  className?: string;
}

export function PlanBuildModeToggle({
  mode,
  onModeChange,
  disabled = false,
  className,
}: PlanBuildModeToggleProps) {
  return (
    <div 
      className={cn("flex items-center gap-1 p-1 bg-muted/50 rounded-lg", className)}
      data-testid="mode-toggle"
    >
      <Button
        variant={mode === "plan" ? "secondary" : "ghost"}
        size="sm"
        onClick={() => onModeChange("plan")}
        disabled={disabled}
        className={cn(
          "gap-1.5 text-xs font-medium toggle-elevate",
          mode === "plan" && "toggle-elevated bg-purple-600 text-white border-purple-600"
        )}
        data-testid="button-mode-plan"
      >
        <Lightbulb className="w-3.5 h-3.5" />
        Plan
      </Button>
      <Button
        variant={mode === "build" ? "secondary" : "ghost"}
        size="sm"
        onClick={() => onModeChange("build")}
        disabled={disabled}
        className={cn(
          "gap-1.5 text-xs font-medium toggle-elevate",
          mode === "build" && "toggle-elevated bg-orange-600 text-white border-orange-600"
        )}
        data-testid="button-mode-build"
      >
        <Hammer className="w-3.5 h-3.5" />
        Build
      </Button>
    </div>
  );
}

interface ModeIndicatorProps {
  mode: AgentMode;
  className?: string;
}

export function ModeIndicator({ mode, className }: ModeIndicatorProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 text-[10px] font-medium",
        mode === "plan" 
          ? "border-purple-500/50 bg-purple-500/10 text-purple-400" 
          : "border-orange-500/50 bg-orange-500/10 text-orange-400",
        className
      )}
    >
      {mode === "plan" ? (
        <>
          <Lightbulb className="w-3 h-3" />
          Planning
        </>
      ) : (
        <>
          <Hammer className="w-3 h-3" />
          Building
        </>
      )}
    </Badge>
  );
}

interface PlanModeInfoProps {
  className?: string;
}

export function PlanModeInfo({ className }: PlanModeInfoProps) {
  return (
    <div 
      className={cn("text-xs text-muted-foreground bg-purple-500/5 border border-purple-500/20 rounded-lg p-3", className)}
      data-testid="plan-mode-info"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Lightbulb className="w-3.5 h-3.5 text-purple-400" />
        <span className="font-medium text-purple-300">Plan Mode Active</span>
      </div>
      <p className="leading-relaxed">
        In Plan mode, I'll help you brainstorm, explore approaches, and create a structured task list—without modifying any files. 
        When ready, approve the plan to start building.
      </p>
    </div>
  );
}

interface BuildModeInfoProps {
  className?: string;
}

export function BuildModeInfo({ className }: BuildModeInfoProps) {
  return (
    <div className={cn("text-xs text-muted-foreground bg-orange-500/5 border border-orange-500/20 rounded-lg p-3", className)}>
      <div className="flex items-center gap-2 mb-1.5">
        <Hammer className="w-3.5 h-3.5 text-orange-400" />
        <span className="font-medium text-orange-300">Build Mode</span>
      </div>
      <p className="leading-relaxed">
        In Build mode, I'll directly write code, create files, and implement features in your project.
      </p>
    </div>
  );
}
