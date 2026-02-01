import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, User, Sparkles, FileCode, Loader2, Mic, MicOff } from "lucide-react";
import type { Message, DataModel } from "@shared/schema";
import { GenerationWizard } from "./generation-wizard";
import { WorkingIndicator } from "./working-indicator";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";

interface ChatPanelProps {
  messages: Message[];
  isLoading: boolean;
  loadingPhase?: string | null;
  onSendMessage: (content: string, dataModel?: DataModel) => void;
  llmConnected: boolean | null;
  onCheckConnection: () => void;
}

function formatMessageContent(content: string): JSX.Element[] {
  const lines = content.split('\n');
  const elements: JSX.Element[] = [];
  let currentSection: string[] = [];
  let sectionIndex = 0;

  const flushSection = () => {
    if (currentSection.length > 0) {
      elements.push(
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
      elements.push(
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
      elements.push(
        <h3 key={`h-${sectionIndex}`} className="text-base font-semibold mt-3 mb-1">
          {line.substring(2)}
        </h3>
      );
      sectionIndex++;
    } else if (line.startsWith('## ')) {
      flushSection();
      elements.push(
        <h4 key={`h-${sectionIndex}`} className="text-sm font-semibold mt-2 mb-1">
          {line.substring(3)}
        </h4>
      );
      sectionIndex++;
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      flushSection();
      elements.push(
        <div key={`li-${sectionIndex}`} className="flex gap-2 text-sm pl-2">
          <span className="text-muted-foreground">•</span>
          <span>{line.substring(2)}</span>
        </div>
      );
      sectionIndex++;
    } else if (line.match(/^\d+\. /)) {
      flushSection();
      const num = line.match(/^(\d+)\. /)?.[1];
      elements.push(
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
  return elements;
}

export function ChatPanel({ messages, isLoading, loadingPhase, onSendMessage, llmConnected, onCheckConnection }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTranscript = useCallback((transcript: string) => {
    setInput((prev) => prev + (prev ? " " : "") + transcript);
  }, []);

  const { isListening, isSupported, toggleListening, error: speechError } = useSpeechRecognition(handleTranscript);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
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
                      <p className="text-xs text-muted-foreground mt-1" data-testid={`text-timestamp-${message.id}`}>
                        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-shrink-0 w-7 h-7 rounded-md bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center" data-testid={`avatar-assistant-${message.id}`}>
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <span className="text-xs text-muted-foreground" data-testid={`text-timestamp-${message.id}`}>
                        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="pl-9 space-y-2" data-testid={`text-assistant-message-${message.id}`}>
                      {formatMessageContent(message.content)}
                    </div>
                  </div>
                )}
              </div>
            ))}
            
            {isLoading && (
              <div className="animate-in fade-in slide-up" data-testid="message-loading">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-md bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                    <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
                  </div>
                </div>
                <div className="pl-9">
                  <WorkingIndicator text={loadingPhase || "Working"} />
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="status-analyzing">
                      <div className="w-4 h-4 rounded border border-primary/30 flex items-center justify-center">
                        <div className="w-2 h-2 bg-primary/50 rounded-sm animate-pulse" />
                      </div>
                      <span>{loadingPhase || "Analyzing your request..."}</span>
                    </div>
                  </div>
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
              <div className="relative">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe what you want to change..."
                  className="resize-none pr-24 text-sm"
                  rows={3}
                  disabled={isLoading}
                  data-testid="input-chat"
                />
                <div className="absolute right-2 bottom-2 flex items-center gap-1">
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
                    disabled={!input.trim() || isLoading}
                    data-testid="button-send"
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
                  "Press Enter to send, Shift+Enter for new line"
                )}
              </p>
              {speechError && (
                <p className="text-xs text-destructive mt-1 text-center">{speechError}</p>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
