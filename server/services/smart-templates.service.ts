import { logger } from "../lib/logger";

interface Template {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  files: TemplateFile[];
  variables: TemplateVariable[];
  tags: string[];
  usageCount: number;
  createdAt: number;
}

interface TemplateFile {
  path: string;
  content: string;
  required: boolean;
}

interface TemplateVariable {
  name: string;
  description: string;
  defaultValue?: string;
  type: "string" | "boolean" | "choice";
  choices?: string[];
}

type TemplateCategory = 
  | "component"
  | "page"
  | "feature"
  | "api"
  | "form"
  | "layout"
  | "auth"
  | "crud";

interface GeneratedFiles {
  files: Array<{ path: string; content: string }>;
  instructions: string[];
}

interface ProjectAnalysis {
  detectedStack: string[];
  conventions: {
    componentStyle: "functional" | "arrow";
    fileNaming: "kebab" | "pascal" | "camel";
    testLocation: "alongside" | "separate";
  };
  existingPatterns: string[];
}

class SmartTemplatesService {
  private static instance: SmartTemplatesService;
  private templates: Map<string, Template> = new Map();
  private projectAnalyses: Map<string, ProjectAnalysis> = new Map();

  private constructor() {
    this.initializeBuiltInTemplates();
  }

  static getInstance(): SmartTemplatesService {
    if (!SmartTemplatesService.instance) {
      SmartTemplatesService.instance = new SmartTemplatesService();
    }
    return SmartTemplatesService.instance;
  }

  private initializeBuiltInTemplates(): void {
    const templates: Omit<Template, "id" | "createdAt" | "usageCount">[] = [
      {
        name: "React Component",
        category: "component",
        description: "Basic React functional component with TypeScript",
        files: [
          {
            path: "components/{{ComponentName}}.tsx",
            content: `interface {{ComponentName}}Props {
  className?: string;
}

export function {{ComponentName}}({ className }: {{ComponentName}}Props) {
  return (
    <div className={className}>
      <h2>{{ComponentName}}</h2>
    </div>
  );
}`,
            required: true
          }
        ],
        variables: [
          { name: "ComponentName", description: "Name of the component", type: "string" }
        ],
        tags: ["react", "component", "typescript"]
      },
      {
        name: "CRUD Feature",
        category: "crud",
        description: "Complete CRUD implementation with API routes and UI",
        files: [
          {
            path: "server/routes/{{resourceName}}.ts",
            content: `import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";

const router = Router();

const create{{ResourceName}}Schema = z.object({
  name: z.string().min(1),
  // Add more fields
});

router.get("/api/{{resourceName}}s", async (req, res) => {
  const items = await storage.get{{ResourceName}}s();
  res.json(items);
});

router.get("/api/{{resourceName}}s/:id", async (req, res) => {
  const item = await storage.get{{ResourceName}}(req.params.id);
  if (!item) return res.status(404).json({ error: "Not found" });
  res.json(item);
});

router.post("/api/{{resourceName}}s", async (req, res) => {
  const data = create{{ResourceName}}Schema.parse(req.body);
  const item = await storage.create{{ResourceName}}(data);
  res.status(201).json(item);
});

router.put("/api/{{resourceName}}s/:id", async (req, res) => {
  const data = create{{ResourceName}}Schema.partial().parse(req.body);
  const item = await storage.update{{ResourceName}}(req.params.id, data);
  res.json(item);
});

router.delete("/api/{{resourceName}}s/:id", async (req, res) => {
  await storage.delete{{ResourceName}}(req.params.id);
  res.status(204).send();
});

export default router;`,
            required: true
          },
          {
            path: "client/src/pages/{{ResourceName}}List.tsx",
            content: `import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export function {{ResourceName}}List() {
  const queryClient = useQueryClient();
  
  const { data: items, isLoading } = useQuery({
    queryKey: ["/api/{{resourceName}}s"]
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => 
      fetch(\`/api/{{resourceName}}s/\${id}\`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/{{resourceName}}s"] });
    }
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">{{ResourceName}}s</h1>
        <Button>Add New</Button>
      </div>
      <div className="grid gap-4">
        {items?.map((item: any) => (
          <Card key={item.id}>
            <CardHeader>
              <CardTitle>{item.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <Button 
                variant="destructive" 
                onClick={() => deleteMutation.mutate(item.id)}
              >
                Delete
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}`,
            required: true
          }
        ],
        variables: [
          { name: "ResourceName", description: "Name of the resource (PascalCase)", type: "string" },
          { name: "resourceName", description: "Name of the resource (camelCase)", type: "string" }
        ],
        tags: ["crud", "api", "full-stack"]
      },
      {
        name: "Form Component",
        category: "form",
        description: "Form with React Hook Form and Zod validation",
        files: [
          {
            path: "components/{{FormName}}Form.tsx",
            content: `import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const formSchema = z.object({
  {{#fields}}
  {{name}}: z.string().min(1, "{{label}} is required"),
  {{/fields}}
});

type FormData = z.infer<typeof formSchema>;

interface {{FormName}}FormProps {
  onSubmit: (data: FormData) => Promise<void>;
  defaultValues?: Partial<FormData>;
}

export function {{FormName}}Form({ onSubmit, defaultValues }: {{FormName}}FormProps) {
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues || {}
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {{#fields}}
        <FormField
          control={form.control}
          name="{{name}}"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{{label}}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {{/fields}}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Saving..." : "Save"}
        </Button>
      </form>
    </Form>
  );
}`,
            required: true
          }
        ],
        variables: [
          { name: "FormName", description: "Name of the form (PascalCase)", type: "string" },
          { name: "fields", description: "Form fields", type: "string" }
        ],
        tags: ["form", "validation", "react-hook-form"]
      },
      {
        name: "API Route",
        category: "api",
        description: "Express API route with validation",
        files: [
          {
            path: "server/routes/{{routeName}}.ts",
            content: `import { Router } from "express";
import { z } from "zod";
import { logger } from "../lib/logger";

const router = Router();

const requestSchema = z.object({
  // Define your request schema
});

router.get("/api/{{routeName}}", async (req, res) => {
  try {
    // Implementation
    res.json({ success: true });
  } catch (error) {
    logger.error("Error in {{routeName}}", { error });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/api/{{routeName}}", async (req, res) => {
  try {
    const data = requestSchema.parse(req.body);
    // Implementation
    res.status(201).json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    logger.error("Error in {{routeName}}", { error });
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;`,
            required: true
          }
        ],
        variables: [
          { name: "routeName", description: "Name of the route (kebab-case)", type: "string" }
        ],
        tags: ["api", "express", "validation"]
      },
      {
        name: "Auth Protected Page",
        category: "auth",
        description: "Page component with authentication check",
        files: [
          {
            path: "client/src/pages/{{PageName}}Page.tsx",
            content: `import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useEffect } from "react";

export function {{PageName}}Page() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/login");
    }
  }, [user, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">{{PageName}}</h1>
      {/* Page content */}
    </div>
  );
}`,
            required: true
          }
        ],
        variables: [
          { name: "PageName", description: "Name of the page (PascalCase)", type: "string" }
        ],
        tags: ["auth", "protected", "page"]
      }
    ];

    for (const template of templates) {
      this.addTemplate(template);
    }
  }

