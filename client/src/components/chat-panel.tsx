import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, User, Sparkles, FileCode, Loader2, Mic, MicOff, Paperclip, Image } from "lucide-react";
import type { Message, DataModel, MessageAttachment } from "@shared/schema";
import { GenerationWizard } from "./generation-wizard";
import { WorkingIndicator } from "./working-indicator";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useFileAttachments, type Attachment } from "@/hooks/use-file-attachments";
import { AttachmentPreview, DropZoneOverlay } from "./attachment-preview";
import { ActionGroupRow, type Action } from "./action-group-row";
import { StatusIndicator, type StatusType } from "./status-indicator";

interface QueueStatus {
  pending: number;
  active: number;
  maxQueueSize?: number;
  utilizationPercent?: number;
  isOverloaded?: boolean;
  isFull?: boolean;
}

interface ChatPanelProps {
  messages: Message[];
  isLoading: boolean;
  loadingPhase?: string | null;
  currentActions?: Action[];
  onSendMessage: (content: string, dataModel?: DataModel, attachments?: Attachment[], temperature?: number) => void;
  llmConnected: boolean | null;
  onCheckConnection: () => void;
  queueStatus?: QueueStatus | null;
}

// Memoized message content formatter - prevents re-parsing unchanged content
const FormattedMessageContent = memo(function FormattedMessageContent({ content }: { content: string }) {
  const elements = useMemo(() => {
    const lines = content.split('\n');
    const result: JSX.Element[] = [];
    let currentSection: string[] = [];
    let sectionIndex = 0;

    const flushSection = () => {
      if (currentSection.length > 0) {
        result.push(
          <p key={`section-${sectionIndex}`} className="text-sm leading-relaxed whitespace-pre-wrap">
            {currentSection.join('\n')}
          </p>
        );
        currentSection = [];
        sectionIndex++;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.match(/^```/)) {
        flushSection();
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].match(/^```/)) {
          codeLines.push(lines[i]);
          i++;
        }
        result.push(
          <div key={`code-${sectionIndex}`} className="my-2 rounded-md bg-muted/50 border overflow-hidden" data-testid={`code-block-${sectionIndex}`}>
            <div className="px-3 py-1.5 bg-muted/80 border-b flex items-center gap-2">
              <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Code</span>
            </div>
            <pre className="p-3 text-xs overflow-x-auto">
              <code>{codeLines.join('\n')}</code>
            </pre>
          </div>
        );
        sectionIndex++;
      } else if (line.startsWith('# ')) {
        flushSection();
        result.push(
          <h3 key={`h-${sectionIndex}`} className="text-base font-semibold mt-3 mb-1">
            {line.substring(2)}
          </h3>
        );
        sectionIndex++;
      } else if (line.startsWith('## ')) {
        flushSection();
        result.push(
          <h4 key={`h-${sectionIndex}`} className="text-sm font-semibold mt-2 mb-1">
            {line.substring(3)}
          </h4>
        );
        sectionIndex++;
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        flushSection();
        result.push(
          <div key={`li-${sectionIndex}`} className="flex gap-2 text-sm pl-2">
            <span className="text-muted-foreground">•</span>
            <span>{line.substring(2)}</span>
          </div>
        );
        sectionIndex++;
      } else if (line.match(/^\d+\. /)) {
        flushSection();
        const num = line.match(/^(\d+)\. /)?.[1];
        result.push(
          <div key={`li-${sectionIndex}`} className="flex gap-2 text-sm pl-2">
            <span className="text-muted-foreground min-w-[1.25rem]">{num}.</span>
            <span>{line.replace(/^\d+\. /, '')}</span>
          </div>
        );
        sectionIndex++;
      } else {
        currentSection.push(line);
      }
    }

    flushSection();
    return result;
  }, [content]);

  return <>{elements}</>;
});

function getStatusFromPhase(phase: string | null | undefined): StatusType {
  if (!phase) return "thinking";
  const lower = phase.toLowerCase();
  if (lower.includes("build")) return "building";
  if (lower.includes("generat")) return "generating";
  if (lower.includes("optimi")) return "optimizing";
  if (lower.includes("search")) return "searching";
  if (lower.includes("edit") || lower.includes("writ")) return "editing";
  if (lower.includes("check") || lower.includes("valid")) return "checking";
  if (lower.includes("complete") || lower.includes("done")) return "complete";
  return "thinking";
}

