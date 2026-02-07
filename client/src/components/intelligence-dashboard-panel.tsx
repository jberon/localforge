import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Brain,
  Target,
  Shield,
  Puzzle,
  BookOpen,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

interface IntelligenceV2Status {
  outcomeLearning: {
    active: boolean;
    leaderboardSize: number;
    topPerformers: Record<string, string>;
    weakSpots: number;
  };
  semanticContext: {
    active: boolean;
  };
  errorPrevention: {
    active: boolean;
    totalPatterns: number;
    totalAssessments: number;
    preventionRate: number;
  };
  adaptiveDecomposition: {
    active: boolean;
    profileCount: number;
  };
  crossProjectKnowledge: {
    active: boolean;
    totalPatterns: number;
    avgQualityScore: number;
    categories: Record<string, number>;
  };
  speculativeGeneration: {
    active: boolean;
    enabled: boolean;
    totalSessions: number;
    avgQualityImprovement: number;
  };
  version: string;
}

interface ErrorPreventionStats {
  totalPatterns: number;
  learnedPatterns: number;
  totalAssessments: number;
  preventionRate: number;
  topRisks: Array<{ name: string; riskScore: number; occurrences: number }>;
}

interface DecompositionThresholds {
  decompositionThreshold: number;
  contextWindowSize: number;
  maxSteps: number;
}

interface SpeculativeConfig {
  enabled: boolean;
  candidateCount: number;
  qualityThreshold: number;
  diversityMode: string;
  timeoutMs: number;
  autoSelectBest: boolean;
}

function riskColor(score: number): string {
  if (score < 0.4) return "text-green-500";
  if (score <= 0.7) return "text-amber-500";
  return "text-red-500";
}

interface ApiResponse<T> {
  data: T;
}

