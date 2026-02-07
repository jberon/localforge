import { useState, useEffect, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, Circle, ListChecks, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface Feature {
  id: string;
  name: string;
  status: "pending" | "in-progress" | "completed";
  acceptanceCriteria?: string[];
  detectedAt?: number;
  completedAt?: number;
}

interface FeatureManifest {
  features: Feature[];
  totalFeatures: number;
  completedFeatures: number;
  progressPercent: number;
}

interface FeatureManifestPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
}

export function FeatureManifestPanel({ open, onOpenChange, projectId }: FeatureManifestPanelProps) {
  const [manifest, setManifest] = useState<FeatureManifest | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedFeatures, setExpandedFeatures] = useState<Set<string>>(new Set());

  const fetchManifest = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/runtime/project-state/${projectId}`);
      if (res.ok) {
        const data = await res.json();
        const features: Feature[] = (data.features || []).map((f: any, i: number) => ({
          id: f.id || `feature-${i}`,
          name: f.name || f.feature || `Feature ${i + 1}`,
          status: f.completed ? "completed" : f.inProgress ? "in-progress" : "pending",
          acceptanceCriteria: f.acceptanceCriteria || [],
          detectedAt: f.detectedAt,
          completedAt: f.completedAt,
        }));
        const completed = features.filter(f => f.status === "completed").length;
        setManifest({
          features,
          totalFeatures: features.length,
          completedFeatures: completed,
          progressPercent: features.length > 0 ? Math.round((completed / features.length) * 100) : 0,
        });
      }
    } catch (err) {
      console.error("Failed to fetch feature manifest:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open && projectId) {
      fetchManifest();
    }
  }, [open, projectId, fetchManifest]);

  const toggleExpand = (featureId: string) => {
    setExpandedFeatures(prev => {
      const next = new Set(prev);
      if (next.has(featureId)) {
        next.delete(featureId);
      } else {
        next.add(featureId);
      }
      return next;
    });
  };

  const getStatusIcon = (status: Feature["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />;
      case "in-progress":
        return <Circle className="h-4 w-4 text-amber-500 animate-pulse shrink-0" />;
      default:
        return <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />;
    }
  };

  const getStatusBadge = (status: Feature["status"]) => {
    switch (status) {
      case "completed":
        return <Badge variant="secondary" className="text-emerald-600 dark:text-emerald-400 text-xs">Done</Badge>;
      case "in-progress":
        return <Badge variant="secondary" className="text-amber-600 dark:text-amber-400 text-xs">Building</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">Pending</Badge>;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[380px] sm:w-[420px] p-0">
        <SheetHeader className="p-4 pb-3 border-b">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-primary" />
              <SheetTitle className="text-base">Feature Manifest</SheetTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchManifest}
              disabled={loading}
              data-testid="button-refresh-features"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </SheetHeader>

        <div className="p-4">
          {manifest && manifest.features.length > 0 && (
            <div className="mb-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">{manifest.completedFeatures}/{manifest.totalFeatures} features</span>
              </div>
              <Progress value={manifest.progressPercent} className="h-2" data-testid="progress-features" />
              <p className="text-xs text-muted-foreground">{manifest.progressPercent}% complete</p>
            </div>
          )}
        </div>

        <ScrollArea className="flex-1 h-[calc(100vh-200px)]">
          <div className="px-4 pb-4 space-y-2">
            {!projectId && (
              <div className="text-center py-8 text-muted-foreground text-sm" data-testid="text-no-project">
                Select a project to view features
              </div>
            )}

            {projectId && loading && !manifest && (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 rounded-md bg-muted/50 animate-pulse" />
                ))}
              </div>
            )}

            {projectId && manifest && manifest.features.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm" data-testid="text-no-features">
                No features detected yet. Generate code to see features here.
              </div>
            )}

            {manifest?.features.map((feature) => (
              <Card
                key={feature.id}
                className="p-3"
                data-testid={`card-feature-${feature.id}`}
              >
                <div
                  className="flex items-start gap-2 cursor-pointer"
                  onClick={() => toggleExpand(feature.id)}
                  data-testid={`button-expand-feature-${feature.id}`}
                >
                  {getStatusIcon(feature.status)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{feature.name}</span>
                      {getStatusBadge(feature.status)}
                    </div>
                  </div>
                  {feature.acceptanceCriteria && feature.acceptanceCriteria.length > 0 && (
                    expandedFeatures.has(feature.id)
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  )}
                </div>

                {expandedFeatures.has(feature.id) && feature.acceptanceCriteria && feature.acceptanceCriteria.length > 0 && (
                  <div className="mt-2 ml-6 space-y-1">
                    <p className="text-xs text-muted-foreground font-medium mb-1">Acceptance Criteria:</p>
                    {feature.acceptanceCriteria.map((criterion, idx) => (
                      <div key={idx} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <span className="mt-0.5 shrink-0">-</span>
                        <span>{criterion}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
