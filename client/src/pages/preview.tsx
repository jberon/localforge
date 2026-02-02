import { useEffect, useState, useMemo } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle, ExternalLink, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Project } from "@shared/schema";

export default function Preview() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [copied, setCopied] = useState(false);

  const { data: project, isLoading, error } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  const previewDataUrl = useMemo(() => {
    if (!project?.generatedCode) return "";

    const code = project.generatedCode;
    
    // Wrap code with error boundary for resilience
    const wrappedCode = `
try {
  ${code}
} catch (error) {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = '<div class="error-display"><h3>Runtime Error</h3><pre>' + error.message + '</pre></div>';
  }
  console.error('Runtime error:', error);
}`;
    
    // Use same template as main PreviewPanel for rendering parity
    const htmlDoc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${project.name || "LocalForge Preview"}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/recharts@2.10.3/umd/Recharts.min.js"></script>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 16px; background: white; }
    * { box-sizing: border-box; }
    .error-display { padding: 20px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #991b1b; }
    .error-display h3 { margin: 0 0 8px 0; }
    .error-display pre { margin: 0; white-space: pre-wrap; font-size: 14px; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" data-type="module">
    ${wrappedCode}
  </script>
  <script>
    // Catch Babel transformation errors
    window.addEventListener('error', function(e) {
      if (e.message && e.message.includes('Babel')) {
        const root = document.getElementById('root');
        if (root) {
          root.innerHTML = '<div class="error-display"><h3>Syntax Error in Generated Code</h3><pre>' + e.message + '</pre></div>';
        }
      }
    });
  </script>
</body>
</html>`;
    
    // Use data URL for stability (doesn't get revoked like blob URLs)
    return `data:text/html;charset=utf-8,${encodeURIComponent(htmlDoc)}`;
  }, [project?.generatedCode, project?.name]);

  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenFullscreen = () => {
    // Open the data URL directly in a new tab for a clean fullscreen experience
    if (previewDataUrl) {
      window.open(previewDataUrl, "_blank");
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background" data-testid="preview-loading">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading project...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background" data-testid="preview-error">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h1 className="text-xl font-semibold mb-2">Project Not Found</h1>
        <p className="text-muted-foreground mb-4">
          This project doesn't exist or you don't have access to it.
        </p>
        <Button variant="outline" onClick={() => window.location.href = "/"} data-testid="button-back-home">
          Back to Home
        </Button>
      </div>
    );
  }

  if (!project.generatedCode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background" data-testid="preview-empty">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h1 className="text-xl font-semibold mb-2">No Preview Available</h1>
        <p className="text-muted-foreground mb-4">
          This project doesn't have any generated code yet.
        </p>
        <Button variant="outline" onClick={() => window.location.href = "/"} data-testid="button-back-home">
          Back to Home
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen" data-testid="preview-page">
      <header className="flex items-center justify-between px-4 py-2 border-b bg-background shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="font-semibold text-lg" data-testid="text-project-name">{project.name}</h1>
          <span className="text-xs text-muted-foreground">LocalForge Preview</span>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleCopyLink}
            data-testid="button-copy-link"
          >
            {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
            {copied ? "Copied!" : "Copy Link"}
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleOpenFullscreen}
            data-testid="button-open-new-tab"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Open in New Tab
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => window.location.href = "/"}
            data-testid="button-back-to-editor"
          >
            Back to Editor
          </Button>
        </div>
      </header>
      <main className="flex-1 overflow-hidden bg-white">
        <iframe
          src={previewDataUrl}
          className="w-full h-full border-0"
          sandbox="allow-scripts"
          title={`Preview: ${project.name}`}
          data-testid="iframe-standalone-preview"
        />
      </main>
    </div>
  );
}
