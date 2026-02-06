import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Brain, Cloud, Cpu, BarChart3, Zap, Settings, RefreshCw, ArrowRight } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface RoutingConfig {
  enabled: boolean;
  fastModel: string;
  balancedModel: string;
  powerfulModel: string;
  fastEndpoint: string;
  balancedEndpoint: string;
  powerfulEndpoint: string;
  autoRouting: boolean;
  complexityThresholds: {
    simpleMaxTokens: number;
    moderateMaxTokens: number;
  };
}

interface RoutingStats {
  totalRoutes: number;
  successRate: number;
  tierDistribution: Record<string, number>;
}

interface RouteResult {
  selectedModel: string;
  selectedEndpoint: string;
  tier: "fast" | "balanced" | "powerful";
  reason: string;
  confidence: number;
  alternativeModels: string[];
  explanation: string;
}

interface CloudProvider {
  id: string;
  name: string;
  connected: boolean;
  priority: number;
}

const DEFAULT_PROVIDERS: CloudProvider[] = [
  { id: "openai", name: "OpenAI", connected: false, priority: 1 },
  { id: "groq", name: "Groq", connected: false, priority: 2 },
  { id: "together", name: "Together", connected: false, priority: 3 },
];

const TIER_COLORS: Record<string, string> = {
  fast: "text-green-500",
  balanced: "text-blue-500",
  powerful: "text-purple-500",
};

const TIER_BG: Record<string, string> = {
  fast: "bg-green-500/10 border-green-500/30",
  balanced: "bg-blue-500/10 border-blue-500/30",
  powerful: "bg-purple-500/10 border-purple-500/30",
};

