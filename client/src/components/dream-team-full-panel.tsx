import { useState, useEffect, useRef, useCallback, memo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Users, Code, Layers, Heart, Target,
  MessageSquare, Lightbulb, AlertTriangle, CheckCircle2,
  HelpCircle, ChevronRight, Send, Sparkles, Loader2,
  Clock, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  DreamTeamSettings, DreamTeamPersona,
  DreamTeamDiscussion,
} from "@shared/schema";

interface DreamTeamFullPanelProps {
  settings: DreamTeamSettings;
  activeDiscussion: DreamTeamDiscussion | null;
  discussionHistory: DreamTeamDiscussion[];
  onUserResponse: (response: string) => void;
  isGenerating?: boolean;
}

const iconMap: Record<string, React.ElementType> = {
  code: Code, layers: Layers, heart: Heart, target: Target,
};

const colorMap: Record<string, string> = {
  blue: "bg-blue-500", purple: "bg-purple-500", pink: "bg-pink-500",
  green: "bg-green-500", orange: "bg-orange-500", cyan: "bg-cyan-500",
  red: "bg-red-500", yellow: "bg-yellow-500",
};

const messageTypeIcons: Record<string, React.ElementType> = {
  opinion: MessageSquare, concern: AlertTriangle,
  suggestion: Lightbulb, approval: CheckCircle2, question: HelpCircle,
};

const messageTypeColors: Record<string, string> = {
  opinion: "text-blue-500", concern: "text-amber-500",
  suggestion: "text-green-500", approval: "text-emerald-500",
  question: "text-purple-500",
};

