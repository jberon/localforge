import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Cpu,
  Activity,
  Zap,
  RefreshCw,
  Server,
  Layers,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  Gauge,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";

interface ModelSlot {
  id: string;
  model: string;
  endpoint: string;
  role: "planner" | "builder" | "reviewer" | "any";
  busy: boolean;
  currentTask: string | null;
  completedTasks: number;
  totalTokensUsed: number;
  avgLatencyMs: number;
  lastUsedAt: number;
}

interface PoolStats {
  totalSlots: number;
  busySlots: number;
  availableSlots: number;
  models: Array<{
    model: string;
    endpoint: string;
    totalSlots: number;
    busySlots: number;
    avgLatencyMs: number;
    completedTasks: number;
  }>;
  throughput: {
    tasksPerMinute: number;
    tokensPerMinute: number;
  };
}

interface WorkStream {
  id: string;
  type: "build" | "plan" | "quality" | "file";
  slotId: string | null;
  model: string;
  chunkId: string;
  chunkTitle: string;
  status: "queued" | "running" | "completed" | "failed";
  startedAt: number | null;
  completedAt: number | null;
  tokensUsed: number;
  error: string | null;
}

interface ParallelConfig {
  enabled: boolean;
  maxConcurrentChunks: number;
  enableLookahead: boolean;
  enableParallelFiles: boolean;
  enableConcurrentQuality: boolean;
  lookaheadDepth: number;
  qualityCheckThreshold: number;
}

interface ExecutionState {
  pipelineId: string;
  activeStreams: WorkStream[];
  completedStreams: WorkStream[];
  lookaheadQueue: Array<{ chunkId: string; chunkTitle: string; ready: boolean }>;
  qualityQueue: Array<{ chunkId: string; status: string }>;
  poolStats: PoolStats;
  speedup: number;
  wallClockMs: number;
  totalCpuMs: number;
}

const ROLE_COLORS: Record<string, string> = {
  planner: "text-blue-500",
  builder: "text-green-500",
  reviewer: "text-amber-500",
  any: "text-muted-foreground",
};