export function IntelligenceDashboardPanel() {
  const statusQuery = useQuery<ApiResponse<IntelligenceV2Status>>({
    queryKey: ["/api/intelligence-v2/status"],
    refetchInterval: 5000,
  });

  const errorStatsQuery = useQuery<ApiResponse<ErrorPreventionStats>>({
    queryKey: ["/api/intelligence-v2/error-prevention/stats"],
    refetchInterval: 10000,
  });

  const thresholdsQuery = useQuery<ApiResponse<DecompositionThresholds>>({
    queryKey: ["/api/intelligence-v2/adaptive-decomposition/thresholds"],
    refetchInterval: 10000,
  });

  const speculativeConfigQuery = useQuery<ApiResponse<SpeculativeConfig>>({
    queryKey: ["/api/intelligence-v2/speculative/config"],
    refetchInterval: 10000,
  });

  if (statusQuery.isLoading) {
    return (
      <div className="flex items-center justify-center p-8" data-testid="text-loading">
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  const data = statusQuery.data?.data;

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center" data-testid="section-empty-state">
        <Brain className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm text-muted-foreground">No intelligence data available yet.</p>
        <p className="text-xs text-muted-foreground mt-1">The Intelligence Engine will populate as services initialize.</p>
      </div>
    );
  }

  const topPerformers = Object.entries(data.outcomeLearning?.topPerformers || {});
  const categories = Object.entries(data.crossProjectKnowledge?.categories || {});
  const errorStats = errorStatsQuery.data?.data;
  const topRisks = (errorStats?.topRisks || []).slice(0, 3);
  const thresholds = thresholdsQuery.data?.data;
  const specConfig = speculativeConfigQuery.data?.data;

  return (
    <div className="space-y-4" data-testid="panel-intelligence-dashboard">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Intelligence Engine</span>
        </div>
        <Badge variant="secondary" data-testid="text-version">{data.version || "v2.0"}</Badge>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-lg font-bold" data-testid="text-models-tracked">{data.outcomeLearning?.leaderboardSize ?? 0}</div>
            <div className="text-xs text-muted-foreground">Models Tracked</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-lg font-bold" data-testid="text-error-patterns">{data.errorPrevention?.totalPatterns ?? 0}</div>
            <div className="text-xs text-muted-foreground">Error Patterns</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-lg font-bold" data-testid="text-knowledge-patterns">{data.crossProjectKnowledge?.totalPatterns ?? 0}</div>
            <div className="text-xs text-muted-foreground">Knowledge Library</div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="section-outcome-learning">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Outcome Learning
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-2">
          {topPerformers.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Top Performers</div>
              <div className="flex flex-wrap gap-1">
                {topPerformers.map(([taskType, model]) => (
                  <Badge key={taskType} variant="outline" data-testid={`text-performer-${taskType}`}>
                    {taskType} → {String(model)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {(data.outcomeLearning?.weakSpots ?? 0) > 0 && (
            <div className="flex items-center gap-2 text-xs" data-testid="text-weakspots">
              <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
              <span>{data.outcomeLearning.weakSpots} weak spot{data.outcomeLearning.weakSpots > 1 ? "s" : ""} detected</span>
            </div>
          )}
          {topPerformers.length === 0 && (data.outcomeLearning?.weakSpots ?? 0) === 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              <span>No outcome data collected yet. Generate code to start learning.</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="section-error-prevention">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Error Prevention
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-2">
          <div className="grid grid-cols-3 gap-2 text-xs text-center">
            <div>
              <div className="text-lg font-bold" data-testid="text-prevention-rate">
                {((data.errorPrevention?.preventionRate ?? 0) * 100).toFixed(0)}%
              </div>
              <div className="text-muted-foreground">Prevention Rate</div>
            </div>
            <div>
              <div className="text-lg font-bold" data-testid="text-assessments">{data.errorPrevention?.totalAssessments ?? 0}</div>
              <div className="text-muted-foreground">Assessments</div>
            </div>
            <div>
              <div className="text-lg font-bold" data-testid="text-learned-patterns">{errorStats?.learnedPatterns ?? 0}</div>
              <div className="text-muted-foreground">Learned</div>
            </div>
          </div>
          {topRisks.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Top Risks</div>
              {topRisks.map((risk, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-xs" data-testid={`text-risk-${i}`}>
                  <span className="truncate flex-1">{risk.name}</span>
                  <span className="text-muted-foreground">{risk.occurrences}x</span>
                  <Badge variant="outline" className={riskColor(risk.riskScore)}>
                    {risk.riskScore.toFixed(2)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="section-knowledge">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Knowledge Library
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-2">
          {categories.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Categories</div>
              <div className="flex flex-wrap gap-1">
                {categories.map(([name, count]) => (
                  <Badge key={name} variant="secondary" data-testid={`text-category-${name}`}>
                    {name}: {String(count)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Avg Quality Score</span>
            <span className="font-bold" data-testid="text-avg-quality">{(data.crossProjectKnowledge?.avgQualityScore ?? 0).toFixed(2)}</span>
          </div>
          {(data.crossProjectKnowledge?.totalPatterns ?? 0) === 0 && categories.length === 0 && (
            <div className="text-xs text-muted-foreground">No patterns extracted yet. Complete successful generations to build the library.</div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="section-speculative">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Speculative Generation
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Status</span>
            <Badge variant={data.speculativeGeneration?.enabled ? "secondary" : "outline"} data-testid="text-speculative-status">
              {data.speculativeGeneration?.enabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>
          {specConfig && (
            <>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">Candidate Count</span>
                <span className="font-bold" data-testid="text-candidate-count">{specConfig.candidateCount}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">Diversity Mode</span>
                <Badge variant="outline" data-testid="text-diversity-mode">{specConfig.diversityMode}</Badge>
              </div>
            </>
          )}
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Total Sessions</span>
            <span className="font-bold" data-testid="text-total-sessions">{data.speculativeGeneration?.totalSessions ?? 0}</span>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Avg Quality Improvement</span>
            <span className="font-bold" data-testid="text-quality-improvement">
              {((data.speculativeGeneration?.avgQualityImprovement ?? 0) * 100).toFixed(1)}%
            </span>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="section-adaptive-decomposition">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Puzzle className="h-4 w-4" />
            Adaptive Decomposition
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Profiles</span>
            <span className="font-bold" data-testid="text-profile-count">{data.adaptiveDecomposition?.profileCount ?? 0}</span>
          </div>
          {thresholds && (
            <>
              <Separator />
              <div className="text-xs font-medium text-muted-foreground">Thresholds</div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">Decomposition</span>
                <Badge variant="outline" data-testid="text-decomposition-threshold">
                  {thresholds.decompositionThreshold}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">Context Window</span>
                <Badge variant="outline" data-testid="text-context-window">
                  {thresholds.contextWindowSize.toLocaleString()}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">Max Steps</span>
                <Badge variant="outline" data-testid="text-max-steps">
                  {thresholds.maxSteps}
                </Badge>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card data-testid="section-semantic-context">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="h-4 w-4" />
            Semantic Context
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div className="flex items-center gap-2 text-xs">
            <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
            <span className="text-muted-foreground" data-testid="text-semantic-status">
              {data.semanticContext?.active ? "Active" : "Inactive"} - TF-IDF fallback ready
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
