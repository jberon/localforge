import { useState, useEffect, useRef, useCallback, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Users,
  Brain,
  Hammer,
  Search,
  Lightbulb,
  Target,
  Palette,
  Shield,
  MessageSquare,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CORE_DREAM_TEAM } from "@shared/schema";

interface ThinkingMessage {
  id: string;
  timestamp: number;
  personaId: string;
  personaName: string;
  personaTitle: string;
  personaColor: string;
  personaIcon: string;
  content: string;
  phase: "planning" | "building" | "searching" | "validating";
  type: "thinking" | "suggestion" | "concern" | "decision";
}

interface DreamTeamThinkingTabProps {
  thinking: { model: string; content: string } | null;
  phase: string | null;
  isActive: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  target: Target,
  layers: Brain,
  palette: Palette,
  code: Hammer,
  shield: Shield,
  brain: Brain,
  lightbulb: Lightbulb,
  zap: Zap,
  search: Search,
};

const colorMap: Record<string, string> = {
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
  green: "bg-green-500",
  orange: "bg-orange-500",
  cyan: "bg-cyan-500",
  amber: "bg-amber-500",
  violet: "bg-violet-500",
};

// Map model type (planner/builder) to appropriate Dream Team personas
const modelPersonaMapping: Record<string, string[]> = {
  planner: ["marty-cagan", "martin-fowler"], // Product vision + Architecture
  builder: ["martin-fowler", "kent-beck"],   // Architecture + Quality/TDD
  web_search: ["ben-thompson"],               // Strategy/Research
};

// Fallback phase mapping when model info isn't available
const phasePersonaMapping: Record<string, string[]> = {
  planning: ["marty-cagan", "martin-fowler"],
  building: ["martin-fowler", "kent-beck"],
  searching: ["ben-thompson"],
  validating: ["kent-beck", "julie-zhuo"],
  fixing: ["martin-fowler", "kent-beck"],
};

function getPersonaForModel(model: string | undefined, phase: string, messageIndex: number): typeof CORE_DREAM_TEAM[0] | null {
  // First priority: use model type (planner/builder) for persona selection
  const personaIds = model && modelPersonaMapping[model] 
    ? modelPersonaMapping[model]
    : phasePersonaMapping[phase] || phasePersonaMapping.planning;
  
  const personaId = personaIds[messageIndex % personaIds.length];
  return CORE_DREAM_TEAM.find(p => p.id === personaId) || CORE_DREAM_TEAM[0];
}

function classifyMessageType(content: string): ThinkingMessage["type"] {
  const lowerContent = content.toLowerCase();
  if (lowerContent.includes("concern") || lowerContent.includes("issue") || lowerContent.includes("problem")) {
    return "concern";
  }
  if (lowerContent.includes("suggest") || lowerContent.includes("recommend") || lowerContent.includes("should")) {
    return "suggestion";
  }
  if (lowerContent.includes("decided") || lowerContent.includes("will use") || lowerContent.includes("implementing")) {
    return "decision";
  }
  return "thinking";
}

const typeConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  thinking: { icon: Brain, color: "text-purple-500" },
  suggestion: { icon: Lightbulb, color: "text-green-500" },
  concern: { icon: Shield, color: "text-amber-500" },
  decision: { icon: Target, color: "text-blue-500" },
};

