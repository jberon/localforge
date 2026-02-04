import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Users, 
  Code, 
  Layers, 
  Heart, 
  Target,
  MessageSquare,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  ChevronRight,
  Send,
  X,
  Sparkles,
  Loader2
} from "lucide-react";
import type { 
  DreamTeamSettings, 
  DreamTeamPersona, 
  DreamTeamMessage,
  DreamTeamDiscussion 
} from "@shared/schema";

interface DreamTeamPanelProps {
  settings: DreamTeamSettings;
  discussion: DreamTeamDiscussion | null;
  onUserResponse: (response: string) => void;
  onDismiss: () => void;
  isGenerating?: boolean;
}

const iconMap: Record<string, React.ElementType> = {
  code: Code,
  layers: Layers,
  heart: Heart,
  target: Target,
};

const colorMap: Record<string, string> = {
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
  green: "bg-green-500",
  orange: "bg-orange-500",
  cyan: "bg-cyan-500",
  red: "bg-red-500",
  yellow: "bg-yellow-500",
};

const messageTypeIcons: Record<string, React.ElementType> = {
  opinion: MessageSquare,
  concern: AlertTriangle,
  suggestion: Lightbulb,
  approval: CheckCircle2,
  question: HelpCircle,
};

const messageTypeColors: Record<string, string> = {
  opinion: "text-blue-500",
  concern: "text-amber-500",
  suggestion: "text-green-500",
  approval: "text-emerald-500",
  question: "text-purple-500",
};

export function DreamTeamPanel({ 
  settings, 
  discussion, 
  onUserResponse, 
  onDismiss,
  isGenerating 
}: DreamTeamPanelProps) {
  const [userInput, setUserInput] = useState("");
  const [visibleMessages, setVisibleMessages] = useState<number>(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!discussion?.messages) return;
    
    setVisibleMessages(0);
    
    const showNextMessage = (index: number) => {
      if (!isMountedRef.current) return;
      if (index >= discussion.messages.length) return;
      
      setTimeout(() => {
        if (!isMountedRef.current) return;
        setVisibleMessages(index + 1);
        showNextMessage(index + 1);
      }, 800 + Math.random() * 400);
    };
    
    setTimeout(() => {
      if (isMountedRef.current) {
        showNextMessage(0);
      }
    }, 500);
  }, [discussion?.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleMessages]);

  const getPersona = useCallback((personaId: string): DreamTeamPersona | undefined => {
    return settings.personas.find(p => p.id === personaId);
  }, [settings.personas]);

  const handleSubmit = () => {
    if (!userInput.trim()) return;
    onUserResponse(userInput.trim());
    setUserInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!discussion) return null;

  const displayedMessages = discussion.messages.slice(0, visibleMessages);
  const isTyping = visibleMessages < discussion.messages.length;
  const nextTypingPersona = isTyping ? getPersona(discussion.messages[visibleMessages]?.personaId) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <Card className="w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col shadow-2xl">
        <CardHeader className="pb-3 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Users className="w-4 h-4 text-white" />
              </div>
              <span>Dream Team Review</span>
              <Badge variant="outline" className="ml-2">
                {discussion.status === "discussing" ? "Discussing..." : 
                 discussion.status === "awaiting_input" ? "Awaiting Input" : "Resolved"}
              </Badge>
            </CardTitle>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onDismiss}
              data-testid="button-dismiss-dream-team"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {discussion.topic}
          </p>
        </CardHeader>

        <CardContent className="flex-1 overflow-hidden p-0">
          <ScrollArea className="h-[400px] p-4" ref={scrollRef}>
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <p className="font-medium mb-1 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Context
                </p>
                <p className="text-muted-foreground">{discussion.context}</p>
              </div>

              <Separator />

              {displayedMessages.map((message, index) => {
                const persona = getPersona(message.personaId);
                if (!persona) return null;
                
                const Icon = iconMap[persona.avatar || "code"] || Code;
                const TypeIcon = messageTypeIcons[message.type] || MessageSquare;
                
                return (
                  <div 
                    key={`${message.personaId}-${index}`}
                    className="flex gap-3 animate-in slide-in-from-bottom-2 duration-300"
                  >
                    <div className={`w-10 h-10 rounded-full ${colorMap[persona.color] || "bg-gray-500"} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{persona.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          {persona.title}
                        </Badge>
                        <TypeIcon className={`w-4 h-4 ${messageTypeColors[message.type]}`} />
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {message.content}
                      </p>
                    </div>
                  </div>
                );
              })}

              {isTyping && nextTypingPersona && (
                <div className="flex gap-3 animate-in fade-in duration-200">
                  <div className={`w-10 h-10 rounded-full ${colorMap[nextTypingPersona.color] || "bg-gray-500"} flex items-center justify-center flex-shrink-0`}>
                    {(() => {
                      const Icon = iconMap[nextTypingPersona.avatar || "code"] || Code;
                      return <Icon className="w-5 h-5 text-white" />;
                    })()}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{nextTypingPersona.name}</span>
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}

              {discussion.recommendation && !isTyping && (
                <div className="mt-4 p-4 bg-primary/5 border border-primary/20 rounded-lg animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <p className="font-medium flex items-center gap-2 mb-2">
                    <Lightbulb className="w-4 h-4 text-primary" />
                    Team Recommendation
                  </p>
                  <p className="text-sm">{discussion.recommendation}</p>
                </div>
              )}
            </div>
          </ScrollArea>

          {discussion.status === "awaiting_input" && !isTyping && (
            <div className="border-t p-4 space-y-3">
              <p className="text-sm font-medium flex items-center gap-2">
                <ChevronRight className="w-4 h-4 text-primary" />
                Your Response
              </p>
              <div className="flex gap-2">
                <Textarea
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Share your thoughts or provide direction..."
                  rows={2}
                  className="flex-1 resize-none"
                  data-testid="textarea-user-response"
                />
                <Button 
                  onClick={handleSubmit}
                  disabled={!userInput.trim() || isGenerating}
                  className="self-end"
                  data-testid="button-send-response"
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => onUserResponse("proceed")}
                  data-testid="button-proceed"
                >
                  Proceed with recommendation
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => onUserResponse("explore alternatives")}
                  data-testid="button-explore"
                >
                  Explore alternatives
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
