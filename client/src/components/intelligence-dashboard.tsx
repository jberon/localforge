import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Brain, 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  Lightbulb,
  TrendingUp,
  Activity,
  Zap,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Eye,
  Code,
  Target
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface IntelligenceStatus {
  services: {
    enhancedAnalysis: { active: boolean };
    feedbackLearning: { active: boolean; patternsCount: number };
    extendedThinking: { active: boolean; mode: string };
    smartContext: { active: boolean };
  };
  version: string;
}

interface AnalysisResult {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  issues: Array<{
    id: string;
    type: string;
    severity: string;
    message: string;
    line?: number;
    suggestion?: string;
    autoFixable: boolean;
  }>;
  metrics: {
    linesOfCode: number;
    cyclomaticComplexity: number;
    cognitiveComplexity: number;
    maintainabilityIndex: number;
    duplicatePercentage: number;
  };
  suggestions: string[];
  securityFindings: Array<{
    type: string;
    severity: string;
    description: string;
    remediation: string;
  }>;
  bestPracticeViolations: Array<{
    rule: string;
    category: string;
    description: string;
    severity: string;
    recommendation: string;
  }>;
}

interface LearningStats {
  totalFeedback: number;
  learnedPatterns: number;
  applicationRate: number;
  topCategories: Array<{ category: string; count: number }>;
}

interface IntelligenceDashboardProps {
  projectId?: number;
  code?: string;
}

const GRADE_COLORS: Record<string, string> = {
  A: "text-green-500",
  B: "text-blue-500",
  C: "text-yellow-500",
  D: "text-orange-500",
  F: "text-red-500"
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-blue-500",
  info: "bg-gray-500"
};

