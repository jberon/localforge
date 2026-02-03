import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Loader2, Lightbulb, Wrench, ArrowUp, X, MessageSquare } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { LLMSettings } from "@shared/schema";

interface AssistResponse {
  action: string;
  result: string;
  explanation: string;
  suggestedCode: string | null;
}

interface SelectionRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

interface CodeAssistantProps {
  selectedCode: string;
  fullCode: string;
  settings: LLMSettings;
  selectionRange?: SelectionRange;
  onApplyFix: (newCode: string) => void;
  onClose: () => void;
}

type AssistAction = "explain" | "fix" | "improve";

export function CodeAssistant({
  selectedCode,
  fullCode,
  settings,
  selectionRange,
  onApplyFix,
  onClose,
}: CodeAssistantProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [suggestedCode, setSuggestedCode] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<AssistAction | null>(null);
  const { toast } = useToast();

  const handleAction = async (action: AssistAction) => {
    setIsLoading(true);
    setActiveAction(action);
    setResult(null);
    setSuggestedCode(null);

    const prompts: Record<AssistAction, string> = {
      explain: `Explain this code in simple terms. What does it do and how does it work?\n\nCode:\n${selectedCode}`,
      fix: `Fix any bugs or issues in this code. Return the corrected code with a brief explanation of what was wrong.\n\nCode:\n${selectedCode}`,
      improve: `Improve this code for better readability, performance, or best practices. Return the improved code with a brief explanation.\n\nCode:\n${selectedCode}`,
    };

    try {
      const response = await apiRequest("POST", "/api/llm/assist", {
        prompt: prompts[action],
        action,
        code: selectedCode,
        fullCode,
        settings,
      });

      const data: AssistResponse = await response.json();
      setResult(data.explanation || data.result);
      if (data.suggestedCode) {
        setSuggestedCode(data.suggestedCode);
      }
    } catch (error: any) {
      const errorMessage = error?.message || "Failed to get AI assistance";
      setResult(errorMessage);
      toast({
        title: "AI Assistance Failed",
        description: "Make sure LM Studio is connected.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = () => {
    if (!suggestedCode) return;

    let newFullCode: string;

    if (selectionRange) {
      // Use selection range for precise replacement
      const lines = fullCode.split('\n');
      const beforeLines = lines.slice(0, selectionRange.startLineNumber - 1);
      const afterLines = lines.slice(selectionRange.endLineNumber);
      const startLine = lines[selectionRange.startLineNumber - 1] || '';
      const endLine = lines[selectionRange.endLineNumber - 1] || '';
      
      const before = beforeLines.join('\n') + 
        (beforeLines.length > 0 ? '\n' : '') + 
        startLine.slice(0, selectionRange.startColumn - 1);
      const after = endLine.slice(selectionRange.endColumn - 1) + 
        (afterLines.length > 0 ? '\n' : '') + 
        afterLines.join('\n');
      
      newFullCode = before + suggestedCode + after;
    } else {
      // Fallback: Use escaped regex for safer replacement
      const escapedSelection = selectedCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapedSelection);
      newFullCode = fullCode.replace(regex, suggestedCode);
    }
    
    if (newFullCode !== fullCode) {
      onApplyFix(newFullCode);
      onClose();
    } else {
      toast({
        title: "Could not apply",
        description: "The selected code may have changed. Try selecting again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">AI Code Assistant</span>
        </div>
        <Button size="icon" variant="ghost" onClick={onClose} className="h-6 w-6">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="bg-muted rounded-md p-2 max-h-24 overflow-hidden">
        <pre className="text-xs font-mono text-muted-foreground truncate">
          {selectedCode.slice(0, 200)}{selectedCode.length > 200 ? "..." : ""}
        </pre>
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant={activeAction === "explain" ? "secondary" : "outline"}
          onClick={() => handleAction("explain")}
          disabled={isLoading}
          className="gap-1.5 flex-1"
          data-testid="button-ai-explain"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Explain
        </Button>
        <Button
          size="sm"
          variant={activeAction === "fix" ? "secondary" : "outline"}
          onClick={() => handleAction("fix")}
          disabled={isLoading}
          className="gap-1.5 flex-1"
          data-testid="button-ai-fix"
        >
          <Wrench className="h-3.5 w-3.5" />
          Fix
        </Button>
        <Button
          size="sm"
          variant={activeAction === "improve" ? "secondary" : "outline"}
          onClick={() => handleAction("improve")}
          disabled={isLoading}
          className="gap-1.5 flex-1"
          data-testid="button-ai-improve"
        >
          <ArrowUp className="h-3.5 w-3.5" />
          Improve
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-4 gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm text-muted-foreground">Analyzing code...</span>
        </div>
      )}

      {result && !isLoading && (
        <ScrollArea className="h-48 border rounded-md p-3">
          <div className="space-y-3">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <p className="text-sm whitespace-pre-wrap">{result}</p>
            </div>
            {suggestedCode && (
              <div className="space-y-2">
                <Badge variant="secondary" className="text-xs">Suggested Code</Badge>
                <pre className="text-xs font-mono bg-muted p-2 rounded overflow-x-auto">
                  {suggestedCode}
                </pre>
                <Button
                  size="sm"
                  onClick={handleApply}
                  className="w-full gap-1.5"
                  data-testid="button-apply-suggestion"
                >
                  <Lightbulb className="h-3.5 w-3.5" />
                  Apply Suggestion
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </Card>
  );
}
