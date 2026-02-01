import { useState, useCallback } from "react";
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
import { ArrowLeft, ArrowRight, Sparkles, Loader2, Mic, MicOff } from "lucide-react";
import type { TemplateConfig } from "./types";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";

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
  const [activeVoiceField, setActiveVoiceField] = useState<string | null>(null);

  const handleTranscript = useCallback((transcript: string) => {
    if (activeVoiceField) {
      onFieldChange(activeVoiceField, (fieldValues[activeVoiceField] || "") + (fieldValues[activeVoiceField] ? " " : "") + transcript);
    }
  }, [activeVoiceField, fieldValues, onFieldChange]);

  const { isListening, isSupported, toggleListening, stopListening, error: speechError } = useSpeechRecognition(handleTranscript);

  const handleVoiceToggle = (fieldId: string) => {
    if (isListening && activeVoiceField === fieldId) {
      stopListening();
      setActiveVoiceField(null);
    } else {
      if (isListening) {
        stopListening();
      }
      setActiveVoiceField(fieldId);
      setTimeout(() => toggleListening(), 100);
    }
  };

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
              <div className="relative">
                <Textarea
                  id={field.id}
                  value={fieldValues[field.id] || ""}
                  onChange={(e) => onFieldChange(field.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onQuickGenerate && canProceed && !isGenerating && llmConnected) {
                      e.preventDefault();
                      onQuickGenerate();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      (e.target as HTMLTextAreaElement).blur();
                    }
                  }}
                  placeholder={field.placeholder}
                  className="min-h-[80px] pr-12"
                  data-testid={`textarea-wizard-${field.id}`}
                />
                {isSupported && (
                  <Button
                    type="button"
                    size="icon"
                    variant={isListening && activeVoiceField === field.id ? "default" : "ghost"}
                    onClick={() => handleVoiceToggle(field.id)}
                    className={`absolute right-2 top-2 ${isListening && activeVoiceField === field.id ? "bg-red-500 hover:bg-red-600 animate-pulse" : ""}`}
                    data-testid={`button-voice-${field.id}`}
                  >
                    {isListening && activeVoiceField === field.id ? (
                      <MicOff className="h-4 w-4" />
                    ) : (
                      <Mic className="h-4 w-4" />
                    )}
                  </Button>
                )}
                {isListening && activeVoiceField === field.id ? (
                  <p className="text-xs text-red-500 mt-1">Listening... Click mic to stop</p>
                ) : (
                  onQuickGenerate && (
                    <p className="text-xs text-muted-foreground mt-1">⌘+Enter to generate • Esc to cancel</p>
                  )
                )}
              </div>
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

      {speechError && (
        <p className="text-xs text-destructive text-center">{speechError}</p>
      )}

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
