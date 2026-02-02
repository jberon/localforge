import { FreeformPrompt } from "./freeform-prompt";
import type { TemplateConfig, ProductionTemplateConfig } from "./types";
import type { LLMSettings, ProductionModules } from "@shared/schema";
import type { Attachment } from "@/hooks/use-file-attachments";

interface TemplateSelectorProps {
  onSelect: (template: TemplateConfig) => void;
  onSelectProduction: (template: ProductionTemplateConfig, modules: ProductionModules) => void;
  onGenerate: (prompt: string, dataModel?: undefined, attachments?: Attachment[], temperature?: number) => void;
  isGenerating: boolean;
  llmConnected: boolean | null;
  onCheckConnection: () => void;
  settings?: LLMSettings;
}

export function TemplateSelector({
  onGenerate,
  isGenerating,
  llmConnected,
  onCheckConnection,
  settings,
}: TemplateSelectorProps) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">
          What will you create?
        </h1>
        <p className="text-lg text-muted-foreground max-w-md mx-auto">
          Describe your vision and let AI build it for you.
        </p>
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
