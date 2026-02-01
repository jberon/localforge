import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, XCircle, Wand2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { LLMSettings } from "@shared/schema";

interface FreeformPromptProps {
  onGenerate: (prompt: string) => void;
  isGenerating: boolean;
  llmConnected: boolean | null;
  onCheckConnection: () => void;
  settings?: LLMSettings;
}

export function FreeformPrompt({
  onGenerate,
  isGenerating,
  llmConnected,
  onCheckConnection,
  settings,
}: FreeformPromptProps) {
  const [prompt, setPrompt] = useState("");
  const [isEnhancing, setIsEnhancing] = useState(false);
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim() && !isGenerating && llmConnected) {
      onGenerate(prompt.trim());
    }
  };

  const handleEnhance = async () => {
    if (!prompt.trim() || !llmConnected || !settings) return;
    
    setIsEnhancing(true);
    try {
      const response = await fetch("/api/llm/enhance-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), settings }),
      });

      if (!response.ok) {
        throw new Error("Failed to enhance prompt");
      }

      const data = await response.json();
      setPrompt(data.enhanced);
      toast({
        title: "Prompt Enhanced",
        description: "Your prompt has been improved with more detail.",
      });
    } catch (error) {
      toast({
        title: "Enhancement Failed",
        description: "Couldn't enhance the prompt. Try again.",
        variant: "destructive",
      });
    } finally {
      setIsEnhancing(false);
    }
  };

  const canEnhance = prompt.trim().length > 0 && 
    prompt.trim().length < 100 && 
    llmConnected && 
    settings &&
    !isGenerating && 
    !isEnhancing;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-freeform">
      <div className="relative">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Or describe your idea..."
          disabled={isGenerating || isEnhancing}
          className="min-h-[100px] text-base resize-none pr-4"
          data-testid="textarea-freeform-prompt"
        />
      </div>

      <div className="flex flex-col items-center gap-3">
        {llmConnected === false ? (
          <div className="flex flex-col items-center gap-3 p-4 rounded-lg bg-muted/50 border border-dashed animate-in fade-in duration-300">
            <p className="text-sm text-muted-foreground text-center">
              Start LM Studio on your Mac to begin creating
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={onCheckConnection}
              className="gap-2"
              data-testid="button-freeform-retry"
            >
              <Loader2 className="h-4 w-4" />
              Check connection
            </Button>
          </div>
        ) : llmConnected === null ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Connecting to LM Studio...</span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            {canEnhance && (
              <Button
                type="button"
                variant="outline"
                onClick={handleEnhance}
                disabled={isEnhancing}
                className="gap-2"
                data-testid="button-enhance-prompt"
              >
                {isEnhancing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enhancing...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" />
                    Enhance
                  </>
                )}
              </Button>
            )}
            <Button
              type="submit"
              size="lg"
              disabled={!prompt.trim() || isGenerating || isEnhancing}
              className="gap-2 px-8"
              data-testid="button-freeform-generate"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Create App
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {canEnhance && (
        <p className="text-xs text-muted-foreground text-center">
          Short prompt? Click "Enhance" to add more detail automatically.
        </p>
      )}
    </form>
  );
}
