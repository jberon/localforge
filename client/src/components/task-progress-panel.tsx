import { useState } from "react";
import { ChevronDown, ChevronUp, Clock, Loader2, CheckCircle2, Circle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface TaskItem {
  id: string;
  title: string;
  description?: string;
  status: "pending" | "in_progress" | "completed" | "failed";
}

interface TaskProgressPanelProps {
  tasks: TaskItem[];
  completedCount: number;
  totalCount: number;
  isVisible?: boolean;
  className?: string;
}

function TaskStatusIcon({ status }: { status: TaskItem["status"] }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case "in_progress":
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
    case "failed":
      return <Clock className="w-4 h-4 text-red-500" />;
    case "pending":
    default:
      return <Circle className="w-4 h-4 text-muted-foreground" />;
  }
}

export function TaskProgressPanel({
  tasks,
  completedCount,
  totalCount,
  isVisible = true,
  className,
}: TaskProgressPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!isVisible || tasks.length === 0) {
    return null;
  }

  const inProgressTasks = tasks.filter(t => t.status === "in_progress");
  const hasActiveTasks = inProgressTasks.length > 0 || completedCount < totalCount;

  return (
    <Card className={cn("border shadow-sm", className)}>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className="flex items-center gap-2 hover-elevate rounded-md px-1 -mx-1"
            onClick={() => setIsExpanded(!isExpanded)}
            data-testid="button-toggle-tasks"
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
            <CardTitle className="text-sm font-medium">In progress tasks</CardTitle>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {completedCount} / {totalCount}
            </span>
            {hasActiveTasks && (
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
            )}
          </div>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="pt-0 pb-3 px-4">
          <div className="space-y-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={cn(
                  "flex items-center gap-3 py-2 px-3 rounded-md transition-colors",
                  task.status === "in_progress" && "bg-blue-500/5 font-medium",
                  task.status === "completed" && "opacity-60"
                )}
                data-testid={`task-item-${task.id}`}
              >
                <TaskStatusIcon status={task.status} />
                <span className="text-sm flex-1">{task.title}</span>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
