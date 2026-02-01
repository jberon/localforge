import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Sparkles, Loader2 } from "lucide-react";
import type { TemplateConfig } from "./types";

interface ConfigureStepProps {
  template: TemplateConfig;
  fieldValues: Record<string, string>;
  onFieldChange: (fieldId: string, value: string) => void;
  onBack: () => void;
  onNext: () => void;
  onQuickGenerate?: () => void;
  canProceed: boolean;
  isGenerating: boolean;
  llmConnected: boolean | null;
}

export function ConfigureStep({
  template,
  fieldValues,
  onFieldChange,
  onBack,
  onNext,
  onQuickGenerate,
  canProceed,
  isGenerating,
  llmConnected,
}: ConfigureStepProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-wizard-back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-xl font-semibold">{template.name}</h2>
          <p className="text-sm text-muted-foreground">{template.description}</p>
        </div>
      </div>

      <div className="space-y-4">
        {template.fields.map((field) => (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            {field.type === "text" && (
              <Input
                id={field.id}
                value={fieldValues[field.id] || ""}
                onChange={(e) => onFieldChange(field.id, e.target.value)}
                placeholder={field.placeholder}
                data-testid={`input-wizard-${field.id}`}
              />
            )}
            {field.type === "textarea" && (
              <Textarea
                id={field.id}
                value={fieldValues[field.id] || ""}
                onChange={(e) => onFieldChange(field.id, e.target.value)}
                placeholder={field.placeholder}
                className="min-h-[80px]"
                data-testid={`textarea-wizard-${field.id}`}
              />
            )}
            {field.type === "select" && field.options && (
              <Select
                value={fieldValues[field.id] || ""}
                onValueChange={(value) => onFieldChange(field.id, value)}
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

      <div className="flex justify-between items-center pt-4 border-t">
        {onQuickGenerate ? (
          <Button
            variant="default"
            onClick={onQuickGenerate}
            disabled={!canProceed || isGenerating || !llmConnected}
            className="gap-2"
            data-testid="button-quick-generate"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Quick Generate
              </>
            )}
          </Button>
        ) : (
          <div />
        )}
        <Button onClick={onNext} disabled={!canProceed} variant="outline" className="gap-2" data-testid="button-wizard-next">
          {onQuickGenerate ? "Customize More" : "Continue"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
