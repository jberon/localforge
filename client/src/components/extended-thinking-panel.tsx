import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Brain, 
  ChevronDown, 
  ChevronUp, 
  Clock, 
  CheckCircle,
  AlertTriangle,
  Zap,
  RefreshCw,
  Eye,
  Target,
  Lightbulb
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";

interface ThinkingStep {
  id: string;
  type: "analyze" | "decompose" | "research" | "synthesize" | "validate" | "conclude";
  content: string;
  duration: number;
  insights: string[];
  questions: string[];
  timestamp: string;
}

interface ThinkingSession {
  id: string;
  projectId: string;
  mode: "standard" | "extended" | "deep";
  prompt: string;
  steps: ThinkingStep[];
  startTime: string;
  endTime?: string;
  conclusion?: string;
  confidence: number;
  triggerReason?: string;
}

interface ExtendedThinkingPanelProps {
  projectId?: string;
  activeSession?: ThinkingSession;
  isThinking?: boolean;
}

const STEP_ICONS: Record<ThinkingStep["type"], typeof Brain> = {
  analyze: Eye,
  decompose: Target,
  research: Brain,
  synthesize: Zap,
  validate: CheckCircle,
  conclude: Lightbulb
};

const STEP_COLORS: Record<ThinkingStep["type"], string> = {
  analyze: "text-blue-500",
  decompose: "text-purple-500",
  research: "text-cyan-500",
  synthesize: "text-orange-500",
  validate: "text-green-500",
  conclude: "text-green-600"
};

const MODE_CONFIGS = {
  standard: { label: "Standard", steps: 3, color: "bg-blue-500" },
  extended: { label: "Extended", steps: 7, color: "bg-purple-500" },
  deep: { label: "Deep", steps: 15, color: "bg-orange-500" }
};

