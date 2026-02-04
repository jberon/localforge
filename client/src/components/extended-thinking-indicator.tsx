import { useState, useEffect } from "react";
import { Brain, Lightbulb, Sparkles, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ThinkingMode = "standard" | "extended" | "deep";

interface ThinkingStep {
  id: string;
  type: "analyze" | "decompose" | "research" | "synthesize" | "validate" | "conclude";
  content: string;
  insights: string[];
  questions: string[];
  timestamp: Date;
}

interface ThinkingSession {
  id: string;
  projectId: string;
  mode: ThinkingMode;
  prompt: string;
  steps: ThinkingStep[];
  startTime: Date;
  endTime?: Date;
  conclusion?: string;
  confidence: number;
  triggerReason?: string;
}

const MODE_ICONS: Record<ThinkingMode, typeof Brain> = {
  standard: Lightbulb,
  extended: Brain,
  deep: Sparkles
};

const MODE_COLORS: Record<ThinkingMode, string> = {
  standard: "text-blue-500",
  extended: "text-purple-500",
  deep: "text-amber-500"
};

const STEP_LABELS: Record<ThinkingStep["type"], string> = {
  analyze: "Analyzing",
  decompose: "Breaking down",
  research: "Researching",
  synthesize: "Synthesizing",
  validate: "Validating",
  conclude: "Concluding"
};

interface ExtendedThinkingIndicatorProps {
  session?: ThinkingSession | null;
  isActive?: boolean;
  compact?: boolean;
}

export function ExtendedThinkingIndicator({ 
  session, 
  isActive = false,
  compact = false 
}: ExtendedThinkingIndicatorProps) {
  const [dots, setDots] = useState("");

  useEffect(() => {
    if (isActive) {
      const interval = setInterval(() => {
        setDots(prev => prev.length >= 3 ? "" : prev + ".");
      }, 500);
      return () => clearInterval(interval);
    }
  }, [isActive]);

  if (!session && !isActive) return null;

  const mode = session?.mode || "standard";
  const Icon = MODE_ICONS[mode];
  const currentStep = session?.steps[session.steps.length - 1];
  const maxSteps = mode === "deep" ? 15 : mode === "extended" ? 7 : 3;
  const progress = session ? Math.min((session.steps.length / maxSteps) * 100, 100) : 0;

  if (compact) {
    return (
      <div 
        className={cn(
          "flex items-center gap-2 px-2 py-1 rounded-md bg-muted/50",
          isActive && "animate-pulse"
        )}
        data-testid="thinking-indicator-compact"
      >
        <Icon className={cn("h-4 w-4", MODE_COLORS[mode])} />
        <span className="text-xs">
          {isActive ? `Thinking${dots}` : "Ready"}
        </span>
        {mode !== "standard" && (
          <Badge variant="secondary" className="text-[10px] capitalize">
            {mode}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <Card 
      className={cn(
        "transition-all",
        isActive && "ring-2 ring-primary/50"
      )}
      data-testid="thinking-indicator-full"
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Icon className={cn("h-4 w-4", MODE_COLORS[mode], isActive && "animate-pulse")} />
            Extended Thinking
          </span>
          <Badge variant="secondary" className="capitalize">
            {mode}
          </Badge>
        </CardTitle>
        {session?.triggerReason && (
          <CardDescription className="text-xs flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {session.triggerReason}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {isActive && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {currentStep ? STEP_LABELS[currentStep.type] : "Starting"}
                {dots}
              </span>
              <span className="text-muted-foreground">
                Step {session?.steps.length || 0}
              </span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>
        )}

        {session && session.steps.length > 0 && (
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {session.steps.slice(-3).map((step) => (
              <div 
                key={step.id}
                className="text-xs p-2 rounded bg-muted/50 space-y-1"
              >
                <div className="font-medium capitalize text-muted-foreground">
                  {step.type}
                </div>
                <div className="text-foreground line-clamp-2">
                  {step.content}
                </div>
                {step.insights.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {step.insights.slice(0, 2).map((insight, i) => (
                      <Badge key={i} variant="outline" className="text-[10px]">
                        {insight}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {session?.conclusion && (
          <div className="p-2 rounded bg-primary/10 text-xs">
            <div className="font-medium mb-1">Conclusion</div>
            <div className="text-muted-foreground">{session.conclusion}</div>
            <div className="mt-1 flex items-center gap-1">
              <span className="text-muted-foreground">Confidence:</span>
              <span className="font-medium">{Math.round(session.confidence * 100)}%</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
