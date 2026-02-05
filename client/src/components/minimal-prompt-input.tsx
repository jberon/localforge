import { useState, useRef, useEffect } from "react";
import { 
  Box, 
  Paintbrush, 
  Paperclip, 
  Zap, 
  Settings, 
  ArrowRight,
  Globe,
  Sparkles,
  ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Attachment } from "@/hooks/use-file-attachments";

interface MinimalPromptInputProps {
  onGenerate: (prompt: string, mode: "app" | "design") => void;
  isGenerating: boolean;
  isConnected: boolean;
  onAttach?: () => void;
  attachments?: Attachment[];
  onOpenSettings?: () => void;
  userName?: string;
  buildMode?: "fast" | "full";
  onBuildModeChange?: (mode: "fast" | "full") => void;
  autonomyLevel?: "low" | "medium" | "high" | "max";
  onAutonomyChange?: (level: "low" | "medium" | "high" | "max") => void;
}

export function MinimalPromptInput({
  onGenerate,
  isGenerating,
  isConnected,
  onAttach,
  attachments = [],
  onOpenSettings,
  userName,
  buildMode = "fast",
  onBuildModeChange,
  autonomyLevel = "medium",
  onAutonomyChange,
}: MinimalPromptInputProps) {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"app" | "design">("app");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [prompt]);

  const handleSubmit = () => {
    if (prompt.trim() && !isGenerating && isConnected) {
      onGenerate(prompt.trim(), mode);
      setPrompt("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const greeting = userName ? `Hi ${userName},` : "Hi there,";

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 py-8 animate-in fade-in duration-500">
      <div className="text-center mb-8 space-y-2">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
          {greeting}
        </h1>
        <p className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
          what do you want to make?
        </p>
      </div>

      <div className="w-full max-w-2xl space-y-4">
        <Tabs value={mode} onValueChange={(v) => setMode(v as "app" | "design")} className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-12 p-1 bg-muted/50 rounded-xl">
            <TabsTrigger 
              value="app" 
              className="flex items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"
              data-testid="tab-app-mode"
            >
              <Box className="h-4 w-4" />
              <span className="font-medium">App</span>
            </TabsTrigger>
            <TabsTrigger 
              value="design" 
              className="flex items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"
              data-testid="tab-design-mode"
            >
              <Paintbrush className="h-4 w-4" />
              <span className="font-medium">Design</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative bg-background border rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50 transition-all">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the idea you want to build..."
            className="w-full min-h-[120px] max-h-[200px] p-4 pb-16 bg-transparent border-0 resize-none focus:outline-none text-base placeholder:text-muted-foreground/60"
            disabled={isGenerating || !isConnected}
            data-testid="textarea-minimal-prompt"
          />

          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
                    data-testid="dropdown-build-mode"
                  >
                    <Box className="h-4 w-4" />
                    <span className="text-sm capitalize">{buildMode === "fast" ? "Build" : "Full Build"}</span>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem 
                    onClick={() => onBuildModeChange?.("fast")}
                    className="gap-2"
                    data-testid="menu-item-build-fast"
                  >
                    <Zap className="h-4 w-4" />
                    <div>
                      <div className="font-medium">Fast</div>
                      <div className="text-xs text-muted-foreground">Quick edits (10-60s)</div>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => onBuildModeChange?.("full")}
                    className="gap-2"
                    data-testid="menu-item-build-full"
                  >
                    <Sparkles className="h-4 w-4" />
                    <div>
                      <div className="font-medium">Full Build</div>
                      <div className="text-xs text-muted-foreground">Complete app (5-15min)</div>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={onAttach}
                    data-testid="button-attach"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Attach files</TooltipContent>
              </Tooltip>
            </div>

            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    data-testid="button-quick-actions"
                  >
                    <Zap className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Quick actions</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={onOpenSettings}
                    data-testid="button-prompt-settings"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Settings</TooltipContent>
              </Tooltip>

              <Button
                onClick={handleSubmit}
                disabled={!prompt.trim() || isGenerating || !isConnected}
                className="h-8 px-4 gap-2 ml-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border-0"
                variant="ghost"
                data-testid="button-start-generation"
              >
                <span className="text-sm font-medium">Start</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
                data-testid="dropdown-app-type"
              >
                <Globe className="h-4 w-4" />
                <span>Web app</span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem data-testid="menu-item-app-web">Web app</DropdownMenuItem>
              <DropdownMenuItem data-testid="menu-item-app-mobile">Mobile app</DropdownMenuItem>
              <DropdownMenuItem data-testid="menu-item-app-desktop">Desktop app</DropdownMenuItem>
              <DropdownMenuItem data-testid="menu-item-app-cli">CLI tool</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
                data-testid="dropdown-autonomy"
              >
                <Sparkles className="h-4 w-4" />
                <span className="capitalize">{autonomyLevel}</span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => onAutonomyChange?.("low")} data-testid="menu-item-autonomy-low">
                <div>
                  <div className="font-medium">Low</div>
                  <div className="text-xs text-muted-foreground">Confirm every action</div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAutonomyChange?.("medium")} data-testid="menu-item-autonomy-medium">
                <div>
                  <div className="font-medium">Medium</div>
                  <div className="text-xs text-muted-foreground">Confirm destructive only</div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAutonomyChange?.("high")} data-testid="menu-item-autonomy-high">
                <div>
                  <div className="font-medium">High</div>
                  <div className="text-xs text-muted-foreground">Auto-fix errors</div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAutonomyChange?.("max")} data-testid="menu-item-autonomy-max">
                <div>
                  <div className="font-medium">Max</div>
                  <div className="text-xs text-muted-foreground">Full autonomy</div>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-1">
            {attachments.map((attachment, idx) => (
              <div 
                key={idx}
                className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-lg text-sm"
              >
                <Paperclip className="h-3 w-3" />
                <span className="truncate max-w-[150px]">{attachment.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
