import { BaseService, ManagedMap } from "../lib/base-service";

interface ImportedDesign {
  id: string;
  projectId: string;
  sourceType: "image" | "screenshot" | "figma-export";
  fileName: string;
  imageData?: string;
  analysisPrompt: string;
  extractedElements: DesignElement[];
  generatedPrompt: string;
  status: "uploaded" | "analyzing" | "analyzed" | "generating" | "complete" | "error";
  createdAt: Date;
  error?: string;
}

interface DesignElement {
  type: "header" | "hero" | "card" | "button" | "input" | "text" | "image" | "nav" | "footer" | "list" | "form" | "sidebar" | "modal";
  description: string;
  estimatedPosition: { x: number; y: number; width: number; height: number };
  suggestedComponent: string;
  confidence: number;
}

class ImageImportService extends BaseService {
  private static instance: ImageImportService;
  private readonly MAX_IMPORTS = 200;
  private imports: ManagedMap<string, ImportedDesign>;

  private constructor() {
    super("ImageImportService");
    this.imports = this.createManagedMap<string, ImportedDesign>({ maxSize: 200, strategy: "lru" });
  }

  static getInstance(): ImageImportService {
    if (!ImageImportService.instance) {
      ImageImportService.instance = new ImageImportService();
    }
    return ImageImportService.instance;
  }

  createImport(
    projectId: string,
    sourceType: ImportedDesign["sourceType"],
    fileName: string,
    imageData?: string
  ): ImportedDesign {
    const id = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const importRecord: ImportedDesign = {
      id,
      projectId,
      sourceType,
      fileName,
      imageData,
      analysisPrompt: "",
      extractedElements: [],
      generatedPrompt: "",
      status: "uploaded",
      createdAt: new Date(),
    };

    this.imports.set(id, importRecord);

    this.log("Design import created", { id, projectId, sourceType, fileName });
    return importRecord;
  }

  generateAnalysisPrompt(importId: string): string | null {
    const record = this.imports.get(importId);
    if (!record) {
      this.logWarn("Import not found for analysis prompt generation", { importId });
      return null;
    }

    record.status = "analyzing";

    const sourceDescription = {
      image: "a design mockup image",
      screenshot: "a screenshot of an existing website or application",
      "figma-export": "an exported Figma design file",
    }[record.sourceType];

    const prompt = `You are a UI/UX analysis expert. Analyze ${sourceDescription} named "${record.fileName}" and identify all visual elements present.

For each element found, provide:
1. **type**: One of: header, hero, card, button, input, text, image, nav, footer, list, form, sidebar, modal
2. **description**: A detailed description of the element's appearance, content, and styling
3. **estimatedPosition**: Approximate position as {x, y, width, height} in percentage of viewport (0-100)
4. **suggestedComponent**: The recommended React/shadcn component to implement this element (e.g., "Card with CardHeader and CardContent", "Button variant=outline", "Input with Label")
5. **confidence**: How confident you are in this identification (0.0 to 1.0)

Focus on:
- Layout structure (columns, grids, flex arrangements)
- Color palette and typography choices
- Interactive elements (buttons, forms, inputs)
- Navigation patterns
- Content hierarchy and spacing
- Responsive design considerations

Return the analysis as a structured JSON array of elements.`;

    record.analysisPrompt = prompt;
    this.imports.set(importId, record);

    this.log("Analysis prompt generated", { importId, sourceType: record.sourceType });
    return prompt;
  }

  setAnalysisResult(importId: string, elements: DesignElement[]): boolean {
    const record = this.imports.get(importId);
    if (!record) {
      this.logWarn("Import not found for setting analysis result", { importId });
      return false;
    }

    record.extractedElements = elements;
    record.status = "analyzed";
    this.imports.set(importId, record);

    this.log("Analysis result stored", { importId, elementCount: elements.length });
    return true;
  }

