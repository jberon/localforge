import { Component, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, RefreshCw, Wifi, Clock, FileWarning, HelpCircle } from "lucide-react";

type ErrorType = "network" | "llm_timeout" | "parse_error" | "render_error" | "unknown";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorType: ErrorType) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorType: ErrorType;
  retryCount: number;
  isRetrying: boolean;
}

function classifyError(error: Error): ErrorType {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  if (message.includes("network") || message.includes("fetch") || message.includes("connection") || name === "typeerror" && message.includes("failed to fetch")) {
    return "network";
  }
  if (message.includes("timeout") || message.includes("timed out") || message.includes("aborted")) {
    return "llm_timeout";
  }
  if (message.includes("json") || message.includes("parse") || message.includes("unexpected token")) {
    return "parse_error";
  }
  if (message.includes("render") || message.includes("component") || message.includes("react")) {
    return "render_error";
  }
  return "unknown";
}

function getErrorConfig(errorType: ErrorType): { icon: typeof AlertTriangle; title: string; description: string; retryable: boolean } {
  switch (errorType) {
    case "network":
      return {
        icon: Wifi,
        title: "Connection Issue",
        description: "Unable to connect to the server. Check your network connection and try again.",
        retryable: true,
      };
    case "llm_timeout":
      return {
        icon: Clock,
        title: "Request Timed Out",
        description: "The AI model is taking too long to respond. This might happen with complex requests.",
        retryable: true,
      };
    case "parse_error":
      return {
        icon: FileWarning,
        title: "Invalid Response",
        description: "Received an unexpected response format. The AI might be overloaded.",
        retryable: true,
      };
    case "render_error":
      return {
        icon: AlertTriangle,
        title: "Display Error",
        description: "Something went wrong while displaying this content. The generated code might have issues.",
        retryable: true,
      };
    default:
      return {
        icon: HelpCircle,
        title: "Unexpected Error",
        description: "An unexpected error occurred. Try refreshing the page.",
        retryable: true,
      };
  }
}

export class EnhancedErrorBoundary extends Component<Props, State> {
  private maxRetries = 3;
  private retryDelays = [1000, 2000, 4000];

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorType: "unknown",
      retryCount: 0,
      isRetrying: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
      errorType: classifyError(error),
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const errorType = classifyError(error);
    console.error(`[ErrorBoundary] ${errorType}:`, error, errorInfo);
    this.props.onError?.(error, errorType);
  }

  handleRetry = async () => {
    const { errorType, retryCount } = this.state;

    if (retryCount >= this.maxRetries) {
      return;
    }

    this.setState({ isRetrying: true });

    const delay = this.retryDelays[retryCount] || 4000;
    await new Promise((resolve) => setTimeout(resolve, delay));

    this.setState({
      hasError: false,
      error: null,
      errorType: "unknown",
      retryCount: retryCount + 1,
      isRetrying: false,
    });
  };

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorType: "unknown",
      retryCount: 0,
      isRetrying: false,
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { hasError, error, errorType, retryCount, isRetrying } = this.state;

    if (hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const config = getErrorConfig(errorType);
      const Icon = config.icon;
      const canRetry = config.retryable && retryCount < this.maxRetries;

      return (
        <div className="flex items-center justify-center h-full p-4">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <Icon className="h-5 w-5" />
                {config.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {config.description}
              </p>
              {error && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Technical details
                  </summary>
                  <pre className="mt-2 bg-muted p-3 rounded-md overflow-x-auto max-h-32">
                    {error.message}
                    {error.stack && `\n\n${error.stack}`}
                  </pre>
                </details>
              )}
              {retryCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  Retry attempt {retryCount} of {this.maxRetries}
                </p>
              )}
            </CardContent>
            <CardFooter className="gap-2 flex-wrap">
              {canRetry && (
                <Button
                  onClick={this.handleRetry}
                  disabled={isRetrying}
                  className="gap-2"
                  data-testid="button-retry"
                >
                  <RefreshCw className={`h-4 w-4 ${isRetrying ? "animate-spin" : ""}`} />
                  {isRetrying ? "Retrying..." : "Retry"}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={this.handleReset}
                data-testid="button-dismiss"
              >
                Dismiss
              </Button>
              <Button
                variant="ghost"
                onClick={this.handleReload}
                data-testid="button-reload"
              >
                Reload Page
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

interface NetworkErrorBoundaryProps {
  children: ReactNode;
  onRetry?: () => void;
}

export function NetworkErrorBoundary({ children, onRetry }: NetworkErrorBoundaryProps) {
  return (
    <EnhancedErrorBoundary
      onError={(error, type) => {
        if (type === "network" && onRetry) {
          setTimeout(onRetry, 2000);
        }
      }}
    >
      {children}
    </EnhancedErrorBoundary>
  );
}