function ThinkingMessageBubble({ message, isLatest }: { message: ThinkingMessage; isLatest: boolean }) {
  const IconComponent = iconMap[message.personaIcon] || Brain;
  const TypeIcon = typeConfig[message.type]?.icon || MessageSquare;
  
  return (
    <div 
      className={cn(
        "flex gap-3 p-3 rounded-lg transition-all",
        isLatest && "bg-primary/5 border border-primary/20",
        !isLatest && "opacity-80"
      )}
      data-testid={`thinking-message-${message.id}`}
    >
      <div className={cn(
        "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0",
        colorMap[message.personaColor] || "bg-purple-500"
      )}>
        <IconComponent className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm">{message.personaName}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {message.personaTitle}
          </Badge>
          <TypeIcon className={cn("w-3.5 h-3.5 ml-auto", typeConfig[message.type]?.color)} />
        </div>
        <p className={cn(
          "text-sm leading-relaxed",
          isLatest ? "text-foreground" : "text-muted-foreground"
        )}>
          {message.content}
        </p>
        {isLatest && (
          <div className="flex items-center gap-1 mt-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] text-muted-foreground">Active</span>
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator({ persona }: { persona: typeof CORE_DREAM_TEAM[0] }) {
  const IconComponent = iconMap[persona.avatar] || Brain;
  
  return (
    <div className="flex gap-3 p-3 animate-in fade-in duration-200">
      <div className={cn(
        "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0",
        colorMap[persona.color] || "bg-purple-500"
      )}>
        <IconComponent className="w-4 h-4 text-white" />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{persona.name}</span>
        <div className="flex gap-1">
          <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}

export const DreamTeamThinkingTab = memo(function DreamTeamThinkingTab({
  thinking,
  phase,
  isActive,
  isExpanded = true,
  onToggleExpand,
}: DreamTeamThinkingTabProps) {
  const [messages, setMessages] = useState<ThinkingMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [typingPersona, setTypingPersona] = useState<typeof CORE_DREAM_TEAM[0] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastContentRef = useRef<string | null>(null);
  const messageCountRef = useRef(0);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (thinking?.content && thinking.content !== lastContentRef.current) {
      lastContentRef.current = thinking.content;
      
      // Clear any existing timeout to prevent stale updates
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      const currentPhase = phase || "planning";
      // Use model type (planner/builder) for persona selection
      const persona = getPersonaForModel(thinking.model, currentPhase, messageCountRef.current);
      messageCountRef.current++;
      
      if (!persona) return;

      setIsTyping(true);
      setTypingPersona(persona);

      const typingDelay = Math.min(500 + thinking.content.length * 5, 1500);
      
      typingTimeoutRef.current = setTimeout(() => {
        const newMessage: ThinkingMessage = {
          id: `${Date.now()}-${Math.random()}`,
          timestamp: Date.now(),
          personaId: persona.id,
          personaName: persona.name,
          personaTitle: persona.title,
          personaColor: persona.color,
          personaIcon: persona.avatar,
          content: thinking.content,
          phase: currentPhase as ThinkingMessage["phase"],
          type: classifyMessageType(thinking.content),
        };
        
        setMessages(prev => [...prev.slice(-30), newMessage]);
        setIsTyping(false);
        setTypingPersona(null);
        typingTimeoutRef.current = null;
      }, typingDelay);
    }
    
    // Cleanup timeout on unmount or when dependencies change
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [thinking, phase]);

  useEffect(() => {
    if (!isActive) {
      // Clear timeout when becoming inactive
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      setMessages([]);
      lastContentRef.current = null;
      messageCountRef.current = 0;
      setIsTyping(false);
      setTypingPersona(null);
    }
  }, [isActive]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  const phaseConfig: Record<string, { label: string; color: string }> = {
    planning: { label: "Planning Session", color: "text-purple-500" },
    building: { label: "Build Discussion", color: "text-orange-500" },
    searching: { label: "Research Mode", color: "text-blue-500" },
    validating: { label: "Quality Review", color: "text-green-500" },
    fixing: { label: "Problem Solving", color: "text-amber-500" },
  };

  const currentPhaseConfig = phaseConfig[phase || "planning"] || phaseConfig.planning;

  return (
    <Card className="border-border/50 bg-card/80" data-testid="dream-team-thinking-tab">
      <CardHeader className="py-2 px-3 flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Users className="h-4 w-4 text-primary" />
            {isActive && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            )}
          </div>
          <CardTitle className="text-sm">Dream Team</CardTitle>
          {isActive && (
            <Badge 
              variant="outline" 
              className={cn("text-[10px]", currentPhaseConfig.color)}
            >
              {currentPhaseConfig.label}
            </Badge>
          )}
        </div>
        {onToggleExpand && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleExpand}
            data-testid="button-toggle-thinking-tab"
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        )}
      </CardHeader>

      {isExpanded && (
        <CardContent className="p-0">
          <Tabs defaultValue="discussion" className="w-full">
            <TabsList className="w-full rounded-none border-b h-8">
              <TabsTrigger value="discussion" className="flex-1 text-xs h-7" data-testid="tab-discussion">
                <MessageSquare className="h-3 w-3 mr-1" />
                Discussion
              </TabsTrigger>
              <TabsTrigger value="insights" className="flex-1 text-xs h-7" data-testid="tab-insights">
                <Sparkles className="h-3 w-3 mr-1" />
                Insights
              </TabsTrigger>
            </TabsList>

            <TabsContent value="discussion" className="m-0">
              <ScrollArea className="h-[280px]" ref={scrollRef}>
                <div className="p-2 space-y-1">
                  {!isActive && messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-[240px] text-center">
                      <Users className="h-8 w-8 text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Dream Team discussion will appear here
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        Watch the team think and ideate during generation
                      </p>
                    </div>
                  )}
                  
                  {messages.map((message, index) => (
                    <ThinkingMessageBubble
                      key={message.id}
                      message={message}
                      isLatest={index === messages.length - 1 && !isTyping}
                    />
                  ))}
                  
                  {isTyping && typingPersona && (
                    <TypingIndicator persona={typingPersona} />
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="insights" className="m-0 p-3">
              <div className="space-y-3">
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium mb-2 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    Team Composition
                  </p>
                  <div className="space-y-2">
                    {CORE_DREAM_TEAM.map((persona) => {
                      const IconComponent = iconMap[persona.avatar] || Brain;
                      const messageCount = messages.filter(m => m.personaId === persona.id).length;
                      return (
                        <div 
                          key={persona.id}
                          className="flex items-center gap-2 p-2 rounded border bg-muted/30"
                          data-testid={`insight-persona-${persona.id}`}
                        >
                          <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center",
                            colorMap[persona.color] || "bg-purple-500"
                          )}>
                            <IconComponent className="w-3 h-3 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium">{persona.name}</span>
                              <span className="text-[10px] text-muted-foreground">{persona.expertise}</span>
                            </div>
                          </div>
                          {messageCount > 0 && (
                            <Badge variant="secondary" className="text-[10px]">
                              {messageCount}
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {messages.length > 0 && (
                  <div className="text-xs pt-2 border-t">
                    <p className="font-medium mb-1.5">Session Stats</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 rounded bg-muted/30 text-center">
                        <span className="block text-lg font-semibold">{messages.length}</span>
                        <span className="text-muted-foreground">Messages</span>
                      </div>
                      <div className="p-2 rounded bg-muted/30 text-center">
                        <span className="block text-lg font-semibold">
                          {new Set(messages.map(m => m.personaId)).size}
                        </span>
                        <span className="text-muted-foreground">Contributors</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      )}
    </Card>
  );
});
