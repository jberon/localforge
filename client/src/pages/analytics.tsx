import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  ThumbsUp,
  ThumbsDown,
  Clock,
  Zap,
  RefreshCw,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Target,
  Sparkles,
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { AnalyticsOverview, Insight, LLMSettings } from "@shared/schema";

interface AnalyticsPageProps {
  settings: LLMSettings;
}

export default function AnalyticsPage({ settings }: AnalyticsPageProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: overview, isLoading: overviewLoading } = useQuery<AnalyticsOverview>({
    queryKey: ["/api/analytics/overview"],
  });

  const { data: insights = [], isLoading: insightsLoading } = useQuery<Insight[]>({
    queryKey: ["/api/analytics/insights"],
  });

  const generateInsightsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/analytics/generate-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/insights"] });
      toast({
        title: "Insights Generated",
        description: `Generated ${data.generated} new insights from your usage data.`,
      });
    },
    onError: () => {
      toast({
        title: "Failed to generate insights",
        description: "Make sure LM Studio is running and connected.",
        variant: "destructive",
      });
    },
  });

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "destructive";
      case "medium": return "default";
      case "low": return "secondary";
      default: return "outline";
    }
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case "pattern": return <BarChart3 className="h-4 w-4" />;
      case "recommendation": return <Lightbulb className="h-4 w-4" />;
      case "trend": return <TrendingUp className="h-4 w-4" />;
      case "warning": return <AlertTriangle className="h-4 w-4" />;
      default: return <Sparkles className="h-4 w-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back-home">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
              <p className="text-muted-foreground">
                Insights and metrics from your LocalForge usage
              </p>
            </div>
          </div>
          <Button
            onClick={() => generateInsightsMutation.mutate()}
            disabled={generateInsightsMutation.isPending}
            data-testid="button-generate-insights"
          >
            {generateInsightsMutation.isPending ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Generate AI Insights
          </Button>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList data-testid="analytics-tabs">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <BarChart3 className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="insights" data-testid="tab-insights">
              <Lightbulb className="h-4 w-4 mr-2" />
              AI Insights
              {insights.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {insights.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {overviewLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardHeader className="pb-2">
                      <div className="h-4 bg-muted rounded w-1/2" />
                    </CardHeader>
                    <CardContent>
                      <div className="h-8 bg-muted rounded w-1/3" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : overview ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card data-testid="metric-total-generations">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                      <CardTitle className="text-sm font-medium">
                        Total Generations
                      </CardTitle>
                      <Zap className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{overview.totalGenerations}</div>
                      <p className="text-xs text-muted-foreground">
                        Last 30 days
                      </p>
                    </CardContent>
                  </Card>

                  <Card data-testid="metric-success-rate">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                      <CardTitle className="text-sm font-medium">
                        Success Rate
                      </CardTitle>
                      {overview.successRate >= 80 ? (
                        <TrendingUp className="h-4 w-4 text-green-500" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-500" />
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {overview.successRate.toFixed(1)}%
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {overview.successfulGenerations} successful / {overview.failedGenerations} failed
                      </p>
                    </CardContent>
                  </Card>

                  <Card data-testid="metric-avg-time">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                      <CardTitle className="text-sm font-medium">
                        Avg. Generation Time
                      </CardTitle>
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {(overview.averageGenerationTime / 1000).toFixed(1)}s
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Per generation
                      </p>
                    </CardContent>
                  </Card>

                  <Card data-testid="metric-feedback">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                      <CardTitle className="text-sm font-medium">
                        Feedback Score
                      </CardTitle>
                      <Target className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1">
                          <ThumbsUp className="h-4 w-4 text-green-500" />
                          <span className="text-lg font-bold">{overview.feedbackStats.positive}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <ThumbsDown className="h-4 w-4 text-red-500" />
                          <span className="text-lg font-bold">{overview.feedbackStats.negative}</span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        User ratings
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card data-testid="card-template-usage">
                    <CardHeader>
                      <CardTitle className="text-base">Template Usage</CardTitle>
                      <CardDescription>
                        Which templates are most popular
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {Object.keys(overview.templateUsage).length > 0 ? (
                        <div className="space-y-3">
                          {Object.entries(overview.templateUsage)
                            .sort(([, a], [, b]) => b - a)
                            .map(([template, count]) => {
                              const total = Object.values(overview.templateUsage).reduce((a, b) => a + b, 0);
                              const percentage = (count / total) * 100;
                              return (
                                <div key={template} className="space-y-1">
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="capitalize">{template.replace(/_/g, " ")}</span>
                                    <span className="text-muted-foreground">{count} uses</span>
                                  </div>
                                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-primary transition-all"
                                      style={{ width: `${percentage}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No template usage data yet
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  <Card data-testid="card-recent-trends">
                    <CardHeader>
                      <CardTitle className="text-base">7-Day Trend</CardTitle>
                      <CardDescription>
                        Generation activity over the past week
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {overview.recentTrends.map((day) => {
                          const successRate = day.generations > 0 
                            ? (day.successes / day.generations) * 100 
                            : 0;
                          return (
                            <div key={day.date} className="flex items-center gap-4">
                              <span className="text-sm text-muted-foreground w-24">
                                {new Date(day.date).toLocaleDateString("en-US", { 
                                  weekday: "short", 
                                  month: "short", 
                                  day: "numeric" 
                                })}
                              </span>
                              <div className="flex-1">
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-primary transition-all"
                                    style={{ width: `${Math.min(day.generations * 10, 100)}%` }}
                                  />
                                </div>
                              </div>
                              <div className="flex items-center gap-2 w-20 justify-end">
                                <span className="text-sm font-medium">{day.generations}</span>
                                {day.generations > 0 && (
                                  <CheckCircle2 
                                    className={`h-3 w-3 ${successRate >= 80 ? 'text-green-500' : 'text-yellow-500'}`}
                                  />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Data Yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Start generating apps to see your analytics
                  </p>
                  <Link href="/">
                    <Button data-testid="button-go-create">
                      Create Your First App
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="insights" className="space-y-4">
            {insightsLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardHeader>
                      <div className="h-5 bg-muted rounded w-1/3" />
                    </CardHeader>
                    <CardContent>
                      <div className="h-4 bg-muted rounded w-2/3" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : insights.length > 0 ? (
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-4">
                  {insights.map((insight) => (
                    <Card key={insight.id} data-testid={`insight-${insight.id}`}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-2">
                            {getInsightIcon(insight.type)}
                            <CardTitle className="text-base">{insight.title}</CardTitle>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={getPriorityColor(insight.priority)}>
                              {insight.priority}
                            </Badge>
                            <Badge variant="outline" className="capitalize">
                              {insight.type}
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">
                          {insight.description}
                        </p>
                        {insight.actionable && (
                          <div className="mt-3 flex items-center gap-2 text-sm text-primary">
                            <Target className="h-4 w-4" />
                            <span>Actionable</span>
                          </div>
                        )}
                        <div className="mt-2 text-xs text-muted-foreground">
                          Generated {new Date(insight.generatedAt).toLocaleDateString()}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Lightbulb className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Insights Yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Click "Generate AI Insights" to analyze your usage data
                  </p>
                  <Button
                    onClick={() => generateInsightsMutation.mutate()}
                    disabled={generateInsightsMutation.isPending}
                    data-testid="button-generate-insights-empty"
                  >
                    {generateInsightsMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    Generate AI Insights
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
