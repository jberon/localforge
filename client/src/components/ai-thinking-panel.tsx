import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Brain, 
  Hammer, 
  Search, 
  CheckCircle2, 
  AlertTriangle,
  Sparkles,
  FileCode,
  TestTube,
  FileText,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ThinkingEntry {
  id: string;
  timestamp: number;
  type: "thinking" | "action" | "result" | "search" | "file";
  model?: string;
  content: string;
  phase?: string;
}

interface AIThinkingPanelProps {
  phase: string | null;
  thinking: { model: string; content: string } | null;
  generationPhase: string | null;
  isActive: boolean;
  streamingCode?: string;
}

const phaseConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  planning: { icon: Brain, color: "text-purple-500", label: "Planning" },
  searching: { icon: Search, color: "text-blue-500", label: "Researching" },
  building: { icon: Hammer, color: "text-orange-500", label: "Building" },
  validating: { icon: CheckCircle2, color: "text-green-500", label: "Validating" },
  fixing: { icon: AlertTriangle, color: "text-amber-500", label: "Fixing" },
  testing: { icon: TestTube, color: "text-cyan-500", label: "Testing" },
  quality_check: { icon: Sparkles, color: "text-pink-500", label: "Quality Check" },
  documenting: { icon: FileText, color: "text-indigo-500", label: "Documenting" },
};

export function AIThinkingPanel({ 
  phase, 
  thinking, 
  generationPhase,
  isActive,
  streamingCode 
}: AIThinkingPanelProps) {
  const [entries, setEntries] = useState<ThinkingEntry[]>([]);
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastThinkingRef = useRef<string | null>(null);
  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (thinking?.content && thinking.content !== lastThinkingRef.current) {
      lastThinkingRef.current = thinking.content;
      
      const newEntry: ThinkingEntry = {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: Date.now(),
        type: thinking.model === "web_search" ? "search" : "thinking",
        model: thinking.model,
        content: thinking.content,
        phase: phase || undefined,
      };
      
      setEntries(prev => [...prev.slice(-50), newEntry]);
      
      setIsTyping(true);
      setDisplayedText("");
      
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
      }
      
      let charIndex = 0;
      const text = thinking.content;
      typingIntervalRef.current = setInterval(() => {
        if (charIndex < text.length) {
          setDisplayedText(text.slice(0, charIndex + 1));
          charIndex++;
        } else {
          setIsTyping(false);
          if (typingIntervalRef.current) {
            clearInterval(typingIntervalRef.current);
          }
        }
      }, 15);
    }
    
    return () => {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
      }
    };
  }, [thinking, phase]);

  const lastGenPhaseRef = useRef<string | null>(null);
  
  useEffect(() => {
    if (generationPhase && 
        (generationPhase.includes("Generating") || generationPhase.includes("Writing")) &&
        generationPhase !== lastGenPhaseRef.current) {
      lastGenPhaseRef.current = generationPhase;
      const newEntry: ThinkingEntry = {
        id: `file-${Date.now()}`,
        timestamp: Date.now(),
        type: "file",
        content: generationPhase,
        phase: phase || undefined,
      };
      setEntries(prev => [...prev.slice(-50), newEntry]);
    }
  }, [generationPhase, phase]);

  useEffect(() => {
    if (!isActive) {
      setEntries([]);
      setDisplayedText("");
      lastThinkingRef.current = null;
      lastGenPhaseRef.current = null;
    }
  }, [isActive]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [entries, displayedText, scrollToBottom]);

  if (!isActive) return null;

  const currentPhase = phase ? phaseConfig[phase] : null;
  const PhaseIcon = currentPhase?.icon || Zap;

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-background to-muted/30 overflow-hidden" data-testid="ai-thinking-panel">
      <CardContent className="p-0">
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/50">
          <div className="relative">
            <PhaseIcon className={cn("h-4 w-4", currentPhase?.color || "text-primary")} />
            {isActive && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            )}
          </div>
          <span className="text-sm font-medium">
            {currentPhase?.label || "AI Working"}
          </span>
          {thinking?.model && thinking.model !== "web_search" && (
            <Badge variant="outline" className="text-xs ml-auto">
              {thinking.model.split("/").pop()?.slice(0, 20) || "LLM"}
            </Badge>
          )}
        </div>
        
        <div className="h-[200px] overflow-y-auto" ref={scrollRef}>
          <div className="p-3 space-y-2">
            {entries.slice(-10).map((entry) => (
              <div 
                key={entry.id} 
                className={cn(
                  "text-xs animate-in fade-in slide-in-from-bottom-2 duration-300",
                  entry.type === "search" && "text-blue-500",
                  entry.type === "file" && "text-green-500",
                  entry.type === "thinking" && "text-muted-foreground"
                )}
              >
                {entry.type === "search" && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <Search className="h-3 w-3" />
                    <span className="font-medium">Web Search</span>
                  </div>
                )}
                {entry.type === "file" && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <FileCode className="h-3 w-3" />
                    <span className="font-medium">File Generation</span>
                  </div>
                )}
                <p className="leading-relaxed pl-4 border-l-2 border-muted">
                  {entry.content}
                </p>
              </div>
            ))}
            
            {isTyping && displayedText && (
              <div className="text-xs text-foreground animate-in fade-in">
                <div className="flex items-center gap-1.5 mb-1">
                  <Brain className="h-3 w-3 text-purple-500 animate-pulse" />
                  <span className="font-medium text-purple-500">Thinking...</span>
                </div>
                <p className="leading-relaxed pl-4 border-l-2 border-purple-500/50">
                  {displayedText}
                  <span className="inline-block w-1.5 h-3.5 bg-primary ml-0.5 animate-pulse" />
                </p>
              </div>
            )}
            
            {streamingCode && phase === "building" && (
              <div className="text-xs text-muted-foreground mt-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <Hammer className="h-3 w-3 text-orange-500 animate-bounce" />
                  <span className="font-medium text-orange-500">Generating Code...</span>
                </div>
                <pre className="bg-muted/50 rounded p-2 overflow-hidden max-h-20 text-[10px] font-mono">
                  {streamingCode.slice(-500)}
                </pre>
              </div>
            )}
          </div>
        </div>
        
        {generationPhase && (
          <div className="px-3 py-2 border-t bg-muted/30 flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-xs text-muted-foreground truncate">
              {generationPhase}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
