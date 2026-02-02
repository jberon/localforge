import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw, Lightbulb, Settings, Zap } from "lucide-react";

interface ErrorRecoveryProps {
  error: string;
  originalPrompt?: string;
  onRetry: (prompt?: string) => void;
  onCheckConnection: () => void;
  onOpenSettings?: () => void;
  isRetrying?: boolean;
}

const simplifiedPrompts = [
  "Create a simple task list app",
  "Build a basic calculator",
  "Make a note-taking app",
  "Create a counter with plus/minus buttons",
];

export function ErrorRecovery({ 
  error, 
  originalPrompt, 
  onRetry, 
  onCheckConnection,
  onOpenSettings,
  isRetrying 
}: ErrorRecoveryProps) {
  const isConnectionError = error.toLowerCase().includes("connect") || 
                            error.toLowerCase().includes("econnrefused") ||
                            error.toLowerCase().includes("network") ||
                            error.toLowerCase().includes("lm studio");
  
  const isTimeoutError = error.toLowerCase().includes("timeout") ||
                         error.toLowerCase().includes("took too long");
  
  const isModelError = error.toLowerCase().includes("model") ||
                       error.toLowerCase().includes("no models");

  return (
    <Card className="mx-auto max-w-lg border-destructive/50" data-testid="card-error-recovery">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          Generation Failed
        </CardTitle>
        <CardDescription className="text-sm">
          {error}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isConnectionError && (
          <div className="text-sm space-y-2 p-3 rounded-md bg-muted/50">
            <p className="font-medium flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Connection Issue
            </p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-sm">
              <li>Open LM Studio on your Mac</li>
              <li>Go to the "Local Server" tab</li>
              <li>Click "Start Server"</li>
              <li>Make sure a model is loaded</li>
            </ol>
          </div>
        )}
        
        {isTimeoutError && (
          <div className="text-sm space-y-2 p-3 rounded-md bg-muted/50">
            <p className="font-medium flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Request Timed Out
            </p>
            <p className="text-muted-foreground text-sm">
              The request took too long. Try using a smaller, faster model or simplifying your request.
            </p>
          </div>
        )}

        {isModelError && (
          <div className="text-sm space-y-2 p-3 rounded-md bg-muted/50">
            <p className="font-medium flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              Model Issue
            </p>
            <p className="text-muted-foreground text-sm">
              Make sure you have a model loaded in LM Studio. Go to the Models tab and load a model before trying again.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button 
            onClick={() => onRetry(originalPrompt)} 
            className="gap-2"
            disabled={isRetrying}
            data-testid="button-retry-generation"
          >
            <RefreshCw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
            {isRetrying ? "Retrying..." : "Try Again"}
          </Button>
          
          {isConnectionError && (
            <Button 
              variant="outline" 
              onClick={onCheckConnection}
              className="gap-2"
              data-testid="button-check-connection"
            >
              <RefreshCw className="h-4 w-4" />
              Check Connection
            </Button>
          )}
          
          {onOpenSettings && (
            <Button 
              variant="outline" 
              onClick={onOpenSettings}
              className="gap-2"
              data-testid="button-error-settings"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Button>
          )}
        </div>

        {(isTimeoutError || originalPrompt) && (
          <div className="pt-3 border-t space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-yellow-500" />
              Try a simpler prompt:
            </p>
            <div className="flex flex-wrap gap-2">
              {simplifiedPrompts.map((prompt, i) => (
                <Button
                  key={i}
                  variant="secondary"
                  size="sm"
                  onClick={() => onRetry(prompt)}
                  disabled={isRetrying}
                  className="text-xs"
                  data-testid={`button-simple-prompt-${i}`}
                >
                  {prompt}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
