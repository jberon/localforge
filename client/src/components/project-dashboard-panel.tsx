import { useState, useEffect, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Activity, RefreshCw, Heart, Code2, GitBranch, TrendingUp,
  CheckCircle2, AlertTriangle, XCircle, Wrench
} from "lucide-react";

interface HealthEntry {
  renders: boolean;
  errors: string[];
  timestamp: number;
}

interface GenerationRecord {
  prompt: string;
  linesOfCode: number;
  features: string[];
  success: boolean;
  timestamp: number;
}

interface RefinementRecord {
  refinement: string;
  linesOfCode: number;
  filesChanged: string[];
  success: boolean;
  timestamp: number;
}

interface ProjectState {
  features: any[];
  healthHistory: HealthEntry[];
  generations: GenerationRecord[];
  refinements: RefinementRecord[];
  currentHealth: { renders: boolean; errors: string[] };
  stats: {
    totalGenerations: number;
    totalRefinements: number;
    successRate: number;
    averageLinesOfCode: number;
  };
}

interface ProjectDashboardPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
}

export function ProjectDashboardPanel({ open, onOpenChange, projectId }: ProjectDashboardPanelProps) {
  const [state, setState] = useState<ProjectState | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "health" | "history">("overview");

  const fetchState = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/runtime/project-state/${projectId}`);
      if (res.ok) {
        const data = await res.json();
        const generations = data.generations || [];
        const refinements = data.refinements || [];
        const healthHistory = data.healthHistory || [];
        const successfulGens = generations.filter((g: any) => g.success).length;
        const successfulRefs = refinements.filter((r: any) => r.success).length;
        const totalOps = generations.length + refinements.length;
        const successOps = successfulGens + successfulRefs;

        const allLocs = [...generations, ...refinements].map((r: any) => r.linesOfCode || 0).filter((l: number) => l > 0);

        setState({
          features: data.features || [],
          healthHistory,
          generations,
          refinements,
          currentHealth: data.currentHealth || { renders: true, errors: [] },
          stats: {
            totalGenerations: generations.length,
            totalRefinements: refinements.length,
            successRate: totalOps > 0 ? Math.round((successOps / totalOps) * 100) : 100,
            averageLinesOfCode: allLocs.length > 0 ? Math.round(allLocs.reduce((a: number, b: number) => a + b, 0) / allLocs.length) : 0,
          },
        });
      }
    } catch (err) {
      console.error("Failed to fetch project state:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open && projectId) {
      fetchState();
    }
  }, [open, projectId, fetchState]);

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const getHealthIcon = (renders: boolean) => {
    return renders
      ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
      : <XCircle className="h-4 w-4 text-destructive" />;
  };

  const tabs = [
    { id: "overview" as const, label: "Overview" },
    { id: "health" as const, label: "Health" },
    { id: "history" as const, label: "History" },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:w-[460px] p-0">
        <SheetHeader className="p-4 pb-3 border-b">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <SheetTitle className="text-base">Project Dashboard</SheetTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchState}
              disabled={loading}
              data-testid="button-refresh-dashboard"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <div className="flex items-center gap-1 mt-2">
            {tabs.map(tab => (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setActiveTab(tab.id)}
                className={activeTab === tab.id ? "toggle-elevate toggle-elevated" : ""}
                data-testid={`button-tab-${tab.id}`}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-160px)]">
          <div className="p-4 space-y-4">
            {!projectId && (
              <div className="text-center py-8 text-muted-foreground text-sm" data-testid="text-no-project-dashboard">
                Select a project to view its dashboard
              </div>
            )}

            {projectId && loading && !state && (
              <div className="space-y-3">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-20 rounded-md bg-muted/50 animate-pulse" />
                ))}
              </div>
            )}

            {projectId && state && activeTab === "overview" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Card className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Code2 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Generations</span>
                    </div>
                    <p className="text-2xl font-semibold" data-testid="text-total-generations">{state.stats.totalGenerations}</p>
                  </Card>
                  <Card className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Wrench className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Refinements</span>
                    </div>
                    <p className="text-2xl font-semibold" data-testid="text-total-refinements">{state.stats.totalRefinements}</p>
                  </Card>
                  <Card className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Success Rate</span>
                    </div>
                    <p className="text-2xl font-semibold" data-testid="text-success-rate">{state.stats.successRate}%</p>
                  </Card>
                  <Card className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <GitBranch className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Avg Lines</span>
                    </div>
                    <p className="text-2xl font-semibold" data-testid="text-avg-loc">{state.stats.averageLinesOfCode}</p>
                  </Card>
                </div>

                <Separator />

                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Heart className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Current Health</span>
                  </div>
                  <Card className="p-3">
                    <div className="flex items-center gap-2">
                      {getHealthIcon(state.currentHealth.renders)}
                      <span className={`text-sm font-medium ${state.currentHealth.renders ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                        {state.currentHealth.renders ? "Healthy" : "Issues Detected"}
                      </span>
                    </div>
                    {state.currentHealth.errors.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {state.currentHealth.errors.map((error, idx) => (
                          <div key={idx} className="flex items-start gap-1.5 text-xs text-destructive/80">
                            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                            <span>{error}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </div>

                {state.features.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <span className="text-sm font-medium">Features ({state.features.length})</span>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {state.features.map((f: any, idx: number) => (
                          <Badge
                            key={idx}
                            variant={f.completed ? "secondary" : "outline"}
                            className={f.completed ? "text-emerald-600 dark:text-emerald-400" : ""}
                          >
                            {f.name || f.feature || `Feature ${idx + 1}`}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {projectId && state && activeTab === "health" && (
              <div className="space-y-2">
                {state.healthHistory.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No health history yet
                  </div>
                ) : (
                  state.healthHistory.slice().reverse().map((entry, idx) => (
                    <Card key={idx} className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {getHealthIcon(entry.renders)}
                          <span className="text-sm">{entry.renders ? "Healthy" : "Issues"}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {entry.timestamp ? formatTimeAgo(entry.timestamp) : ""}
                        </span>
                      </div>
                      {entry.errors.length > 0 && (
                        <div className="mt-1.5 text-xs text-muted-foreground">
                          {entry.errors.join(", ")}
                        </div>
                      )}
                    </Card>
                  ))
                )}
              </div>
            )}

            {projectId && state && activeTab === "history" && (
              <div className="space-y-2">
                {[...state.generations, ...state.refinements]
                  .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                  .map((record: any, idx: number) => {
                    const isGeneration = "prompt" in record && !("refinement" in record);
                    return (
                      <Card key={idx} className="p-3">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2">
                            {isGeneration
                              ? <Code2 className="h-3.5 w-3.5 text-primary" />
                              : <Wrench className="h-3.5 w-3.5 text-amber-500" />
                            }
                            <Badge variant="outline" className="text-xs">
                              {isGeneration ? "Generate" : "Refine"}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {record.timestamp ? formatTimeAgo(record.timestamp) : ""}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          {record.prompt || record.refinement || ""}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground/60">
                          <span>{record.linesOfCode || 0} lines</span>
                          {record.success !== undefined && (
                            <span className={record.success ? "text-emerald-500" : "text-destructive"}>
                              {record.success ? "Success" : "Failed"}
                            </span>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                {state.generations.length === 0 && state.refinements.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No generation history yet
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}