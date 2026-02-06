import { useState, useCallback } from "react";
import { Sparkles, Check, Paintbrush, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type DesignKeyword =
  | "glassmorphism"
  | "neumorphism"
  | "brutalism"
  | "retro"
  | "gradient-mesh"
  | "aurora"
  | "cyberpunk"
  | "organic"
  | "material-3"
  | "claymorphism";

interface KeywordInfo {
  id: DesignKeyword;
  name: string;
  description: string;
  icon: string;
  preview: {
    bg: string;
    border: string;
    shadow: string;
    radius: string;
  };
}

const KEYWORD_CATALOG: KeywordInfo[] = [
  {
    id: "glassmorphism",
    name: "Glass",
    description: "Frosted glass with blur effects",
    icon: "G",
    preview: { bg: "bg-white/10 backdrop-blur-sm", border: "border border-white/20", shadow: "shadow-lg", radius: "rounded-xl" },
  },
  {
    id: "neumorphism",
    name: "Neumorphic",
    description: "Soft UI with extruded shadows",
    icon: "N",
    preview: { bg: "bg-gray-200 dark:bg-gray-700", border: "", shadow: "shadow-[4px_4px_8px_#b8bec7,-4px_-4px_8px_#ffffff] dark:shadow-[4px_4px_8px_#1a1a2e,-4px_-4px_8px_#3a3a5e]", radius: "rounded-2xl" },
  },
  {
    id: "brutalism",
    name: "Brutalist",
    description: "Bold borders, no rounding, raw aesthetic",
    icon: "B",
    preview: { bg: "bg-yellow-300 dark:bg-yellow-500", border: "border-[3px] border-black dark:border-white", shadow: "shadow-[4px_4px_0px_#000] dark:shadow-[4px_4px_0px_#fff]", radius: "rounded-none" },
  },
  {
    id: "retro",
    name: "Retro",
    description: "Vintage warmth with classic typography",
    icon: "R",
    preview: { bg: "bg-amber-50 dark:bg-amber-950", border: "border-2 border-amber-700", shadow: "shadow-sm", radius: "rounded" },
  },
  {
    id: "gradient-mesh",
    name: "Gradient",
    description: "Rich multi-color gradient backgrounds",
    icon: "M",
    preview: { bg: "bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500", border: "", shadow: "shadow-lg", radius: "rounded-2xl" },
  },
  {
    id: "aurora",
    name: "Aurora",
    description: "Northern lights with luminous accents",
    icon: "A",
    preview: { bg: "bg-gradient-to-br from-slate-900 via-blue-950 to-cyan-950", border: "border border-cyan-500/30", shadow: "shadow-[0_0_20px_rgba(100,200,255,0.15)]", radius: "rounded-xl" },
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    description: "Neon-accented dark futuristic UI",
    icon: "C",
    preview: { bg: "bg-black", border: "border border-green-400", shadow: "shadow-[0_0_10px_rgba(0,255,136,0.3)]", radius: "rounded-sm" },
  },
  {
    id: "organic",
    name: "Organic",
    description: "Natural blob shapes, earthy tones",
    icon: "O",
    preview: { bg: "bg-stone-100 dark:bg-stone-900", border: "border border-stone-300 dark:border-stone-600", shadow: "shadow-sm", radius: "rounded-[24px_8px_24px_8px]" },
  },
  {
    id: "material-3",
    name: "Material 3",
    description: "Google's Material You design system",
    icon: "3",
    preview: { bg: "bg-purple-50 dark:bg-purple-950", border: "", shadow: "shadow-md", radius: "rounded-2xl" },
  },
  {
    id: "claymorphism",
    name: "Clay",
    description: "Soft 3D clay-like inflated elements",
    icon: "Y",
    preview: { bg: "bg-violet-100 dark:bg-violet-900", border: "", shadow: "shadow-[4px_4px_8px_rgba(0,0,0,0.1),-2px_-2px_6px_rgba(255,255,255,0.6)]", radius: "rounded-3xl" },
  },
];

interface DesignKeywordPickerProps {
  selectedKeywords: DesignKeyword[];
  onKeywordsChange: (keywords: DesignKeyword[]) => void;
  compact?: boolean;
}

export function DesignKeywordPicker({ selectedKeywords, onKeywordsChange, compact = false }: DesignKeywordPickerProps) {
  const toggleKeyword = useCallback((keyword: DesignKeyword) => {
    if (selectedKeywords.includes(keyword)) {
      onKeywordsChange(selectedKeywords.filter(k => k !== keyword));
    } else {
      onKeywordsChange([...selectedKeywords, keyword]);
    }
  }, [selectedKeywords, onKeywordsChange]);

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1.5" data-testid="design-keyword-picker-compact">
        {KEYWORD_CATALOG.map((kw) => {
          const isSelected = selectedKeywords.includes(kw.id);
          return (
            <Tooltip key={kw.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => toggleKeyword(kw.id)}
                  className={`
                    inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md transition-colors
                    ${isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover-elevate"
                    }
                  `}
                  data-testid={`keyword-tag-${kw.id}`}
                >
                  {isSelected && <Check className="w-3 h-3" />}
                  {kw.name}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">{kw.description}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="design-keyword-picker">
      <div className="flex items-center gap-2">
        <Paintbrush className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">Design Style Keywords</span>
        {selectedKeywords.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {selectedKeywords.length} selected
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {KEYWORD_CATALOG.map((kw) => {
          const isSelected = selectedKeywords.includes(kw.id);
          return (
            <button
              key={kw.id}
              type="button"
              onClick={() => toggleKeyword(kw.id)}
              className={`
                group relative flex flex-col gap-1 p-2 text-left transition-all
                rounded-md border
                ${isSelected
                  ? "border-primary bg-primary/5 dark:bg-primary/10"
                  : "border-border hover-elevate"
                }
              `}
              data-testid={`keyword-card-${kw.id}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className={`w-5 h-5 flex items-center justify-center text-[10px] font-bold ${kw.preview.bg} ${kw.preview.border} ${kw.preview.radius}`}>
                    <span className={kw.id === "cyberpunk" ? "text-green-400" : kw.id === "gradient-mesh" || kw.id === "aurora" ? "text-white" : ""}>
                      {kw.icon}
                    </span>
                  </div>
                  <span className="text-xs font-medium">{kw.name}</span>
                </div>
                {isSelected && (
                  <Check className="w-3.5 h-3.5 text-primary" />
                )}
              </div>
              <p className="text-[10px] text-muted-foreground leading-tight">{kw.description}</p>
            </button>
          );
        })}
      </div>

      {selectedKeywords.length > 0 && (
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <p className="text-xs text-muted-foreground">
            Style instructions will be added to your prompt automatically
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onKeywordsChange([])}
            className="ml-auto text-xs"
            data-testid="button-clear-keywords"
          >
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}

export { KEYWORD_CATALOG };
export type { DesignKeyword, KeywordInfo };
