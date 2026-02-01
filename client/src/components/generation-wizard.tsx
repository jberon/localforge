import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LayoutDashboard,
  ListTodo,
  BarChart3,
  Globe,
  Calculator,
  Palette,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
  Wand2,
} from "lucide-react";

interface GenerationWizardProps {
  onGenerate: (prompt: string) => void;
  isGenerating: boolean;
  llmConnected: boolean | null;
  onCheckConnection: () => void;
}

type TemplateType = "dashboard" | "todo" | "data-tool" | "landing" | "calculator" | "creative";

interface TemplateConfig {
  id: TemplateType;
  name: string;
  description: string;
  icon: typeof LayoutDashboard;
  fields: FieldConfig[];
  promptBuilder: (values: Record<string, string>) => string;
}

interface FieldConfig {
  id: string;
  label: string;
  type: "text" | "textarea" | "select";
  placeholder: string;
  options?: { value: string; label: string }[];
  required?: boolean;
}

const TEMPLATES: TemplateConfig[] = [
  {
    id: "dashboard",
    name: "Dashboard",
    description: "Stats, charts, and data visualization",
    icon: LayoutDashboard,
    fields: [
      { id: "title", label: "Dashboard Title", type: "text", placeholder: "Sales Dashboard", required: true },
      { id: "metrics", label: "Key Metrics (comma-separated)", type: "text", placeholder: "Revenue, Users, Orders, Growth" },
      { id: "chartType", label: "Primary Chart Type", type: "select", placeholder: "Select chart type", options: [
        { value: "bar", label: "Bar Chart" },
        { value: "line", label: "Line Chart" },
        { value: "pie", label: "Pie Chart" },
        { value: "area", label: "Area Chart" },
      ]},
      { id: "style", label: "Visual Style", type: "select", placeholder: "Select style", options: [
        { value: "modern", label: "Modern & Minimal" },
        { value: "corporate", label: "Corporate & Professional" },
        { value: "colorful", label: "Colorful & Vibrant" },
        { value: "dark", label: "Dark Theme" },
      ]},
    ],
    promptBuilder: (v) => `Create a ${v.style || "modern"} dashboard called "${v.title}". Include these key metrics displayed as stat cards: ${v.metrics || "Revenue, Users, Orders"}. Add a ${v.chartType || "bar"} chart showing sample data trends. Make it visually polished with proper spacing and a cohesive color scheme.`,
  },
  {
    id: "todo",
    name: "Task Manager",
    description: "Todo lists, kanban, productivity tools",
    icon: ListTodo,
    fields: [
      { id: "title", label: "App Name", type: "text", placeholder: "My Tasks", required: true },
      { id: "features", label: "Features", type: "select", placeholder: "Select features", options: [
        { value: "basic", label: "Basic (add, complete, delete)" },
        { value: "categories", label: "With Categories/Tags" },
        { value: "priority", label: "With Priority Levels" },
        { value: "full", label: "Full Featured (all of the above)" },
      ]},
      { id: "persistence", label: "Save Tasks?", type: "select", placeholder: "Select option", options: [
        { value: "session", label: "Session only (reset on refresh)" },
        { value: "local", label: "Save to browser (localStorage)" },
      ]},
    ],
    promptBuilder: (v) => `Create a task management app called "${v.title}". Features: ${v.features === "basic" ? "add new tasks, mark as complete, delete tasks" : v.features === "categories" ? "add tasks with categories/tags, filter by category, complete and delete" : v.features === "priority" ? "add tasks with priority levels (high/medium/low), sort by priority, complete and delete" : "add tasks with categories AND priority levels, filter and sort, complete and delete"}. ${v.persistence === "local" ? "Save tasks to localStorage so they persist across page refreshes." : ""} Include a progress indicator showing completion percentage.`,
  },
  {
    id: "data-tool",
    name: "Data Analyzer",
    description: "CSV/data input with statistics",
    icon: BarChart3,
    fields: [
      { id: "title", label: "Tool Name", type: "text", placeholder: "CSV Analyzer", required: true },
      { id: "inputType", label: "Data Input Method", type: "select", placeholder: "Select input type", options: [
        { value: "paste", label: "Paste CSV/Text Data" },
        { value: "manual", label: "Manual Data Entry" },
        { value: "both", label: "Both Options" },
      ]},
      { id: "stats", label: "Statistics to Show", type: "text", placeholder: "sum, average, min, max, count" },
      { id: "visualization", label: "Include Charts?", type: "select", placeholder: "Select option", options: [
        { value: "table", label: "Table Only" },
        { value: "simple", label: "Table + Simple Chart" },
        { value: "full", label: "Table + Multiple Charts" },
      ]},
    ],
    promptBuilder: (v) => `Create a data analysis tool called "${v.title}". Allow users to ${v.inputType === "paste" ? "paste CSV or tabular data" : v.inputType === "manual" ? "manually enter data in rows" : "either paste CSV data or manually enter rows"}. Display the data in a clean table format. Calculate and display these statistics for numeric columns: ${v.stats || "sum, average, min, max, count"}. ${v.visualization === "simple" ? "Add a bar chart visualization." : v.visualization === "full" ? "Add both bar and pie chart visualizations." : ""} Make parsing robust and handle common CSV edge cases.`,
  },
  {
    id: "landing",
    name: "Landing Page",
    description: "Marketing pages and portfolios",
    icon: Globe,
    fields: [
      { id: "title", label: "Page Title/Brand", type: "text", placeholder: "Acme Inc", required: true },
      { id: "tagline", label: "Tagline/Headline", type: "text", placeholder: "Build faster with AI" },
      { id: "sections", label: "Sections to Include", type: "select", placeholder: "Select sections", options: [
        { value: "minimal", label: "Hero + CTA only" },
        { value: "standard", label: "Hero + Features + CTA" },
        { value: "full", label: "Hero + Features + Testimonials + CTA" },
      ]},
      { id: "style", label: "Design Style", type: "select", placeholder: "Select style", options: [
        { value: "modern", label: "Modern SaaS" },
        { value: "minimal", label: "Minimalist" },
        { value: "bold", label: "Bold & Colorful" },
        { value: "elegant", label: "Elegant & Professional" },
      ]},
    ],
    promptBuilder: (v) => `Create a ${v.style || "modern"} landing page for "${v.title}". Headline: "${v.tagline || "Welcome to " + v.title}". ${v.sections === "minimal" ? "Include a hero section with headline, subtext, and a call-to-action button." : v.sections === "standard" ? "Include a hero section, a features grid with 3-4 features (use icons), and a call-to-action section." : "Include a hero section, features grid, testimonials section with 2-3 quotes, and a final CTA section."} Make it fully responsive and visually polished.`,
  },
  {
    id: "calculator",
    name: "Calculator/Tool",
    description: "Calculators and utility tools",
    icon: Calculator,
    fields: [
      { id: "type", label: "Calculator Type", type: "select", placeholder: "Select type", required: true, options: [
        { value: "basic", label: "Basic Math Calculator" },
        { value: "tip", label: "Tip Calculator" },
        { value: "bmi", label: "BMI Calculator" },
        { value: "mortgage", label: "Mortgage Calculator" },
        { value: "unit", label: "Unit Converter" },
        { value: "custom", label: "Custom (describe below)" },
      ]},
      { id: "customDesc", label: "Custom Description (if applicable)", type: "textarea", placeholder: "Describe your custom calculator..." },
      { id: "style", label: "Visual Style", type: "select", placeholder: "Select style", options: [
        { value: "clean", label: "Clean & Modern" },
        { value: "colorful", label: "Colorful" },
        { value: "dark", label: "Dark Mode" },
      ]},
    ],
    promptBuilder: (v) => {
      if (v.type === "custom" && v.customDesc) {
        return `Create a ${v.style || "clean"} calculator/tool: ${v.customDesc}. Make it user-friendly with clear inputs and outputs.`;
      }
      const types: Record<string, string> = {
        basic: "basic math calculator with large buttons for digits and operations (+, -, ×, ÷). Include clear and equals buttons. Display the current calculation.",
        tip: "tip calculator. Input: bill amount and tip percentage (with preset buttons for 15%, 18%, 20%). Show tip amount and total. Option to split between people.",
        bmi: "BMI (Body Mass Index) calculator. Input height and weight (support both metric and imperial). Display BMI value and category (underweight, normal, overweight, obese).",
        mortgage: "mortgage calculator. Inputs: loan amount, interest rate, loan term in years. Calculate and display monthly payment, total payment, and total interest.",
        unit: "unit converter. Support length (m/ft/in), weight (kg/lb), and temperature (C/F). Clean interface to select category, input value, and see converted result.",
      };
      return `Create a ${v.style || "clean"} ${types[v.type] || types.basic}`;
    },
  },
  {
    id: "creative",
    name: "Creative App",
    description: "Games, generators, fun tools",
    icon: Palette,
    fields: [
      { id: "type", label: "App Type", type: "select", placeholder: "Select type", required: true, options: [
        { value: "quote", label: "Quote Generator" },
        { value: "color", label: "Color Palette Generator" },
        { value: "timer", label: "Pomodoro Timer" },
        { value: "password", label: "Password Generator" },
        { value: "custom", label: "Custom (describe below)" },
      ]},
      { id: "customDesc", label: "Custom Description (if applicable)", type: "textarea", placeholder: "Describe your creative app idea..." },
    ],
    promptBuilder: (v) => {
      if (v.type === "custom" && v.customDesc) {
        return `Create this creative app: ${v.customDesc}. Make it fun, interactive, and visually appealing.`;
      }
      const types: Record<string, string> = {
        quote: "inspirational quote generator. Display a random quote with author in a beautiful card design. Button to get new quote. Include copy-to-clipboard functionality. Use a nice gradient or image background.",
        color: "color palette generator. Generate 5 harmonious colors. Display each with its hex code. Allow clicking to copy hex. Add lock icons to keep certain colors while regenerating others. Show color names if possible.",
        timer: "Pomodoro timer with 25-minute work sessions and 5-minute breaks. Large countdown display. Start, pause, and reset buttons. Visual or sound notification when timer completes. Track completed sessions.",
        password: "secure password generator. Options for length (8-32), include uppercase, lowercase, numbers, symbols. Generate button creates random password. Copy button to clipboard. Password strength indicator.",
      };
      return `Create a ${types[v.type] || types.quote}`;
    },
  },
];

