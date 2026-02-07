import { useState, useMemo } from "react";
import { FreeformPrompt } from "./freeform-prompt";
import { TEMPLATES, PRODUCTION_TEMPLATES } from "./templates";
import type { TemplateConfig, ProductionTemplateConfig } from "./types";
import type { LLMSettings, ProductionModules } from "@shared/schema";
import type { Attachment } from "@/hooks/use-file-attachments";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Search,
  Sparkles,
  Rocket,
  Layers,
  DollarSign,
  UtensilsCrossed,
  Dumbbell,
  Target,
  FileText,
  Bookmark,
  Cloud,
  Package,
} from "lucide-react";

const IDEA_STARTERS = [
  { label: "Personal finance tracker with budget categories", icon: DollarSign },
  { label: "Recipe collection with search and favorites", icon: UtensilsCrossed },
  { label: "Workout log with exercise tracking", icon: Dumbbell },
  { label: "Habit tracker with streaks and stats", icon: Target },
  { label: "Meeting notes organizer", icon: FileText },
  { label: "Bookmark manager with tags", icon: Bookmark },
  { label: "Weather dashboard with forecasts", icon: Cloud },
  { label: "Inventory management system", icon: Package },
];

type CategoryFilter = "all" | "quick" | "production";

interface TemplateSelectorProps {
  onSelect: (template: TemplateConfig) => void;
  onSelectProduction: (template: ProductionTemplateConfig, modules: ProductionModules) => void;
  onGenerate: (prompt: string, dataModel?: undefined, attachments?: Attachment[], temperature?: number) => void;
  isGenerating: boolean;
  llmConnected: boolean | null;
  onCheckConnection: () => void;
  settings?: LLMSettings;
}

export function TemplateSelector({
  onSelect,
  onSelectProduction,
  onGenerate,
  isGenerating,
  llmConnected,
  onCheckConnection,
  settings,
}: TemplateSelectorProps) {
  const [selectedIdea, setSelectedIdea] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");

  const filteredQuickTemplates = useMemo(() => {
    if (categoryFilter === "production") return [];
    const query = searchQuery.toLowerCase();
    if (!query) return TEMPLATES;
    return TEMPLATES.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query)
    );
  }, [searchQuery, categoryFilter]);

  const filteredProductionTemplates = useMemo(() => {
    if (categoryFilter === "quick") return [];
    const query = searchQuery.toLowerCase();
    if (!query) return PRODUCTION_TEMPLATES;
    return PRODUCTION_TEMPLATES.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query)
    );
  }, [searchQuery, categoryFilter]);

  const handleIdeaClick = (idea: string) => {
    setSelectedIdea(idea);
  };

  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">
          What will you create?
        </h1>
        <p className="text-lg text-muted-foreground max-w-md mx-auto">
          Describe your vision and let AI build it for you.
        </p>
      </div>

      <div className="max-w-xl mx-auto">
        <FreeformPrompt
          onGenerate={onGenerate}
          isGenerating={isGenerating}
          llmConnected={llmConnected}
          onCheckConnection={onCheckConnection}
          settings={settings}
          defaultPrompt={selectedIdea}
        />
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground text-center">
          Idea Starters
        </h2>
        <div className="flex flex-wrap justify-center gap-2">
          {IDEA_STARTERS.map((idea) => (
            <Badge
              key={idea.label}
              variant="outline"
              className="cursor-pointer gap-1.5 py-1.5 px-3 text-sm font-normal"
              onClick={() => handleIdeaClick(idea.label)}
              data-testid={`badge-idea-${idea.label.split(" ")[0].toLowerCase()}`}
            >
              <idea.icon className="h-3.5 w-3.5 shrink-0" />
              {idea.label}
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates..."
              className="pl-9"
              data-testid="input-template-search"
            />
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant={categoryFilter === "all" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setCategoryFilter("all")}
              data-testid="button-filter-all"
            >
              <Layers className="h-4 w-4 mr-1.5" />
              All
            </Button>
            <Button
              variant={categoryFilter === "quick" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setCategoryFilter("quick")}
              data-testid="button-filter-quick"
            >
              <Sparkles className="h-4 w-4 mr-1.5" />
              Quick Start
            </Button>
            <Button
              variant={categoryFilter === "production" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setCategoryFilter("production")}
              data-testid="button-filter-production"
            >
              <Rocket className="h-4 w-4 mr-1.5" />
              Production
            </Button>
          </div>
        </div>

        {filteredQuickTemplates.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Quick Start Templates</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredQuickTemplates.map((template) => (
                <Card
                  key={template.id}
                  className="hover-elevate cursor-pointer flex flex-col"
                  onClick={() => onSelect(template)}
                  data-testid={`card-template-${template.id}`}
                >
                  <CardHeader className="flex flex-row items-start gap-3 p-4 pb-2">
                    <div className="rounded-md bg-muted p-2 shrink-0">
                      <template.icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-sm font-semibold leading-tight">
                        {template.name}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 flex-1 flex flex-col">
                    <CardDescription className="text-xs flex-1">
                      {template.description}
                    </CardDescription>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(template);
                      }}
                      data-testid={`button-use-template-${template.id}`}
                    >
                      Use Template
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {filteredProductionTemplates.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Production Apps</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredProductionTemplates.map((template) => (
                <Card
                  key={template.id}
                  className="hover-elevate cursor-pointer flex flex-col"
                  onClick={() => onSelectProduction(template, template.defaultModules)}
                  data-testid={`card-template-${template.id}`}
                >
                  <CardHeader className="flex flex-row items-start gap-3 p-4 pb-2">
                    <div className="rounded-md bg-muted p-2 shrink-0">
                      <template.icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-sm font-semibold leading-tight">
                        {template.name}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 flex-1 flex flex-col">
                    <CardDescription className="text-xs flex-1">
                      {template.description}
                    </CardDescription>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectProduction(template, template.defaultModules);
                      }}
                      data-testid={`button-use-template-${template.id}`}
                    >
                      Use Template
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {filteredQuickTemplates.length === 0 && filteredProductionTemplates.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No templates match your search.</p>
          </div>
        )}
      </div>
    </div>
  );
}
