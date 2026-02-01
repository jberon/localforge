import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Calculator, BarChart3, ListTodo, Clock, Palette, ThumbsUp, TrendingUp } from "lucide-react";
import { getSuccessfulPrompts } from "@/lib/analytics";

interface ExamplePromptsProps {
  onSelectPrompt: (prompt: string) => void;
}

interface LearnedPrompt {
  prompt: string;
  template?: string;
  timestamp: number;
}

const EXAMPLE_PROMPTS = [
  {
    icon: ListTodo,
    title: "Todo App",
    description: "Task list with add, complete & delete",
    prompt: "Create a simple todo app with the ability to add, complete, and delete tasks. Include a progress bar showing completion percentage.",
  },
  {
    icon: Calculator,
    title: "Calculator",
    description: "Modern calculator with basic math",
    prompt: "Build a calculator with basic arithmetic operations (add, subtract, multiply, divide). Make it look modern with large, easy-to-click buttons.",
  },
  {
    icon: BarChart3,
    title: "CSV Analyzer",
    description: "Paste data and see statistics",
    prompt: "Create a data analysis tool that lets me paste CSV data, displays it in a table, and shows basic statistics like sum, average, min, max for numeric columns.",
  },
  {
    icon: Clock,
    title: "Pomodoro Timer",
    description: "Focus timer with work sessions",
    prompt: "Build a Pomodoro timer with 25-minute work sessions and 5-minute breaks. Include start, pause, and reset buttons with a visual countdown.",
  },
  {
    icon: Palette,
    title: "Color Palette",
    description: "Generate harmonious color schemes",
    prompt: "Create a color palette generator that shows 5 harmonious colors. Let me lock colors I like and regenerate the rest. Include hex codes for each color.",
  },
  {
    icon: Sparkles,
    title: "Quote Generator",
    description: "Random inspirational quotes",
    prompt: "Build an inspirational quote generator with a beautiful card design. Include a button to get a new random quote and copy to clipboard functionality.",
  },
];

export function ExamplePrompts({ onSelectPrompt }: ExamplePromptsProps) {
  const [learnedPrompts, setLearnedPrompts] = useState<LearnedPrompt[]>([]);

  useEffect(() => {
    getSuccessfulPrompts(3).then(setLearnedPrompts);
  }, []);

  const truncatePrompt = (prompt: string, maxLength = 60): string => {
    if (prompt.length <= maxLength) return prompt;
    return prompt.slice(0, maxLength).trim() + "...";
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 overflow-y-auto">
      <div className="max-w-xl w-full space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">What would you like to build?</h1>
          <p className="text-sm text-muted-foreground">
            Describe your app idea or try an example:
          </p>
        </div>

        {learnedPrompts.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              <span>Popular creations</span>
              <Badge variant="secondary" className="text-xs">
                <ThumbsUp className="h-3 w-3 mr-1" />
                Liked
              </Badge>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {learnedPrompts.map((learned, index) => (
                <Button
                  key={index}
                  variant="outline"
                  className="h-auto p-3 justify-start text-left"
                  onClick={() => onSelectPrompt(learned.prompt)}
                  data-testid={`button-learned-prompt-${index}`}
                >
                  <div className="flex items-center gap-2">
                    <ThumbsUp className="h-4 w-4 text-green-500 flex-shrink-0" />
                    <span className="text-sm truncate">{truncatePrompt(learned.prompt)}</span>
                  </div>
                </Button>
              ))}
            </div>
          </div>
        )}
        
        <div className="grid grid-cols-2 gap-2">
          {EXAMPLE_PROMPTS.map((example) => (
            <Button
              key={example.title}
              variant="outline"
              className="h-auto p-3 flex flex-col items-start gap-1 text-left"
              onClick={() => onSelectPrompt(example.prompt)}
              data-testid={`button-example-${example.title.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <div className="flex items-center gap-2">
                <example.icon className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="font-medium text-sm">{example.title}</span>
              </div>
              <span className="text-xs text-muted-foreground truncate w-full">
                {example.description}
              </span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
