import { TEMPLATES } from "./templates";
import type { TemplateConfig } from "./types";
import { FreeformPrompt } from "./freeform-prompt";
import { trackEvent } from "@/lib/analytics";
import type { LLMSettings } from "@shared/schema";

interface TemplateSelectorProps {
  onSelect: (template: TemplateConfig) => void;
  onGenerate: (prompt: string) => void;
  isGenerating: boolean;
  llmConnected: boolean | null;
  onCheckConnection: () => void;
  settings?: LLMSettings;
}

export function TemplateSelector({
  onSelect,
  onGenerate,
  isGenerating,
  llmConnected,
  onCheckConnection,
  settings,
}: TemplateSelectorProps) {
  return (
    <div className="space-y-12">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">
          What will you create?
        </h1>
        <p className="text-lg text-muted-foreground max-w-md mx-auto">
          Choose a starting point, or describe your vision.
        </p>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-6 justify-items-center">
        {TEMPLATES.map((template) => (
          <button
            key={template.id}
            className="group flex flex-col items-center gap-3 p-4 rounded-2xl hover-elevate focus:outline-none focus:ring-2 focus:ring-primary/20"
            onClick={() => {
              trackEvent("template_selected", undefined, { template: template.id });
              onSelect(template);
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
