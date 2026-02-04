import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Lightbulb, 
  ArrowRight, 
  Edit2, 
  Plus, 
  Trash2, 
  ChevronDown, 
  ChevronUp,
  Sparkles,
  CheckCircle2,
  Circle
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface PlanTask {
  id: string;
  title: string;
  description?: string;
  fileTarget?: string;
  type: "build" | "review" | "test" | "plan";
  selected: boolean;
}

interface PlanModeTaskListProps {
  tasks: PlanTask[];
  summary?: string;
  architecture?: string;
  onTasksChange: (tasks: PlanTask[]) => void;
  onStartBuilding: (selectedTasks: PlanTask[]) => void;
  onEditPlan: () => void;
  isBuilding?: boolean;
  className?: string;
}

export function PlanModeTaskList({
  tasks,
  summary,
  architecture,
  onTasksChange,
  onStartBuilding,
  onEditPlan,
  isBuilding = false,
  className,
}: PlanModeTaskListProps) {
  const [showArchitecture, setShowArchitecture] = useState(false);
  
  const selectedTasks = tasks.filter(t => t.selected);
  const allSelected = tasks.length > 0 && selectedTasks.length === tasks.length;

  const toggleTask = (id: string) => {
    onTasksChange(tasks.map(t => 
      t.id === id ? { ...t, selected: !t.selected } : t
    ));
  };

  const toggleAll = () => {
    const newState = !allSelected;
    onTasksChange(tasks.map(t => ({ ...t, selected: newState })));
  };

  const handleStartBuilding = () => {
    if (selectedTasks.length > 0) {
      onStartBuilding(selectedTasks);
    }
  };

  const typeColors: Record<string, string> = {
    build: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    review: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    test: "bg-green-500/20 text-green-400 border-green-500/30",
    plan: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  };

  return (
    <Card className={cn("border-purple-500/30 bg-card/80", className)} data-testid="plan-mode-task-list">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-purple-500/20">
              <Lightbulb className="w-4 h-4 text-purple-400" />
            </div>
            Plan Ready
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onEditPlan}
            className="text-xs"
            data-testid="button-edit-plan"
          >
            <Edit2 className="w-3 h-3 mr-1" />
            Refine
          </Button>
        </div>
        {summary && (
          <p className="text-sm text-muted-foreground mt-2">{summary}</p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {architecture && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowArchitecture(!showArchitecture)}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-toggle-architecture"
            >
              {showArchitecture ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
              <span className="font-medium">Architecture Overview</span>
            </button>
            {showArchitecture && (
              <div className="text-xs bg-muted/30 rounded-lg p-3 border">
                <p className="text-muted-foreground whitespace-pre-wrap">{architecture}</p>
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Tasks ({selectedTasks.length}/{tasks.length} selected)
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleAll}
              className="text-xs"
              data-testid="button-toggle-all-tasks"
            >
              {allSelected ? "Deselect All" : "Select All"}
            </Button>
          </div>

          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {tasks.map((task, index) => (
              <div
                key={task.id}
                className={cn(
                  "flex items-start gap-3 p-2.5 rounded-lg border transition-all",
                  task.selected 
                    ? "border-purple-500/40 bg-purple-500/5" 
                    : "border-border/50 bg-muted/20 opacity-60"
                )}
                data-testid={`task-item-${task.id}`}
              >
                <Checkbox
                  checked={task.selected}
                  onCheckedChange={() => toggleTask(task.id)}
                  className="mt-0.5"
                  data-testid={`checkbox-task-${task.id}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs text-muted-foreground">#{index + 1}</span>
                    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", typeColors[task.type])}>
                      {task.type}
                    </Badge>
                    {task.fileTarget && (
                      <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                        {task.fileTarget}
                      </code>
                    )}
                  </div>
                  <p className="text-sm font-medium">{task.title}</p>
                  {task.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {task.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-2 border-t">
          <Button
            onClick={handleStartBuilding}
            disabled={selectedTasks.length === 0 || isBuilding}
            className="w-full gap-2 bg-orange-600 text-white border-orange-600"
            data-testid="button-start-building"
          >
            <Sparkles className="w-4 h-4" />
            Start Building {selectedTasks.length > 0 && `(${selectedTasks.length} tasks)`}
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            This will switch to Build mode and implement the selected tasks
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

interface PlanProgressProps {
  tasks: PlanTask[];
  currentTaskIndex: number;
  className?: string;
}

export function PlanProgress({
  tasks,
  currentTaskIndex,
  className,
}: PlanProgressProps) {
  return (
    <div className={cn("space-y-2", className)} data-testid="plan-progress">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">Building from plan</span>
        <span className="text-muted-foreground">
          {currentTaskIndex + 1} of {tasks.length}
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-orange-500 to-orange-600 transition-all duration-500"
          style={{ width: `${((currentTaskIndex + 1) / tasks.length) * 100}%` }}
        />
      </div>
      <div className="space-y-1">
        {tasks.slice(0, currentTaskIndex + 2).map((task, index) => (
          <div 
            key={task.id}
            className="flex items-center gap-2 text-xs"
          >
            {index < currentTaskIndex ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
            ) : index === currentTaskIndex ? (
              <div className="w-3.5 h-3.5 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
            ) : (
              <Circle className="w-3.5 h-3.5 text-muted-foreground" />
            )}
            <span className={cn(
              index < currentTaskIndex && "text-muted-foreground line-through",
              index === currentTaskIndex && "text-foreground font-medium",
              index > currentTaskIndex && "text-muted-foreground"
            )}>
              {task.title}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
