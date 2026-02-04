import { useState, useEffect } from "react";
import { Shield, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { apiRequest } from "@/lib/queryClient";

type AutonomyLevel = "low" | "medium" | "high" | "max";

interface AutonomyConfig {
  level: AutonomyLevel;
  confirmBeforeEdit: boolean;
  confirmBeforeDelete: boolean;
  confirmBeforeInstall: boolean;
  autoRunTests: boolean;
  autoFixErrors: boolean;
  selfTestingLoop: boolean;
  maxSessionMinutes: number;
  description: string;
}

const LEVEL_VALUES: Record<AutonomyLevel, number> = {
  low: 0,
  medium: 33,
  high: 66,
  max: 100
};

const VALUE_TO_LEVEL: Record<number, AutonomyLevel> = {
  0: "low",
  33: "medium",
  66: "high",
  100: "max"
};

const LEVEL_ICONS: Record<AutonomyLevel, typeof Shield> = {
  low: Shield,
  medium: ShieldCheck,
  high: ShieldAlert,
  max: Sparkles
};

const LEVEL_COLORS: Record<AutonomyLevel, string> = {
  low: "bg-blue-500",
  medium: "bg-green-500",
  high: "bg-yellow-500",
  max: "bg-purple-500"
};

interface AutonomySliderProps {
  projectId?: string;
  compact?: boolean;
  onLevelChange?: (level: AutonomyLevel) => void;
}

export function AutonomySlider({ projectId, compact = false, onLevelChange }: AutonomySliderProps) {
  const [config, setConfig] = useState<AutonomyConfig | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, [projectId]);

  const fetchConfig = async () => {
    try {
      const url = projectId 
        ? `/api/optimization/autonomy?projectId=${projectId}` 
        : "/api/optimization/autonomy";
      const response = await fetch(url);
      const data = await response.json();
      setConfig(data);
    } catch (error) {
      console.error("Failed to fetch autonomy config:", error);
    }
  };

  const setLevel = async (level: AutonomyLevel) => {
    setLoading(true);
    try {
      await apiRequest("PUT", "/api/optimization/autonomy", { level, projectId });
      await fetchConfig();
      onLevelChange?.(level);
    } catch (error) {
      console.error("Failed to set autonomy level:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSliderChange = (values: number[]) => {
    const nearestValue = [0, 33, 66, 100].reduce((prev, curr) =>
      Math.abs(curr - values[0]) < Math.abs(prev - values[0]) ? curr : prev
    );
    const level = VALUE_TO_LEVEL[nearestValue];
    if (level && level !== config?.level) {
      setLevel(level);
    }
  };

  if (!config) return null;

  const Icon = LEVEL_ICONS[config.level];

  if (compact) {
    const levels: AutonomyLevel[] = ["low", "medium", "high", "max"];
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            className="flex items-center gap-2 h-8 px-2"
            data-testid="autonomy-slider-compact"
          >
            <Icon className="h-4 w-4" />
            <Badge 
              variant="secondary" 
              className={`capitalize ${LEVEL_COLORS[config.level]} text-white`}
              data-testid="badge-autonomy-level"
            >
              {config.level}
            </Badge>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-2" align="start">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground px-2">Autonomy Level</Label>
            {levels.map((level) => {
              const LevelIcon = LEVEL_ICONS[level];
              return (
                <Button
                  key={level}
                  variant={config.level === level ? "secondary" : "ghost"}
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() => setLevel(level)}
                  disabled={loading}
                  data-testid={`button-autonomy-${level}`}
                >
                  <LevelIcon className="h-4 w-4" />
                  <span className="capitalize">{level}</span>
                </Button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-2 px-2">
            {config.description}
          </p>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Card data-testid="autonomy-slider-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className="h-4 w-4" />
          Autonomy Level
        </CardTitle>
        <CardDescription className="text-xs">
          Control how independently the AI works
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Control</Label>
            <Badge 
              className={`capitalize ${LEVEL_COLORS[config.level]} text-white`}
              data-testid="badge-autonomy-level-full"
            >
              {config.level}
            </Badge>
          </div>
          <Slider
            value={[LEVEL_VALUES[config.level]]}
            min={0}
            max={100}
            step={1}
            onValueChange={handleSliderChange}
            disabled={loading}
            className="cursor-pointer"
            data-testid="slider-autonomy"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Low</span>
            <span>Medium</span>
            <span>High</span>
            <span>Max</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {config.description}
        </p>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <div className={`h-2 w-2 rounded-full ${config.autoRunTests ? "bg-green-500" : "bg-muted"}`} />
            <span className="text-muted-foreground">Auto-test</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`h-2 w-2 rounded-full ${config.autoFixErrors ? "bg-green-500" : "bg-muted"}`} />
            <span className="text-muted-foreground">Auto-fix</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`h-2 w-2 rounded-full ${config.selfTestingLoop ? "bg-green-500" : "bg-muted"}`} />
            <span className="text-muted-foreground">Self-test loop</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`h-2 w-2 rounded-full ${!config.confirmBeforeEdit ? "bg-green-500" : "bg-muted"}`} />
            <span className="text-muted-foreground">Auto-edit</span>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          Max session: {config.maxSessionMinutes} minutes
        </div>
      </CardContent>
    </Card>
  );
}
