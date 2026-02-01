import { Button } from "@/components/ui/button";
import { Sparkles, Calculator, BarChart3, ListTodo, Clock, Palette } from "lucide-react";

interface ExamplePromptsProps {
  onSelectPrompt: (prompt: string) => void;
}

const EXAMPLE_PROMPTS = [
  {
    icon: ListTodo,
    title: "Todo App",
    prompt: "Create a simple todo app with the ability to add, complete, and delete tasks. Include a progress bar showing completion percentage.",
  },
  {
    icon: Calculator,
    title: "Calculator",
    prompt: "Build a calculator with basic arithmetic operations (add, subtract, multiply, divide). Make it look modern with large, easy-to-click buttons.",
  },
  {
    icon: BarChart3,
    title: "CSV Analyzer",
    prompt: "Create a data analysis tool that lets me paste CSV data, displays it in a table, and shows basic statistics like sum, average, min, max for numeric columns.",
  },
  {
    icon: Clock,
    title: "Pomodoro Timer",
    prompt: "Build a Pomodoro timer with 25-minute work sessions and 5-minute breaks. Include start, pause, and reset buttons with a visual countdown.",
  },
  {
    icon: Palette,
    title: "Color Palette",
    prompt: "Create a color palette generator that shows 5 harmonious colors. Let me lock colors I like and regenerate the rest. Include hex codes for each color.",
  },
  {
    icon: Sparkles,
    title: "Quote Generator",
    prompt: "Build an inspirational quote generator with a beautiful card design. Include a button to get a new random quote and copy to clipboard functionality.",
  },
];

export function ExamplePrompts({ onSelectPrompt }: ExamplePromptsProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">What would you like to build?</h1>
          <p className="text-muted-foreground">
            Describe your app idea and I'll generate it for you. Or try one of these examples:
          </p>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {EXAMPLE_PROMPTS.map((example) => (
            <Button
              key={example.title}
              variant="outline"
              className="h-auto p-4 flex flex-col items-start gap-2 text-left"
              onClick={() => onSelectPrompt(example.prompt)}
              data-testid={`button-example-${example.title.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <div className="flex items-center gap-2">
                <example.icon className="h-4 w-4 text-primary" />
                <span className="font-medium">{example.title}</span>
              </div>
              <span className="text-xs text-muted-foreground line-clamp-2">
                {example.prompt}
              </span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
