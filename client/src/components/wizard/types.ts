import type { LucideIcon } from "lucide-react";
import type { DataModel } from "@shared/schema";

export type TemplateType = "dashboard" | "todo" | "data-tool" | "landing" | "calculator" | "creative";

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
  temperature: number; // Auto-optimized temperature for this template type
}

export type WizardStep = "template" | "configure" | "data-model" | "review";

export interface WizardState {
  step: WizardStep;
  selectedTemplate: TemplateConfig | null;
  fieldValues: Record<string, string>;
  dataModel: DataModel;
}

export interface GenerationWizardProps {
  onGenerate: (prompt: string, dataModel?: DataModel, temperature?: number) => void;
  isGenerating: boolean;
  llmConnected: boolean | null;
  onCheckConnection: () => void;
}
