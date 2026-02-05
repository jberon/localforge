import { useState } from "react";
import { 
  Brain, 
  Lightbulb, 
  Activity,
  Gauge,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { IntelligenceDashboard } from "./intelligence-dashboard";
import { PatternManager } from "./pattern-manager";
import { ExtendedThinkingPanel } from "./extended-thinking-panel";
import { ContextBudgetPanel } from "./context-budget-panel";

interface AIInsightsPanelProps {
  projectId?: string;
  isThinking?: boolean;
  onClose?: () => void;
}

export function AIInsightsPanel({ projectId, isThinking = false, onClose }: AIInsightsPanelProps) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div className="h-full flex flex-col items-center py-4 px-2 border-l bg-background">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setCollapsed(false)}
              data-testid="button-expand-insights"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Expand AI Insights</TooltipContent>
        </Tooltip>
        
        <div className="flex flex-col items-center gap-4 mt-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant={activeTab === "dashboard" ? "secondary" : "ghost"} 
                size="icon"
                onClick={() => { setActiveTab("dashboard"); setCollapsed(false); }}
                data-testid="button-collapsed-dashboard"
              >
                <Activity className={`h-4 w-4 ${isThinking ? "text-purple-500 animate-pulse" : ""}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Intelligence Dashboard</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant={activeTab === "thinking" ? "secondary" : "ghost"} 
                size="icon"
                onClick={() => { setActiveTab("thinking"); setCollapsed(false); }}
                data-testid="button-collapsed-thinking"
              >
                <Brain className={`h-4 w-4 ${isThinking ? "text-purple-500 animate-pulse" : ""}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Extended Thinking</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant={activeTab === "patterns" ? "secondary" : "ghost"} 
                size="icon"
                onClick={() => { setActiveTab("patterns"); setCollapsed(false); }}
                data-testid="button-collapsed-patterns"
              >
                <Lightbulb className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Pattern Manager</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant={activeTab === "budget" ? "secondary" : "ghost"} 
                size="icon"
                onClick={() => { setActiveTab("budget"); setCollapsed(false); }}
                data-testid="button-collapsed-budget"
              >
                <Gauge className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Context Budget</TooltipContent>
          </Tooltip>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col border-l bg-background" data-testid="ai-insights-panel">
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <Brain className={`h-5 w-5 ${isThinking ? "text-purple-500 animate-pulse" : "text-muted-foreground"}`} />
          <span className="font-semibold">AI Insights</span>
          {isThinking && (
            <Badge variant="secondary" className="text-xs animate-pulse">
              Thinking...
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setCollapsed(true)}
                data-testid="button-collapse-insights"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Collapse panel</TooltipContent>
          </Tooltip>
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-3 mt-2 grid grid-cols-4">
          <TabsTrigger value="dashboard" className="text-xs" data-testid="tab-dashboard">
            <Activity className="h-3 w-3 mr-1" />
            Status
          </TabsTrigger>
          <TabsTrigger value="thinking" className="text-xs" data-testid="tab-thinking">
            <Brain className="h-3 w-3 mr-1" />
            Think
          </TabsTrigger>
          <TabsTrigger value="patterns" className="text-xs" data-testid="tab-patterns">
            <Lightbulb className="h-3 w-3 mr-1" />
            Learn
          </TabsTrigger>
          <TabsTrigger value="budget" className="text-xs" data-testid="tab-budget">
            <Gauge className="h-3 w-3 mr-1" />
            Budget
          </TabsTrigger>
        </TabsList>
        
        <ScrollArea className="flex-1 p-3">
          <TabsContent value="dashboard" className="mt-0 h-full">
            <IntelligenceDashboard projectId={projectId} />
          </TabsContent>
          
          <TabsContent value="thinking" className="mt-0 h-full">
            <ExtendedThinkingPanel projectId={projectId} isThinking={isThinking} />
          </TabsContent>
          
          <TabsContent value="patterns" className="mt-0 h-full">
            <PatternManager projectId={projectId} />
          </TabsContent>
          
          <TabsContent value="budget" className="mt-0 h-full">
            <ContextBudgetPanel projectId={projectId} />
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
