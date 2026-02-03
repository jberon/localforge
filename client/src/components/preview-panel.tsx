import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Eye, Code, Download, Copy, Check, RefreshCw, Maximize2, Minimize2, FolderTree, FileCode, Database, ChevronRight, Rocket, RotateCcw, AlertTriangle, Save, Play, Terminal, Search, Package, Wrench, ChevronDown, ExternalLink, Loader2, Zap } from "lucide-react";
import Editor from "@monaco-editor/react";
import { useToast } from "@/hooks/use-toast";
import { PublishingPanel } from "./publishing-panel";
import { PreviewErrorBoundary } from "./error-boundary";
import type { ConsoleLog } from "./console-panel";
import { CodeAssistant } from "./code-assistant";
import { TestPreview } from "./test-preview";
import { FileExplorer } from "./file-explorer";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { GeneratedFile, DataModel, ValidationResult, LLMSettings } from "@shared/schema";
import type { editor } from "monaco-editor";
import { useBundler } from "@/hooks/use-bundler";

interface PreviewPanelProps {
  code: string;
  isGenerating: boolean;
  onDownload: () => void;
  generatedFiles?: GeneratedFile[];
  projectName?: string;
  lastPrompt?: string;
  dataModel?: DataModel;
  validation?: ValidationResult;
  onRegenerate?: (prompt: string, dataModel?: DataModel) => void;
  projectId?: string;
  settings?: LLMSettings;
  onCodeUpdate?: (code: string) => void;
  onFilesUpdate?: () => void;
}

