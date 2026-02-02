import { useState } from "react";
import {
  TemplateSelector,
  ConfigureStep,
  DataModelBuilder,
  ReviewStep,
  ModuleSelector,
  DEFAULT_DATA_MODELS,
  PRODUCTION_DATA_MODELS,
  DEFAULT_PRODUCTION_MODULES,
} from "./wizard";
import type { TemplateConfig, ProductionTemplateConfig, WizardStep, GenerationWizardProps } from "./wizard";
import type { DataModel, LLMSettings, ProductionModules } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";

interface ExtendedWizardProps extends GenerationWizardProps {
  settings?: LLMSettings;
  planBuildMode?: boolean;
}

export function GenerationWizard({
  onGenerate,
  isGenerating,
  llmConnected,
  onCheckConnection,
  settings,
  planBuildMode,
}: ExtendedWizardProps) {
  const [step, setStep] = useState<WizardStep>("template");
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateConfig | null>(null);
  const [selectedProductionTemplate, setSelectedProductionTemplate] = useState<ProductionTemplateConfig | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [dataModel, setDataModel] = useState<DataModel>({ entities: [], enableDatabase: false });
  const [productionModules, setProductionModules] = useState<ProductionModules>(DEFAULT_PRODUCTION_MODULES);

  const isProductionMode = selectedProductionTemplate !== null;

  const handleTemplateSelect = (template: TemplateConfig) => {
    setSelectedTemplate(template);
    setSelectedProductionTemplate(null);
    setFieldValues({});
    const defaultEntities = DEFAULT_DATA_MODELS[template.id] || [];
    setDataModel({ entities: defaultEntities, enableDatabase: defaultEntities.length > 0 });
    setProductionModules(DEFAULT_PRODUCTION_MODULES);
    setStep("configure");
  };

  const handleProductionTemplateSelect = (template: ProductionTemplateConfig, modules: ProductionModules) => {
    setSelectedProductionTemplate(template);
    setSelectedTemplate(null);
    setFieldValues({});
    const defaultEntities = PRODUCTION_DATA_MODELS[template.id] || [];
    setDataModel({ entities: defaultEntities, enableDatabase: true });
    setProductionModules(modules);
    setStep("configure");
  };

  const handleFieldChange = (fieldId: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleBack = () => {
    if (step === "configure") {
      setStep("template");
      setSelectedTemplate(null);
      setSelectedProductionTemplate(null);
    } else if (step === "modules") {
      setStep("configure");
    } else if (step === "data-model") {
      if (isProductionMode) {
        setStep("modules");
      } else {
        setStep("configure");
      }
    } else if (step === "review") {
      setStep("data-model");
    }
  };

  const handleNext = () => {
    if (step === "configure") {
      if (isProductionMode) {
        setStep("modules");
      } else {
        setStep("data-model");
      }
    } else if (step === "modules") {
      setStep("data-model");
    } else if (step === "data-model") {
      setStep("review");
    }
  };

  const canProceed = () => {
    const template = selectedTemplate || selectedProductionTemplate;
    if (!template) return false;
    const requiredFields = template.fields.filter((f) => f.required);
    return requiredFields.every((f) => fieldValues[f.id]?.trim());
  };

  const buildFullPrompt = () => {
    const template = selectedTemplate || selectedProductionTemplate;
    if (!template) return "";
    
    let prompt: string;
    if (selectedProductionTemplate) {
      prompt = selectedProductionTemplate.promptBuilder(fieldValues, productionModules);
    } else if (selectedTemplate) {
      prompt = selectedTemplate.promptBuilder(fieldValues);
    } else {
      return "";
    }

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
  const currentTemplate = selectedTemplate || selectedProductionTemplate;
  const currentTemperature = currentTemplate?.temperature || 0.5;

  const handleGenerate = () => {
    if (generatedPrompt && llmConnected && currentTemplate) {
      onGenerate(generatedPrompt, dataModel, undefined, currentTemperature);
    }
  };

  const handleQuickGenerate = () => {
    if (currentTemplate && canProceed() && llmConnected) {
      let quickPrompt: string;
      if (selectedProductionTemplate) {
        quickPrompt = selectedProductionTemplate.promptBuilder(fieldValues, productionModules);
      } else if (selectedTemplate) {
        quickPrompt = selectedTemplate.promptBuilder(fieldValues);
      } else {
        return;
      }
      onGenerate(quickPrompt, undefined, undefined, currentTemperature);
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
            onSelectProduction={handleProductionTemplateSelect}
            onGenerate={onGenerate}
            isGenerating={isGenerating}
            llmConnected={llmConnected}
            onCheckConnection={onCheckConnection}
            settings={settings}
          />
        )}

        {step === "configure" && currentTemplate && (
          <ConfigureStep
            template={selectedTemplate || {
              ...selectedProductionTemplate!,
              id: selectedProductionTemplate!.id as any,
              promptBuilder: (v: Record<string, string>) => selectedProductionTemplate!.promptBuilder(v, productionModules),
            }}
            fieldValues={fieldValues}
            onFieldChange={handleFieldChange}
            onBack={handleBack}
            onNext={handleNext}
            onQuickGenerate={isProductionMode ? undefined : handleQuickGenerate}
            canProceed={canProceed()}
            isGenerating={isGenerating}
            llmConnected={llmConnected}
          />
        )}

        {step === "modules" && selectedProductionTemplate && (
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle>Configure Production Modules</CardTitle>
              <CardDescription>
                Select the features to include in your {selectedProductionTemplate.name}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <ModuleSelector
                modules={productionModules}
                onChange={setProductionModules}
                disabled={isGenerating}
              />
              
              <div className="flex justify-between gap-4 pt-4">
                <Button
                  variant="outline"
                  onClick={handleBack}
                  disabled={isGenerating}
                  data-testid="button-modules-back"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button
                  onClick={handleNext}
                  disabled={isGenerating}
                  data-testid="button-modules-next"
                >
                  Continue to Data Model
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "data-model" && currentTemplate && (
          <DataModelBuilder
            dataModel={dataModel}
            onChange={setDataModel}
            onBack={handleBack}
            onNext={handleNext}
            onSkip={isProductionMode ? undefined : handleSkipDataModel}
          />
        )}

        {step === "review" && currentTemplate && (
          <ReviewStep
            template={selectedTemplate || {
              ...selectedProductionTemplate!,
              id: selectedProductionTemplate!.id as any,
              promptBuilder: (v: Record<string, string>) => selectedProductionTemplate!.promptBuilder(v, productionModules),
            }}
            dataModel={dataModel}
            generatedPrompt={generatedPrompt}
            llmConnected={llmConnected}
            isGenerating={isGenerating}
            onBack={handleBack}
            onGenerate={handleGenerate}
            onCheckConnection={onCheckConnection}
            planBuildMode={planBuildMode}
            productionModules={isProductionMode ? productionModules : undefined}
          />
        )}
      </div>
    </div>
  );
}
