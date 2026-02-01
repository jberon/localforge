import type { LucideIcon } from "lucide-react";
import type { DataModel, ProductionModules } from "@shared/schema";

export type TemplateType = "dashboard" | "todo" | "data-tool" | "landing" | "calculator" | "creative";
export type ProductionTemplateType = "saas-starter" | "marketplace" | "admin-dashboard" | "api-service" | "ecommerce" | "content-platform";
export type TemplateCategory = "quick" | "production";

export interface FieldConfig {
  id: string;
  label: string;
  type: "text" | "textarea" | "select";
  placeholder: string;
  options?: { value: string; label: string }[];
  required?: boolean;
}

export interface TemplateConfig {
  id: TemplateType;
  name: string;
  description: string;
  icon: LucideIcon;
  fields: FieldConfig[];
  promptBuilder: (values: Record<string, string>) => string;
  temperature: number;
}

export interface ProductionTemplateConfig {
  id: ProductionTemplateType;
  name: string;
  description: string;
  icon: LucideIcon;
  category: "saas" | "marketplace" | "internal" | "api" | "ecommerce" | "content";
  fields: FieldConfig[];
  defaultModules: ProductionModules;
  suggestedStack: {
    frontend: string;
    backend: string;
    database: string;
  };
  promptBuilder: (values: Record<string, string>, modules: ProductionModules) => string;
  temperature: number;
}

export type WizardStep = "template" | "configure" | "modules" | "data-model" | "review";

export interface WizardState {
  step: WizardStep;
  templateCategory: TemplateCategory;
  selectedTemplate: TemplateConfig | null;
  selectedProductionTemplate: ProductionTemplateConfig | null;
  fieldValues: Record<string, string>;
  productionModules: ProductionModules;
  dataModel: DataModel;
}

export interface GenerationWizardProps {
  onGenerate: (prompt: string, dataModel?: DataModel, temperature?: number) => void;
  isGenerating: boolean;
  llmConnected: boolean | null;
  onCheckConnection: () => void;
}
