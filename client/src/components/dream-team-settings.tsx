import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { 
  Users, 
  Code, 
  Layers, 
  Heart, 
  Target,
  Plus,
  Trash2,
  RotateCcw,
  Sparkles,
  Shield,
  Brain
} from "lucide-react";
import type { DreamTeamSettings as DreamTeamSettingsType, DreamTeamPersona } from "@shared/schema";
import { defaultDreamTeamPersonas } from "@shared/schema";

interface DreamTeamSettingsProps {
  settings: DreamTeamSettingsType;
  onSettingsChange: (settings: DreamTeamSettingsType) => void;
}

const iconMap: Record<string, React.ElementType> = {
  code: Code,
  layers: Layers,
  heart: Heart,
  target: Target,
  shield: Shield,
  brain: Brain,
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

export function DreamTeamSettings({ settings, onSettingsChange }: DreamTeamSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localSettings, setLocalSettings] = useState<DreamTeamSettingsType>(settings);

  const handleSave = () => {
    onSettingsChange(localSettings);
    setIsOpen(false);
  };

  const handleReset = () => {
    setLocalSettings({
      ...localSettings,
      personas: [...defaultDreamTeamPersonas],
    });
  };

  const updatePersona = (id: string, updates: Partial<DreamTeamPersona>) => {
    setLocalSettings((prev) => ({
      ...prev,
      personas: prev.personas.map((p) => 
        p.id === id ? { ...p, ...updates } : p
      ),
    }));
  };

  const togglePersona = (id: string) => {
    updatePersona(id, { 
      enabled: !localSettings.personas.find(p => p.id === id)?.enabled 
    });
  };

  const addPersona = () => {
    const newPersona: DreamTeamPersona = {
      id: `custom-${Date.now()}`,
      name: "New Expert",
      title: "Custom Role",
      inspiration: "",
      avatar: "code",
      color: "cyan",
      focus: ["custom focus area"],
      personality: "Describe this expert's perspective and what questions they ask.",
      enabled: true,
    };
    setLocalSettings((prev) => ({
      ...prev,
      personas: [...prev.personas, newPersona],
    }));
  };

  const removePersona = (id: string) => {
    setLocalSettings((prev) => ({
      ...prev,
      personas: prev.personas.filter((p) => p.id !== id),
    }));
  };

  const getIcon = (avatar: string | undefined) => {
    const Icon = iconMap[avatar || "code"] || Code;
    return Icon;
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-dream-team-settings" title="Dream Team Settings">
          <Users className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Dream Team</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            AI Dream Team Configuration
          </DialogTitle>
          <DialogDescription>
            Configure your expert advisors who review decisions and provide recommendations.
            Each persona brings a unique perspective inspired by industry leaders.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">General Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable Dream Team</Label>
                  <p className="text-sm text-muted-foreground">
                    Get expert recommendations during generation
                  </p>
                </div>
                <Switch
                  checked={localSettings.enabled}
                  onCheckedChange={(checked) => 
                    setLocalSettings((prev) => ({ ...prev, enabled: checked }))
                  }
                  data-testid="switch-dream-team-enabled"
                />
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Pause for Major Decisions</Label>
                  <p className="text-sm text-muted-foreground">
                    Stop and ask for your input on important choices
                  </p>
                </div>
                <Switch
                  checked={localSettings.pauseOnMajorDecisions}
                  onCheckedChange={(checked) => 
                    setLocalSettings((prev) => ({ ...prev, pauseOnMajorDecisions: checked }))
                  }
                  data-testid="switch-pause-decisions"
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Discussion Depth</Label>
                <Select
                  value={localSettings.discussionDepth}
                  onValueChange={(value: "brief" | "balanced" | "thorough") => 
                    setLocalSettings((prev) => ({ ...prev, discussionDepth: value }))
                  }
                >
                  <SelectTrigger data-testid="select-discussion-depth">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="brief">Brief - Quick consensus</SelectItem>
                    <SelectItem value="balanced">Balanced - Key perspectives</SelectItem>
                    <SelectItem value="thorough">Thorough - Deep analysis</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  How much detail the experts provide in their discussion
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Expert Personas</h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleReset} data-testid="button-reset-personas">
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset to Defaults
              </Button>
              <Button variant="outline" size="sm" onClick={addPersona} data-testid="button-add-persona">
                <Plus className="w-4 h-4 mr-2" />
                Add Expert
              </Button>
            </div>
          </div>

          <Accordion type="single" collapsible className="space-y-2">
            {localSettings.personas.map((persona) => {
              const Icon = getIcon(persona.avatar);
              return (
                <AccordionItem 
                  key={persona.id} 
                  value={persona.id}
                  className="border rounded-lg px-4"
                >
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center gap-3 flex-1">
                      <div className={`w-10 h-10 rounded-full ${colorMap[persona.color] || "bg-gray-500"} flex items-center justify-center`}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{persona.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {persona.title}
                          </Badge>
                          {!persona.enabled && (
                            <Badge variant="secondary" className="text-xs">
                              Disabled
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Inspired by {persona.inspiration || "custom expertise"}
                        </p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-2 pb-4">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label>Enabled</Label>
                        <Switch
                          checked={persona.enabled}
                          onCheckedChange={() => togglePersona(persona.id)}
                          data-testid={`switch-persona-${persona.id}`}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Name</Label>
                          <Input
                            value={persona.name}
                            onChange={(e) => updatePersona(persona.id, { name: e.target.value })}
                            data-testid={`input-persona-name-${persona.id}`}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Title</Label>
                          <Input
                            value={persona.title}
                            onChange={(e) => updatePersona(persona.id, { title: e.target.value })}
                            data-testid={`input-persona-title-${persona.id}`}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Inspiration</Label>
                          <Input
                            value={persona.inspiration}
                            onChange={(e) => updatePersona(persona.id, { inspiration: e.target.value })}
                            placeholder="e.g., Steve Jobs"
                            data-testid={`input-persona-inspiration-${persona.id}`}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Color</Label>
                          <Select
                            value={persona.color}
                            onValueChange={(value) => updatePersona(persona.id, { color: value })}
                          >
                            <SelectTrigger data-testid={`select-persona-color-${persona.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.keys(colorMap).map((color) => (
                                <SelectItem key={color} value={color}>
                                  <div className="flex items-center gap-2">
                                    <div className={`w-3 h-3 rounded-full ${colorMap[color]}`} />
                                    {color.charAt(0).toUpperCase() + color.slice(1)}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Focus Areas</Label>
                        <Input
                          value={persona.focus.join(", ")}
                          onChange={(e) => updatePersona(persona.id, { 
                            focus: e.target.value.split(",").map(s => s.trim()).filter(Boolean)
                          })}
                          placeholder="code quality, performance, maintainability"
                          data-testid={`input-persona-focus-${persona.id}`}
                        />
                        <p className="text-xs text-muted-foreground">
                          Comma-separated list of expertise areas
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label>Personality & Perspective</Label>
                        <Textarea
                          value={persona.personality}
                          onChange={(e) => updatePersona(persona.id, { personality: e.target.value })}
                          rows={3}
                          placeholder="Describe how this expert thinks and what questions they ask..."
                          data-testid={`textarea-persona-personality-${persona.id}`}
                        />
                      </div>

                      {!defaultDreamTeamPersonas.find(p => p.id === persona.id) && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => removePersona(persona.id)}
                          data-testid={`button-remove-persona-${persona.id}`}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Remove Expert
                        </Button>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>

        <Separator />

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => setIsOpen(false)} data-testid="button-cancel-dream-team">
            Cancel
          </Button>
          <Button onClick={handleSave} data-testid="button-save-dream-team">
            Save Configuration
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
