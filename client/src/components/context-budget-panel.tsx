import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Gauge, 
  FileCode, 
  MessageSquare, 
  Settings, 
  ArrowRight,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle,
  Info
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ContextBudgetBreakdown {
  systemPrompt: number;
  userMessage: number;
  codeContext: number;
  chatHistory: number;
  outputReserve: number;
  fileContents: number;
}

interface SelectedFile {
  path: string;
  tokens: number;
  relevanceScore: number;
  reason: string;
}

interface ContextBudgetData {
  maxTokens: number;
  usedTokens: number;
  breakdown: ContextBudgetBreakdown;
  selectedFiles: SelectedFile[];
  truncatedFiles: string[];
  modelLimit: number;
  modelName: string;
}

interface ContextBudgetPanelProps {
  projectId?: string;
  compact?: boolean;
}

const ALLOCATION_LABELS: Record<string, { label: string; icon: typeof Gauge; color: string }> = {
  systemPrompt: { label: "System Prompt", icon: Settings, color: "bg-purple-500" },
  userMessage: { label: "Your Message", icon: MessageSquare, color: "bg-blue-500" },
  codeContext: { label: "Code Context", icon: FileCode, color: "bg-green-500" },
  chatHistory: { label: "Chat History", icon: MessageSquare, color: "bg-orange-500" },
  outputReserve: { label: "Output Reserve", icon: ArrowRight, color: "bg-gray-500" },
};

function formatTokens(tokens: number): string {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

function getUsageLevel(percentage: number): { label: string; color: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  if (percentage < 50) return { label: "Low", color: "text-green-500", variant: "secondary" };
  if (percentage < 75) return { label: "Moderate", color: "text-yellow-500", variant: "outline" };
  if (percentage < 90) return { label: "High", color: "text-orange-500", variant: "outline" };
  return { label: "Critical", color: "text-red-500", variant: "destructive" };
}

export function ContextBudgetPanel({ projectId, compact = false }: ContextBudgetPanelProps) {
  const [showFiles, setShowFiles] = useState(false);

  const { data: budgetData, isLoading } = useQuery<ContextBudgetData>({
    queryKey: projectId 
      ? ["/api/intelligence/context-budget", projectId]
      : ["/api/intelligence/context-budget"],
    queryFn: async () => {
      const url = projectId 
        ? `/api/intelligence/context-budget?projectId=${projectId}`
        : "/api/intelligence/context-budget";
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch context budget");
      return response.json();
    },
    refetchInterval: 10000,
  });

  if (isLoading || !budgetData) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Context Budget</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-24 flex items-center justify-center text-muted-foreground text-sm">
            Loading budget data...
          </div>
        </CardContent>
      </Card>
    );
  }

  const usagePercent = Math.round((budgetData.usedTokens / budgetData.maxTokens) * 100);
  const usageLevel = getUsageLevel(usagePercent);
  const availableTokens = budgetData.maxTokens - budgetData.usedTokens;
  const outputReserve = budgetData.breakdown.outputReserve || Math.floor(budgetData.maxTokens * 0.10);

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-2 rounded-lg border bg-muted/30" data-testid="context-budget-compact">
        <Tooltip>
          <TooltipTrigger asChild>
            <div 
              className="flex items-center gap-2 cursor-help"
              data-testid="context-budget-compact-trigger"
            >
              <Gauge className={`h-4 w-4 ${usageLevel.color}`} />
              <Progress value={usagePercent} className="w-20 h-2" />
              <span className="text-xs text-muted-foreground">
                {formatTokens(budgetData.usedTokens)} / {formatTokens(budgetData.maxTokens)}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <div className="space-y-1">
              <p className="font-medium">Context Budget: {usagePercent}% used</p>
              <p className="text-xs text-muted-foreground">
                {formatTokens(availableTokens)} tokens available for code and output
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
        {usagePercent >= 75 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div data-testid="context-budget-warning">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
              </div>
            </TooltipTrigger>
            <TooltipContent>Context budget running low</TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  }

  return (
    <Card className="w-full" data-testid="context-budget-panel">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Gauge className={`h-5 w-5 ${usageLevel.color}`} />
            <CardTitle className="text-lg">Context Budget</CardTitle>
            <Badge variant={usageLevel.variant}>{usageLevel.label}</Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            {budgetData.modelName || "Default Model"}
          </div>
        </div>
        <CardDescription>
          Token allocation for {formatTokens(budgetData.modelLimit)} context window
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>Total Usage</span>
            <span className="font-medium">
              {formatTokens(budgetData.usedTokens)} / {formatTokens(budgetData.maxTokens)} tokens
            </span>
          </div>
          <Progress value={usagePercent} className="h-3" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{usagePercent}% used</span>
            <span>{formatTokens(availableTokens)} available</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium flex items-center gap-2">
            Allocation Breakdown
            <Tooltip>
              <TooltipTrigger asChild>
                <div data-testid="allocation-info-trigger">
                  <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                How your context window is divided between system prompts, your message, code files, and chat history
              </TooltipContent>
            </Tooltip>
          </div>
          
          <div className="space-y-2">
            {Object.entries(budgetData.breakdown).map(([key, tokens]) => {
              if (key === "fileContents") return null;
              const config = ALLOCATION_LABELS[key];
              if (!config) return null;
              
              const percent = Math.round((tokens / budgetData.maxTokens) * 100);
              const Icon = config.icon;
              
              return (
                <div key={key} className="flex items-center gap-2" data-testid={`budget-allocation-${key}`}>
                  <div className={`w-3 h-3 rounded-full ${config.color}`} />
                  <Icon className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs flex-1">{config.label}</span>
                  <span className="text-xs text-muted-foreground">{formatTokens(tokens)}</span>
                  <span className="text-xs text-muted-foreground w-8 text-right">{percent}%</span>
                </div>
              );
            })}
          </div>
        </div>

        {budgetData.selectedFiles.length > 0 && (
          <Collapsible open={showFiles} onOpenChange={setShowFiles}>
            <CollapsibleTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-full justify-between p-2 h-auto"
                data-testid="button-toggle-files"
              >
                <span className="text-sm flex items-center gap-2">
                  <FileCode className="h-4 w-4" />
                  Included Files ({budgetData.selectedFiles.length})
                </span>
                {showFiles ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ScrollArea className="h-40 mt-2">
                <div className="space-y-1 pr-4">
                  {budgetData.selectedFiles.map((file, index) => (
                    <div 
                      key={index} 
                      className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-xs"
                      data-testid={`file-item-${index}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-mono">{file.path}</div>
                        <div className="text-muted-foreground truncate">{file.reason}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <Badge variant="outline" className="text-xs">
                          {formatTokens(file.tokens)}
                        </Badge>
                        <Badge 
                          variant="secondary" 
                          className={`text-xs ${file.relevanceScore > 50 ? "bg-green-500/20" : ""}`}
                        >
                          {file.relevanceScore}%
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>
        )}

        {budgetData.truncatedFiles.length > 0 && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-yellow-500/10 border border-yellow-500/20">
            <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-medium">{budgetData.truncatedFiles.length} files truncated</span>
              <span className="text-muted-foreground"> due to context limits</span>
            </div>
          </div>
        )}

        {usagePercent < 50 && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-green-500/10 border border-green-500/20">
            <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground">
              Plenty of context available for detailed responses
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