export function PreviewPanel({ 
  code, 
  isGenerating, 
  onDownload, 
  generatedFiles = [], 
  projectName = "My Project",
  lastPrompt,
  dataModel,
  validation,
  onRegenerate,
  projectId,
  settings,
  onCodeUpdate,
  onFilesUpdate,
}: PreviewPanelProps) {
  const [activeTab, setActiveTab] = useState<"preview" | "files" | "publish" | "console" | "search">("preview");
  const [copied, setCopied] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const safeGeneratedFiles = generatedFiles ?? [];
  const [selectedFile, setSelectedFile] = useState<GeneratedFile | null>(safeGeneratedFiles[0] || null);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState("");
  const [localCode, setLocalCode] = useState(code);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLog[]>([]);
  const [selectedCode, setSelectedCode] = useState("");
  const [selectionRange, setSelectionRange] = useState<{
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  } | null>(null);
  const [showAssistant, setShowAssistant] = useState(false);
  const [showFeedback, setShowFeedback] = useState(true);
  const [showTestPreview, setShowTestPreview] = useState(false);
  const [editingFileContent, setEditingFileContent] = useState<string | null>(null);
  const [codeSearchQuery, setCodeSearchQuery] = useState("");
  const [codeSearchResults, setCodeSearchResults] = useState<Array<{ file: string; line: number; content: string; match: string }>>([]);
  const [isFileSaving, setIsFileSaving] = useState(false);
  const [hasFileChanges, setHasFileChanges] = useState(false);
  const [devToolsExpanded, setDevToolsExpanded] = useState(false);
  const [bundlerEnabled, setBundlerEnabled] = useState(true);

  // Handle Escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const fileEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const nonceRef = useRef<string>(crypto.randomUUID());
  const { toast } = useToast();

  // File operation handlers
  const handleCreateFile = useCallback(async (path: string, content: string) => {
    if (!projectId) return;
    try {
      await apiRequest("POST", `/api/projects/${projectId}/files`, { path, content });
      await queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      onFilesUpdate?.();
      toast({ title: "File Created", description: `Created ${path}` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to create file", variant: "destructive" });
    }
  }, [projectId, onFilesUpdate, toast]);

  const handleDeleteFile = useCallback(async (path: string) => {
    if (!projectId) return;
    try {
      await apiRequest("DELETE", `/api/projects/${projectId}/files`, { path });
      await queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      onFilesUpdate?.();
      if (selectedFile?.path === path) {
        setSelectedFile(null);
        setEditingFileContent(null);
      }
      toast({ title: "File Deleted", description: `Deleted ${path}` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to delete file", variant: "destructive" });
    }
  }, [projectId, selectedFile, onFilesUpdate, toast]);

  const handleSaveFile = useCallback(async () => {
    if (!projectId || !selectedFile || editingFileContent === null) return;
    setIsFileSaving(true);
    try {
      await apiRequest("PATCH", `/api/projects/${projectId}/files`, { 
        path: selectedFile.path, 
        content: editingFileContent 
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      onFilesUpdate?.();
      // Update selectedFile with saved content to keep state in sync
      setSelectedFile({ ...selectedFile, content: editingFileContent });
      setHasFileChanges(false);
      toast({ title: "File Saved", description: `Saved ${selectedFile.path}` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save file", variant: "destructive" });
    } finally {
      setIsFileSaving(false);
    }
  }, [projectId, selectedFile, editingFileContent, onFilesUpdate, toast]);

  const handleSelectFile = useCallback((file: GeneratedFile) => {
    setSelectedFile(file);
    setEditingFileContent(file.content);
    setHasFileChanges(false);
  }, []);

  const handleFileContentChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      setEditingFileContent(value);
      setHasFileChanges(value !== selectedFile?.content);
    }
  }, [selectedFile]);

  // Sync selectedFile with generatedFiles when they change externally
  useEffect(() => {
    if (selectedFile && generatedFiles.length > 0) {
      const updatedFile = generatedFiles.find(f => f.path === selectedFile.path);
      if (updatedFile && updatedFile.content !== selectedFile.content && !hasFileChanges) {
        setSelectedFile(updatedFile);
        setEditingFileContent(updatedFile.content);
      }
    }
  }, [generatedFiles, selectedFile, hasFileChanges]);

  // Handle editor mount and selection changes
  const handleEditorMount = useCallback((editorInstance: editor.IStandaloneCodeEditor) => {
    editorRef.current = editorInstance;
    
    editorInstance.onDidChangeCursorSelection((e) => {
      const selection = editorInstance.getSelection();
      if (selection && !selection.isEmpty()) {
        const selected = editorInstance.getModel()?.getValueInRange(selection) || "";
        if (selected.trim().length > 10) {
          setSelectedCode(selected);
          setSelectionRange({
            startLineNumber: selection.startLineNumber,
            startColumn: selection.startColumn,
            endLineNumber: selection.endLineNumber,
            endColumn: selection.endColumn,
          });
          setShowAssistant(true);
        }
      }
    });
  }, []);

  // Listen for console messages from iframe
  useEffect(() => {
    const currentNonce = nonceRef.current;
    const handleMessage = (event: MessageEvent) => {
      // Validate origin - only accept messages from same origin or data URLs
      const validOrigin = event.origin === window.location.origin || 
                          event.origin === "null" || 
                          event.origin === "";
      
      if (!validOrigin) return;
      
      // Validate nonce to ensure message is from our iframe
      if (event.data?.nonce !== currentNonce) return;
      
      if (event.data && event.data.type === "console" && typeof event.data.message === "string") {
        const log: ConsoleLog = {
          id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
          type: event.data.level || "log",
          message: event.data.message,
          timestamp: Date.now(),
        };
        setConsoleLogs((prev) => [...prev.slice(-99), log]);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Clear console on code change or refresh
  const clearConsole = useCallback(() => {
    setConsoleLogs([]);
  }, []);

  // Cleanup debounced save on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);
  
  const hasFullStackProject = safeGeneratedFiles.length > 0;
  
  const bundlerFiles = useMemo(() => {
    return safeGeneratedFiles.map(f => ({ path: f.path, content: f.content }));
  }, [safeGeneratedFiles]);
  
  const { 
    previewHtml: bundledPreviewHtml, 
    isCompiling, 
    errors: bundleErrors, 
    warnings: bundleWarnings,
    lastBundleTime,
    rebundle 
  } = useBundler({
    files: bundlerFiles,
    enabled: bundlerEnabled && hasFullStackProject && !isGenerating,
    nonce: nonceRef.current,
  });
  
  const hasRunnableMultiFileProject = hasFullStackProject && bundledPreviewHtml && !isCompiling && bundleErrors.length === 0;
  const canRegenerate = hasFullStackProject && onRegenerate && !isGenerating;
  
  // Reset feedback panel when new generation starts or lastPrompt changes
  useEffect(() => {
    setShowFeedback(true);
  }, [lastPrompt, projectId]);
  
  // Sync local code with props when new code comes in (from generation)
  useEffect(() => {
    // Only sync when code prop changes and there are no local edits
    if (!hasUnsavedChanges) {
      setLocalCode(code);
    }
  }, [code, hasUnsavedChanges]);

  // Save code to server with debounce
  const saveCode = useCallback(async (newCode: string) => {
    if (!projectId || isGenerating) return;
    
    setIsSaving(true);
    try {
      await apiRequest("PATCH", `/api/projects/${projectId}/code`, {
        generatedCode: newCode,
      });
      setHasUnsavedChanges(false);
      if (onCodeUpdate) onCodeUpdate(newCode);
    } catch (error) {
      toast({
        title: "Save Failed",
        description: "Could not save your changes.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }, [projectId, isGenerating, onCodeUpdate, toast]);

  // Debounced auto-save on code change
  const handleCodeChange = useCallback((value: string | undefined) => {
    const newCode = value || "";
    setLocalCode(newCode);
    setHasUnsavedChanges(true);
    
    // Update preview immediately
    setIframeKey((k) => k + 1);
    
    // Debounce save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveCode(newCode);
    }, 1500); // Auto-save after 1.5s of no typing
  }, [saveCode]);

  // Manual save
  const handleManualSave = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveCode(localCode);
  };
  
  // Auto-select first file when generatedFiles change
  if (hasFullStackProject && !selectedFile && safeGeneratedFiles.length > 0) {
    setSelectedFile(safeGeneratedFiles[0]);
  }

  const handleCopy = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast({
      title: "Copied to clipboard",
      description: "The code has been copied to your clipboard.",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRefresh = useCallback(() => {
    setIframeKey((k) => k + 1);
    if (hasFullStackProject && bundlerEnabled) {
      rebundle();
    }
  }, [hasFullStackProject, bundlerEnabled, rebundle]);

  // Keyboard shortcut: Cmd/Ctrl+R to refresh preview
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'r' && activeTab === 'preview' && (code || hasFullStackProject)) {
        e.preventDefault();
        handleRefresh();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, code, hasFullStackProject, handleRefresh]);

  const handleOpenRegenerate = () => {
    setEditedPrompt(lastPrompt || projectName);
    setShowRegenerateDialog(true);
  };

  const handleRegenerate = () => {
    if (onRegenerate && editedPrompt.trim()) {
      onRegenerate(editedPrompt.trim(), dataModel);
      setShowRegenerateDialog(false);
    }
  };

  // Memoize preview HTML to avoid expensive re-computation on every render
  const previewDataUrl = useMemo(() => {
    if (!localCode) return "";
    
    const nonce = nonceRef.current;
    const consoleInterceptor = `
    (function() {
      const NONCE = '${nonce}';
      const originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info
      };
      
      function sendToParent(level, args) {
        try {
          const message = args.map(arg => {
            if (typeof arg === 'object') {
              try { return JSON.stringify(arg, null, 2); }
              catch { return String(arg); }
            }
            return String(arg);
          }).join(' ');
          window.parent.postMessage({ type: 'console', level, message, nonce: NONCE }, '*');
        } catch(e) {}
      }
      
      console.log = function(...args) { sendToParent('log', args); originalConsole.log.apply(console, args); };
      console.warn = function(...args) { sendToParent('warn', args); originalConsole.warn.apply(console, args); };
      console.error = function(...args) { sendToParent('error', args); originalConsole.error.apply(console, args); };
      console.info = function(...args) { sendToParent('info', args); originalConsole.info.apply(console, args); };
      
      window.onerror = function(message, source, lineno, colno, error) {
        sendToParent('error', [message + ' at line ' + lineno]);
        return false;
      };
    })();
    `;
    
    // Wrap the user code to catch errors and display them clearly
    const wrappedCode = `
try {
${localCode}
} catch (err) {
  console.error('App Error:', err.message || err);
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = '<div style="padding: 20px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #991b1b;"><h3 style="margin: 0 0 8px 0;">Error in Generated Code</h3><pre style="margin: 0; white-space: pre-wrap; font-size: 14px;">' + (err.message || err) + '</pre></div>';
  }
}
`;
    
    const htmlDoc = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script>${consoleInterceptor}</script>
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
    return `data:text/html;charset=utf-8,${encodeURIComponent(htmlDoc)}`;
  }, [localCode]);

  const isEmpty = !localCode && !isGenerating && !hasFullStackProject;

  return (
    <div className={`flex flex-col h-full bg-card border-l ${isFullscreen ? "fixed inset-0 z-50 bg-background" : ""}`}>
      {isFullscreen && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setIsFullscreen(false)}
          className="absolute top-4 right-4 z-50 gap-2 shadow-lg"
          data-testid="button-exit-fullscreen"
        >
          <Minimize2 className="h-4 w-4" />
          Exit Fullscreen
        </Button>
      )}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
        <div className="flex items-center gap-3">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "preview" | "files" | "publish" | "console" | "search")}>
            <TabsList className="h-8">
              <TabsTrigger value="preview" className="text-xs gap-1.5" data-testid="tab-preview">
                <Eye className="h-3.5 w-3.5" />
                Preview
              </TabsTrigger>
              {hasFullStackProject && (
                <>
                  <TabsTrigger value="files" className="text-xs gap-1.5" data-testid="tab-files">
                    <FolderTree className="h-3.5 w-3.5" />
                    Files
                    <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{generatedFiles.length}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="publish" className="text-xs gap-1.5" data-testid="tab-publish">
                    <Package className="h-3.5 w-3.5" />
                    Publish
                  </TabsTrigger>
                  <div className="relative flex items-center">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDevToolsExpanded(!devToolsExpanded);
                      }}
                      className="text-xs gap-1 text-muted-foreground"
                      data-testid="button-dev-tools-toggle"
                    >
                      <Wrench className="h-3.5 w-3.5" />
                      Dev
                      <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${devToolsExpanded ? 'rotate-180' : ''}`} />
                    </Button>
                    {devToolsExpanded && (
                      <div className="flex items-center ml-1 animate-in fade-in slide-in-from-left-2 duration-200">
                        <TabsTrigger value="search" className="text-xs gap-1.5" data-testid="tab-search">
                          <Search className="h-3.5 w-3.5" />
                          Search
                        </TabsTrigger>
                        <TabsTrigger value="console" className="text-xs gap-1.5" data-testid="tab-console">
                          <Terminal className="h-3.5 w-3.5" />
                          Console
                          {consoleLogs.length > 0 && (
                            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{consoleLogs.length}</Badge>
                          )}
                        </TabsTrigger>
                      </div>
                    )}
                  </div>
                </>
              )}
            </TabsList>
          </Tabs>
          {isGenerating && (
            <div className="flex items-center gap-2 px-2 py-1 bg-primary/10 rounded-full animate-in fade-in duration-300">
              <div className="flex gap-0.5">
                <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-xs font-medium text-primary">Building your app...</span>
            </div>
          )}
          {!isGenerating && hasFullStackProject && (
            <div className="flex items-center gap-2">
              {isCompiling ? (
                <Badge variant="secondary" className="gap-1.5 text-xs animate-pulse" data-testid="badge-compiling">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Compiling...
                </Badge>
              ) : bundleErrors.length > 0 ? (
                <Badge variant="destructive" className="gap-1.5 text-xs" data-testid="badge-build-error">
                  <AlertTriangle className="h-3 w-3" />
                  Build failed
                </Badge>
              ) : bundledPreviewHtml ? (
                <Badge variant="secondary" className="gap-1.5 text-xs bg-green-500/10 text-green-700 dark:text-green-400" data-testid="badge-build-success">
                  <Check className="h-3 w-3" />
                  {safeGeneratedFiles.length} files
                </Badge>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {activeTab === "preview" && (code || hasFullStackProject) && (
            <>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleRefresh}
                className="h-8 w-8"
                data-testid="button-refresh-preview"
                title="Refresh preview (⌘R / Ctrl+R)"
              >
                <RefreshCw className={`h-4 w-4 ${isCompiling ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setShowTestPreview(true)}
                className="h-8 w-8"
                title="Visual Test Runner"
                data-testid="button-test-preview"
              >
                <Play className="h-4 w-4" />
              </Button>
            </>
          )}
          {(code || hasFullStackProject) && (
            <>
              {code && (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleCopy}
                    data-testid="button-copy-code"
                  >
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setIsFullscreen(!isFullscreen)}
                    data-testid="button-fullscreen"
                  >
                    {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </Button>
                </>
              )}
              {canRegenerate && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleOpenRegenerate}
                  className="gap-1.5"
                  data-testid="button-regenerate"
                >
                  <RotateCcw className="h-4 w-4" />
                  Regenerate
                </Button>
              )}
              <Button
                size="sm"
                variant="default"
                onClick={onDownload}
                className="gap-1.5"
                data-testid="button-download"
              >
                <Download className="h-4 w-4" />
                Download
              </Button>
              {projectId && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(`/preview/${projectId}`, "_blank")}
                  className="gap-1.5"
                  data-testid="button-open-browser"
                >
                  <ExternalLink className="h-4 w-4" />
                  View in Browser
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Eye className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-medium mb-2">No Preview Yet</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Describe what you want to build in the chat, and your app will appear here.
            </p>
          </div>
        ) : (
          <>
            {activeTab === "preview" ? (
              <div className="h-full flex flex-col bg-white dark:bg-background transition-opacity duration-300">
                {code && !isGenerating ? (
                  <>
                    <div className="flex-1 overflow-hidden animate-in fade-in duration-500 relative">
                      <iframe
                        key={iframeKey}
                        src={previewDataUrl}
                        className="w-full h-full border-0"
                        sandbox="allow-scripts"
                        title="App Preview"
                        data-testid="iframe-preview"
                      />
                      <Button
                        size="icon"
                        variant="secondary"
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className="absolute bottom-4 right-4 shadow-lg z-10"
                        data-testid="button-popout-preview"
                        title={isFullscreen ? "Exit fullscreen" : "Open fullscreen preview"}
                      >
                        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
                      </Button>
                    </div>
                    </>
                ) : isGenerating ? (
                  <div className="flex flex-col items-center justify-center h-full gap-6 p-8 animate-in fade-in duration-500">
                    <div className="relative">
                      <div className="w-16 h-16 border-2 border-primary/20 rounded-full" />
                      <div className="absolute inset-0 w-16 h-16 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <div className="absolute inset-2 w-12 h-12 border-2 border-primary/30 border-b-transparent rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
                    </div>
                    <div className="text-center space-y-2">
                      <p className="font-semibold text-lg">Creating your app</p>
                      <p className="text-sm text-muted-foreground max-w-xs">
                        {code ? "Code is streaming in. Preview will appear when complete." : "Connecting to your local AI..."}
                      </p>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <div className="w-2 h-2 bg-primary/60 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-primary/60 rounded-full animate-pulse" style={{ animationDelay: '200ms' }} />
                      <div className="w-2 h-2 bg-primary/60 rounded-full animate-pulse" style={{ animationDelay: '400ms' }} />
                    </div>
                  </div>
                ) : hasFullStackProject ? (
                  isCompiling ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
                      <div className="relative">
                        <div className="w-16 h-16 border-2 border-primary/20 rounded-full" />
                        <div className="absolute inset-0 w-16 h-16 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <Zap className="absolute inset-0 m-auto h-6 w-6 text-primary" />
                      </div>
                      <div className="text-center space-y-2">
                        <p className="font-semibold text-lg">Compiling Project</p>
                        <p className="text-sm text-muted-foreground max-w-xs">
                          Bundling {safeGeneratedFiles.length} files with esbuild...
                        </p>
                      </div>
                    </div>
                  ) : bundleErrors.length > 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
                      <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                        <AlertTriangle className="h-8 w-8 text-red-500" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg mb-2">Build Errors</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          {bundleErrors.length} error{bundleErrors.length > 1 ? 's' : ''} found while compiling your project
                        </p>
                        <div className="text-left max-w-lg mx-auto bg-muted/50 rounded-lg p-4">
                          <ScrollArea className="max-h-48">
                            {bundleErrors.map((error, i) => (
                              <p key={i} className="text-sm text-red-600 dark:text-red-400 font-mono mb-2">{error}</p>
                            ))}
                          </ScrollArea>
                        </div>
                        <div className="flex items-center justify-center gap-2 mt-4">
                          <Button onClick={rebundle} variant="outline" className="gap-2" data-testid="button-retry-build">
                            <RefreshCw className="h-4 w-4" />
                            Retry Build
                          </Button>
                          <Button 
                            variant="ghost" 
                            className="gap-2"
                            onClick={() => {
                              navigator.clipboard.writeText(bundleErrors.join('\n'));
                              toast({ title: "Errors copied to clipboard" });
                            }}
                            data-testid="button-copy-errors"
                          >
                            <Copy className="h-4 w-4" />
                            Copy Errors
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : bundledPreviewHtml ? (
                    <div className="flex-1 overflow-hidden animate-in fade-in duration-500 relative h-full">
                      <iframe
                        key={iframeKey}
                        src={bundledPreviewHtml}
                        className="w-full h-full border-0"
                        sandbox="allow-scripts"
                        title="App Preview"
                        data-testid="iframe-bundled-preview"
                      />
                      <div className="absolute bottom-4 left-4 flex items-center gap-2">
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <Zap className="h-3 w-3" />
                          Bundled in {lastBundleTime}ms
                        </Badge>
                        {bundleWarnings.length > 0 && (
                          <Badge variant="secondary" className="gap-1 text-xs bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">
                            <AlertTriangle className="h-3 w-3" />
                            {bundleWarnings.length} warning{bundleWarnings.length > 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                      <Button
                        size="icon"
                        variant="secondary"
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className="absolute bottom-4 right-4 shadow-lg z-10"
                        data-testid="button-popout-bundled-preview"
                        title={isFullscreen ? "Exit fullscreen" : "Open fullscreen preview"}
                      >
                        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
                      <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                        validation && !validation.valid ? "bg-yellow-500/10" : "bg-green-500/10"
                      }`}>
                        {validation && !validation.valid ? (
                          <AlertTriangle className="h-8 w-8 text-yellow-500" />
                        ) : (
                          <Rocket className="h-8 w-8 text-green-500" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg mb-2">
                          {validation && !validation.valid ? "Project Generated (with warnings)" : "Full-Stack Project Ready!"}
                        </h3>
                        <p className="text-sm text-muted-foreground max-w-md">
                          Your complete project has been generated. Use the <strong>Files</strong> tab to browse all generated code,
                          or the <strong>Launch</strong> tab for step-by-step instructions to run your app.
                        </p>
                        {validation && (validation.warnings.length > 0 || validation.errors.length > 0) && (
                          <div className="mt-4 flex flex-wrap gap-2 justify-center">
                            {validation.valid ? (
                              <Badge variant="secondary" className="gap-1">
                                <Check className="h-3 w-3" />
                                Validated
                              </Badge>
                            ) : validation.errors.length > 0 ? (
                              <Badge variant="destructive" className="gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                {validation.errors.length} error{validation.errors.length > 1 ? "s" : ""}
                              </Badge>
                            ) : null}
                            {validation.warnings.length > 0 && (
                              <Badge variant="secondary" className="gap-1 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">
                                <AlertTriangle className="h-3 w-3" />
                                {validation.warnings.length} warning{validation.warnings.length > 1 ? "s" : ""}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                ) : null}
              </div>
            ) : activeTab === "files" ? (
              <div className="flex h-full">
                <FileExplorer
                  files={generatedFiles}
                  selectedFile={selectedFile}
                  onSelectFile={handleSelectFile}
                  onCreateFile={projectId ? handleCreateFile : undefined}
                  onDeleteFile={projectId ? handleDeleteFile : undefined}
                  isGenerating={isGenerating}
                  className="w-64 border-r"
                />
                <div className="flex-1 flex flex-col">
                  {selectedFile ? (
                    <>
                      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/30">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileCode className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm truncate">{selectedFile.path}</span>
                          {hasFileChanges && (
                            <Badge variant="secondary" className="text-[10px] h-5">Modified</Badge>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleSaveFile}
                          disabled={!hasFileChanges || isFileSaving}
                          className="gap-1"
                          data-testid="button-save-file"
                        >
                          <Save className="h-3.5 w-3.5" />
                          {isFileSaving ? "Saving..." : "Save"}
                        </Button>
                      </div>
                      <div className="flex-1">
                        <Editor
                          height="100%"
                          defaultLanguage={getFileLanguage(selectedFile.path)}
                          value={editingFileContent ?? selectedFile.content}
                          onChange={handleFileContentChange}
                          onMount={(editor) => { fileEditorRef.current = editor; }}
                          theme="vs-dark"
                          options={{
                            readOnly: isGenerating,
                            minimap: { enabled: false },
                            fontSize: 13,
                            lineNumbers: "on",
                            scrollBeyondLastLine: false,
                            wordWrap: "on",
                            padding: { top: 16 },
                          }}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center p-8">
                      <FileCode className="h-8 w-8 text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground">Select a file to view and edit</p>
                    </div>
                  )}
                </div>
              </div>
            ) : activeTab === "search" ? (
              <div className="h-full flex flex-col">
                <div className="p-4 border-b">
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search in all files..."
                      value={codeSearchQuery}
                      onChange={(e) => {
                        const query = e.target.value;
                        setCodeSearchQuery(query);
                        if (query.length >= 2) {
                          const results: Array<{ file: string; line: number; content: string; match: string }> = [];
                          generatedFiles.forEach(file => {
                            const lines = file.content.split('\n');
                            lines.forEach((line, index) => {
                              if (line.toLowerCase().includes(query.toLowerCase())) {
                                results.push({
                                  file: file.path,
                                  line: index + 1,
                                  content: line.trim(),
                                  match: query,
                                });
                              }
                            });
                          });
                          setCodeSearchResults(results);
                        } else {
                          setCodeSearchResults([]);
                        }
                      }}
                      className="flex-1"
                      data-testid="input-code-search"
                    />
                    {codeSearchResults.length > 0 && (
                      <Badge variant="secondary">{codeSearchResults.length} results</Badge>
                    )}
                  </div>
                </div>
                <ScrollArea className="flex-1">
                  {codeSearchResults.length > 0 ? (
                    <div className="divide-y">
                      {codeSearchResults.map((result, i) => (
                        <div
                          key={i}
                          className="p-3 hover-elevate cursor-pointer"
                          onClick={() => {
                            const file = generatedFiles.find(f => f.path === result.file);
                            if (file) {
                              setSelectedFile(file);
                              setEditingFileContent(file.content);
                              setActiveTab("files");
                            }
                          }}
                          data-testid={`search-result-${i}`}
                        >
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                            <FileCode className="h-3 w-3" />
                            <span className="font-medium">{result.file}</span>
                            <span>Line {result.line}</span>
                          </div>
                          <pre className="text-sm font-mono truncate">{result.content}</pre>
                        </div>
                      ))}
                    </div>
                  ) : codeSearchQuery.length >= 2 ? (
                    <div className="flex items-center justify-center h-48 text-muted-foreground">
                      No results found for "{codeSearchQuery}"
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                      <Search className="h-8 w-8 mb-2" />
                      <p className="text-sm">Enter at least 2 characters to search</p>
                    </div>
                  )}
                </ScrollArea>
              </div>
            ) : activeTab === "console" ? (
              <div className="h-full flex flex-col">
                <div className="p-4 border-b flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4" />
                    <span className="font-medium">Console Output</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConsoleLogs([])}
                    data-testid="button-clear-console"
                  >
                    Clear
                  </Button>
                </div>
                <ScrollArea className="flex-1 bg-muted/30">
                  {consoleLogs.length > 0 ? (
                    <div className="p-2 font-mono text-xs space-y-1">
                      {consoleLogs.map((log, i) => (
                        <div
                          key={i}
                          className={`px-2 py-1 rounded ${
                            log.type === 'error' ? 'bg-red-500/10 text-red-500' :
                            log.type === 'warn' ? 'bg-yellow-500/10 text-yellow-600' :
                            log.type === 'info' ? 'bg-blue-500/10 text-blue-500' :
                            'text-foreground'
                          }`}
                        >
                          <span className="text-muted-foreground mr-2">[{log.timestamp}]</span>
                          {log.message}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                      <Terminal className="h-8 w-8 mb-2" />
                      <p className="text-sm">No console output yet</p>
                      <p className="text-xs">Run your app to see logs here</p>
                    </div>
                  )}
                </ScrollArea>
              </div>
            ) : activeTab === "publish" ? (
              <PublishingPanel
                projectId={projectId ? parseInt(projectId) : 0}
                projectName={projectName}
                generatedFiles={generatedFiles}
                isFullStack={hasFullStackProject}
              />
            ) : null}
          </>
        )}
      </div>

      <Dialog open={showRegenerateDialog} onOpenChange={setShowRegenerateDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Regenerate Project</DialogTitle>
            <DialogDescription>
              Edit the prompt and regenerate your project with the same data model.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              value={editedPrompt}
              onChange={(e) => setEditedPrompt(e.target.value)}
              placeholder="Describe what you want to build..."
              className="min-h-[120px]"
              data-testid="input-regenerate-prompt"
            />
            {dataModel && (
              <p className="text-xs text-muted-foreground mt-2">
                Will regenerate with {dataModel.entities.length} data {dataModel.entities.length === 1 ? 'entity' : 'entities'}: {dataModel.entities.map(e => e.name).join(', ')}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegenerateDialog(false)} data-testid="button-cancel-regenerate">
              Cancel
            </Button>
            <Button onClick={handleRegenerate} disabled={!editedPrompt.trim()} data-testid="button-confirm-regenerate">
              <RotateCcw className="h-4 w-4 mr-2" />
              Regenerate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TestPreview
        code={code || generatedFiles.map(f => f.content).join('\n')}
        isVisible={showTestPreview}
        onClose={() => setShowTestPreview(false)}
        projectName={projectName}
      />
    </div>
  );
}

function getFileLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'json':
      return 'json';
    case 'md':
      return 'markdown';
    case 'css':
      return 'css';
    case 'html':
      return 'html';
    default:
      return 'plaintext';
  }
}