export function GenerationWizard({ onGenerate, isGenerating, llmConnected, onCheckConnection }: GenerationWizardProps) {
  const [step, setStep] = useState<"template" | "configure" | "review">("template");
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateConfig | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  const handleTemplateSelect = (template: TemplateConfig) => {
    setSelectedTemplate(template);
    setFieldValues({});
    setStep("configure");
  };

  const handleFieldChange = (fieldId: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleBack = () => {
    if (step === "configure") {
      setStep("template");
      setSelectedTemplate(null);
    } else if (step === "review") {
      setStep("configure");
    }
  };

  const handleNext = () => {
    if (step === "configure") {
      setStep("review");
    }
  };

  const generatedPrompt = selectedTemplate ? selectedTemplate.promptBuilder(fieldValues) : "";

  const canProceed = () => {
    if (!selectedTemplate) return false;
    const requiredFields = selectedTemplate.fields.filter((f) => f.required);
    return requiredFields.every((f) => fieldValues[f.id]?.trim());
  };

  const handleGenerate = () => {
    if (generatedPrompt && llmConnected) {
      onGenerate(generatedPrompt);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 overflow-y-auto">
      <div className="max-w-2xl w-full space-y-6">
        {step === "template" && (
          <>
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight">What would you like to build?</h1>
              <p className="text-sm text-muted-foreground">
                Choose a template to get started, or describe your own idea below
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {TEMPLATES.map((template) => (
                <Card
                  key={template.id}
                  className="p-4 cursor-pointer hover-elevate transition-all"
                  onClick={() => handleTemplateSelect(template)}
                  data-testid={`card-template-${template.id}`}
                >
                  <div className="flex flex-col items-center text-center gap-2">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <template.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium text-sm">{template.name}</h3>
                      <p className="text-xs text-muted-foreground">{template.description}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or describe your own</span>
              </div>
            </div>

            <FreeformPrompt 
              onGenerate={onGenerate} 
              isGenerating={isGenerating} 
              llmConnected={llmConnected}
              onCheckConnection={onCheckConnection}
            />
          </>
        )}

        {step === "configure" && selectedTemplate && (
          <>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={handleBack} data-testid="button-wizard-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h2 className="text-xl font-semibold">{selectedTemplate.name}</h2>
                <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>
              </div>
            </div>

            <div className="space-y-4">
              {selectedTemplate.fields.map((field) => (
                <div key={field.id} className="space-y-2">
                  <Label htmlFor={field.id}>
                    {field.label}
                    {field.required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  {field.type === "text" && (
                    <Input
                      id={field.id}
                      value={fieldValues[field.id] || ""}
                      onChange={(e) => handleFieldChange(field.id, e.target.value)}
                      placeholder={field.placeholder}
                      data-testid={`input-wizard-${field.id}`}
                    />
                  )}
                  {field.type === "textarea" && (
                    <Textarea
                      id={field.id}
                      value={fieldValues[field.id] || ""}
                      onChange={(e) => handleFieldChange(field.id, e.target.value)}
                      placeholder={field.placeholder}
                      className="min-h-[80px]"
                      data-testid={`textarea-wizard-${field.id}`}
                    />
                  )}
                  {field.type === "select" && field.options && (
                    <Select
                      value={fieldValues[field.id] || ""}
                      onValueChange={(value) => handleFieldChange(field.id, value)}
                    >
                      <SelectTrigger data-testid={`select-wizard-${field.id}`}>
                        <SelectValue placeholder={field.placeholder} />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <Button onClick={handleNext} disabled={!canProceed()} className="gap-2" data-testid="button-wizard-next">
                Review & Generate
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}

        {step === "review" && selectedTemplate && (
          <>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={handleBack} data-testid="button-wizard-back-review">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h2 className="text-xl font-semibold">Review & Generate</h2>
                <p className="text-sm text-muted-foreground">Check the details before generating</p>
              </div>
            </div>

            <Card className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1">
                  <selectedTemplate.icon className="h-3 w-3" />
                  {selectedTemplate.name}
                </Badge>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Generated Prompt</Label>
                <div className="p-3 bg-muted rounded-md text-sm">
                  {generatedPrompt}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t">
                <Label className="text-xs text-muted-foreground">LLM Status:</Label>
                {llmConnected === null ? (
                  <Badge variant="secondary" className="gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Checking...
                  </Badge>
                ) : llmConnected ? (
                  <Badge variant="default" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Connected
                  </Badge>
                ) : (
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive" className="gap-1">
                      <XCircle className="h-3 w-3" />
                      Disconnected
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={onCheckConnection} data-testid="button-retry-connection">
                      Retry
                    </Button>
                  </div>
                )}
              </div>
            </Card>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleBack}>
                Edit Settings
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !llmConnected}
                className="gap-2"
                data-testid="button-wizard-generate"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" />
                    Generate App
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FreeformPrompt({ 
  onGenerate, 
  isGenerating, 
  llmConnected,
  onCheckConnection,
}: { 
  onGenerate: (prompt: string) => void; 
  isGenerating: boolean;
  llmConnected: boolean | null;
  onCheckConnection: () => void;
}) {
  const [prompt, setPrompt] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim() && !isGenerating && llmConnected) {
      onGenerate(prompt.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3" data-testid="form-freeform">
      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe the app you want to build in detail..."
        disabled={isGenerating}
        data-testid="textarea-freeform-prompt"
      />
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {llmConnected === false && (
            <div className="flex items-center gap-2">
              <span className="text-destructive flex items-center gap-1">
                <XCircle className="h-3 w-3" />
                LLM not connected
              </span>
              <Button 
                type="button" 
                variant="ghost" 
                size="sm" 
                onClick={onCheckConnection}
                data-testid="button-freeform-retry"
              >
                Retry
              </Button>
            </div>
          )}
          {llmConnected === null && (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Checking connection...
            </span>
          )}
        </div>
        <Button
          type="submit"
          disabled={!prompt.trim() || isGenerating || !llmConnected}
          className="gap-2"
          data-testid="button-freeform-generate"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Generate
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