  generateCodePrompt(importId: string): string | null {
    const record = this.imports.get(importId);
    if (!record) {
      this.logWarn("Import not found for code prompt generation", { importId });
      return null;
    }

    if (record.extractedElements.length === 0) {
      this.logWarn("No extracted elements available for code generation", { importId });
      return null;
    }

    record.status = "generating";

    const elementDescriptions = record.extractedElements
      .sort((a, b) => a.estimatedPosition.y - b.estimatedPosition.y)
      .map((el, i) => {
        return `${i + 1}. **${el.type.toUpperCase()}** (confidence: ${(el.confidence * 100).toFixed(0)}%)
   - Description: ${el.description}
   - Position: x=${el.estimatedPosition.x}%, y=${el.estimatedPosition.y}%, w=${el.estimatedPosition.width}%, h=${el.estimatedPosition.height}%
   - Suggested component: ${el.suggestedComponent}`;
      })
      .join("\n\n");

    const layoutElements = record.extractedElements.map((el) => el.type);
    const hasNavigation = layoutElements.includes("nav") || layoutElements.includes("header");
    const hasFooter = layoutElements.includes("footer");
    const hasSidebar = layoutElements.includes("sidebar");
    const hasHero = layoutElements.includes("hero");
    const formCount = layoutElements.filter((t) => t === "form" || t === "input").length;
    const cardCount = layoutElements.filter((t) => t === "card").length;

    let layoutSuggestion = "single-column layout";
    if (hasSidebar) {
      layoutSuggestion = "sidebar layout using the Shadcn Sidebar component";
    } else if (cardCount >= 3) {
      layoutSuggestion = "responsive grid layout for card-based content";
    } else if (formCount >= 2) {
      layoutSuggestion = "form-focused layout with clear input grouping";
    }

    const prompt = `Generate a complete, production-ready React component that faithfully recreates the following design. Use TypeScript, Tailwind CSS, and shadcn/ui components.

## Source
File: "${record.fileName}" (${record.sourceType})

## Detected Elements (${record.extractedElements.length} total)

${elementDescriptions}

## Layout Analysis
- Layout type: ${layoutSuggestion}
- Has navigation: ${hasNavigation ? "Yes" : "No"}
- Has footer: ${hasFooter ? "Yes" : "No"}
- Has sidebar: ${hasSidebar ? "Yes" : "No"}
- Has hero section: ${hasHero ? "Yes" : "No"}
- Form elements: ${formCount}
- Card elements: ${cardCount}

## Implementation Requirements
1. Use shadcn/ui components: Button, Card, Input, Label, Badge, etc.
2. Use Tailwind CSS for all styling — no inline styles
3. Ensure the layout is fully responsive (mobile-first)
4. Follow accessibility best practices (proper ARIA labels, semantic HTML)
5. Add data-testid attributes to all interactive elements
6. Use lucide-react icons where appropriate
7. Match the visual hierarchy and spacing from the original design
8. Include proper TypeScript types for all props and state
9. Use the existing color scheme variables from the project's CSS

Generate the complete component code with all necessary imports.`;

    record.generatedPrompt = prompt;
    this.imports.set(importId, record);

    this.log("Code generation prompt created", {
      importId,
      elementCount: record.extractedElements.length,
      layoutSuggestion,
    });
    return prompt;
  }

  getImport(importId: string): ImportedDesign | null {
    return this.imports.get(importId) || null;
  }

  getProjectImports(projectId: string): ImportedDesign[] {
    return this.imports.values()
      .filter((imp) => imp.projectId === projectId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  getStats(): {
    totalImports: number;
    byStatus: Record<string, number>;
    bySourceType: Record<string, number>;
  } {
    const byStatus: Record<string, number> = {};
    const bySourceType: Record<string, number> = {};

    for (const [, imp] of this.imports.entries()) {
      byStatus[imp.status] = (byStatus[imp.status] || 0) + 1;
      bySourceType[imp.sourceType] = (bySourceType[imp.sourceType] || 0) + 1;
    }

    return {
      totalImports: this.imports.size,
      byStatus,
      bySourceType,
    };
  }

  destroy(): void {
    this.imports.clear();
    this.log("ImageImportService destroyed");
  }
}

export const imageImportService = ImageImportService.getInstance();
