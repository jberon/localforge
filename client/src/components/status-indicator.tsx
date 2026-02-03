import { cn } from "@/lib/utils";
import { 
  Loader2, 
  Brain, 
  Sparkles, 
  Zap, 
  RefreshCw,
  CheckCircle2,
  Code2,
  FileEdit,
  Search
} from "lucide-react";

export type StatusType = 
  | "thinking"
  | "generating"
  | "building"
  | "optimizing"
  | "searching"
  | "editing"
  | "checking"
  | "complete";

interface StatusIndicatorProps {
  status: StatusType;
  text?: string;
  className?: string;
}

const statusConfig: Record<StatusType, { 
  icon: typeof Loader2; 
  color: string; 
  bgColor: string;
  animate: boolean;
  defaultText: string;
}> = {
  thinking: {
    icon: Brain,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    animate: true,
    defaultText: "Thinking..."
  },
  generating: {
    icon: Sparkles,
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
    animate: true,
    defaultText: "Generating code..."
  },
  building: {
    icon: Code2,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    animate: true,
    defaultText: "Building your app..."
  },
  optimizing: {
    icon: Zap,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
    animate: true,
    defaultText: "Optimizing..."
  },
  searching: {
    icon: Search,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    animate: true,
    defaultText: "Searching..."
  },
  editing: {
    icon: FileEdit,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    animate: true,
    defaultText: "Editing files..."
  },
  checking: {
    icon: RefreshCw,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    animate: true,
    defaultText: "Checking..."
  },
  complete: {
    icon: CheckCircle2,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    animate: false,
    defaultText: "Complete"
  }
};

export function StatusIndicator({ status, text, className }: StatusIndicatorProps) {
  const config = statusConfig[status];
  const Icon = config.icon;
  
  return (
    <div 
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full",
        config.bgColor,
        className
      )}
      data-testid={`status-indicator-${status}`}
    >
      <Icon 
        className={cn(
          "h-4 w-4",
          config.color,
          config.animate && "animate-pulse"
        )} 
      />
      <span className={cn("text-sm font-medium", config.color)}>
        {text || config.defaultText}
      </span>
    </div>
  );
}

export function LiveStatusDot({ isActive = true, className }: { isActive?: boolean; className?: string }) {
  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      <div 
        className={cn(
          "w-2 h-2 rounded-full",
          isActive ? "bg-green-500" : "bg-muted-foreground"
        )} 
      />
      {isActive && (
        <div className="absolute w-2 h-2 rounded-full bg-green-500 animate-ping" />
      )}
    </div>
  );
}
