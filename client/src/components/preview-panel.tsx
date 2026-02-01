import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, Code, Download, Copy, Check, RefreshCw, Maximize2, Minimize2 } from "lucide-react";
import Editor from "@monaco-editor/react";
import { useToast } from "@/hooks/use-toast";

interface PreviewPanelProps {
  code: string;
  isGenerating: boolean;
  onDownload: () => void;
}

export function PreviewPanel({ code, isGenerating, onDownload }: PreviewPanelProps) {
  const [activeTab, setActiveTab] = useState<"preview" | "code">("preview");
  const [copied, setCopied] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { toast } = useToast();

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

  const createPreviewHTML = () => {
    if (!code) return "";
    
    const htmlDoc = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
    ${code}
  </script>
</body>
</html>`;
    return `data:text/html;charset=utf-8,${encodeURIComponent(htmlDoc)}`;
  };

  const isEmpty = !code && !isGenerating;

  return (
    <div className={`flex flex-col h-full bg-card border-l ${isFullscreen ? "fixed inset-0 z-50" : ""}`}>
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "preview" | "code")}>
          <TabsList className="h-8">
            <TabsTrigger value="preview" className="text-xs gap-1.5" data-testid="tab-preview">
              <Eye className="h-3.5 w-3.5" />
              Preview
            </TabsTrigger>
            <TabsTrigger value="code" className="text-xs gap-1.5" data-testid="tab-code">
              <Code className="h-3.5 w-3.5" />
              Code
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-1">
          {activeTab === "preview" && code && (
            <Button
              size="icon"
              variant="ghost"
              onClick={handleRefresh}
              className="h-8 w-8"
              data-testid="button-refresh-preview"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
          {code && (
            <>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleCopy}
                className="h-8 w-8"
                data-testid="button-copy-code"
              >
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="h-8 w-8"
                data-testid="button-fullscreen"
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
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
              <div className="h-full bg-white">
                {isGenerating ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm text-muted-foreground">Generating your app...</p>
                    </div>
                  </div>
                ) : (
                  <iframe
                    key={iframeKey}
                    src={createPreviewHTML()}
                    className="w-full h-full border-0"
                    sandbox="allow-scripts"
                    title="App Preview"
                    data-testid="iframe-preview"
                  />
                )}
              </div>
            ) : (
              <Editor
                height="100%"
                defaultLanguage="javascript"
                value={code || "// Your generated code will appear here"}
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
            )}
          </>
        )}
      </div>
    </div>
  );
}
