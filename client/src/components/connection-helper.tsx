import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Settings, ExternalLink, Monitor, Server, Cpu, CheckCircle2 } from "lucide-react";
import { useState } from "react";

interface ConnectionHelperProps {
  onRetry: () => void;
  onOpenSettings?: () => void;
  isRetrying?: boolean;
  compact?: boolean;
}

export function ConnectionHelper({ onRetry, onOpenSettings, isRetrying, compact }: ConnectionHelperProps) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  
  const steps = [
    {
      icon: Monitor,
      title: "Open LM Studio",
      description: "Launch the LM Studio app on your Mac",
      detail: "You can download LM Studio from lmstudio.ai if you don't have it installed."
    },
    {
      icon: Cpu,
      title: "Load a Model",
      description: "Select and load an LLM model",
      detail: "Recommended for M4 Pro 48GB: qwen2.5-coder-32b-instruct or deepseek-coder-v2-lite-instruct for best code generation."
    },
    {
      icon: Server,
      title: "Start Local Server",
      description: "Go to 'Local Server' tab and click 'Start Server'",
      detail: "Default port is 1234. Make sure no other app is using this port."
    },
    {
      icon: CheckCircle2,
      title: "Retry Connection",
      description: "Click below to connect to LM Studio",
      detail: "LocalForge will automatically detect your loaded model."
    },
  ];

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30" data-testid="connection-helper-compact">
        <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">LM Studio not connected</p>
          <p className="text-xs text-muted-foreground">Start the local server to generate apps</p>
        </div>
        <Button size="sm" onClick={onRetry} disabled={isRetrying} className="gap-1.5" data-testid="button-retry-connection-compact">
          <RefreshCw className={`h-3.5 w-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
          {isRetrying ? "Connecting..." : "Retry"}
        </Button>
      </div>
    );
  }

  return (
    <Card className="mx-auto max-w-lg mt-8 border-yellow-500/30" data-testid="connection-helper">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-yellow-600 dark:text-yellow-500">
          <AlertTriangle className="h-5 w-5" />
          LM Studio Not Connected
        </CardTitle>
        <CardDescription>
          Follow these steps to connect your local LLM
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {steps.map((step, i) => (
            <div 
              key={i}
              className="group rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => setExpandedStep(expandedStep === i ? null : i)}
              data-testid={`setup-step-${i}`}
            >
              <div className="flex items-center gap-3 p-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <step.icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
                <span className="text-xs text-muted-foreground">{i + 1}/4</span>
              </div>
              {expandedStep === i && (
                <div className="px-3 pb-3 pl-14 text-xs text-muted-foreground animate-in fade-in slide-in-from-top-1">
                  {step.detail}
                </div>
              )}
            </div>
          ))}
        </div>
        
        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={onRetry} className="gap-2" disabled={isRetrying} data-testid="button-retry-connection">
            <RefreshCw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
            {isRetrying ? "Connecting..." : "Retry Connection"}
          </Button>
          {onOpenSettings && (
            <Button variant="outline" onClick={onOpenSettings} className="gap-2" data-testid="button-open-settings">
              <Settings className="h-4 w-4" />
              Settings
            </Button>
          )}
        </div>

        <div className="pt-2 border-t flex items-center justify-between">
          <a 
            href="https://lmstudio.ai" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
            data-testid="link-lmstudio-download"
          >
            Download LM Studio
            <ExternalLink className="h-3 w-3" />
          </a>
          <span className="text-xs text-muted-foreground">Free for personal use</span>
        </div>
      </CardContent>
    </Card>
  );
}
