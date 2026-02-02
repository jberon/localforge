import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Settings2, 
  Brain, 
  Hammer, 
  Zap,
  Info
} from "lucide-react";
import type { DualModelSettings as DualModelSettingsType } from "@shared/schema";

interface DualModelSettingsProps {
  settings: DualModelSettingsType;
  onSettingsChange: (settings: DualModelSettingsType) => void;
}

export function DualModelSettings({ settings, onSettingsChange }: DualModelSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localSettings, setLocalSettings] = useState<DualModelSettingsType>(settings);

  const handleSave = () => {
    onSettingsChange(localSettings);
    setIsOpen(false);
  };

  const updatePlanner = (updates: Partial<DualModelSettingsType["planner"]>) => {
    setLocalSettings((prev) => ({
      ...prev,
      planner: { ...prev.planner, ...updates },
    }));
  };

  const updateBuilder = (updates: Partial<DualModelSettingsType["builder"]>) => {
    setLocalSettings((prev) => ({
      ...prev,
      builder: { ...prev.builder, ...updates },
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-dual-model-settings">
          <Settings2 className="w-4 h-4 mr-2" />
          Model Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Plan & Build Model Configuration
          </DialogTitle>
          <DialogDescription>
            Configure different models for planning (reasoning) and building (code generation).
            Use a reasoning-focused model for planning and a code-optimized model for building.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Brain className="w-4 h-4 text-purple-500" />
                  Planner Model
                </CardTitle>
                <Badge variant="outline" className="text-purple-500 border-purple-500/30">
                  Reasoning
                </Badge>
              </div>
              <CardDescription>
                Used for creating implementation plans. Best with reasoning-focused models.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="planner-endpoint">API Endpoint</Label>
                <Input
                  id="planner-endpoint"
                  value={localSettings.planner.endpoint}
                  onChange={(e) => updatePlanner({ endpoint: e.target.value })}
                  placeholder="http://localhost:1234/v1"
                  data-testid="input-planner-endpoint"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="planner-model">Model Name (optional)</Label>
                <Input
                  id="planner-model"
                  value={localSettings.planner.model}
                  onChange={(e) => updatePlanner({ model: e.target.value })}
                  placeholder="Leave empty for default"
                  data-testid="input-planner-model"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Temperature</Label>
                  <span className="text-sm text-muted-foreground">
                    {localSettings.planner.temperature.toFixed(2)}
                  </span>
                </div>
                <Slider
                  value={[localSettings.planner.temperature]}
                  onValueChange={([value]) => updatePlanner({ temperature: value })}
                  min={0}
                  max={1}
                  step={0.05}
                  data-testid="slider-planner-temperature"
                />
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  Lower values produce more focused, deterministic plans.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Hammer className="w-4 h-4 text-orange-500" />
                  Builder Model
                </CardTitle>
                <Badge variant="outline" className="text-orange-500 border-orange-500/30">
                  Code Gen
                </Badge>
              </div>
              <CardDescription>
                Used for generating code from approved plans. Best with code-focused models.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="builder-endpoint">API Endpoint</Label>
                <Input
                  id="builder-endpoint"
                  value={localSettings.builder.endpoint}
                  onChange={(e) => updateBuilder({ endpoint: e.target.value })}
                  placeholder="http://localhost:1234/v1"
                  data-testid="input-builder-endpoint"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="builder-model">Model Name (optional)</Label>
                <Input
                  id="builder-model"
                  value={localSettings.builder.model}
                  onChange={(e) => updateBuilder({ model: e.target.value })}
                  placeholder="Leave empty for default"
                  data-testid="input-builder-model"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Temperature</Label>
                  <span className="text-sm text-muted-foreground">
                    {localSettings.builder.temperature.toFixed(2)}
                  </span>
                </div>
                <Slider
                  value={[localSettings.builder.temperature]}
                  onValueChange={([value]) => updateBuilder({ temperature: value })}
                  min={0}
                  max={1}
                  step={0.05}
                  data-testid="slider-builder-temperature"
                />
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  Slightly higher values allow for more creative code solutions.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Separator />

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => setIsOpen(false)} data-testid="button-cancel-settings">
            Cancel
          </Button>
          <Button onClick={handleSave} data-testid="button-save-settings">
            Save Settings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