const STREAM_TYPE_COLORS: Record<string, string> = {
  build: "text-green-500",
  plan: "text-blue-500",
  quality: "text-amber-500",
  file: "text-purple-500",
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function truncateModel(model: string): string {
  if (model.length <= 30) return model;
  return model.slice(0, 27) + "...";
}

export function ParallelExecutionPanel() {
  const { toast } = useToast();
  const [localConfig, setLocalConfig] = useState<ParallelConfig | null>(null);

  const poolStatsQuery = useQuery<PoolStats>({
    queryKey: ["/api/parallel/pool/stats"],
    refetchInterval: 3000,
  });

  const slotsQuery = useQuery<ModelSlot[]>({
    queryKey: ["/api/parallel/pool/slots"],
    refetchInterval: 3000,
  });

  const configQuery = useQuery<ParallelConfig>({
    queryKey: ["/api/parallel/pipeline/config"],
  });

  const executionStateQuery = useQuery<ExecutionState>({
    queryKey: ["/api/parallel/pipeline/state"],
    refetchInterval: 2000,
  });

  useEffect(() => {
    if (configQuery.data && !localConfig) {
      setLocalConfig(configQuery.data);
    }
  }, [configQuery.data, localConfig]);

  const discoverMutation = useMutation({
    mutationFn: () => fetch("/api/parallel/pool/discover").then(r => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/parallel/pool/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/parallel/pool/slots"] });
      const modelCount = Object.values(data.models || {}).reduce(
        (sum: number, arr: unknown) => sum + (Array.isArray(arr) ? arr.length : 0), 0
      );
      toast({
        title: "Models Discovered",
        description: `Found ${modelCount} model(s) across ${Object.keys(data.models || {}).length} endpoint(s).`,
      });
    },
    onError: () => {
      toast({ title: "Discovery Failed", description: "Could not connect to LM Studio.", variant: "destructive" });
    },
  });

  const saveConfigMutation = useMutation({
    mutationFn: (config: Partial<ParallelConfig>) =>
      apiRequest("POST", "/api/parallel/pipeline/configure", config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parallel/pipeline/config"] });
      toast({ title: "Configuration Saved", description: "Parallel execution settings updated." });
    },
  });

  const setRoleMutation = useMutation({
    mutationFn: ({ model, role }: { model: string; role: string }) =>
      apiRequest("POST", "/api/parallel/pool/role", { model, role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parallel/pool/slots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/parallel/pool/stats"] });
    },
  });

  const startDiscoveryMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/parallel/pool/start-discovery", { intervalMs: 30000 }),
    onSuccess: () => {
      toast({ title: "Auto-Discovery Started", description: "Models will be refreshed every 30 seconds." });
    },
  });

  const handleSaveConfig = useCallback(() => {
    if (localConfig) {
      saveConfigMutation.mutate(localConfig);
    }
  }, [localConfig, saveConfigMutation]);

  const stats = poolStatsQuery.data;
  const slots = slotsQuery.data || [];
  const execState = executionStateQuery.data;

  const uniqueModels = stats?.models || [];
  const busySlots = slots.filter(s => s.busy);
  const hasActiveExecution = execState && execState.activeStreams.length > 0;

  return (
    <div className="space-y-4" data-testid="panel-parallel-execution">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Model Pool</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => discoverMutation.mutate()}
            disabled={discoverMutation.isPending}
            data-testid="button-discover-models"
          >
            {discoverMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            <span className="ml-1">Discover</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => startDiscoveryMutation.mutate()}
            title="Start auto-discovery"
            data-testid="button-auto-discover"
          >
            <Activity className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-2">
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-lg font-bold" data-testid="text-total-slots">{stats.totalSlots}</div>
              <div className="text-xs text-muted-foreground">Total Slots</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-lg font-bold text-green-500" data-testid="text-available-slots">{stats.availableSlots}</div>
              <div className="text-xs text-muted-foreground">Available</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-lg font-bold text-amber-500" data-testid="text-busy-slots">{stats.busySlots}</div>
              <div className="text-xs text-muted-foreground">Busy</div>
            </CardContent>
          </Card>
        </div>
      )}

      {uniqueModels.length > 0 && (
        <Card>
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Server className="h-4 w-4" />
              Loaded Models
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 space-y-2">
            {uniqueModels.map((model) => (
              <div key={`${model.endpoint}::${model.model}`} className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono truncate" title={model.model} data-testid={`text-model-name-${model.model}`}>
                    {truncateModel(model.model)}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{model.busySlots}/{model.totalSlots} busy</span>
                    {model.avgLatencyMs > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Clock className="h-3 w-3" />
                        {formatDuration(model.avgLatencyMs)}
                      </span>
                    )}
                    {model.completedTasks > 0 && (
                      <span>{model.completedTasks} done</span>
                    )}
                  </div>
                </div>
                <Select
                  value={slots.find(s => s.model === model.model)?.role || "any"}
                  onValueChange={(role) => setRoleMutation.mutate({ model: model.model, role })}
                >
                  <SelectTrigger className="w-24 h-7 text-xs" data-testid={`select-role-${model.model}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="planner">Planner</SelectItem>
                    <SelectItem value="builder">Builder</SelectItem>
                    <SelectItem value="reviewer">Reviewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {uniqueModels.length === 0 && !discoverMutation.isPending && (
        <Card>
          <CardContent className="p-4 text-center text-sm text-muted-foreground">
            <Cpu className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>No models discovered yet.</p>
            <p className="text-xs mt-1">Click "Discover" to scan LM Studio for loaded models.</p>
          </CardContent>
        </Card>
      )}

      <Separator />

      {localConfig && (
        <Card>
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Parallel Execution
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="parallel-enabled" className="text-xs">Enable Parallel Execution</Label>
              <Switch
                id="parallel-enabled"
                checked={localConfig.enabled}
                onCheckedChange={(v) => setLocalConfig({ ...localConfig, enabled: v })}
                data-testid="switch-parallel-enabled"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">Max Concurrent Tasks</Label>
              <Select
                value={String(localConfig.maxConcurrentChunks)}
                onValueChange={(v) => setLocalConfig({ ...localConfig, maxConcurrentChunks: parseInt(v) })}
              >
                <SelectTrigger className="w-16 h-7 text-xs" data-testid="select-max-concurrent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="4">4</SelectItem>
                  <SelectItem value="5">5</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="lookahead-enabled" className="text-xs flex items-center gap-1">
                <Eye className="h-3 w-3" />
                Lookahead Planning
              </Label>
              <Switch
                id="lookahead-enabled"
                checked={localConfig.enableLookahead}
                onCheckedChange={(v) => setLocalConfig({ ...localConfig, enableLookahead: v })}
                data-testid="switch-lookahead"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="quality-enabled" className="text-xs flex items-center gap-1">
                <Gauge className="h-3 w-3" />
                Concurrent Quality Check
              </Label>
              <Switch
                id="quality-enabled"
                checked={localConfig.enableConcurrentQuality}
                onCheckedChange={(v) => setLocalConfig({ ...localConfig, enableConcurrentQuality: v })}
                data-testid="switch-concurrent-quality"
              />
            </div>

            <Button
              size="sm"
              onClick={handleSaveConfig}
              disabled={saveConfigMutation.isPending}
              className="w-full"
              data-testid="button-save-parallel-config"
            >
              {saveConfigMutation.isPending ? "Saving..." : "Save Configuration"}
            </Button>
          </CardContent>
        </Card>
      )}

      {busySlots.length > 0 && (
        <>
          <Separator />
          <Card>
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-amber-500" />
                Active Slots
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 space-y-2">
              {busySlots.map((slot) => (
                <div key={slot.id} className="flex items-center gap-2 text-xs" data-testid={`slot-active-${slot.id}`}>
                  <Loader2 className="h-3 w-3 animate-spin text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono truncate">{truncateModel(slot.model)}</div>
                    <div className="text-muted-foreground truncate">
                      {slot.currentTask || "working..."}
                    </div>
                  </div>
                  <Badge variant="outline" className={ROLE_COLORS[slot.role]}>
                    {slot.role}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {hasActiveExecution && execState && (
        <>
          <Separator />
          <Card>
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                Pipeline Execution
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 space-y-3">
              <div className="grid grid-cols-3 gap-2 text-xs text-center">
                <div>
                  <div className="font-bold" data-testid="text-speedup">{execState.speedup.toFixed(1)}x</div>
                  <div className="text-muted-foreground">Speedup</div>
                </div>
                <div>
                  <div className="font-bold">{formatDuration(execState.wallClockMs)}</div>
                  <div className="text-muted-foreground">Wall Clock</div>
                </div>
                <div>
                  <div className="font-bold">{formatDuration(execState.totalCpuMs)}</div>
                  <div className="text-muted-foreground">CPU Time</div>
                </div>
              </div>

              {execState.activeStreams.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Active Streams</div>
                  {execState.activeStreams.map((stream) => (
                    <div key={stream.id} className="flex items-center gap-2 text-xs p-1 rounded bg-muted/30">
                      <Loader2 className={`h-3 w-3 animate-spin shrink-0 ${STREAM_TYPE_COLORS[stream.type]}`} />
                      <span className="font-mono truncate flex-1">{stream.chunkTitle}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {stream.type}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              {execState.completedStreams.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">
                    Completed ({execState.completedStreams.length})
                  </div>
                  {execState.completedStreams.slice(-5).map((stream) => (
                    <div key={stream.id} className="flex items-center gap-2 text-xs p-1 rounded">
                      {stream.status === "completed" ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                      ) : (
                        <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                      )}
                      <span className="truncate flex-1 text-muted-foreground">{stream.chunkTitle}</span>
                      {stream.tokensUsed > 0 && (
                        <span className="text-muted-foreground text-[10px]">{stream.tokensUsed}tk</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {stats && stats.throughput.tasksPerMinute > 0 && (
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Throughput</span>
              <span className="font-mono">{stats.throughput.tasksPerMinute} tasks/min</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
