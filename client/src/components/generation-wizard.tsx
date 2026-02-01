import { useState } from "react";
import {
  TemplateSelector,
  ConfigureStep,
  DataModelBuilder,
  ReviewStep,
  DEFAULT_DATA_MODELS,
} from "./wizard";
import type { TemplateConfig, WizardStep, GenerationWizardProps } from "./wizard";
import type { DataModel, LLMSettings } from "@shared/schema";

interface ExtendedWizardProps extends GenerationWizardProps {
  settings?: LLMSettings;
}

export function GenerationWizard({
  onGenerate,
  isGenerating,
  llmConnected,
  onCheckConnection,
  settings,
}: ExtendedWizardProps) {
  const [step, setStep] = useState<WizardStep>("template");
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateConfig | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [dataModel, setDataModel] = useState<DataModel>({ entities: [], enableDatabase: false });

  const handleTemplateSelect = (template: TemplateConfig) => {
    setSelectedTemplate(template);
    setFieldValues({});
    const defaultEntities = DEFAULT_DATA_MODELS[template.id] || [];
    setDataModel({ entities: defaultEntities, enableDatabase: defaultEntities.length > 0 });
    setStep("configure");
  };

  const handleFieldChange = (fieldId: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleBack = () => {
    if (step === "configure") {
      setStep("template");
      setSelectedTemplate(null);
    } else if (step === "data-model") {
      setStep("configure");
    } else if (step === "review") {
      setStep("data-model");
    }
  };

  const handleNext = () => {
    if (step === "configure") {
      setStep("data-model");
    } else if (step === "data-model") {
      setStep("review");
    }
  };

  const canProceed = () => {
    if (!selectedTemplate) return false;
    const requiredFields = selectedTemplate.fields.filter((f) => f.required);
    return requiredFields.every((f) => fieldValues[f.id]?.trim());
  };

  const buildFullPrompt = () => {
    if (!selectedTemplate) return "";
    let prompt = selectedTemplate.promptBuilder(fieldValues);

    if (dataModel.enableDatabase && dataModel.entities.length > 0) {
      prompt += "\n\n## Full-Stack Requirements:\n";
      prompt += "Generate a COMPLETE full-stack application with:\n";
      prompt += "1. Frontend (React + TypeScript + Tailwind CSS)\n";
      prompt += "2. Backend (Express.js API)\n";
      prompt += "3. Database schema (PostgreSQL with Drizzle ORM)\n\n";
      prompt += "## Data Model:\n";

      dataModel.entities.forEach((entity) => {
        prompt += `\n### ${entity.name} Entity\n`;
        prompt += "Fields:\n";
        entity.fields.forEach((field) => {
          const reqText = field.required ? " (required)" : "";
          prompt += `- ${field.name}: ${field.type}${reqText}\n`;
        });
      });

      prompt += "\n## API Endpoints:\n";
      dataModel.entities.forEach((entity) => {
        const plural = entity.name.toLowerCase() + "s";
        prompt += `- GET /api/${plural} - List all ${plural}\n`;
        prompt += `- POST /api/${plural} - Create ${entity.name.toLowerCase()}\n`;
        prompt += `- GET /api/${plural}/:id - Get single ${entity.name.toLowerCase()}\n`;
        prompt += `- PUT /api/${plural}/:id - Update ${entity.name.toLowerCase()}\n`;
        prompt += `- DELETE /api/${plural}/:id - Delete ${entity.name.toLowerCase()}\n`;
      });

      prompt += "\nGenerate all files needed for a complete, working full-stack application.";
    }

    return prompt;
  };

  const generatedPrompt = buildFullPrompt();

  const handleGenerate = () => {
    if (generatedPrompt && llmConnected && selectedTemplate) {
      onGenerate(generatedPrompt, dataModel, selectedTemplate.temperature);
    }
  };

  const handleQuickGenerate = () => {
    if (selectedTemplate && canProceed() && llmConnected) {
      const quickPrompt = selectedTemplate.promptBuilder(fieldValues);
      onGenerate(quickPrompt, undefined, selectedTemplate.temperature);
    }
  };

  const handleSkipDataModel = () => {
    setDataModel({ entities: [], enableDatabase: false });
    setStep("review");
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 overflow-y-auto">
      <div className="max-w-3xl w-full">
        {step === "template" && (
          <TemplateSelector
            onSelect={handleTemplateSelect}
            onGenerate={onGenerate}
            isGenerating={isGenerating}
            llmConnected={llmConnected}
            onCheckConnection={onCheckConnection}
            settings={settings}
          />
        )}

        {step === "configure" && selectedTemplate && (
          <ConfigureStep
            template={selectedTemplate}
            fieldValues={fieldValues}
            onFieldChange={handleFieldChange}
            onBack={handleBack}
            onNext={handleNext}
            onQuickGenerate={handleQuickGenerate}
            canProceed={canProceed()}
            isGenerating={isGenerating}
            llmConnected={llmConnected}
          />
        )}

        {step === "data-model" && selectedTemplate && (
          <DataModelBuilder
            dataModel={dataModel}
            onChange={setDataModel}
            onBack={handleBack}
            onNext={handleNext}
            onSkip={handleSkipDataModel}
          />
        )}

        {step === "review" && selectedTemplate && (
          <ReviewStep
            template={selectedTemplate}
            dataModel={dataModel}
            generatedPrompt={generatedPrompt}
            llmConnected={llmConnected}
            isGenerating={isGenerating}
            onBack={handleBack}
            onGenerate={handleGenerate}
            onCheckConnection={onCheckConnection}
          />
        )}
      </div>
    </div>
  );
}
