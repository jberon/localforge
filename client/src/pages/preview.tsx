import { useState, useMemo } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle, ExternalLink, Copy, Check, FileCode, Download, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Project, GeneratedFile } from "@shared/schema";

export default function Preview() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [copied, setCopied] = useState(false);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);

  const { data: project, isLoading, error } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  // Determine if this is a single-file or multi-file project
  const files = (project?.generatedFiles as GeneratedFile[] | undefined) ?? [];
  const isMultiFile = files.length > 0;
  const hasSingleFile = !!project?.generatedCode;
  const hasCode = isMultiFile || hasSingleFile;

  // For single-file projects, create an iframe preview
  const previewDataUrl = useMemo(() => {
    if (!project?.generatedCode) return "";

    const code = project.generatedCode;
    
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
    
    const htmlDoc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${project?.name || "LocalForge Preview"}</title>
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
    
    return `data:text/html;charset=utf-8,${encodeURIComponent(htmlDoc)}`;
  }, [project?.generatedCode, project?.name]);

  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenFullscreen = () => {
    if (previewDataUrl) {
      window.open(previewDataUrl, "_blank");
    }
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/package`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project?.name || 'project'}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download error:', error);
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

  if (!hasCode) {
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

  // Multi-file project view
  if (isMultiFile) {
    const selectedFile = files[selectedFileIndex] || files[0];
    const sourceFiles = files.filter(f => !f.path.includes('.test.') && !f.path.includes('README'));
    const testFiles = files.filter(f => f.path.includes('.test.'));
    const docFiles = files.filter(f => f.path.includes('README'));

    return (
      <div className="flex flex-col h-screen bg-background" data-testid="preview-page-multifile">
        <header className="flex items-center justify-between px-4 py-2 border-b bg-background shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="font-semibold text-lg" data-testid="text-project-name">{project.name}</h1>
            <span className="text-xs text-muted-foreground bg-primary/10 px-2 py-0.5 rounded">
              Full-Stack Project
            </span>
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
              size="sm" 
              onClick={handleDownload}
              data-testid="button-download"
            >
              <Download className="h-4 w-4 mr-2" />
              Download ZIP
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

        <div className="flex flex-1 overflow-hidden">
          {/* File List Sidebar */}
          <aside className="w-64 border-r bg-card overflow-hidden flex flex-col">
            <div className="p-3 border-b">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>{files.length} Files Generated</span>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2">
                {sourceFiles.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-medium text-muted-foreground px-2 mb-1">Source Files</p>
                    {sourceFiles.map((file, idx) => {
                      const globalIdx = files.indexOf(file);
                      return (
                        <button
                          key={file.path}
                          onClick={() => setSelectedFileIndex(globalIdx)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md text-left hover-elevate ${
                            globalIdx === selectedFileIndex ? 'bg-primary/10 text-primary' : ''
                          }`}
                          data-testid={`button-file-${idx}`}
                        >
                          <FileCode className="h-4 w-4 shrink-0" />
                          <span className="truncate">{file.path.split('/').pop()}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {testFiles.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-medium text-muted-foreground px-2 mb-1">Tests</p>
                    {testFiles.map((file, idx) => {
                      const globalIdx = files.indexOf(file);
                      return (
                        <button
                          key={file.path}
                          onClick={() => setSelectedFileIndex(globalIdx)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md text-left hover-elevate ${
                            globalIdx === selectedFileIndex ? 'bg-primary/10 text-primary' : ''
                          }`}
                          data-testid={`button-test-file-${idx}`}
                        >
                          <FileCode className="h-4 w-4 shrink-0 text-yellow-500" />
                          <span className="truncate">{file.path.split('/').pop()}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {docFiles.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground px-2 mb-1">Documentation</p>
                    {docFiles.map((file, idx) => {
                      const globalIdx = files.indexOf(file);
                      return (
                        <button
                          key={file.path}
                          onClick={() => setSelectedFileIndex(globalIdx)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md text-left hover-elevate ${
                            globalIdx === selectedFileIndex ? 'bg-primary/10 text-primary' : ''
                          }`}
                          data-testid={`button-doc-file-${idx}`}
                        >
                          <FileCode className="h-4 w-4 shrink-0 text-blue-500" />
                          <span className="truncate">{file.path.split('/').pop()}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </ScrollArea>
          </aside>

          {/* Code View */}
          <main className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
              <span className="text-sm text-muted-foreground">{selectedFile?.path}</span>
            </div>
            <ScrollArea className="flex-1">
              <pre className="p-4 text-sm font-mono overflow-x-auto">
                <code>{selectedFile?.content || ''}</code>
              </pre>
            </ScrollArea>
          </main>
        </div>
      </div>
    );
  }

  // Single-file project view with iframe preview
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
