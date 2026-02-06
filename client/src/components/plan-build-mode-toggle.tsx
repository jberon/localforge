import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, Hammer, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type AgentMode = "plan" | "build" | "discuss";

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
      <Button
        variant={mode === "discuss" ? "secondary" : "ghost"}
        size="sm"
        onClick={() => onModeChange("discuss")}
        disabled={disabled}
        className={cn(
          "gap-1.5 text-xs font-medium toggle-elevate",
          mode === "discuss" && "toggle-elevated bg-teal-600 text-white border-teal-600"
        )}
        data-testid="button-mode-discuss"
      >
        <MessageCircle className="w-3.5 h-3.5" />
        Discuss
      </Button>
    </div>
  );
}

interface ModeIndicatorProps {
  mode: AgentMode;
  className?: string;
}

export function ModeIndicator({ mode, className }: ModeIndicatorProps) {
  const config = {
    plan: { border: "border-purple-500/50", bg: "bg-purple-500/10", text: "text-purple-400", icon: Lightbulb, label: "Planning" },
    build: { border: "border-orange-500/50", bg: "bg-orange-500/10", text: "text-orange-400", icon: Hammer, label: "Building" },
    discuss: { border: "border-teal-500/50", bg: "bg-teal-500/10", text: "text-teal-400", icon: MessageCircle, label: "Discussing" },
  };
  const c = config[mode];
  const Icon = c.icon;

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 text-[10px] font-medium",
        c.border, c.bg, c.text,
        className
      )}
    >
      <Icon className="w-3 h-3" />
      {c.label}
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

interface DiscussModeInfoProps {
  className?: string;
}

export function DiscussModeInfo({ className }: DiscussModeInfoProps) {
  return (
    <div 
      className={cn("text-xs text-muted-foreground bg-teal-500/5 border border-teal-500/20 rounded-lg p-3", className)}
      data-testid="discuss-mode-info"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <MessageCircle className="w-3.5 h-3.5 text-teal-400" />
        <span className="font-medium text-teal-300">Discussion Mode</span>
      </div>
      <p className="leading-relaxed">
        In Discussion mode, we brainstorm ideas, explore approaches, and think through your project—no code changes will be made. 
        When ready, click "Apply to Project" to convert ideas into action.
      </p>
    </div>
  );
}