  addTemplate(template: Omit<Template, "id" | "createdAt" | "usageCount">): Template {
    const id = `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const newTemplate: Template = {
      ...template,
      id,
      createdAt: Date.now(),
      usageCount: 0
    };

    this.templates.set(id, newTemplate);
    logger.info("Template added", { id, name: template.name });
    return newTemplate;
  }

  analyzeProject(
    projectId: string,
    files: Array<{ path: string; content: string }>
  ): ProjectAnalysis {
    const analysis: ProjectAnalysis = {
      detectedStack: [],
      conventions: {
        componentStyle: "functional",
        fileNaming: "pascal",
        testLocation: "alongside"
      },
      existingPatterns: []
    };

    for (const file of files) {
      if (file.path.includes("package.json")) {
        const content = file.content;
        if (content.includes("react")) analysis.detectedStack.push("react");
        if (content.includes("typescript")) analysis.detectedStack.push("typescript");
        if (content.includes("tailwindcss")) analysis.detectedStack.push("tailwind");
        if (content.includes("express")) analysis.detectedStack.push("express");
        if (content.includes("drizzle")) analysis.detectedStack.push("drizzle");
      }

      if (file.content.includes("const") && file.content.includes("=>") && file.path.endsWith(".tsx")) {
        analysis.conventions.componentStyle = "arrow";
      }

      if (file.path.includes("-")) {
        analysis.conventions.fileNaming = "kebab";
      }

      if (file.path.includes(".test.") || file.path.includes(".spec.")) {
        analysis.conventions.testLocation = "alongside";
      }
    }

    this.projectAnalyses.set(projectId, analysis);
    return analysis;
  }

  generateFromTemplate(
    templateId: string,
    variables: Record<string, string>,
    projectId?: string
  ): GeneratedFiles {
    const template = this.templates.get(templateId);
    if (!template) {
      return { files: [], instructions: ["Template not found"] };
    }

    const analysis = projectId ? this.projectAnalyses.get(projectId) : undefined;
    const files: Array<{ path: string; content: string }> = [];
    const instructions: string[] = [];

    for (const templateFile of template.files) {
      let path = templateFile.path;
      let content = templateFile.content;

      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
        path = path.replace(regex, value);
        content = content.replace(regex, value);
      }

      if (analysis) {
        if (analysis.conventions.componentStyle === "arrow" && content.includes("function ")) {
          content = this.convertToArrowFunction(content);
        }
      }

      files.push({ path, content });
    }

    template.usageCount++;
    instructions.push(`Generated ${files.length} file(s) from template "${template.name}"`);

    return { files, instructions };
  }

  private convertToArrowFunction(content: string): string {
    return content.replace(
      /export function (\w+)\(([^)]*)\)/g,
      "export const $1 = ($2) =>"
    );
  }

  findTemplates(query: string, category?: TemplateCategory): Template[] {
    const queryLower = query.toLowerCase();
    let templates = Array.from(this.templates.values());

    if (category) {
      templates = templates.filter(t => t.category === category);
    }

    return templates
      .filter(t => 
        t.name.toLowerCase().includes(queryLower) ||
        t.description.toLowerCase().includes(queryLower) ||
        t.tags.some(tag => tag.includes(queryLower))
      )
      .sort((a, b) => b.usageCount - a.usageCount);
  }

  getByCategory(category: TemplateCategory): Template[] {
    return Array.from(this.templates.values())
      .filter(t => t.category === category);
  }

  getPopularTemplates(limit: number = 10): Template[] {
    return Array.from(this.templates.values())
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, limit);
  }

  deleteTemplate(templateId: string): boolean {
    return this.templates.delete(templateId);
  }
}

export const smartTemplatesService = SmartTemplatesService.getInstance();
