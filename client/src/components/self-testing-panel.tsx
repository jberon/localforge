import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FlaskConical,
  Play,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Wrench,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface TestStep {
  action: string;
  expected: string;
  status?: string;
}

interface TestScenario {
  id: string;
  name: string;
  description?: string;
  status: "passed" | "failed" | "pending" | "running";
  steps?: TestStep[];
  assertions?: string[];
  error?: string;
}

interface TestSuite {
  id: string;
  name: string;
  projectId: string;
  scenarios: TestScenario[];
  createdAt?: string;
  status?: string;
}

interface TestStats {
  totalSuites: number;
  totalScenarios: number;
  passed: number;
  failed: number;
  pending: number;
}

interface FixSuggestion {
  scenario: string;
  suggestion: string;
  code?: string;
}

interface SelfTestingPanelProps {
  projectId: string;
  code?: string;
}

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle; color: string; badgeVariant: "default" | "secondary" | "destructive" | "outline" }> = {
  passed: { icon: CheckCircle, color: "text-green-500", badgeVariant: "default" },
  failed: { icon: XCircle, color: "text-red-500", badgeVariant: "destructive" },
  pending: { icon: Clock, color: "text-muted-foreground", badgeVariant: "secondary" },
  running: { icon: Loader2, color: "text-yellow-500", badgeVariant: "outline" },
};