export const DreamTeamFullPanel = memo(function DreamTeamFullPanel({
  settings,
  activeDiscussion,
  discussionHistory,
  onUserResponse,
  isGenerating,
}: DreamTeamFullPanelProps) {
  const [selectedDiscussionId, setSelectedDiscussionId] = useState<string | null>(null);
  const [userInput, setUserInput] = useState("");
  const [visibleMessages, setVisibleMessages] = useState<number>(0);
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const viewedDiscussion = selectedDiscussionId
    ? discussionHistory.find(d => d.id === selectedDiscussionId) || activeDiscussion
    : activeDiscussion;

  const isViewingActive = !selectedDiscussionId || selectedDiscussionId === activeDiscussion?.id;

  useEffect(() => {
    if (activeDiscussion) {
      setSelectedDiscussionId(null);
    }
  }, [activeDiscussion?.id]);

  useEffect(() => {
    if (!viewedDiscussion?.messages) return;

    if (!isViewingActive || !activeDiscussion) {
      setVisibleMessages(viewedDiscussion.messages.length);
      return;
    }

    setVisibleMessages(0);
    const showNextMessage = (index: number) => {
      if (!isMountedRef.current) return;
      if (index >= (viewedDiscussion?.messages.length || 0)) return;
      setTimeout(() => {
        if (!isMountedRef.current) return;
        setVisibleMessages(index + 1);
        showNextMessage(index + 1);
      }, 800 + Math.random() * 400);
    };
    setTimeout(() => {
      if (isMountedRef.current) showNextMessage(0);
    }, 500);
  }, [viewedDiscussion?.id, isViewingActive]);

  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
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

  const displayedMessages = viewedDiscussion
    ? viewedDiscussion.messages.slice(0, visibleMessages)
    : [];
  const isTyping = viewedDiscussion
    ? visibleMessages < viewedDiscussion.messages.length
    : false;
  const nextTypingPersona = isTyping && viewedDiscussion
    ? getPersona(viewedDiscussion.messages[visibleMessages]?.personaId)
    : null;

  const allDiscussions = [
    ...(activeDiscussion ? [activeDiscussion] : []),
    ...discussionHistory.filter(d => d.id !== activeDiscussion?.id),
  ];

  if (!viewedDiscussion && allDiscussions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6" data-testid="team-empty-state">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center mb-4">
          <Users className="h-7 w-7 text-muted-foreground/50" />
        </div>
        <p className="text-sm font-medium text-foreground mb-1">No team discussions yet</p>
        <p className="text-xs text-muted-foreground max-w-[240px]">
          When the Dream Team reviews your requests, their conversations will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="dream-team-full-panel">
      <div className="flex items-center justify-between gap-2 px-3 h-10 border-b shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0">
            <Users className="w-3 h-3 text-white" />
          </div>
          <span className="text-sm font-medium truncate">
            {viewedDiscussion?.topic || "Dream Team"}
          </span>
          {viewedDiscussion && (
            <Badge
              variant="outline"
              className={cn("text-[10px] shrink-0",
                viewedDiscussion.status === "resolved" && "text-emerald-500",
                viewedDiscussion.status === "awaiting_input" && "text-amber-500",
                viewedDiscussion.status === "discussing" && "text-blue-500",
              )}
            >
              {viewedDiscussion.status === "discussing" ? "Live" :
                viewedDiscussion.status === "awaiting_input" ? "Awaiting Input" : "Resolved"}
            </Badge>
          )}
        </div>
        {allDiscussions.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHistory(!showHistory)}
            className="gap-1 text-xs shrink-0"
            data-testid="button-toggle-history"
          >
            <Clock className="w-3 h-3" />
            History ({allDiscussions.length})
            <ChevronDown className={cn("w-3 h-3 transition-transform", showHistory && "rotate-180")} />
          </Button>
        )}
      </div>

      {showHistory && (
        <div className="border-b bg-muted/30 max-h-[200px] overflow-y-auto" data-testid="discussion-history-list">
          {allDiscussions.map((disc) => (
            <button
              key={disc.id}
              onClick={() => {
                setSelectedDiscussionId(disc.id === activeDiscussion?.id ? null : disc.id);
                setShowHistory(false);
              }}
              className={cn(
                "flex items-center gap-2 w-full px-3 py-2 text-left hover-elevate",
                (disc.id === viewedDiscussion?.id) && "bg-primary/5"
              )}
              data-testid={`history-item-${disc.id}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{disc.topic}</p>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(disc.createdAt).toLocaleString([], {
                    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                  })}
                  {" \u00b7 "}{disc.messages.length} messages
                </p>
              </div>
              <Badge variant="outline" className="text-[10px] shrink-0">
                {disc.status === "resolved" ? "Done" : disc.status === "discussing" ? "Live" : "Waiting"}
              </Badge>
            </button>
          ))}
        </div>
      )}

      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-3 space-y-3">
          {viewedDiscussion && (
            <div className="bg-muted/50 rounded-md p-2.5 text-xs" data-testid="discussion-context">
              <p className="font-medium mb-1 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                Context
              </p>
              <p className="text-muted-foreground leading-relaxed">{viewedDiscussion.context}</p>
            </div>
          )}

          <Separator />

          {displayedMessages.map((message, index) => {
            const persona = getPersona(message.personaId);
            if (!persona) return null;
            const Icon = iconMap[persona.avatar || "code"] || Code;
            const TypeIcon = messageTypeIcons[message.type] || MessageSquare;

            return (
              <div
                key={`${message.personaId}-${index}`}
                className="flex gap-2.5 animate-in slide-in-from-bottom-2 duration-300"
                data-testid={`team-message-${index}`}
              >
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                  colorMap[persona.color] || "bg-gray-500"
                )}>
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium">{persona.name}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {persona.title}
                    </Badge>
                    <TypeIcon className={cn("w-3.5 h-3.5", messageTypeColors[message.type])} />
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {message.content}
                  </p>
                </div>
              </div>
            );
          })}

          {isTyping && nextTypingPersona && (
            <div className="flex gap-2.5 animate-in fade-in duration-200">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                colorMap[nextTypingPersona.color] || "bg-gray-500"
              )}>
                {(() => {
                  const Icon = iconMap[nextTypingPersona.avatar || "code"] || Code;
                  return <Icon className="w-4 h-4 text-white" />;
                })()}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{nextTypingPersona.name}</span>
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          {viewedDiscussion?.recommendation && !isTyping && (
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-md animate-in fade-in slide-in-from-bottom-2 duration-500" data-testid="team-recommendation">
              <p className="font-medium flex items-center gap-2 mb-1.5 text-sm">
                <Lightbulb className="w-4 h-4 text-primary" />
                Team Recommendation
              </p>
              <p className="text-sm leading-relaxed">{viewedDiscussion.recommendation}</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {isViewingActive && activeDiscussion?.status === "awaiting_input" && !isTyping && (
        <div className="border-t p-3 space-y-2 shrink-0" data-testid="team-input-area">
          <p className="text-xs font-medium flex items-center gap-1.5">
            <ChevronRight className="w-3.5 h-3.5 text-primary" />
            Your Response
          </p>
          <div className="flex gap-2">
            <Textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Share your thoughts or provide direction..."
              rows={2}
              className="flex-1 resize-none text-sm"
              data-testid="textarea-team-response"
            />
            <Button
              onClick={handleSubmit}
              disabled={!userInput.trim() || isGenerating}
              className="self-end"
              size="icon"
              data-testid="button-send-team-response"
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
              className="text-xs"
              data-testid="button-proceed"
            >
              Proceed with recommendation
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onUserResponse("explore alternatives")}
              className="text-xs"
              data-testid="button-explore"
            >
              Explore alternatives
            </Button>
          </div>
        </div>
      )}

      {selectedDiscussionId && selectedDiscussionId !== activeDiscussion?.id && (
        <div className="border-t p-2 shrink-0 text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedDiscussionId(null)}
            className="text-xs gap-1"
            data-testid="button-back-to-active"
          >
            Back to active discussion
          </Button>
        </div>
      )}
    </div>
  );
});
