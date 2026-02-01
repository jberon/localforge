import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Settings, ExternalLink } from "lucide-react";

interface ConnectionHelperProps {
  onRetry: () => void;
  onOpenSettings?: () => void;
}

export function ConnectionHelper({ onRetry, onOpenSettings }: ConnectionHelperProps) {
  return (
    <Card className="mx-auto max-w-lg mt-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-yellow-600 dark:text-yellow-500">
          <AlertTriangle className="h-5 w-5" />
          LM Studio Not Connected
        </CardTitle>
        <CardDescription>
          LocalForge needs to connect to your local LLM to generate apps
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm space-y-3">
          <p className="font-medium">Quick troubleshooting:</p>
          <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
            <li>Make sure LM Studio is running on your Mac</li>
            <li>Go to LM Studio's "Local Server" tab</li>
            <li>Click "Start Server" (default port: 1234)</li>
            <li>Load a model if you haven't already</li>
          </ol>
        </div>
        
        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={onRetry} className="gap-2" data-testid="button-retry-connection">
            <RefreshCw className="h-4 w-4" />
            Retry Connection
          </Button>
          {onOpenSettings && (
            <Button variant="outline" onClick={onOpenSettings} className="gap-2" data-testid="button-open-settings">
              <Settings className="h-4 w-4" />
              Settings
            </Button>
          )}
        </div>

        <div className="pt-2 border-t">
          <a 
            href="https://lmstudio.ai" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            Don't have LM Studio?
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
