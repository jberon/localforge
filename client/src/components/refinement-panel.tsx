import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wand2, Loader2, Send, Palette, Maximize, Minimize, Type } from "lucide-react";
import type { LLMSettings } from "@shared/schema";

interface RefinementPanelProps {
  projectId: string;
  hasCode: boolean;
  settings: LLMSettings;
  onRefineStart: () => void;
  onRefineComplete: (code: string) => void;
  onRefineError: (error: string) => void;
}

const QUICK_REFINEMENTS = [
  { label: "Dark mode", icon: Palette, prompt: "Add a dark mode toggle and apply dark styling" },
  { label: "Make bigger", icon: Maximize, prompt: "Increase the size of all UI elements and text" },
  { label: "Make smaller", icon: Minimize, prompt: "Make the UI more compact with smaller elements" },
  { label: "Better fonts", icon: Type, prompt: "Improve typography with better font sizes and weights" },
];

export function RefinementPanel({
  projectId,
  hasCode,
  settings,
  onRefineStart,
  onRefineComplete,
  onRefineError,
}: RefinementPanelProps) {
  const [refinement, setRefinement] = useState("");
  const [isRefining, setIsRefining] = useState(false);

  const handleRefine = async (text: string) => {
    if (!text.trim() || !hasCode) return;

    setIsRefining(true);
    onRefineStart();

    try {
      const response = await fetch(`/api/projects/${projectId}/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refinement: text.trim(), settings }),
      });

      if (!response.ok) {
        throw new Error("Refinement request failed");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let fullCode = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "chunk") {
                fullCode += data.content;
              } else if (data.type === "done" && data.project) {
                onRefineComplete(data.project.generatedCode || fullCode);
              } else if (data.type === "error") {
                throw new Error(data.error);
              }
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }

      setRefinement("");
    } catch (error: any) {
      onRefineError(error.message || "Refinement failed");
    } finally {
      setIsRefining(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleRefine(refinement);
  };

  if (!hasCode) return null;

  return (
    <Card className="p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Wand2 className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Refine Your App</span>
        {isRefining && (
          <Badge variant="secondary" className="gap-1 ml-auto">
            <Loader2 className="h-3 w-3 animate-spin" />
            Updating...
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {QUICK_REFINEMENTS.map((item) => (
          <Button
            key={item.label}
            variant="outline"
            size="sm"
            disabled={isRefining}
            onClick={() => handleRefine(item.prompt)}
            className="gap-1 text-xs"
            data-testid={`button-quick-refine-${item.label.toLowerCase().replace(" ", "-")}`}
          >
            <item.icon className="h-3 w-3" />
            {item.label}
          </Button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={refinement}
          onChange={(e) => setRefinement(e.target.value)}
          placeholder="Describe changes... (e.g., add a search bar)"
          disabled={isRefining}
          className="flex-1 text-sm"
          data-testid="input-refinement"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!refinement.trim() || isRefining}
          data-testid="button-submit-refinement"
        >
          {isRefining ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </Card>
  );
}
