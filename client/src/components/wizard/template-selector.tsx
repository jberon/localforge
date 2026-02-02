import { useState, useCallback } from "react";
import { TEMPLATES } from "./templates";
import type { TemplateConfig, ProductionTemplateConfig, TemplateCategory } from "./types";
import { FreeformPrompt } from "./freeform-prompt";
import { trackEvent } from "@/lib/analytics";
import type { LLMSettings, ProductionModules } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, X, Settings2, Mic, MicOff, Paperclip } from "lucide-react";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useFileAttachments, type Attachment } from "@/hooks/use-file-attachments";
import { AttachmentPreview, DropZoneOverlay } from "../attachment-preview";

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
  onSelect,
  onSelectProduction,
  onGenerate,
  isGenerating,
  llmConnected,
  onCheckConnection,
  settings,
}: TemplateSelectorProps) {
  // Always use production mode - no toggle needed
  const category: TemplateCategory = "quick";
  const [quickStartTemplate, setQuickStartTemplate] = useState<TemplateConfig | null>(null);
  const [quickStartDescription, setQuickStartDescription] = useState("");

  const handleTranscript = useCallback((transcript: string) => {
    setQuickStartDescription((prev) => prev + (prev ? " " : "") + transcript);
  }, []);

  const { isListening, isSupported, toggleListening, error: speechError } = useSpeechRecognition(handleTranscript);

  const {
    attachments,
    error: attachmentError,
    isDragging,
    fileInputRef,
    removeAttachment,
    clearAttachments,
    openFilePicker,
    handleFileInputChange,
    dragHandlers,
    acceptString,
    hasAttachments,
  } = useFileAttachments();

  const handleQuickStart = (template: TemplateConfig) => {
    setQuickStartTemplate(template);
    setQuickStartDescription("");
    clearAttachments();
  };

  const handleQuickGenerate = () => {
    if (!quickStartTemplate || !llmConnected) return;
    const description = quickStartDescription.trim() || quickStartTemplate.name;
    let prompt = `Create a ${quickStartTemplate.name.toLowerCase()} app: ${description}. Make it modern, clean, and fully functional.`;
    
    if (hasAttachments) {
      prompt += `\n\nUser has attached ${attachments.length} file(s) for reference:`;
      attachments.forEach((a) => {
        if (a.type.startsWith("image/")) {
          prompt += `\n- Image: ${a.name} (use this as visual reference for the design)`;
        } else if (a.content) {
          prompt += `\n- File: ${a.name}\n\`\`\`\n${a.content.slice(0, 2000)}${a.content.length > 2000 ? "\n... (truncated)" : ""}\n\`\`\``;
        }
      });
    }
    
    trackEvent("generation_started", undefined, { template: quickStartTemplate.id, mode: "quick_start", hasAttachments });
    onGenerate(prompt, undefined, attachments.length > 0 ? attachments : undefined);
    clearAttachments();
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
                    data-testid="button-close-quickstart"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="space-y-4">
                  {hasAttachments && (
                    <AttachmentPreview 
                      attachments={attachments} 
                      onRemove={removeAttachment}
                      compact
                    />
                  )}
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept={acceptString}
                      onChange={handleFileInputChange}
                      className="hidden"
                      data-testid="input-quickstart-file"
                    />
                    <div className="relative" {...dragHandlers}>
                      <DropZoneOverlay isDragging={isDragging} />
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
                        className="h-11 pr-20"
                        autoFocus
                        data-testid="input-quickstart-description"
                      />
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={openFilePicker}
                          disabled={isGenerating}
                          className="px-2"
                          data-testid="button-quickstart-attach"
                        >
                          <Paperclip className="h-4 w-4" />
                        </Button>
                        {isSupported && (
                          <Button
                            type="button"
                            size="sm"
                            variant={isListening ? "default" : "ghost"}
                            onClick={toggleListening}
                            disabled={isGenerating}
                            className={`px-2 ${isListening ? "bg-red-500 hover:bg-red-600 animate-pulse" : ""}`}
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
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {isListening ? (
                        <span className="text-red-500">Listening... Click mic to stop</span>
                      ) : (
                        `Enter to generate • Drop files to attach${isSupported ? " • Click mic to speak" : ""}`
                      )}
                    </p>
                    {speechError && (
                      <p className="text-xs text-destructive mt-1">{speechError}</p>
                    )}
                    {attachmentError && (
                      <p className="text-xs text-destructive mt-1">{attachmentError}</p>
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
