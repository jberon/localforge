import { useState } from "react";
import { 
  Terminal, 
  FileEdit, 
  Code2, 
  Brain, 
  Search, 
  Database,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderOpen,
  Zap,
  Eye,
  Settings,
  MessageSquare,
  Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ActionType = 
  | "terminal" 
  | "file_edit" 
  | "file_read"
  | "code" 
  | "thinking" 
  | "search" 
  | "database"
  | "refresh"
  | "check"
  | "error"
  | "view"
  | "settings"
  | "message"
  | "generate";

export interface Action {
  id: string;
  type: ActionType;
  label?: string;
  detail?: string;
  status?: "pending" | "running" | "completed" | "error";
}

interface ActionGroupRowProps extends React.HTMLAttributes<HTMLDivElement> {
  actions: Action[];
}

const actionIcons: Record<ActionType, typeof Terminal> = {
  terminal: Terminal,
  file_edit: FileEdit,
  file_read: FileText,
  code: Code2,
  thinking: Brain,
  search: Search,
  database: Database,
  refresh: RefreshCw,
  check: CheckCircle2,
  error: AlertCircle,
  view: Eye,
  settings: Settings,
  message: MessageSquare,
  generate: Sparkles,
};

const actionColors: Record<ActionType, string> = {
  terminal: "text-emerald-500",
  file_edit: "text-blue-500",
  file_read: "text-slate-400",
  code: "text-amber-500",
  thinking: "text-purple-500",
  search: "text-cyan-500",
  database: "text-pink-500",
  refresh: "text-orange-500",
  check: "text-green-500",
  error: "text-red-500",
  view: "text-indigo-500",
  settings: "text-gray-500",
  message: "text-blue-400",
  generate: "text-violet-500",
};

export function ActionGroupRow({ actions, className, ...props }: ActionGroupRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (actions.length === 0) return null;

  const maxVisibleIcons = 10;
  const visibleActions = actions.slice(0, maxVisibleIcons);
  const hasMore = actions.length > maxVisibleIcons;

  return (
    <div className={cn("space-y-1", className)} {...props}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 py-1.5 px-2 rounded-md hover-elevate transition-colors w-full text-left group"
        data-testid="button-expand-actions"
      >
        <div className="flex items-center gap-0.5">
          {visibleActions.map((action, index) => {
            const Icon = actionIcons[action.type] || Code2;
            const colorClass = actionColors[action.type] || "text-muted-foreground";
            return (
              <div 
                key={action.id}
                className={cn(
                  "w-5 h-5 flex items-center justify-center rounded",
                  index > 0 && "-ml-1",
                  "bg-background border border-border/50"
                )}
                style={{ zIndex: visibleActions.length - index }}
              >
                <Icon className={cn("h-3 w-3", colorClass)} />
              </div>
            );
          })}
          {hasMore && (
            <div 
              className="w-5 h-5 flex items-center justify-center rounded -ml-1 bg-muted border border-border/50"
              style={{ zIndex: 0 }}
            >
              <span className="text-[10px] text-muted-foreground font-medium">...</span>
            </div>
          )}
        </div>
        
        <span className="text-sm text-muted-foreground">
          {actions.length} {actions.length === 1 ? "action" : "actions"}
        </span>
        
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </button>
      
      {isExpanded && (
        <div className="pl-4 space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
          {actions.map((action) => {
            const Icon = actionIcons[action.type] || Code2;
            const colorClass = actionColors[action.type] || "text-muted-foreground";
            return (
              <div 
                key={action.id}
                className="flex items-center gap-2 py-1 px-2 rounded text-sm"
                data-testid={`action-detail-${action.id}`}
              >
                <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", colorClass)} />
                <span className="text-muted-foreground truncate">
                  {action.label || action.type}
                </span>
                {action.status === "completed" && (
                  <CheckCircle2 className="h-3 w-3 text-green-500 ml-auto flex-shrink-0" />
                )}
                {action.status === "error" && (
                  <AlertCircle className="h-3 w-3 text-red-500 ml-auto flex-shrink-0" />
                )}
                {action.status === "running" && (
                  <RefreshCw className="h-3 w-3 text-primary ml-auto flex-shrink-0 animate-spin" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ActionIcon({ type, className }: { type: ActionType; className?: string }) {
  const Icon = actionIcons[type] || Code2;
  const colorClass = actionColors[type] || "text-muted-foreground";
  return <Icon className={cn("h-4 w-4", colorClass, className)} />;
}
