import { useState, useEffect, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Layers, RefreshCw, CheckCircle2, Circle, XCircle, Loader2, Clock
} from "lucide-react";

interface PipelineStep {
  id: number;
  description: string;
  status: "pending" | "running" | "building" | "completed" | "failed" | "skipped";
  qualityScore?: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

interface PipelineProgress {
  active: boolean;
  pipelineId?: string;
  status?: string;
  totalSteps?: number;
  completedSteps?: number;
  currentStep?: number;
  steps?: PipelineStep[];
  progressPercent?: number;
}

interface BuildProgressPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
}

export function BuildProgressPanel({ open, onOpenChange, projectId }: BuildProgressPanelProps) {
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchProgress = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/runtime/pipelines/${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setProgress(data);
      }
    } catch (err) {
      console.error("Failed to fetch pipeline progress:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open && projectId) {
      fetchProgress();
    }
  }, [open, projectId, fetchProgress]);

  useEffect(() => {
    if (!open || !projectId || !progress?.active) return;
    const interval = setInterval(fetchProgress, 3000);
    return () => clearInterval(interval);
  }, [open, projectId, progress?.active, fetchProgress]);

  const getStepIcon = (status: PipelineStep["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />;
      case "running":
      case "building":
        return <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-destructive shrink-0" />;
      case "skipped":
        return <Circle className="h-4 w-4 text-muted-foreground/50 shrink-0" />;
      default:
        return <Circle className="h-4 w-4 text-muted-foreground/30 shrink-0" />;
    }
  };

  const getStepBadge = (status: PipelineStep["status"], qualityScore?: number) => {
    switch (status) {
      case "completed":
        return (
          <Badge variant="secondary" className="text-emerald-600 dark:text-emerald-400 text-xs">
            {qualityScore ? `Score: ${qualityScore}` : "Done"}
          </Badge>
        );
      case "running":
      case "building":
        return <Badge variant="secondary" className="text-primary text-xs">Building</Badge>;
      case "failed":
        return <Badge variant="destructive" className="text-xs">Failed</Badge>;
      case "skipped":
        return <Badge variant="outline" className="text-xs">Skipped</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">Waiting</Badge>;
    }
  };

  const formatDuration = (startMs?: number, endMs?: number) => {
    if (!startMs) return "";
    const end = endMs || Date.now();
    const seconds = Math.round((end - startMs) / 1000);
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  };

  const completedSteps = progress?.completedSteps || 0;
  const totalSteps = progress?.totalSteps || 0;
  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[380px] sm:w-[420px] p-0">
        <SheetHeader className="p-4 pb-3 border-b">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              <SheetTitle className="text-base">Build Pipeline</SheetTitle>
              {progress?.active && (
                <Badge variant="secondary" className="text-primary text-xs">Active</Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchProgress}
              disabled={loading}
              data-testid="button-refresh-pipeline"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </SheetHeader>

        <div className="p-4">
          {progress?.active && totalSteps > 0 && (
            <div className="mb-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Pipeline Progress</span>
                <span className="font-medium">{completedSteps}/{totalSteps} steps</span>
              </div>
              <Progress value={progressPercent} className="h-2" data-testid="progress-pipeline" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{progressPercent}% complete</span>
                <span className="capitalize">{progress.status}</span>
              </div>
            </div>
          )}
        </div>

        <ScrollArea className="flex-1 h-[calc(100vh-220px)]">
          <div className="px-4 pb-4 space-y-2">
            {!projectId && (
              <div className="text-center py-8 text-muted-foreground text-sm" data-testid="text-no-project-pipeline">
                Select a project to view build progress
              </div>
            )}

            {projectId && loading && !progress && (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 rounded-md bg-muted/50 animate-pulse" />
                ))}
              </div>
            )}

            {projectId && progress && !progress.active && (
              <div className="text-center py-8 text-muted-foreground text-sm" data-testid="text-no-pipeline">
                No active build pipeline. Complex prompts will automatically create a multi-step build pipeline.
              </div>
            )}

            {progress?.steps?.map((step, index) => (
              <Card
                key={step.id}
                className={`p-3 ${step.status === "running" ? "border-primary/30" : ""}`}
                data-testid={`card-pipeline-step-${step.id}`}
              >
                <div className="flex items-start gap-2">
                  <div className="flex flex-col items-center gap-1 pt-0.5">
                    {getStepIcon(step.status)}
                    {index < (progress.steps?.length || 0) - 1 && (
                      <div className={`w-px h-4 ${step.status === "completed" ? "bg-emerald-500/30" : "bg-muted-foreground/10"}`} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-sm font-medium">Step {step.id}</span>
                      {getStepBadge(step.status, step.qualityScore)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{step.description}</p>
                    {step.error && (
                      <p className="text-xs text-destructive mt-1">{step.error}</p>
                    )}
                    {(step.startedAt || step.completedAt) && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground/60">
                        <Clock className="h-3 w-3" />
                        <span>{formatDuration(step.startedAt, step.completedAt)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}