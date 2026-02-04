import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Activity, 
  Database, 
  Server, 
  Cpu, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  RefreshCw,
  Clock,
  Zap,
  Shield,
  MemoryStick
} from "lucide-react";

interface HealthDashboardData {
  timestamp: string;
  uptime: number;
  responseTimeMs: number;
  memory: {
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
    heapUsagePercent: number;
  };
  services: {
    database: { connected: boolean; latencyMs: number };
    llm: { connected: boolean; latencyMs: number };
  };
  health: {
    status: "healthy" | "degraded" | "critical";
    components: {
      llm: "healthy" | "degraded" | "critical";
      memory: "healthy" | "degraded" | "critical";
      queue: "healthy" | "degraded" | "critical";
      cache: "healthy" | "degraded" | "critical";
    };
    lastUpdated: number;
  };
  resilience: {
    circuitBreakers: Array<{
      key: string;
      state: string;
      failures: number;
    }>;
    bulkheads: Record<string, { active: number; queue: number; maxConcurrent: number }>;
  };
  tokenEstimation: {
    samples: number;
    avgRatio: string;
    totalEstimated: number;
  };
  recentAlerts: Array<{
    id: string;
    type: string;
    message: string;
    severity: string;
    timestamp: number;
  }>;
}

function StatusIndicator({ status }: { status: "healthy" | "degraded" | "critical" | boolean }) {
  if (status === true || status === "healthy") {
    return <CheckCircle className="h-4 w-4 text-green-500" />;
  }
  if (status === "degraded") {
    return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  }
  return <XCircle className="h-4 w-4 text-red-500" />;
}

function StatusBadge({ status }: { status: "healthy" | "degraded" | "critical" }) {
  const variants: Record<string, string> = {
    healthy: "bg-green-500/10 text-green-600 border-green-500/20",
    degraded: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    critical: "bg-red-500/10 text-red-600 border-red-500/20",
  };
  
  return (
    <Badge variant="outline" className={variants[status]}>
      {status}
    </Badge>
  );
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

export function HealthDashboard() {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery<HealthDashboardData>({
    queryKey: ["/api/health/dashboard"],
    enabled: isOpen,
    refetchInterval: isOpen ? 10000 : false,
  });

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-2 h-9 mb-2" 
          data-testid="button-health-dashboard"
        >
          <Activity className="h-4 w-4" />
          <span className="text-sm">Health Monitor</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Service Health Dashboard
          </DialogTitle>
          <DialogDescription>
            Real-time monitoring of system health, services, and performance.
          </DialogDescription>
        </DialogHeader>

        {isLoading && !data && (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600">
            {error instanceof Error ? error.message : "Failed to load health data"}
          </div>
        )}

        {data && (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <StatusBadge status={data.health.status} />
                <span className="text-sm text-muted-foreground">
                  Updated {new Date(data.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
                data-testid="button-refresh-health"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Uptime</span>
                  </div>
                  <p className="text-lg font-semibold">{formatUptime(data.uptime)}</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Response</span>
                  </div>
                  <p className="text-lg font-semibold">{data.responseTimeMs}ms</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <MemoryStick className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Memory</span>
                  </div>
                  <p className="text-lg font-semibold">{data.memory.heapUsedMB}MB</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Cpu className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Heap</span>
                  </div>
                  <p className="text-lg font-semibold">{data.memory.heapUsagePercent}%</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  Services
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Database</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{data.services.database.latencyMs}ms</span>
                      <StatusIndicator status={data.services.database.connected} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">LLM</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{data.services.llm.latencyMs}ms</span>
                      <StatusIndicator status={data.services.llm.connected} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Health Components
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(data.health.components).map(([name, status]) => (
                    <div key={name} className="flex flex-col items-center p-2 rounded-lg bg-muted/30">
                      <StatusIndicator status={status} />
                      <span className="text-xs mt-1 capitalize">{name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <MemoryStick className="h-4 w-4" />
                  Memory Usage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>Heap Usage</span>
                      <span>{data.memory.heapUsedMB}MB / {data.memory.heapTotalMB}MB</span>
                    </div>
                    <Progress value={data.memory.heapUsagePercent} className="h-2" />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>RSS: {data.memory.rssMB}MB</span>
                    <span>Token Samples: {data.tokenEstimation.samples}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {data.recentAlerts.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Recent Alerts ({data.recentAlerts.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-32">
                    <div className="space-y-2">
                      {data.recentAlerts.map((alert) => (
                        <div
                          key={alert.id}
                          className="flex items-start gap-2 p-2 rounded-lg bg-muted/30 text-xs"
                        >
                          <Badge
                            variant="outline"
                            className={
                              alert.severity === "critical"
                                ? "bg-red-500/10 text-red-600"
                                : alert.severity === "warning"
                                ? "bg-yellow-500/10 text-yellow-600"
                                : "bg-blue-500/10 text-blue-600"
                            }
                          >
                            {alert.severity}
                          </Badge>
                          <span className="flex-1">{alert.message}</span>
                          <span className="text-muted-foreground">
                            {new Date(alert.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {data.resilience.circuitBreakers.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Circuit Breakers
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {data.resilience.circuitBreakers.map((cb) => (
                      <div key={cb.key} className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded">
                        <span className="font-mono">{cb.key}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Failures: {cb.failures}</span>
                          <Badge
                            variant="outline"
                            className={
                              cb.state === "closed"
                                ? "bg-green-500/10 text-green-600"
                                : cb.state === "open"
                                ? "bg-red-500/10 text-red-600"
                                : "bg-yellow-500/10 text-yellow-600"
                            }
                          >
                            {cb.state}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
