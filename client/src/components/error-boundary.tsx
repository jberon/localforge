import { Component, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex items-center justify-center h-full p-4">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Something went wrong
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                An error occurred while rendering this component. This might be due to invalid generated code or a temporary issue.
              </p>
              {this.state.error && (
                <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto max-h-32">
                  {this.state.error.message}
                </pre>
              )}
            </CardContent>
            <CardFooter className="gap-2">
              <Button onClick={this.handleReset} className="gap-2" data-testid="button-try-again">
                <RefreshCw className="h-4 w-4" />
                Try Again
              </Button>
              <Button variant="outline" onClick={() => window.location.reload()} data-testid="button-reload-page">
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

interface PreviewErrorBoundaryProps {
  children: ReactNode;
}

export function PreviewErrorBoundary({ children }: PreviewErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallback={
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <AlertTriangle className="h-12 w-12 text-yellow-500 mb-4" />
          <h3 className="font-medium text-lg mb-2">Preview Unavailable</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            The generated code couldn't be previewed. This might be due to a syntax error or incompatible code structure.
          </p>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
