import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Terminal, Trash2, ChevronDown, ChevronUp, AlertCircle, Info, AlertTriangle } from "lucide-react";

export interface ConsoleLog {
  id: string;
  type: "log" | "warn" | "error" | "info";
  message: string;
  timestamp: number;
}

interface ConsolePanelProps {
  logs: ConsoleLog[];
  onClear: () => void;
}

export function ConsolePanel({ logs, onClear }: ConsolePanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [filter, setFilter] = useState<"all" | "log" | "warn" | "error">("all");
  const scrollRef = useRef<HTMLDivElement>(null);

  const filteredLogs = logs.filter((log) => filter === "all" || log.type === filter);

  const errorCount = logs.filter((l) => l.type === "error").length;
  const warnCount = logs.filter((l) => l.type === "warn").length;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredLogs]);

  const getLogIcon = (type: ConsoleLog["type"]) => {
    switch (type) {
      case "error":
        return <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />;
      case "warn":
        return <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />;
      case "info":
        return <Info className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />;
      default:
        return <span className="w-3.5 h-3.5 flex-shrink-0" />;
    }
  };

  const getLogClass = (type: ConsoleLog["type"]) => {
    switch (type) {
      case "error":
        return "bg-red-500/10 text-red-400";
      case "warn":
        return "bg-yellow-500/10 text-yellow-400";
      case "info":
        return "bg-blue-500/10 text-blue-400";
      default:
        return "bg-transparent";
    }
  };

  return (
    <div className="border-t bg-card">
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover-elevate"
        onClick={() => setIsExpanded(!isExpanded)}
        data-testid="button-toggle-console"
      >
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Console</span>
          {errorCount > 0 && (
            <Badge variant="destructive" className="text-[10px] h-4 px-1.5">
              {errorCount}
            </Badge>
          )}
          {warnCount > 0 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-yellow-500/20 text-yellow-600">
              {warnCount}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            data-testid="button-clear-console"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Clear
          </Button>
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t">
          <div className="flex items-center gap-1 px-3 py-1.5 border-b bg-muted/30">
            {(["all", "log", "warn", "error"] as const).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? "secondary" : "ghost"}
                className="h-6 px-2 text-xs capitalize"
                onClick={() => setFilter(f)}
                data-testid={`button-filter-${f}`}
              >
                {f}
              </Button>
            ))}
          </div>
          <ScrollArea className="h-40" ref={scrollRef}>
            <div className="font-mono text-xs p-2 space-y-0.5">
              {filteredLogs.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No console output</p>
              ) : (
                filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`flex items-start gap-2 px-2 py-1 rounded ${getLogClass(log.type)}`}
                    data-testid={`console-log-${log.id}`}
                  >
                    {getLogIcon(log.type)}
                    <span className="text-muted-foreground text-[10px] flex-shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className="break-all whitespace-pre-wrap">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
