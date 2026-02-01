import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Eye, Code, Download, Copy, Check, RefreshCw, Maximize2, Minimize2, FolderTree, FileCode, Database, ChevronRight, Rocket, RotateCcw, AlertTriangle, Save, Play } from "lucide-react";
import Editor from "@monaco-editor/react";
import { useToast } from "@/hooks/use-toast";
import { LaunchGuide } from "./launch-guide";
import { PreviewErrorBoundary } from "./error-boundary";
import { RefinementPanel } from "./refinement-panel";
import { ConsolePanel, type ConsoleLog } from "./console-panel";
import { CodeAssistant } from "./code-assistant";
import { FeedbackPanel } from "./feedback-panel";
import { TestPreview } from "./test-preview";
import { apiRequest } from "@/lib/queryClient";
import type { GeneratedFile, DataModel, ValidationResult, LLMSettings } from "@shared/schema";
import type { editor } from "monaco-editor";

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
}: PreviewPanelProps) {
  const [activeTab, setActiveTab] = useState<"preview" | "code" | "files" | "launch">("preview");
  const [copied, setCopied] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<GeneratedFile | null>(generatedFiles[0] || null);
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
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const nonceRef = useRef<string>(crypto.randomUUID());
  const { toast } = useToast();

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
  
  const hasFullStackProject = generatedFiles.length > 0;
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
  if (hasFullStackProject && !selectedFile && generatedFiles.length > 0) {
    setSelectedFile(generatedFiles[0]);
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

  const handleRefresh = () => {
    setIframeKey((k) => k + 1);
  };

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

  const createPreviewHTML = () => {
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
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    ${localCode}
  </script>
</body>
</html>`;
    return `data:text/html;charset=utf-8,${encodeURIComponent(htmlDoc)}`;
  };

  const isEmpty = !localCode && !isGenerating && !hasFullStackProject;

  return (
    <div className={`flex flex-col h-full bg-card border-l ${isFullscreen ? "fixed inset-0 z-50" : ""}`}>
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
        <div className="flex items-center gap-3">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "preview" | "code" | "files" | "launch")}>
            <TabsList className="h-8">
              <TabsTrigger value="preview" className="text-xs gap-1.5" data-testid="tab-preview">
                <Eye className="h-3.5 w-3.5" />
                Preview
              </TabsTrigger>
              <TabsTrigger value="code" className="text-xs gap-1.5" data-testid="tab-code">
                <Code className="h-3.5 w-3.5" />
                Code
              </TabsTrigger>
              {hasFullStackProject && (
                <>
                  <TabsTrigger value="files" className="text-xs gap-1.5" data-testid="tab-files">
                    <FolderTree className="h-3.5 w-3.5" />
                    Files
                    <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{generatedFiles.length}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="launch" className="text-xs gap-1.5" data-testid="tab-launch">
                    <Rocket className="h-3.5 w-3.5" />
                    Launch
                  </TabsTrigger>
                </>
              )}
            </TabsList>
          </Tabs>
          {isGenerating && code && (
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              Streaming...
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {activeTab === "preview" && code && (
            <>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleRefresh}
                className="h-8 w-8"
                data-testid="button-refresh-preview"
              >
                <RefreshCw className="h-4 w-4" />
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
              <div className="h-full flex flex-col bg-white dark:bg-background">
                {code && !isGenerating ? (
                  <>
                    <div className="flex-1 overflow-hidden">
                      <iframe
                        key={iframeKey}
                        src={createPreviewHTML()}
                        className="w-full h-full border-0"
                        sandbox="allow-scripts"
                        title="App Preview"
                        data-testid="iframe-preview"
                      />
                    </div>
                    <ConsolePanel logs={consoleLogs} onClear={clearConsole} />
                    {projectId && lastPrompt && showFeedback && (
                      <div className="p-3 border-t bg-background">
                        <FeedbackPanel
                          projectId={projectId}
                          prompt={lastPrompt}
                          generatedCode={code}
                          onClose={() => setShowFeedback(false)}
                        />
                      </div>
                    )}
                    {projectId && settings && !hasFullStackProject && (
                      <div className="p-3 border-t bg-background">
                        <RefinementPanel
                          projectId={projectId}
                          hasCode={!!code}
                          settings={settings}
                          onRefineStart={() => {}}
                          onRefineComplete={(newCode) => {
                            if (onCodeUpdate) onCodeUpdate(newCode);
                            setIframeKey((k) => k + 1);
                          }}
                          onRefineError={(error) => {
                            toast({
                              title: "Refinement Failed",
                              description: error,
                              variant: "destructive",
                            });
                          }}
                        />
                      </div>
                    )}
                  </>
                ) : isGenerating ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
                    <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <div className="text-center">
                      <p className="font-medium">Building your app...</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {code ? "Code is being generated. Switch to Code tab to see progress." : "Waiting for response from LLM..."}
                      </p>
                    </div>
                  </div>
                ) : hasFullStackProject ? (
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
                ) : null}
              </div>
            ) : activeTab === "code" ? (
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Code className="h-4 w-4" />
                    <span>Edit code directly - changes update preview instantly</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasUnsavedChanges && (
                      <Badge variant="secondary" className="text-xs">
                        Unsaved
                      </Badge>
                    )}
                    {isSaving && (
                      <Badge variant="secondary" className="text-xs gap-1">
                        <Save className="h-3 w-3 animate-pulse" />
                        Saving...
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleManualSave}
                      disabled={!hasUnsavedChanges || isSaving || isGenerating}
                      className="gap-1"
                      data-testid="button-save-code"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save
                    </Button>
                  </div>
                </div>
                <div className="flex-1 relative">
                  <Editor
                    height="100%"
                    defaultLanguage="javascript"
                    value={localCode || "// Your generated code will appear here"}
                    onChange={handleCodeChange}
                    onMount={handleEditorMount}
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
                  {showAssistant && selectedCode && settings && (
                    <div className="absolute bottom-4 right-4 w-80 z-10">
                      <CodeAssistant
                        selectedCode={selectedCode}
                        fullCode={localCode}
                        settings={settings}
                        selectionRange={selectionRange || undefined}
                        onApplyFix={(newCode) => {
                          setLocalCode(newCode);
                          setHasUnsavedChanges(true);
                          setIframeKey((k) => k + 1);
                        }}
                        onClose={() => setShowAssistant(false)}
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : activeTab === "files" ? (
              <div className="flex h-full">
                <ScrollArea className="w-64 border-r">
                  <div className="p-2 space-y-1">
                    {generatedFiles.map((file) => (
                      <button
                        key={file.path}
                        onClick={() => setSelectedFile(file)}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 hover-elevate ${
                          selectedFile?.path === file.path ? "bg-accent" : ""
                        }`}
                        data-testid={`file-item-${file.path.replace(/\//g, '-')}`}
                      >
                        <FileCode className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="truncate">{file.path}</span>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
                <div className="flex-1">
                  {selectedFile ? (
                    <Editor
                      height="100%"
                      defaultLanguage={getFileLanguage(selectedFile.path)}
                      value={selectedFile.content}
                      theme="vs-dark"
                      options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        fontSize: 13,
                        lineNumbers: "on",
                        scrollBeyondLastLine: false,
                        wordWrap: "on",
                        padding: { top: 16 },
                      }}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                      Select a file to view its contents
                    </div>
                  )}
                </div>
              </div>
            ) : activeTab === "launch" ? (
              <ScrollArea className="h-full">
                <div className="p-4">
                  <LaunchGuide
                    projectName={projectName}
                    isFullStack={hasFullStackProject}
                    entityCount={generatedFiles.filter(f => f.path.includes('/routes/')).length}
                  />
                </div>
              </ScrollArea>
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
        code={code}
        isVisible={showTestPreview}
        onClose={() => setShowTestPreview(false)}
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