export function SelfTestingPanel({ projectId, code }: SelfTestingPanelProps) {
  const [expandedScenarios, setExpandedScenarios] = useState<Set<string>>(new Set());
  const [fixSuggestions, setFixSuggestions] = useState<Record<string, FixSuggestion[]>>({});

  const { data: suites, isLoading: suitesLoading } = useQuery<TestSuite[]>({
    queryKey: ["/api/optimization/self-testing/projects", projectId, "suites"],
    enabled: !!projectId,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<TestStats>({
    queryKey: ["/api/optimization/self-testing/stats"],
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/optimization/self-testing/generate", {
        projectId,
        code: code || "",
        appType: "web",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/optimization/self-testing/projects", projectId, "suites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/optimization/self-testing/stats"] });
    },
  });

  const fixSuggestionMutation = useMutation({
    mutationFn: async (suiteId: string) => {
      const res = await apiRequest("POST", `/api/optimization/self-testing/suites/${suiteId}/fix-suggestions`, {});
      return res.json() as Promise<{ suiteId: string; suggestions: FixSuggestion[] }>;
    },
    onSuccess: (data) => {
      setFixSuggestions((prev) => ({ ...prev, [data.suiteId]: data.suggestions }));
    },
  });

  const toggleScenario = useCallback((scenarioId: string) => {
    setExpandedScenarios((prev) => {
      const next = new Set(prev);
      if (next.has(scenarioId)) {
        next.delete(scenarioId);
      } else {
        next.add(scenarioId);
      }
      return next;
    });
  }, []);

  const totalPassed = stats?.passed ?? 0;
  const totalFailed = stats?.failed ?? 0;
  const totalPending = stats?.pending ?? 0;
  const totalScenarios = stats?.totalScenarios ?? 0;

  return (
    <div className="flex flex-col h-full" data-testid="self-testing-panel">
      <div className="flex items-center justify-between p-3 border-b gap-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Self-Testing</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              queryClient.invalidateQueries({
                queryKey: ["/api/optimization/self-testing/projects", projectId, "suites"],
              })
            }
            data-testid="button-refresh-tests"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            data-testid="button-generate-tests"
          >
            {generateMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 mr-1.5" />
            )}
            Generate Tests
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 p-3 border-b">
        <div className="flex flex-col items-center p-2 rounded-md bg-muted/50">
          <span className="text-lg font-semibold" data-testid="text-total-scenarios">
            {totalScenarios}
          </span>
          <span className="text-[10px] text-muted-foreground">Total</span>
        </div>
        <div className="flex flex-col items-center p-2 rounded-md bg-muted/50">
          <span className="text-lg font-semibold text-green-500" data-testid="text-passed-count">
            {totalPassed}
          </span>
          <span className="text-[10px] text-muted-foreground">Passed</span>
        </div>
        <div className="flex flex-col items-center p-2 rounded-md bg-muted/50">
          <span className="text-lg font-semibold text-red-500" data-testid="text-failed-count">
            {totalFailed}
          </span>
          <span className="text-[10px] text-muted-foreground">Failed</span>
        </div>
        <div className="flex flex-col items-center p-2 rounded-md bg-muted/50">
          <span className="text-lg font-semibold text-muted-foreground" data-testid="text-pending-count">
            {totalPending}
          </span>
          <span className="text-[10px] text-muted-foreground">Pending</span>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {suitesLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">Loading test suites...</span>
            </div>
          ) : !suites || suites.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-center">
              <FlaskConical className="w-8 h-8 mb-3 opacity-50" />
              <p className="text-sm font-medium">No test suites yet</p>
              <p className="text-xs mt-1 opacity-75">
                Click "Generate Tests" to create test suites from your code
              </p>
            </div>
          ) : (
            suites.map((suite) => (
              <Card key={suite.id} data-testid={`card-suite-${suite.id}`}>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                    <FlaskConical className="w-3.5 h-3.5 text-muted-foreground" />
                    {suite.name}
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => fixSuggestionMutation.mutate(suite.id)}
                    disabled={fixSuggestionMutation.isPending}
                    data-testid={`button-fix-suggestions-${suite.id}`}
                  >
                    {fixSuggestionMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Wrench className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </CardHeader>
                <CardContent className="space-y-1.5 pt-0">
                  {suite.scenarios.map((scenario) => {
                    const isExpanded = expandedScenarios.has(scenario.id);
                    const statusConfig = STATUS_CONFIG[scenario.status] || STATUS_CONFIG.pending;
                    const StatusIcon = statusConfig.icon;

                    return (
                      <Collapsible
                        key={scenario.id}
                        open={isExpanded}
                        onOpenChange={() => toggleScenario(scenario.id)}
                      >
                        <CollapsibleTrigger asChild>
                          <button
                            className="flex items-center justify-between gap-2 w-full p-2 rounded-md text-left text-xs hover-elevate"
                            data-testid={`button-scenario-${scenario.id}`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                              )}
                              <StatusIcon
                                className={`w-3.5 h-3.5 shrink-0 ${statusConfig.color} ${scenario.status === "running" ? "animate-spin" : ""}`}
                              />
                              <span className="truncate">{scenario.name}</span>
                            </div>
                            <Badge variant={statusConfig.badgeVariant} className="text-[10px] shrink-0">
                              {scenario.status}
                            </Badge>
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="ml-7 pl-2 border-l border-border space-y-2 py-2">
                            {scenario.description && (
                              <p className="text-[11px] text-muted-foreground">
                                {scenario.description}
                              </p>
                            )}
                            {scenario.steps && scenario.steps.length > 0 && (
                              <div className="space-y-1">
                                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                                  Steps
                                </span>
                                {scenario.steps.map((step, idx) => (
                                  <div
                                    key={idx}
                                    className="flex flex-col gap-0.5 text-[11px] p-1.5 rounded bg-muted/50"
                                    data-testid={`step-${scenario.id}-${idx}`}
                                  >
                                    <span>
                                      <span className="text-muted-foreground mr-1">{idx + 1}.</span>
                                      {step.action}
                                    </span>
                                    {step.expected && (
                                      <span className="text-muted-foreground ml-3">
                                        Expected: {step.expected}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                            {scenario.assertions && scenario.assertions.length > 0 && (
                              <div className="space-y-1">
                                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                                  Assertions
                                </span>
                                {scenario.assertions.map((assertion, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-start gap-1.5 text-[11px] p-1.5 rounded bg-muted/50"
                                    data-testid={`assertion-${scenario.id}-${idx}`}
                                  >
                                    <AlertCircle className="w-3 h-3 shrink-0 mt-0.5 text-muted-foreground" />
                                    <span>{assertion}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {scenario.status === "failed" && scenario.error && (
                              <div className="p-2 rounded bg-red-500/10 border border-red-500/20 text-[11px] text-red-500">
                                {scenario.error}
                              </div>
                            )}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}

                  {fixSuggestions[suite.id] && fixSuggestions[suite.id].length > 0 && (
                    <div className="mt-3 space-y-1.5 border-t pt-2">
                      <div className="flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                          Fix Suggestions
                        </span>
                      </div>
                      {fixSuggestions[suite.id].map((fix, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded-md bg-muted/50 text-xs space-y-1"
                          data-testid={`fix-suggestion-${suite.id}-${idx}`}
                        >
                          <p className="font-medium">{fix.scenario}</p>
                          <p className="text-muted-foreground">{fix.suggestion}</p>
                          {fix.code && (
                            <pre className="text-[10px] bg-background p-1.5 rounded overflow-x-auto font-mono">
                              {fix.code}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