export function IntelligenceDashboard({ projectId, code }: IntelligenceDashboardProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [analysisExpanded, setAnalysisExpanded] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: status, isLoading: statusLoading } = useQuery<IntelligenceStatus>({
    queryKey: ["/api/intelligence/status"]
  });

  const { data: learningStats } = useQuery<LearningStats>({
    queryKey: ["/api/intelligence/patterns/stats"]
  });

  const { data: thinkingMode } = useQuery<{ currentMode: string; config: { description: string }; available: string[] }>({
    queryKey: ["/api/intelligence/thinking/mode"]
  });

  const analyzeMutation = useMutation({
    mutationFn: async (codeToAnalyze: string) => {
      const response = await apiRequest("POST", "/api/intelligence/analyze", {
        code: codeToAnalyze,
        filePath: "App.tsx"
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Analysis Complete",
        description: "Code has been analyzed successfully"
      });
    }
  });

  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    if (code && code.length > 50) {
      analyzeMutation.mutate(code, {
        onSuccess: (data) => setAnalysisResult(data)
      });
    }
  }, [code]);

  const handleRefreshAnalysis = () => {
    if (code) {
      analyzeMutation.mutate(code, {
        onSuccess: (data) => setAnalysisResult(data)
      });
    }
  };

  if (statusLoading) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center p-8">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-blue-500" />
            <CardTitle className="text-lg">Intelligence Dashboard</CardTitle>
            <Badge variant="outline" className="text-xs">v{status?.version}</Badge>
          </div>
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={handleRefreshAnalysis}
            disabled={!code || analyzeMutation.isPending}
            data-testid="button-refresh-analysis"
          >
            <RefreshCw className={`h-4 w-4 ${analyzeMutation.isPending ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <CardDescription>AI-powered code analysis and learning insights</CardDescription>
      </CardHeader>

      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="analysis" data-testid="tab-analysis">Analysis</TabsTrigger>
            <TabsTrigger value="security" data-testid="tab-security">Security</TabsTrigger>
            <TabsTrigger value="learning" data-testid="tab-learning">Learning</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <ServiceStatusCard
                name="Enhanced Analysis"
                active={status?.services.enhancedAnalysis.active ?? false}
                icon={<Target className="h-4 w-4" />}
              />
              <ServiceStatusCard
                name="Feedback Learning"
                active={status?.services.feedbackLearning.active ?? false}
                icon={<Lightbulb className="h-4 w-4" />}
                detail={`${status?.services.feedbackLearning.patternsCount ?? 0} patterns`}
              />
              <ServiceStatusCard
                name="Extended Thinking"
                active={status?.services.extendedThinking.active ?? false}
                icon={<Brain className="h-4 w-4" />}
                detail={status?.services.extendedThinking.mode}
              />
              <ServiceStatusCard
                name="Smart Context"
                active={status?.services.smartContext.active ?? false}
                icon={<Activity className="h-4 w-4" />}
              />
            </div>

            {analysisResult && (
              <div className="mt-4 p-4 rounded-lg border bg-muted/30">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium">Code Quality Score</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-2xl font-bold ${GRADE_COLORS[analysisResult.grade]}`}>
                      {analysisResult.grade}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      ({analysisResult.score}/100)
                    </span>
                  </div>
                </div>
                <Progress value={analysisResult.score} className="h-2" />
              </div>
            )}
          </TabsContent>

          <TabsContent value="analysis" className="mt-4">
            {analysisResult ? (
              <ScrollArea className="h-[400px]">
                <div className="space-y-4">
                  <MetricsSection metrics={analysisResult.metrics} />
                  
                  <Collapsible open={analysisExpanded} onOpenChange={setAnalysisExpanded}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="w-full justify-between">
                        <span className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          Issues ({analysisResult.issues.length})
                        </span>
                        {analysisExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="space-y-2 mt-2">
                        {analysisResult.issues.slice(0, 10).map((issue) => (
                          <IssueCard key={issue.id} issue={issue} />
                        ))}
                        {analysisResult.issues.length > 10 && (
                          <p className="text-sm text-muted-foreground text-center py-2">
                            +{analysisResult.issues.length - 10} more issues
                          </p>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {analysisResult.bestPracticeViolations.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <Code className="h-4 w-4" />
                        Best Practice Violations
                      </h4>
                      {analysisResult.bestPracticeViolations.slice(0, 5).map((violation, i) => (
                        <ViolationCard key={i} violation={violation} />
                      ))}
                    </div>
                  )}

                  {analysisResult.suggestions.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <Lightbulb className="h-4 w-4" />
                        Suggestions
                      </h4>
                      <ul className="space-y-1">
                        {analysisResult.suggestions.map((suggestion, i) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                            <Zap className="h-3 w-3 mt-1 text-blue-500" />
                            {suggestion}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Eye className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">
                  No code analyzed yet. Generate some code to see analysis results.
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="security" className="mt-4">
            {analysisResult?.securityFindings && analysisResult.securityFindings.length > 0 ? (
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {analysisResult.securityFindings.map((finding, i) => (
                    <SecurityFindingCard key={i} finding={finding} />
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Shield className="h-12 w-12 text-green-500/50 mb-4" />
                <p className="text-muted-foreground">
                  {analysisResult ? "No security issues found" : "Analyze code to check for security issues"}
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="learning" className="mt-4">
            {learningStats ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <StatCard 
                    label="Total Feedback" 
                    value={learningStats.totalFeedback} 
                    icon={<Activity className="h-4 w-4" />}
                  />
                  <StatCard 
                    label="Learned Patterns" 
                    value={learningStats.learnedPatterns} 
                    icon={<Brain className="h-4 w-4" />}
                  />
                </div>

                <div className="p-4 rounded-lg border bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Application Rate</span>
                    <span className="text-sm text-muted-foreground">
                      {Math.round(learningStats.applicationRate * 100)}%
                    </span>
                  </div>
                  <Progress value={learningStats.applicationRate * 100} className="h-2" />
                </div>

                {learningStats.topCategories.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Top Categories</h4>
                    <div className="space-y-2">
                      {learningStats.topCategories.map((cat) => (
                        <div key={cat.category} className="flex items-center justify-between text-sm">
                          <span className="capitalize">{cat.category.replace('_', ' ')}</span>
                          <Badge variant="secondary">{cat.count}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {thinkingMode && (
                  <div className="p-4 rounded-lg border">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Thinking Mode</span>
                      <Badge variant="outline" className="capitalize">
                        {thinkingMode.currentMode}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {thinkingMode.config?.description}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <TrendingUp className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">
                  Learning stats will appear here as you use LocalForge
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function ServiceStatusCard({ 
  name, 
  active, 
  icon, 
  detail 
}: { 
  name: string; 
  active: boolean; 
  icon: React.ReactNode;
  detail?: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
      <div className={`p-2 rounded-md ${active ? "bg-green-500/10 text-green-500" : "bg-muted text-muted-foreground"}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{name}</div>
        {detail && <div className="text-xs text-muted-foreground capitalize">{detail}</div>}
      </div>
      {active ? (
        <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
      )}
    </div>
  );
}

function MetricsSection({ metrics }: { metrics: AnalysisResult["metrics"] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <MetricCard label="Lines of Code" value={metrics.linesOfCode} />
      <MetricCard 
        label="Cyclomatic Complexity" 
        value={metrics.cyclomaticComplexity}
        status={metrics.cyclomaticComplexity <= 10 ? "good" : metrics.cyclomaticComplexity <= 20 ? "warning" : "bad"}
      />
      <MetricCard 
        label="Cognitive Complexity" 
        value={metrics.cognitiveComplexity}
        status={metrics.cognitiveComplexity <= 15 ? "good" : metrics.cognitiveComplexity <= 30 ? "warning" : "bad"}
      />
      <MetricCard 
        label="Maintainability" 
        value={metrics.maintainabilityIndex}
        status={metrics.maintainabilityIndex >= 65 ? "good" : metrics.maintainabilityIndex >= 40 ? "warning" : "bad"}
      />
    </div>
  );
}

function MetricCard({ 
  label, 
  value, 
  status 
}: { 
  label: string; 
  value: number; 
  status?: "good" | "warning" | "bad" 
}) {
  const statusColor = status === "good" ? "text-green-500" : status === "warning" ? "text-yellow-500" : status === "bad" ? "text-red-500" : "";
  
  return (
    <div className="p-3 rounded-lg border bg-muted/30">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold ${statusColor}`}>{value}</div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="p-4 rounded-lg border bg-muted/30 flex items-center gap-3">
      <div className="p-2 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function IssueCard({ issue }: { issue: AnalysisResult["issues"][0] }) {
  return (
    <div className="p-3 rounded-lg border bg-card">
      <div className="flex items-start gap-2">
        <Badge className={`${SEVERITY_COLORS[issue.severity]} text-white text-xs`}>
          {issue.severity}
        </Badge>
        <div className="flex-1 min-w-0">
          <div className="text-sm">{issue.message}</div>
          {issue.line && (
            <div className="text-xs text-muted-foreground mt-1">Line {issue.line}</div>
          )}
          {issue.suggestion && (
            <div className="text-xs text-blue-500 mt-1">{issue.suggestion}</div>
          )}
        </div>
        {issue.autoFixable && (
          <Badge variant="outline" className="text-xs shrink-0">Auto-fixable</Badge>
        )}
      </div>
    </div>
  );
}

function ViolationCard({ violation }: { violation: AnalysisResult["bestPracticeViolations"][0] }) {
  return (
    <div className="p-3 rounded-lg border bg-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs uppercase">{violation.category}</Badge>
            <span className="text-sm font-medium">{violation.rule}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{violation.description}</p>
          <p className="text-xs text-blue-500 mt-1">{violation.recommendation}</p>
        </div>
      </div>
    </div>
  );
}

function SecurityFindingCard({ finding }: { finding: AnalysisResult["securityFindings"][0] }) {
  return (
    <div className="p-4 rounded-lg border bg-card">
      <div className="flex items-start gap-3">
        <Shield className={`h-5 w-5 shrink-0 ${
          finding.severity === "critical" ? "text-red-500" :
          finding.severity === "high" ? "text-orange-500" :
          finding.severity === "medium" ? "text-yellow-500" :
          "text-blue-500"
        }`} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Badge className={`${SEVERITY_COLORS[finding.severity]} text-white text-xs`}>
              {finding.severity}
            </Badge>
            <span className="text-sm font-medium uppercase">{finding.type}</span>
          </div>
          <p className="text-sm mt-2">{finding.description}</p>
          <div className="mt-2 p-2 rounded bg-muted/50">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Remediation:</span> {finding.remediation}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
