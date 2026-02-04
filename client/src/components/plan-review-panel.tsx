import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  FileCode, 
  Layers, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  ChevronRight,
  Lightbulb,
  AlertTriangle,
  Play,
  Edit2,
  X,
  Sparkles,
  Box,
  Code2,
  Database,
  Palette,
  TestTube
} from "lucide-react";
import type { Plan, PlanStep } from "@shared/schema";

interface PlanReviewPanelProps {
  plan: Plan | null;
  onApprove: () => void;
  onReject: () => void;
  onBuild: () => void;
  isApproving?: boolean;
  isBuilding?: boolean;
}

const stepTypeIcons: Record<string, typeof Box> = {
  architecture: Layers,
  component: Code2,
  api: Box,
  database: Database,
  styling: Palette,
  testing: TestTube,
};

const stepTypeColors: Record<string, string> = {
  architecture: "text-blue-500",
  component: "text-purple-500",
  api: "text-green-500",
  database: "text-orange-500",
  styling: "text-pink-500",
  testing: "text-yellow-500",
};

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  approved: "bg-green-500/20 text-green-700 dark:text-green-300",
  building: "bg-blue-500/20 text-blue-700 dark:text-blue-300",
  completed: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  failed: "bg-destructive/20 text-destructive",
};

export function PlanReviewPanel({
  plan,
  onApprove,
  onReject,
  onBuild,
  isApproving,
  isBuilding,
}: PlanReviewPanelProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <Sparkles className="w-12 h-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No Plan Yet</h3>
        <p className="text-muted-foreground text-sm max-w-md">
          Use Plan & Build mode to have the AI create a detailed implementation plan before generating code.
        </p>
      </div>
    );
  }

  const toggleStep = (stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  const canApprove = plan.status === "draft";
  const canBuild = plan.status === "approved";
  const isInProgress = plan.status === "building";

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <Layers className="w-5 h-5 text-primary" />
          <div>
            <h2 className="font-semibold">Implementation Plan</h2>
            <p className="text-sm text-muted-foreground">Review before building</p>
          </div>
        </div>
        <Badge className={statusColors[plan.status]} data-testid="badge-plan-status">
          {plan.status.charAt(0).toUpperCase() + plan.status.slice(1)}
        </Badge>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm" data-testid="text-plan-summary">{plan.summary}</p>
            </CardContent>
          </Card>

          {plan.architecture && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-500" />
                  Architecture
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground" data-testid="text-plan-architecture">
                  {plan.architecture}
                </p>
              </CardContent>
            </Card>
          )}

          {plan.assumptions && plan.assumptions.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-muted-foreground" />
                  Assumptions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1" data-testid="list-assumptions">
                  {plan.assumptions.map((assumption, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <span className="text-muted-foreground">•</span>
                      {assumption}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {plan.filePlan && plan.filePlan.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-emerald-500" />
                  Files to Create
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2" data-testid="list-file-plan">
                  {plan.filePlan.map((file, i) => (
                    <div key={i} className="flex items-start gap-3 p-2 rounded-md bg-muted/50">
                      <FileCode className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{file.path}</p>
                        <p className="text-xs text-muted-foreground">{file.purpose}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {plan.steps && plan.steps.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-primary" />
                  Implementation Steps
                </CardTitle>
                <CardDescription>
                  {plan.steps.length} step{plan.steps.length !== 1 ? "s" : ""} to complete
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2" data-testid="list-steps">
                  {plan.steps.map((step, i) => {
                    const Icon = stepTypeIcons[step.type] || Box;
                    const isExpanded = expandedSteps.has(step.id);
                    
                    return (
                      <div
                        key={step.id}
                        className="rounded-md border overflow-hidden"
                        data-testid={`card-step-${step.id}`}
                      >
                        <button
                          onClick={() => toggleStep(step.id)}
                          className="w-full flex items-center gap-3 p-3 text-left hover-elevate"
                        >
                          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-xs font-medium">
                            {i + 1}
                          </div>
                          <Icon className={`w-4 h-4 ${stepTypeColors[step.type] || "text-muted-foreground"}`} />
                          <span className="flex-1 font-medium text-sm">{step.title}</span>
                          <Badge variant="outline" className="text-xs">
                            {step.type}
                          </Badge>
                          <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                        </button>
                        {isExpanded && (
                          <div className="px-3 pb-3 pt-0">
                            <Separator className="mb-3" />
                            <p className="text-sm text-muted-foreground pl-9">
                              {step.description}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {plan.risks && plan.risks.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Potential Risks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1" data-testid="list-risks">
                  {plan.risks.map((risk, i) => (
                    <li key={i} className="text-sm flex items-start gap-2 text-muted-foreground">
                      <span>•</span>
                      {risk}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t bg-background">
        {canApprove && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onReject}
              disabled={isApproving}
              data-testid="button-reject-plan"
            >
              <X className="w-4 h-4 mr-2" />
              Reject
            </Button>
            <Button
              className="flex-1"
              onClick={onApprove}
              disabled={isApproving}
              data-testid="button-approve-plan"
            >
              {isApproving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              Approve Plan
            </Button>
          </div>
        )}

        {canBuild && (
          <Button
            className="w-full"
            onClick={onBuild}
            disabled={isBuilding}
            data-testid="button-start-build"
          >
            {isBuilding ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Building...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Start Building
              </>
            )}
          </Button>
        )}

        {isInProgress && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Building in progress...
          </div>
        )}

        {plan.status === "completed" && (
          <div className="flex items-center justify-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle className="w-4 h-4" />
            Build completed successfully
          </div>
        )}

        {plan.status === "failed" && (
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-sm text-destructive mb-2">
              <AlertCircle className="w-4 h-4" />
              Build failed
            </div>
            <Button variant="outline" size="sm" onClick={onBuild} data-testid="button-retry-build">
              <Edit2 className="w-3 h-3 mr-2" />
              Retry Build
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