export function ExtendedThinkingPanel({ 
  projectId, 
  activeSession,
  isThinking 
}: ExtendedThinkingPanelProps) {
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  const { data: sessionsData } = useQuery<{ sessions: ThinkingSession[] }>({
    queryKey: projectId 
      ? ["/api/intelligence/thinking/sessions", projectId]
      : ["/api/intelligence/thinking/sessions"],
    queryFn: async () => {
      const url = projectId 
        ? `/api/intelligence/thinking/sessions?projectId=${projectId}`
        : "/api/intelligence/thinking/sessions";
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch sessions");
      return response.json();
    },
    refetchInterval: isThinking ? 2000 : false
  });

  const { data: modeData } = useQuery<{ currentMode: string; config: { description: string; maxSteps: number } }>({
    queryKey: ["/api/intelligence/thinking/mode"]
  });

  const sessions = sessionsData?.sessions || [];
  const displaySession = activeSession || sessions[0];

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Brain className={`h-5 w-5 ${isThinking ? "text-purple-500 animate-pulse" : "text-muted-foreground"}`} />
            <CardTitle className="text-lg">Extended Thinking</CardTitle>
            {modeData && (
              <Badge 
                className={`${MODE_CONFIGS[modeData.currentMode as keyof typeof MODE_CONFIGS]?.color || "bg-gray-500"} text-white`}
              >
                {modeData.currentMode}
              </Badge>
            )}
          </div>
          {isThinking && (
            <Badge variant="outline" className="animate-pulse">
              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
              Thinking...
            </Badge>
          )}
        </div>
        <CardDescription>
          Multi-step reasoning with validation checkpoints
        </CardDescription>
      </CardHeader>

      <CardContent>
        {displaySession ? (
          <div className="space-y-4">
            <ActiveSessionView session={displaySession} isActive={isThinking && displaySession === activeSession} />

            {sessions.length > 1 && (
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-3">Previous Sessions</h4>
                <ScrollArea className="h-[200px]">
                  <div className="space-y-2">
                    {sessions.slice(1, 6).map((session) => (
                      <SessionSummaryCard
                        key={session.id}
                        session={session}
                        isExpanded={expandedSession === session.id}
                        onToggle={() => setExpandedSession(
                          expandedSession === session.id ? null : session.id
                        )}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Brain className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              No thinking sessions yet
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Extended thinking activates for complex prompts
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActiveSessionView({ session, isActive }: { session: ThinkingSession; isActive?: boolean }) {
  const modeConfig = MODE_CONFIGS[session.mode];
  const progress = (session.steps.length / modeConfig.steps) * 100;

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-lg border bg-muted/30">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm line-clamp-2">{session.prompt}</p>
            {session.triggerReason && (
              <p className="text-xs text-muted-foreground mt-1">
                Triggered: {session.triggerReason}
              </p>
            )}
          </div>
          <Badge className={`${modeConfig.color} text-white shrink-0`}>
            {modeConfig.label}
          </Badge>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Progress</span>
            <span>{session.steps.length} / {modeConfig.steps} steps</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      </div>

      {session.steps.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Reasoning Steps</h4>
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
            <div className="space-y-3">
              {session.steps.map((step, index) => (
                <StepCard 
                  key={step.id} 
                  step={step} 
                  index={index}
                  isLast={index === session.steps.length - 1}
                  isActive={isActive && index === session.steps.length - 1}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {session.conclusion && (
        <div className="p-4 rounded-lg border border-primary/30 bg-primary/5">
          <div className="flex items-start gap-3">
            <Lightbulb className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium">Conclusion</span>
                <Badge variant="outline" className="text-xs">
                  {Math.round(session.confidence * 100)}% confidence
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{session.conclusion}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepCard({ 
  step, 
  index, 
  isLast,
  isActive 
}: { 
  step: ThinkingStep; 
  index: number;
  isLast: boolean;
  isActive?: boolean;
}) {
  const [expanded, setExpanded] = useState(isLast);
  const Icon = STEP_ICONS[step.type];
  const colorClass = STEP_COLORS[step.type];

  return (
    <div className="relative pl-8">
      <div className={`absolute left-2.5 w-3 h-3 rounded-full border-2 bg-background ${
        isActive ? "border-primary animate-pulse" : "border-muted-foreground"
      }`} />
      
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger asChild>
          <Button 
            variant="ghost" 
            className="w-full justify-between p-3 h-auto"
            data-testid={`button-expand-step-${step.id}`}
          >
            <div className="flex items-center gap-2">
              <Icon className={`h-4 w-4 ${colorClass}`} />
              <span className="text-sm font-medium capitalize">{step.type}</span>
              {step.duration > 0 && (
                <span className="text-xs text-muted-foreground">
                  ({(step.duration / 1000).toFixed(1)}s)
                </span>
              )}
            </div>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-2">
            <p className="text-sm text-muted-foreground">{step.content}</p>
            
            {step.insights.length > 0 && (
              <div className="mt-2">
                <span className="text-xs font-medium text-green-500">Insights:</span>
                <ul className="mt-1 space-y-1">
                  {step.insights.map((insight, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                      <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
                      {insight}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {step.questions.length > 0 && (
              <div className="mt-2">
                <span className="text-xs font-medium text-yellow-500">Open Questions:</span>
                <ul className="mt-1 space-y-1">
                  {step.questions.map((question, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                      <AlertTriangle className="h-3 w-3 text-yellow-500 mt-0.5 shrink-0" />
                      {question}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function SessionSummaryCard({ 
  session, 
  isExpanded, 
  onToggle 
}: { 
  session: ThinkingSession; 
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const modeConfig = MODE_CONFIGS[session.mode];
  const duration = session.endTime 
    ? new Date(session.endTime).getTime() - new Date(session.startTime).getTime()
    : 0;

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <Button 
          variant="ghost" 
          className="w-full justify-between p-3 h-auto"
          data-testid={`button-expand-session-${session.id}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Badge 
              variant="outline" 
              className={`shrink-0 ${modeConfig.color} text-white`}
            >
              {modeConfig.label}
            </Badge>
            <span className="text-sm truncate">{session.prompt.slice(0, 40)}...</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">
              {session.steps.length} steps
            </span>
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="px-3 pb-3 space-y-2">
          <p className="text-sm text-muted-foreground">{session.prompt}</p>
          
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {duration > 0 ? `${(duration / 1000).toFixed(1)}s` : "In progress"}
            </div>
            <div className="flex items-center gap-1">
              <Target className="h-3 w-3" />
              {Math.round(session.confidence * 100)}% confidence
            </div>
          </div>

          {session.conclusion && (
            <div className="mt-2 p-2 rounded bg-muted/50">
              <p className="text-xs">{session.conclusion}</p>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
