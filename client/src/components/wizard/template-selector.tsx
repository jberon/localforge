import { useState, useCallback } from "react";
import { TEMPLATES, PRODUCTION_TEMPLATES, DEFAULT_PRODUCTION_MODULES } from "./templates";
import type { TemplateConfig, ProductionTemplateConfig, TemplateCategory } from "./types";
import { FreeformPrompt } from "./freeform-prompt";
import { trackEvent } from "@/lib/analytics";
import type { LLMSettings, ProductionModules } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Zap, Rocket, Sparkles, X, ArrowRight, Settings2, Mic, MicOff } from "lucide-react";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";

interface TemplateSelectorProps {
  onSelect: (template: TemplateConfig) => void;
  onSelectProduction: (template: ProductionTemplateConfig, modules: ProductionModules) => void;
  onGenerate: (prompt: string) => void;
  isGenerating: boolean;
  llmConnected: boolean | null;
  onCheckConnection: () => void;
  settings?: LLMSettings;
}

export function TemplateSelector({
  onSelect,
  onSelectProduction,
  onGenerate,
  isGenerating,
  llmConnected,
  onCheckConnection,
  settings,
}: TemplateSelectorProps) {
  const [category, setCategory] = useState<TemplateCategory>("quick");
  const [quickStartTemplate, setQuickStartTemplate] = useState<TemplateConfig | null>(null);
  const [quickStartDescription, setQuickStartDescription] = useState("");

  const handleTranscript = useCallback((transcript: string) => {
    setQuickStartDescription((prev) => prev + (prev ? " " : "") + transcript);
  }, []);

  const { isListening, isSupported, toggleListening, error: speechError } = useSpeechRecognition(handleTranscript);

  const handleQuickStart = (template: TemplateConfig) => {
    setQuickStartTemplate(template);
    setQuickStartDescription("");
  };

  const handleQuickGenerate = () => {
    if (!quickStartTemplate || !llmConnected) return;
    const description = quickStartDescription.trim() || quickStartTemplate.name;
    const prompt = `Create a ${quickStartTemplate.name.toLowerCase()} app: ${description}. Make it modern, clean, and fully functional.`;
    trackEvent("generation_started", undefined, { template: quickStartTemplate.id, mode: "quick_start" });
    onGenerate(prompt);
  };

  const handleAdvancedConfig = () => {
    if (quickStartTemplate) {
      onSelect(quickStartTemplate);
    }
  };

  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">
          What will you create?
        </h1>
        <p className="text-lg text-muted-foreground max-w-md mx-auto">
          Choose a starting point, or describe your vision.
        </p>
      </div>

      <div className="flex justify-center gap-2">
        <button
          onClick={() => setCategory("quick")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            category === "quick"
              ? "bg-primary text-primary-foreground"
              : "bg-muted hover-elevate"
          }`}
          data-testid="button-category-quick"
        >
          <Zap className="h-4 w-4" />
          <span className="font-medium">Quick Apps</span>
        </button>
        <button
          onClick={() => setCategory("production")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            category === "production"
              ? "bg-primary text-primary-foreground"
              : "bg-muted hover-elevate"
          }`}
          data-testid="button-category-production"
        >
          <Rocket className="h-4 w-4" />
          <span className="font-medium">Production Apps</span>
          <Badge variant="outline" className="ml-1 text-xs">Pro</Badge>
        </button>
      </div>

      {category === "quick" ? (
        <div className="space-y-4">
          {quickStartTemplate ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="max-w-md mx-auto p-6 rounded-2xl border bg-card">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <quickStartTemplate.icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{quickStartTemplate.name}</h3>
                      <p className="text-xs text-muted-foreground">{quickStartTemplate.description}</p>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setQuickStartTemplate(null)}
                    className="h-8 w-8"
                    data-testid="button-close-quickstart"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <div className="relative">
                      <Input
                        placeholder={`Describe your ${quickStartTemplate.name.toLowerCase()}...`}
                        value={quickStartDescription}
                        onChange={(e) => setQuickStartDescription(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !isGenerating && llmConnected) {
                            handleQuickGenerate();
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            (e.target as HTMLInputElement).blur();
                            setQuickStartDescription("");
                          }
                        }}
                        className="h-11 pr-10"
                        autoFocus
                        data-testid="input-quickstart-description"
                      />
                      {isSupported && (
                        <Button
                          type="button"
                          size="icon"
                          variant={isListening ? "default" : "ghost"}
                          onClick={toggleListening}
                          disabled={isGenerating}
                          className={`absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 ${isListening ? "bg-red-500 hover:bg-red-600 animate-pulse" : ""}`}
                          data-testid="button-quickstart-voice"
                        >
                          {isListening ? (
                            <MicOff className="h-4 w-4" />
                          ) : (
                            <Mic className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {isListening ? (
                        <span className="text-red-500">Listening... Click mic to stop</span>
                      ) : (
                        `Enter to generate • Esc to clear${isSupported ? " • Click mic to speak" : ""}`
                      )}
                    </p>
                    {speechError && (
                      <p className="text-xs text-destructive mt-1">{speechError}</p>
                    )}
                  </div>
                  
                  {llmConnected === false ? (
                    <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-muted/50 border border-dashed">
                      <p className="text-sm text-muted-foreground text-center">
                        Start LM Studio to generate
                      </p>
                      <Button
                        variant="outline"
                        onClick={onCheckConnection}
                        className="gap-2"
                        size="sm"
                        data-testid="button-quickstart-check-connection"
                      >
                        Check connection
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        onClick={handleQuickGenerate}
                        disabled={isGenerating || !llmConnected}
                        className="flex-1 gap-2"
                        data-testid="button-quickstart-generate"
                      >
                        <Sparkles className="h-4 w-4" />
                        {isGenerating ? "Creating..." : "Generate Now"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleAdvancedConfig}
                        className="gap-2"
                        data-testid="button-quickstart-advanced"
                      >
                        <Settings2 className="h-4 w-4" />
                        Advanced
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              <p className="text-center text-sm text-muted-foreground">
                Click a template to start building instantly
              </p>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-6 justify-items-center">
                {TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    className="group flex flex-col items-center gap-3 p-4 rounded-2xl hover-elevate focus:outline-none focus:ring-2 focus:ring-primary/20"
                    onClick={() => {
                      trackEvent("template_selected", undefined, { template: template.id });
                      handleQuickStart(template);
                    }}
                    data-testid={`card-template-${template.id}`}
                  >
                    <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center transition-colors group-hover:bg-primary/10">
                      <template.icon className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <span className="text-sm font-medium text-center">{template.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-center text-sm text-muted-foreground">
            Full-featured applications ready for real users and revenue
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {PRODUCTION_TEMPLATES.map((template) => (
              <button
                key={template.id}
                className="group flex flex-col items-start gap-3 p-5 rounded-xl border border-border/50 hover-elevate focus:outline-none focus:ring-2 focus:ring-primary/20 text-left"
                onClick={() => {
                  trackEvent("production_template_selected", undefined, { template: template.id });
                  onSelectProduction(template, { ...template.defaultModules });
                }}
                data-testid={`card-production-template-${template.id}`}
              >
                <div className="flex items-center gap-3 w-full">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center transition-colors group-hover:bg-primary/10">
                    <template.icon className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div className="flex-1">
                    <span className="font-semibold block">{template.name}</span>
                    <Badge variant="secondary" className="text-xs capitalize">
                      {template.category}
                    </Badge>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {template.description}
                </p>
                <div className="flex flex-wrap gap-1 mt-auto">
                  {Object.entries(template.defaultModules)
                    .filter(([_, enabled]) => enabled)
                    .slice(0, 3)
                    .map(([key]) => (
                      <Badge key={key} variant="outline" className="text-xs">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </Badge>
                    ))}
                  {Object.values(template.defaultModules).filter(Boolean).length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{Object.values(template.defaultModules).filter(Boolean).length - 3} more
                    </Badge>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="max-w-xl mx-auto">
        <FreeformPrompt
          onGenerate={onGenerate}
          isGenerating={isGenerating}
          llmConnected={llmConnected}
          onCheckConnection={onCheckConnection}
          settings={settings}
        />
      </div>
    </div>
  );
}