export function ChatPanel({ messages, isLoading, loadingPhase, currentActions, onSendMessage, llmConnected, onCheckConnection, queueStatus }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTranscript = useCallback((transcript: string) => {
    setInput((prev) => prev + (prev ? " " : "") + transcript);
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

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((input.trim() || hasAttachments) && !isLoading) {
      onSendMessage(input.trim(), undefined, attachments.length > 0 ? attachments : undefined);
      setInput("");
      clearAttachments();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit(e);
    } else if (e.key === "Escape") {
      e.preventDefault();
      textareaRef.current?.blur();
      setInput("");
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {messages.length === 0 ? (
        <GenerationWizard
          onGenerate={onSendMessage}
          isGenerating={isLoading}
          llmConnected={llmConnected}
          onCheckConnection={onCheckConnection}
        />
      ) : (
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
            {messages.map((message, index) => (
              <div
                key={message.id}
                className="animate-in fade-in slide-up"
                style={{ animationDelay: `${index * 50}ms` }}
                data-testid={`message-${message.role}-${message.id}`}
              >
                {message.role === "user" ? (
                  <div className="flex gap-3 items-start">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-secondary flex items-center justify-center" data-testid={`avatar-user-${message.id}`}>
                      <User className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 pt-0.5">
                      <p className="text-sm font-medium text-foreground leading-relaxed" data-testid={`text-user-message-${message.id}`}>
                        {message.content}
                      </p>
                      {message.attachments && message.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2" data-testid={`attachments-${message.id}`}>
                          {message.attachments.map((attachment) => (
                            <div key={attachment.id} className="flex items-center gap-2 p-2 rounded-md border bg-muted/30">
                              {attachment.type.startsWith("image/") && attachment.preview ? (
                                <img 
                                  src={attachment.preview} 
                                  alt={attachment.name}
                                  className="w-12 h-12 rounded object-cover"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                                  <FileCode className="h-5 w-5 text-muted-foreground" />
                                </div>
                              )}
                              <span className="text-xs text-muted-foreground truncate max-w-[100px]" title={attachment.name}>
                                {attachment.name}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-1" data-testid={`text-timestamp-${message.id}`}>
                        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-shrink-0 w-7 h-7 rounded-md bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center" data-testid={`avatar-assistant-${message.id}`}>
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <span className="text-xs text-muted-foreground" data-testid={`text-timestamp-${message.id}`}>
                        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {message.actions && message.actions.length > 0 && (
                      <div className="pl-9">
                        <ActionGroupRow 
                          actions={message.actions as Action[]} 
                          data-testid={`action-group-${message.id}`}
                        />
                      </div>
                    )}
                    {message.content && (
                      <div className="pl-9 space-y-2" data-testid={`text-assistant-message-${message.id}`}>
                        <FormattedMessageContent content={message.content} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            
            {isLoading && (
              <div className="animate-in fade-in slide-up space-y-3" data-testid="message-loading">
                <div className="flex items-center gap-2">
                  <div className="flex-shrink-0 w-7 h-7 rounded-md bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                    <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
                  </div>
                </div>
                <div className="pl-9 space-y-2">
                  {currentActions && currentActions.length > 0 && (
                    <ActionGroupRow 
                      actions={currentActions}
                      data-testid="action-group-current"
                    />
                  )}
                  <StatusIndicator 
                    status={getStatusFromPhase(loadingPhase)}
                    text={loadingPhase || undefined}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {messages.length > 0 && (
        <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="max-w-3xl mx-auto p-4">
            <form onSubmit={handleSubmit}>
              {hasAttachments && (
                <div className="mb-3">
                  <AttachmentPreview 
                    attachments={attachments} 
                    onRemove={removeAttachment}
                    compact
                  />
                </div>
              )}
              <div className="relative" {...dragHandlers}>
                <DropZoneOverlay isDragging={isDragging} />
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={acceptString}
                  onChange={handleFileInputChange}
                  className="hidden"
                  data-testid="input-file-attachment"
                />
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe what you want to change... (drop files here)"
                  className="resize-none pr-32 text-sm"
                  rows={3}
                  disabled={isLoading}
                  data-testid="input-chat"
                />
                <div className="absolute right-2 bottom-2 flex items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={openFilePicker}
                    disabled={isLoading}
                    data-testid="button-attach-file"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  {isSupported && (
                    <Button
                      type="button"
                      size="icon"
                      variant={isListening ? "default" : "ghost"}
                      onClick={toggleListening}
                      disabled={isLoading}
                      className={isListening ? "bg-red-500 hover:bg-red-600 animate-pulse" : ""}
                      data-testid="button-voice-input"
                    >
                      {isListening ? (
                        <MicOff className="h-4 w-4" />
                      ) : (
                        <Mic className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                  <Button
                    type="submit"
                    size="icon"
                    disabled={(!input.trim() && !hasAttachments) || isLoading || queueStatus?.isFull}
                    data-testid="button-send"
                    title={queueStatus?.isFull ? "Queue is full - please wait" : queueStatus?.isOverloaded ? `Queue ${queueStatus.utilizationPercent}% full` : "Send message"}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                {isListening ? (
                  <span className="text-red-500">Listening... Click mic to stop</span>
                ) : (
                  "Enter to send • Shift+Enter for new line • Drop files to attach"
                )}
              </p>
              {speechError && (
                <p className="text-xs text-destructive mt-1 text-center">{speechError}</p>
              )}
              {attachmentError && (
                <p className="text-xs text-destructive mt-1 text-center">{attachmentError}</p>
              )}
              {queueStatus?.isOverloaded && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 text-center" data-testid="text-queue-warning">
                  {queueStatus.isFull 
                    ? "Request queue is full - please wait before sending more"
                    : `Queue ${queueStatus.utilizationPercent}% full (${queueStatus.pending}/${queueStatus.maxQueueSize})`}
                </p>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
