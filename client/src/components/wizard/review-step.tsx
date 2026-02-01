import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, CheckCircle2, XCircle, Wand2, Database, Brain, Rocket } from "lucide-react";
import type { TemplateConfig } from "./types";
import type { DataModel, ProductionModules } from "@shared/schema";

interface ReviewStepProps {
  template: TemplateConfig;
  dataModel: DataModel;
  generatedPrompt: string;
  llmConnected: boolean | null;
  isGenerating: boolean;
  onBack: () => void;
  onGenerate: () => void;
  onCheckConnection: () => void;
  planBuildMode?: boolean;
  productionModules?: ProductionModules;
}

const MODULE_LABELS: Record<keyof ProductionModules, string> = {
  authentication: "Auth",
  authorization: "RBAC",
  testing: "Testing",
  cicd: "CI/CD",
  docker: "Docker",
  migrations: "Migrations",
  logging: "Logging",
  errorHandling: "Errors",
  apiDocs: "API Docs",
  envConfig: "Env Config",
  rateLimiting: "Rate Limit",
  caching: "Caching",
  monitoring: "Monitoring",
  billing: "Billing",
};

export function ReviewStep({
  template,
  dataModel,
  generatedPrompt,
  llmConnected,
  isGenerating,
  onBack,
  onGenerate,
  onCheckConnection,
  planBuildMode,
  productionModules,
}: ReviewStepProps) {
  const isProduction = productionModules !== undefined;
  const enabledModules = productionModules 
    ? (Object.entries(productionModules).filter(([_, v]) => v) as [keyof ProductionModules, boolean][])
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-wizard-back-review">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-xl font-semibold">Review & Generate</h2>
          <p className="text-sm text-muted-foreground">Check the details before generating</p>
        </div>
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="gap-1">
            <template.icon className="h-3 w-3" />
            {template.name}
          </Badge>
          {isProduction && (
            <Badge variant="default" className="gap-1 bg-gradient-to-r from-purple-600 to-blue-600">
              <Rocket className="h-3 w-3" />
              Production
            </Badge>
          )}
          {dataModel.enableDatabase && dataModel.entities.length > 0 && (
            <Badge variant="default" className="gap-1">
              <Database className="h-3 w-3" />
              Full-Stack
            </Badge>
          )}
          {(!dataModel.enableDatabase || dataModel.entities.length === 0) && !isProduction && (
            <Badge variant="outline" className="gap-1">Frontend Only</Badge>
          )}
        </div>

        {isProduction && enabledModules.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Production Modules</Label>
            <div className="flex flex-wrap gap-1">
              {enabledModules.map(([key]) => (
                <Badge key={key} variant="outline" className="text-xs">
                  {MODULE_LABELS[key]}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {dataModel.enableDatabase && dataModel.entities.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Data Entities</Label>
            <div className="flex flex-wrap gap-2">
              {dataModel.entities.map((entity) => (
                <Badge key={entity.id} variant="outline" className="gap-1">
                  {entity.name} ({entity.fields.length} fields)
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Generated Prompt</Label>
          <div className="p-3 bg-muted rounded-md text-sm max-h-48 overflow-y-auto whitespace-pre-wrap">
            {generatedPrompt}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2 border-t">
          <Label className="text-xs text-muted-foreground">LLM Status:</Label>
          {llmConnected === null ? (
            <Badge variant="secondary" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Checking...
            </Badge>
          ) : llmConnected ? (
            <Badge variant="default" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Connected
            </Badge>
          ) : (
            <div className="flex items-center gap-2">
              <Badge variant="destructive" className="gap-1">
                <XCircle className="h-3 w-3" />
                Disconnected
              </Badge>
              <Button variant="ghost" size="sm" onClick={onCheckConnection} data-testid="button-retry-connection">
                Retry
              </Button>
            </div>
          )}
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onBack}>Edit Settings</Button>
        <Button
          onClick={onGenerate}
          disabled={isGenerating || !llmConnected}
          className="gap-2"
          data-testid="button-wizard-generate"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {planBuildMode ? "Creating Plan..." : "Generating..."}
            </>
          ) : planBuildMode ? (
            <>
              <Brain className="h-4 w-4" />
              Create Plan
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4" />
              Generate App
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