export function SmartModelSettings() {
  const [providers, setProviders] = useState<CloudProvider[]>(DEFAULT_PROVIDERS);
  const [testPrompt, setTestPrompt] = useState("");
  const [recentRoutes, setRecentRoutes] = useState<RouteResult[]>([]);

  const { data: config, isLoading: configLoading } = useQuery<RoutingConfig>({
    queryKey: ["/api/optimization/model-router/config"],
    refetchInterval: 10000,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<RoutingStats>({
    queryKey: ["/api/optimization/model-router/stats"],
    refetchInterval: 5000,
  });

  const updateConfigMutation = useMutation({
    mutationFn: async (updates: Partial<RoutingConfig>) => {
      const res = await apiRequest("PUT", "/api/optimization/model-router/config", updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/optimization/model-router/config"] });
    },
  });

  const testRouteMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const res = await apiRequest("POST", "/api/optimization/model-router/route", { prompt });
      return res.json() as Promise<RouteResult>;
    },
    onSuccess: (result) => {
      setRecentRoutes((prev) => [result, ...prev].slice(0, 5));
      setTestPrompt("");
    },
  });

  const handleToggleEnabled = useCallback((checked: boolean) => {
    updateConfigMutation.mutate({ enabled: checked });
  }, [updateConfigMutation]);

  const handleToggleAutoRouting = useCallback((checked: boolean) => {
    updateConfigMutation.mutate({ autoRouting: checked });
  }, [updateConfigMutation]);

  const moveProvider = useCallback((id: string, direction: "up" | "down") => {
    setProviders((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      if (idx < 0) return prev;
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next.map((p, i) => ({ ...p, priority: i + 1 }));
    });
  }, []);

  const handleTestRoute = useCallback(() => {
    if (testPrompt.trim()) {
      testRouteMutation.mutate(testPrompt.trim());
    }
  }, [testPrompt, testRouteMutation]);

  const totalRoutes = stats?.totalRoutes ?? 0;
  const successRate = stats?.successRate ?? 0;
  const tierDist = stats?.tierDistribution ?? { fast: 0, balanced: 0, powerful: 0 };
  const localTotal = (tierDist.fast ?? 0) + (tierDist.balanced ?? 0) + (tierDist.powerful ?? 0);
  const isEnabled = config?.enabled ?? false;
  const isAutoRouting = config?.autoRouting ?? false;

  if (configLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading model router configuration...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3" data-testid="smart-model-settings">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Brain className="w-4 h-4 text-purple-500" />
            Smart Model Router
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="auto-routing-toggle" className="text-xs text-muted-foreground">
                Auto
              </Label>
              <Switch
                id="auto-routing-toggle"
                checked={isAutoRouting}
                onCheckedChange={handleToggleAutoRouting}
                disabled={!isEnabled || updateConfigMutation.isPending}
                data-testid="switch-auto-routing"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="router-toggle" className="text-xs text-muted-foreground">
                {isEnabled ? "On" : "Off"}
              </Label>
              <Switch
                id="router-toggle"
                checked={isEnabled}
                onCheckedChange={handleToggleEnabled}
                disabled={updateConfigMutation.isPending}
                data-testid="switch-router-enabled"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-0">
          {config && (
            <div className="grid grid-cols-3 gap-2">
              {(["fast", "balanced", "powerful"] as const).map((tier) => {
                const model = config[`${tier}Model` as keyof RoutingConfig] as string;
                const Icon = tier === "fast" ? Zap : tier === "balanced" ? Cpu : Brain;
                return (
                  <div
                    key={tier}
                    className={cn("flex flex-col gap-1 p-2 rounded-md border text-xs", TIER_BG[tier])}
                    data-testid={`tier-card-${tier}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Icon className={cn("w-3.5 h-3.5", TIER_COLORS[tier])} />
                      <span className="font-medium capitalize">{tier}</span>
                    </div>
                    <span className="text-muted-foreground truncate" title={model}>
                      {model || "Not set"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Cloud className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Cloud Providers</span>
            </div>
            <div className="space-y-1.5">
              {providers.map((provider, idx) => (
                <div
                  key={provider.id}
                  className="flex items-center justify-between gap-2 p-1.5 rounded-md border border-border text-xs"
                  data-testid={`provider-row-${provider.id}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-4 text-center">{idx + 1}</span>
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full",
                        provider.connected ? "bg-green-500" : "bg-muted-foreground/30"
                      )}
                      data-testid={`status-provider-${provider.id}`}
                    />
                    <span>{provider.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={idx === 0}
                      onClick={() => moveProvider(provider.id, "up")}
                      data-testid={`button-move-up-${provider.id}`}
                    >
                      <span className="text-[10px]">&#9650;</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={idx === providers.length - 1}
                      onClick={() => moveProvider(provider.id, "down")}
                      data-testid={`button-move-down-${provider.id}`}
                    >
                      <span className="text-[10px]">&#9660;</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">Routing Stats</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/optimization/model-router/stats"] })}
                data-testid="button-refresh-stats"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", statsLoading && "animate-spin")} />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="flex flex-col items-center p-2 rounded-md bg-muted/50">
                <span className="text-lg font-semibold" data-testid="text-total-routes">{totalRoutes}</span>
                <span className="text-muted-foreground">Total</span>
              </div>
              <div className="flex flex-col items-center p-2 rounded-md bg-muted/50">
                <span className="text-lg font-semibold" data-testid="text-success-rate">
                  {Math.round(successRate * 100)}%
                </span>
                <span className="text-muted-foreground">Success</span>
              </div>
              <div className="flex flex-col items-center p-2 rounded-md bg-muted/50">
                <span className="text-lg font-semibold" data-testid="text-local-count">{localTotal}</span>
                <span className="text-muted-foreground">Local</span>
              </div>
            </div>
            {totalRoutes > 0 && (
              <div className="flex items-center gap-1.5 mt-2">
                {(["fast", "balanced", "powerful"] as const).map((tier) => {
                  const count = tierDist[tier] ?? 0;
                  const pct = totalRoutes > 0 ? Math.round((count / totalRoutes) * 100) : 0;
                  return (
                    <Badge
                      key={tier}
                      variant="outline"
                      className={cn("text-[10px] gap-1", TIER_BG[tier])}
                      data-testid={`badge-tier-${tier}`}
                    >
                      <span className="capitalize">{tier}</span>
                      <span>{pct}%</span>
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Settings className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Test Route</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={testPrompt}
                onChange={(e) => setTestPrompt(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleTestRoute()}
                placeholder="Enter a prompt to test routing..."
                className="flex-1 text-xs bg-muted/50 border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
                data-testid="input-test-prompt"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleTestRoute}
                disabled={!testPrompt.trim() || testRouteMutation.isPending}
                data-testid="button-test-route"
              >
                {testRouteMutation.isPending ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ArrowRight className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>
          </div>

          {recentRoutes.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Zap className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">Recent Routes</span>
              </div>
              <div className="space-y-1.5">
                {recentRoutes.map((route, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "flex items-start gap-2 p-2 rounded-md border text-xs",
                      TIER_BG[route.tier]
                    )}
                    data-testid={`route-result-${idx}`}
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">
                          {route.selectedModel}
                        </Badge>
                        <Badge variant="outline" className={cn("text-[10px] capitalize", TIER_BG[route.tier])}>
                          {route.tier}
                        </Badge>
                        <span className="text-muted-foreground">
                          {Math.round(route.confidence * 100)}% conf
                        </span>
                      </div>
                      <p className="text-muted-foreground leading-relaxed">{route.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
