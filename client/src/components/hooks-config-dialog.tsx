import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Zap, Plus, Trash2, History, ChevronDown, ChevronUp } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface HookAction {
  type: string;
  description: string;
}

interface Hook {
  id: string;
  event: string;
  action: HookAction;
  enabled: boolean;
  createdAt: number;
}

interface ProjectHooksResponse {
  projectId: string;
  hooks: Hook[];
  executionHistory: HookExecutionResult[];
}

interface HookExecutionResult {
  hookId: string;
  event: string;
  action: string;
  success: boolean;
  message: string;
  duration: number;
}

interface HooksConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
}

const EVENTS = [
  { value: "post-generation", label: "After Generation" },
  { value: "post-refinement", label: "After Refinement" },
  { value: "pre-deploy", label: "Before Deploy" },
  { value: "post-test", label: "After Tests" },
  { value: "on-error", label: "On Error" },
  { value: "pre-generation", label: "Before Generation" },
];

const ACTIONS = [
  { value: "validate", label: "Run Validation" },
  { value: "check-todos", label: "Check Feature Manifest" },
  { value: "regenerate-tests", label: "Regenerate Tests" },
  { value: "custom-check", label: "Custom Check" },
  { value: "log", label: "Log Event" },
];

const ACTION_DESCRIPTIONS: Record<string, string> = {
  validate: "Validate code quality",
  "check-todos": "Check for remaining TODOs",
  "regenerate-tests": "Regenerate test suite",
  "custom-check": "Run custom validation",
  log: "Log lifecycle event",
};

export function HooksConfigDialog({ open, onOpenChange, projectId }: HooksConfigDialogProps) {
  const [newEvent, setNewEvent] = useState("");
  const [newAction, setNewAction] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const hooksQuery = useQuery<ProjectHooksResponse>({
    queryKey: ["/api/runtime/hooks", projectId],
    enabled: !!projectId && open,
  });

  const addHookMutation = useMutation({
    mutationFn: async ({ event, action }: { event: string; action: string }) => {
      return apiRequest("POST", `/api/runtime/hooks/${projectId}`, {
        event,
        action: {
          type: action,
          description: ACTION_DESCRIPTIONS[action] || action,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/runtime/hooks", projectId] });
      setNewEvent("");
      setNewAction("");
    },
  });

  const removeHookMutation = useMutation({
    mutationFn: async (hookId: string) => {
      return apiRequest("DELETE", `/api/runtime/hooks/${projectId}/${hookId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/runtime/hooks", projectId] });
    },
  });

  const toggleHookMutation = useMutation({
    mutationFn: async ({ hookId, enabled }: { hookId: string; enabled: boolean }) => {
      return apiRequest("POST", `/api/runtime/hooks/${projectId}/toggle`, { hookId, enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/runtime/hooks", projectId] });
    },
  });

  const hooks = hooksQuery.data?.hooks || [];
  const history = hooksQuery.data?.executionHistory || [];

  const getEventLabel = (value: string) => EVENTS.find(e => e.value === value)?.label || value;
  const getActionLabel = (value: string) => ACTIONS.find(a => a.value === value)?.label || value;

  if (!projectId) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Lifecycle Hooks
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Select a project first to configure lifecycle hooks.</p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Lifecycle Hooks
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">Event</label>
              <Select value={newEvent} onValueChange={setNewEvent}>
                <SelectTrigger data-testid="select-hook-event">
                  <SelectValue placeholder="When..." />
                </SelectTrigger>
                <SelectContent>
                  {EVENTS.map(e => (
                    <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">Action</label>
              <Select value={newAction} onValueChange={setNewAction}>
                <SelectTrigger data-testid="select-hook-action">
                  <SelectValue placeholder="Do..." />
                </SelectTrigger>
                <SelectContent>
                  {ACTIONS.map(a => (
                    <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="icon"
              disabled={!newEvent || !newAction || addHookMutation.isPending}
              onClick={() => addHookMutation.mutate({ event: newEvent, action: newAction })}
              data-testid="button-add-hook"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {hooks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hooks configured. Add one above to automate lifecycle actions.
            </p>
          ) : (
            <div className="space-y-2">
              {hooks.map((hook: Hook) => (
                <Card key={hook.id} className="flex items-center justify-between gap-2 p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="secondary" className="shrink-0">{getEventLabel(hook.event)}</Badge>
                    <span className="text-xs text-muted-foreground shrink-0">then</span>
                    <Badge variant="outline" className="shrink-0">{getActionLabel(hook.action.type)}</Badge>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={hook.enabled}
                      onCheckedChange={(checked) => toggleHookMutation.mutate({ hookId: hook.id, enabled: checked })}
                      data-testid={`switch-hook-${hook.id}`}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeHookMutation.mutate(hook.id)}
                      data-testid={`button-remove-hook-${hook.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => setShowHistory(!showHistory)}
            data-testid="button-toggle-history"
          >
            <History className="h-3.5 w-3.5 mr-1.5" />
            Execution History
            {showHistory ? <ChevronUp className="h-3.5 w-3.5 ml-1" /> : <ChevronDown className="h-3.5 w-3.5 ml-1" />}
          </Button>

          {showHistory && (
            <div className="space-y-1.5">
              {history.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">No hook executions yet.</p>
              ) : (
                history.slice(0, 10).map((exec, i) => (
                  <div key={i} className="flex items-center justify-between text-xs p-2 rounded-md bg-muted/30">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${exec.success ? "bg-emerald-500" : "bg-red-500"}`} />
                      <span className="text-muted-foreground">{getEventLabel(exec.event)}</span>
                      <span className="text-muted-foreground">-</span>
                      <span>{getActionLabel(exec.action)}</span>
                    </div>
                    <span className="text-muted-foreground">{exec.duration}ms</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
