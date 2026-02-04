import { useState, useEffect } from "react";
import { Palette, Layout, Wand2, Check, Code, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";

type DesignStyle = "minimal" | "modern" | "playful" | "corporate" | "creative";

interface DesignTemplate {
  id: string;
  name: string;
  description: string;
  style: DesignStyle;
  category: string;
  usageCount: number;
}

interface DesignMockup {
  id: string;
  name: string;
  description: string;
  style: DesignStyle;
  approved: boolean;
  createdAt: Date;
}

interface ColorScheme {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  foreground: string;
}

const STYLE_COLORS: Record<DesignStyle, string> = {
  minimal: "bg-gray-500",
  modern: "bg-indigo-500",
  playful: "bg-amber-500",
  corporate: "bg-blue-700",
  creative: "bg-purple-500"
};

interface DesignModePanelProps {
  projectId: string;
  onMockupApproved?: (mockupId: string) => void;
  onCodeGenerated?: (code: string) => void;
}

export function DesignModePanel({ 
  projectId, 
  onMockupApproved,
  onCodeGenerated 
}: DesignModePanelProps) {
  const [enabled, setEnabled] = useState(false);
  const [templates, setTemplates] = useState<DesignTemplate[]>([]);
  const [mockups, setMockups] = useState<DesignMockup[]>([]);
  const [colorSchemes, setColorSchemes] = useState<Record<DesignStyle, ColorScheme>>({} as Record<DesignStyle, ColorScheme>);
  const [selectedStyle, setSelectedStyle] = useState<DesignStyle>("modern");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchDesignData();
  }, [projectId]);

  const fetchDesignData = async () => {
    try {
      const [statusRes, templatesRes, colorsRes, mockupsRes] = await Promise.all([
        fetch("/api/optimization/design-mode"),
        fetch("/api/optimization/design-mode/templates"),
        fetch("/api/optimization/design-mode/color-schemes"),
        fetch(`/api/optimization/design-mode/projects/${projectId}/mockups`)
      ]);

      const status = await statusRes.json();
      const templatesData = await templatesRes.json();
      const colorsData = await colorsRes.json();
      const mockupsData = await mockupsRes.json();

      setEnabled(status.enabled);
      setTemplates(templatesData);
      setColorSchemes(colorsData);
      setMockups(mockupsData);
    } catch (error) {
      console.error("Failed to fetch design data:", error);
    }
  };

  const toggleDesignMode = async (value: boolean) => {
    try {
      await apiRequest("PUT", "/api/optimization/design-mode", { enabled: value });
      setEnabled(value);
    } catch (error) {
      console.error("Failed to toggle design mode:", error);
    }
  };

  const createMockup = async (templateId?: string) => {
    setLoading(true);
    try {
      const response = await apiRequest("POST", "/api/optimization/design-mode/mockups", {
        projectId,
        name: `Mockup ${mockups.length + 1}`,
        description: "New design mockup",
        style: selectedStyle,
        templateId
      });
      const newMockup = await response.json();
      setMockups([newMockup, ...mockups]);
    } catch (error) {
      console.error("Failed to create mockup:", error);
    } finally {
      setLoading(false);
    }
  };

  const approveMockup = async (mockupId: string) => {
    try {
      await apiRequest("POST", `/api/optimization/design-mode/mockups/${mockupId}/approve`);
      setMockups(mockups.map(m => 
        m.id === mockupId ? { ...m, approved: true } : m
      ));
      onMockupApproved?.(mockupId);
    } catch (error) {
      console.error("Failed to approve mockup:", error);
    }
  };

  const generateCode = async (mockupId: string) => {
    setLoading(true);
    try {
      const response = await apiRequest("POST", `/api/optimization/design-mode/mockups/${mockupId}/generate`);
      const data = await response.json();
      if (data.code) {
        onCodeGenerated?.(data.code);
      }
    } catch (error) {
      console.error("Failed to generate code:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card data-testid="design-mode-panel">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Design Mode
          </CardTitle>
          <div className="flex items-center gap-2">
            <Label htmlFor="design-mode-toggle" className="text-xs">
              {enabled ? "Enabled" : "Disabled"}
            </Label>
            <Switch
              id="design-mode-toggle"
              checked={enabled}
              onCheckedChange={toggleDesignMode}
              data-testid="switch-design-mode"
            />
          </div>
        </div>
        <CardDescription className="text-xs">
          Create visual mockups before building
        </CardDescription>
      </CardHeader>

      {enabled && (
        <CardContent className="space-y-4">
          <Tabs defaultValue="templates" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="templates" className="text-xs" data-testid="tab-templates">
                Templates
              </TabsTrigger>
              <TabsTrigger value="mockups" className="text-xs" data-testid="tab-mockups">
                Mockups ({mockups.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="templates" className="space-y-3 mt-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs">Style:</Label>
                <Select 
                  value={selectedStyle} 
                  onValueChange={(v) => setSelectedStyle(v as DesignStyle)}
                >
                  <SelectTrigger className="w-32 h-8" data-testid="select-style">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STYLE_COLORS) as DesignStyle[]).map((style) => (
                      <SelectItem key={style} value={style} className="capitalize">
                        <span className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${STYLE_COLORS[style]}`} />
                          {style}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <ScrollArea className="h-40">
                <div className="space-y-2">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className="p-2 border rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => createMockup(template.id)}
                      data-testid={`template-${template.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{template.name}</span>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {template.category}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {template.description}
                      </p>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <Button 
                size="sm" 
                onClick={() => createMockup()}
                disabled={loading}
                className="w-full gap-1.5"
                data-testid="button-create-blank"
              >
                <Wand2 className="h-3.5 w-3.5" />
                Create Blank Mockup
              </Button>
            </TabsContent>

            <TabsContent value="mockups" className="space-y-3 mt-3">
              {mockups.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-xs">
                  <Layout className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No mockups yet</p>
                  <p>Create one from a template</p>
                </div>
              ) : (
                <ScrollArea className="h-48">
                  <div className="space-y-2">
                    {mockups.map((mockup) => (
                      <div
                        key={mockup.id}
                        className="p-2 border rounded-md space-y-2"
                        data-testid={`mockup-${mockup.id}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">{mockup.name}</span>
                          <div className="flex items-center gap-1">
                            <Badge 
                              variant="outline" 
                              className={`text-[10px] capitalize ${STYLE_COLORS[mockup.style]} text-white`}
                            >
                              {mockup.style}
                            </Badge>
                            {mockup.approved && (
                              <Badge variant="secondary" className="text-[10px]">
                                <Check className="h-2.5 w-2.5 mr-0.5" />
                                Approved
                              </Badge>
                            )}
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {mockup.description}
                        </p>
                        <div className="flex gap-1.5">
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="flex-1 h-7 text-xs gap-1"
                            data-testid={`button-preview-${mockup.id}`}
                          >
                            <Eye className="h-3 w-3" />
                            Preview
                          </Button>
                          {!mockup.approved ? (
                            <Button 
                              size="sm"
                              className="flex-1 h-7 text-xs gap-1"
                              onClick={() => approveMockup(mockup.id)}
                              data-testid={`button-approve-${mockup.id}`}
                            >
                              <Check className="h-3 w-3" />
                              Approve
                            </Button>
                          ) : (
                            <Button 
                              size="sm"
                              className="flex-1 h-7 text-xs gap-1"
                              onClick={() => generateCode(mockup.id)}
                              disabled={loading}
                              data-testid={`button-generate-${mockup.id}`}
                            >
                              <Code className="h-3 w-3" />
                              Generate
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>
          </Tabs>

          {colorSchemes[selectedStyle] && (
            <div className="pt-2 border-t">
              <Label className="text-xs text-muted-foreground">Color Palette</Label>
              <div className="flex gap-1 mt-1.5">
                {Object.entries(colorSchemes[selectedStyle]).slice(0, 5).map(([name, color]) => (
                  <div
                    key={name}
                    className="h-6 flex-1 rounded"
                    style={{ backgroundColor: color }}
                    title={name}
                  />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
