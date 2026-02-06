import logger from "../lib/logger";

export type DesignStyle = "minimal" | "modern" | "playful" | "corporate" | "creative";

export type DesignKeyword =
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

export interface DesignKeywordDefinition {
  id: DesignKeyword;
  name: string;
  description: string;
  cssProperties: Record<string, string>;
  tailwindClasses: string[];
  promptEnhancement: string;
  compatibleStyles: DesignStyle[];
}

const DESIGN_KEYWORD_DEFINITIONS: Record<DesignKeyword, DesignKeywordDefinition> = {
  glassmorphism: {
    id: "glassmorphism",
    name: "Glassmorphism",
    description: "Frosted glass effect with transparency and blur",
    cssProperties: {
      background: "rgba(255, 255, 255, 0.1)",
      backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",
      border: "1px solid rgba(255, 255, 255, 0.18)",
      borderRadius: "12px",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
    },
    tailwindClasses: ["bg-white/10", "backdrop-blur-xl", "border", "border-white/20", "rounded-xl", "shadow-lg"],
    promptEnhancement: "Use glassmorphism design: frosted glass panels with backdrop-blur, semi-transparent backgrounds (bg-white/10 dark:bg-white/5), subtle white borders (border-white/20), and layered depth. Cards and panels should have the glass effect against a gradient or image background.",
    compatibleStyles: ["modern", "creative", "minimal"],
  },
  neumorphism: {
    id: "neumorphism",
    name: "Neumorphism",
    description: "Soft UI with extruded shadows creating depth",
    cssProperties: {
      background: "#e0e5ec",
      borderRadius: "16px",
      boxShadow: "8px 8px 16px #b8bec7, -8px -8px 16px #ffffff",
      border: "none",
    },
    tailwindClasses: ["rounded-2xl", "shadow-[8px_8px_16px_#b8bec7,-8px_-8px_16px_#ffffff]"],
    promptEnhancement: "Use neumorphism (soft UI) design: elements appear extruded from the background using dual box-shadows (one dark, one light). Use a soft, muted background color. Buttons and cards use inset shadows for pressed states. Avoid sharp borders - rely on shadows for depth.",
    compatibleStyles: ["minimal", "modern"],
  },
  brutalism: {
    id: "brutalism",
    name: "Brutalism",
    description: "Raw, bold design with thick borders and high contrast",
    cssProperties: {
      border: "3px solid #000000",
      boxShadow: "4px 4px 0px #000000",
      borderRadius: "0",
      fontWeight: "900",
    },
    tailwindClasses: ["border-[3px]", "border-black", "dark:border-white", "shadow-[4px_4px_0px_#000]", "rounded-none", "font-black"],
    promptEnhancement: "Use brutalist web design: thick black borders (3px+), hard offset shadows, no border-radius, monospace or heavy fonts, high contrast colors, raw/unpolished aesthetic. Buttons should have sharp corners with offset shadows that shift on hover.",
    compatibleStyles: ["creative", "playful"],
  },
  retro: {
    id: "retro",
    name: "Retro / Vintage",
    description: "Nostalgic design with warm tones and classic typography",
    cssProperties: {
      fontFamily: "'Georgia', serif",
      background: "#faf3e0",
      borderRadius: "4px",
      border: "2px solid #8b7355",
      boxShadow: "2px 2px 0px #8b7355",
    },
    tailwindClasses: ["font-serif", "rounded", "border-2", "border-amber-700", "shadow-sm"],
    promptEnhancement: "Use retro/vintage design: warm earth tones (amber, brown, cream), serif typography, subtle textures, muted color palette, classic layout with generous whitespace. Buttons should feel tactile with subtle shadows and warm hover states.",
    compatibleStyles: ["playful", "creative", "corporate"],
  },
  "gradient-mesh": {
    id: "gradient-mesh",
    name: "Gradient Mesh",
    description: "Rich multi-color gradients with flowing shapes",
    cssProperties: {
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      borderRadius: "16px",
    },
    tailwindClasses: ["bg-gradient-to-br", "from-indigo-500", "via-purple-500", "to-pink-500", "rounded-2xl"],
    promptEnhancement: "Use gradient mesh design: rich multi-color gradients as backgrounds and accents. Layer mesh-like gradient blobs with blur effects. Use vibrant-to-subtle gradient transitions. Cards should have subtle gradient borders or backgrounds. The overall feel should be colorful and dynamic.",
    compatibleStyles: ["modern", "creative", "playful"],
  },
  aurora: {
    id: "aurora",
    name: "Aurora",
    description: "Northern lights inspired with animated color shifts",
    cssProperties: {
      background: "linear-gradient(135deg, #0c0c1d, #1a1a3e, #0d2137)",
      borderRadius: "12px",
      boxShadow: "0 0 40px rgba(100, 200, 255, 0.15)",
    },
    tailwindClasses: ["bg-gradient-to-br", "from-slate-900", "via-blue-950", "to-cyan-950", "rounded-xl"],
    promptEnhancement: "Use aurora/northern lights design: dark backgrounds (deep navy/slate) with luminous accent colors (cyan, teal, purple, green). Subtle glowing effects on interactive elements. Smooth gradient transitions mimicking aurora borealis. Text should be light with high readability against dark backgrounds.",
    compatibleStyles: ["modern", "creative"],
  },
  cyberpunk: {
    id: "cyberpunk",
    name: "Cyberpunk",
    description: "Neon-accented dark UI with futuristic elements",
    cssProperties: {
      background: "#0a0a0a",
      color: "#00ff88",
      borderRadius: "2px",
      border: "1px solid #00ff88",
      boxShadow: "0 0 10px rgba(0, 255, 136, 0.3), inset 0 0 10px rgba(0, 255, 136, 0.1)",
      fontFamily: "'JetBrains Mono', monospace",
    },
    tailwindClasses: ["bg-black", "text-green-400", "border", "border-green-400", "rounded-sm", "font-mono", "shadow-[0_0_10px_rgba(0,255,136,0.3)]"],
    promptEnhancement: "Use cyberpunk design: very dark backgrounds (#0a0a0a), neon accent colors (electric green #00ff88, hot pink #ff0080, electric blue #00d4ff), monospace fonts, scan-line or grid textures, glowing borders and text-shadows on interactive elements. Minimal border-radius (2px). Buttons glow on hover.",
    compatibleStyles: ["creative"],
  },
  organic: {
    id: "organic",
    name: "Organic",
    description: "Natural shapes with soft curves and earthy tones",
    cssProperties: {
      borderRadius: "24px 8px 24px 8px",
      background: "#f5f0e8",
      border: "1px solid #d4c5a9",
    },
    tailwindClasses: ["rounded-[24px_8px_24px_8px]", "bg-stone-100", "dark:bg-stone-900", "border", "border-stone-300"],
    promptEnhancement: "Use organic design: asymmetric border-radius (blob-like shapes), earthy natural color palette (stone, sage, sand, terracotta), soft shadows, generous padding, nature-inspired spacing. Elements should feel hand-crafted with gentle curves and warm tones.",
    compatibleStyles: ["playful", "minimal", "creative"],
  },
  "material-3": {
    id: "material-3",
    name: "Material Design 3",
    description: "Google's latest Material You design system",
    cssProperties: {
      borderRadius: "16px",
      background: "#FFFBFE",
      boxShadow: "0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)",
      fontFamily: "'Roboto', sans-serif",
    },
    tailwindClasses: ["rounded-2xl", "shadow-md", "font-sans"],
    promptEnhancement: "Use Material Design 3 (Material You) guidelines: rounded containers (16px radius), tonal surface colors, prominent FABs, dynamic color theming. Use elevation through shadows (not borders). Cards use surface-tint overlays. Buttons follow filled/outlined/text/tonal variants. Generous touch targets (48px).",
    compatibleStyles: ["modern", "corporate", "minimal"],
  },
  claymorphism: {
    id: "claymorphism",
    name: "Claymorphism",
    description: "3D clay-like elements with soft, inflated appearance",
    cssProperties: {
      background: "#f0e6ff",
      borderRadius: "24px",
      boxShadow: "8px 8px 16px rgba(0,0,0,0.1), -4px -4px 12px rgba(255,255,255,0.6), inset 2px 2px 4px rgba(255,255,255,0.6)",
      border: "none",
    },
    tailwindClasses: ["rounded-3xl", "shadow-[8px_8px_16px_rgba(0,0,0,0.1),-4px_-4px_12px_rgba(255,255,255,0.6)]"],
    promptEnhancement: "Use claymorphism design: elements look like soft 3D clay objects with inflated appearance. Use pastel colors, large border-radius (24px+), multi-layered shadows (outer + inner white highlight), and no sharp edges. Interactive elements should feel squishy with scale transforms on press.",
    compatibleStyles: ["playful", "creative"],
  },
};

interface DesignMockup {
  id: string;
  projectId: string;
  name: string;
  description: string;
  style: DesignStyle;
  components: MockupComponent[];
  layout: LayoutConfig;
  colorScheme: ColorScheme;
  createdAt: Date;
  approved: boolean;
  generatedCode?: string;
}

interface MockupComponent {
  id: string;
  type: "header" | "hero" | "nav" | "card" | "form" | "list" | "footer" | "sidebar" | "modal" | "button" | "input" | "section";
  name: string;
  props: Record<string, any>;
  children: MockupComponent[];
  position: { x: number; y: number };
  size: { width: string; height: string };
}

interface LayoutConfig {
  type: "single-column" | "two-column" | "three-column" | "sidebar-left" | "sidebar-right" | "dashboard";
  responsive: boolean;
  maxWidth: string;
  padding: string;
  gap: string;
}

interface ColorScheme {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  foreground: string;
  muted: string;
  border: string;
}

interface DesignTemplate {
  id: string;
  name: string;
  description: string;
  style: DesignStyle;
  category: "landing" | "dashboard" | "form" | "blog" | "ecommerce" | "portfolio" | "saas";
  components: MockupComponent[];
  layout: LayoutConfig;
  colorScheme: ColorScheme;
  usageCount: number;
}

const DEFAULT_COLOR_SCHEMES: Record<DesignStyle, ColorScheme> = {
  minimal: {
    primary: "#000000",
    secondary: "#666666",
    accent: "#0066FF",
    background: "#FFFFFF",
    foreground: "#000000",
    muted: "#F5F5F5",
    border: "#E5E5E5"
  },
  modern: {
    primary: "#6366F1",
    secondary: "#8B5CF6",
    accent: "#EC4899",
    background: "#0F172A",
    foreground: "#F8FAFC",
    muted: "#1E293B",
    border: "#334155"
  },
  playful: {
    primary: "#F59E0B",
    secondary: "#10B981",
    accent: "#EC4899",
    background: "#FEF3C7",
    foreground: "#1F2937",
    muted: "#FDE68A",
    border: "#FCD34D"
  },
  corporate: {
    primary: "#1E40AF",
    secondary: "#3B82F6",
    accent: "#059669",
    background: "#FFFFFF",
    foreground: "#1F2937",
    muted: "#F3F4F6",
    border: "#D1D5DB"
  },
  creative: {
    primary: "#7C3AED",
    secondary: "#DB2777",
    accent: "#F97316",
    background: "#18181B",
    foreground: "#FAFAFA",
    muted: "#27272A",
    border: "#3F3F46"
  }
};

class DesignModeService {
  private static instance: DesignModeService;
  private readonly MAX_MOCKUPS = 500;
  private mockups: Map<string, DesignMockup> = new Map();
  private templates: Map<string, DesignTemplate> = new Map();
  private enabled: boolean = true;
  private projectStyles: Map<string, DesignStyle> = new Map();

  private constructor() {
    this.initializeTemplates();
    logger.info("DesignModeService initialized");
  }

  static getInstance(): DesignModeService {
    if (!DesignModeService.instance) {
      DesignModeService.instance = new DesignModeService();
    }
    return DesignModeService.instance;
  }

  private initializeTemplates(): void {
    const landingTemplate: DesignTemplate = {
      id: "template_landing_modern",
      name: "Modern Landing Page",
      description: "Clean landing page with hero, features, and CTA sections",
      style: "modern",
      category: "landing",
      components: [
        {
          id: "header",
          type: "header",
          name: "Navigation Header",
          props: { logo: true, navItems: 4, cta: true },
          children: [],
          position: { x: 0, y: 0 },
          size: { width: "100%", height: "64px" }
        },
        {
          id: "hero",
          type: "hero",
          name: "Hero Section",
          props: { headline: true, subheadline: true, cta: 2, image: true },
          children: [],
          position: { x: 0, y: 64 },
          size: { width: "100%", height: "600px" }
        },
        {
          id: "features",
          type: "section",
          name: "Features Grid",
          props: { columns: 3, cards: 6 },
          children: [],
          position: { x: 0, y: 664 },
          size: { width: "100%", height: "400px" }
        },
        {
          id: "footer",
          type: "footer",
          name: "Footer",
          props: { columns: 4, social: true, newsletter: true },
          children: [],
          position: { x: 0, y: 1064 },
          size: { width: "100%", height: "200px" }
        }
      ],
      layout: {
        type: "single-column",
        responsive: true,
        maxWidth: "1200px",
        padding: "16px",
        gap: "32px"
      },
      colorScheme: DEFAULT_COLOR_SCHEMES.modern,
      usageCount: 0
    };

    const dashboardTemplate: DesignTemplate = {
      id: "template_dashboard",
      name: "Admin Dashboard",
      description: "Dashboard layout with sidebar, stats, and data tables",
      style: "corporate",
      category: "dashboard",
      components: [
        {
          id: "sidebar",
          type: "sidebar",
          name: "Navigation Sidebar",
          props: { items: 8, collapsible: true },
          children: [],
          position: { x: 0, y: 0 },
          size: { width: "250px", height: "100vh" }
        },
        {
          id: "header",
          type: "header",
          name: "Top Bar",
          props: { search: true, notifications: true, profile: true },
          children: [],
          position: { x: 250, y: 0 },
          size: { width: "calc(100% - 250px)", height: "64px" }
        },
        {
          id: "stats",
          type: "section",
          name: "Stats Cards",
          props: { cards: 4 },
          children: [],
          position: { x: 250, y: 64 },
          size: { width: "calc(100% - 250px)", height: "150px" }
        },
        {
          id: "content",
          type: "section",
          name: "Main Content",
          props: { table: true, chart: true },
          children: [],
          position: { x: 250, y: 214 },
          size: { width: "calc(100% - 250px)", height: "calc(100vh - 214px)" }
        }
      ],
      layout: {
        type: "sidebar-left",
        responsive: true,
        maxWidth: "100%",
        padding: "24px",
        gap: "24px"
      },
      colorScheme: DEFAULT_COLOR_SCHEMES.corporate,
      usageCount: 0
    };

    const formTemplate: DesignTemplate = {
      id: "template_form",
      name: "Multi-Step Form",
      description: "Form with progress indicator and multiple steps",
      style: "minimal",
      category: "form",
      components: [
        {
          id: "progress",
          type: "section",
          name: "Progress Indicator",
          props: { steps: 4, current: 1 },
          children: [],
          position: { x: 0, y: 0 },
          size: { width: "100%", height: "80px" }
        },
        {
          id: "form",
          type: "form",
          name: "Form Content",
          props: { fields: 5, validation: true },
          children: [],
          position: { x: 0, y: 80 },
          size: { width: "100%", height: "400px" }
        },
        {
          id: "actions",
          type: "section",
          name: "Form Actions",
          props: { back: true, next: true, submit: true },
          children: [],
          position: { x: 0, y: 480 },
          size: { width: "100%", height: "60px" }
        }
      ],
      layout: {
        type: "single-column",
        responsive: true,
        maxWidth: "600px",
        padding: "32px",
        gap: "24px"
      },
      colorScheme: DEFAULT_COLOR_SCHEMES.minimal,
      usageCount: 0
    };

    this.templates.set(landingTemplate.id, landingTemplate);
    this.templates.set(dashboardTemplate.id, dashboardTemplate);
    this.templates.set(formTemplate.id, formTemplate);

    logger.info("Design templates initialized", { count: this.templates.size });
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.info("Design mode", { enabled });
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setProjectStyle(projectId: string, style: DesignStyle): void {
    this.projectStyles.set(projectId, style);
  }

  getProjectStyle(projectId: string): DesignStyle {
    return this.projectStyles.get(projectId) || "modern";
  }

  createMockup(
    projectId: string,
    name: string,
    description: string,
    style?: DesignStyle,
    templateId?: string
  ): DesignMockup {
    const mockupId = `mockup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const effectiveStyle = style || this.getProjectStyle(projectId);

    let components: MockupComponent[] = [];
    let layout: LayoutConfig = {
      type: "single-column",
      responsive: true,
      maxWidth: "1200px",
      padding: "16px",
      gap: "24px"
    };

    if (templateId && this.templates.has(templateId)) {
      const template = this.templates.get(templateId)!;
      components = JSON.parse(JSON.stringify(template.components));
      layout = { ...template.layout };
      template.usageCount++;
    }

    const mockup: DesignMockup = {
      id: mockupId,
      projectId,
      name,
      description,
      style: effectiveStyle,
      components,
      layout,
      colorScheme: DEFAULT_COLOR_SCHEMES[effectiveStyle],
      createdAt: new Date(),
      approved: false
    };

    this.mockups.set(mockupId, mockup);
    this.evictMockupsIfNeeded();
    logger.info("Mockup created", { mockupId, projectId, style: effectiveStyle });

    return mockup;
  }

  private evictMockupsIfNeeded(): void {
    if (this.mockups.size > this.MAX_MOCKUPS) {
      const sorted = Array.from(this.mockups.entries())
        .sort((a, b) => a[1].createdAt.getTime() - b[1].createdAt.getTime());
      const toRemove = sorted.slice(0, this.mockups.size - this.MAX_MOCKUPS);
      for (const [key] of toRemove) {
        this.mockups.delete(key);
      }
    }
  }

  destroy(): void {
    this.mockups.clear();
    this.projectStyles.clear();
  }

  addComponent(mockupId: string, component: Omit<MockupComponent, "id">): MockupComponent | null {
    const mockup = this.mockups.get(mockupId);
    if (!mockup) return null;

    const newComponent: MockupComponent = {
      ...component,
      id: `comp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
    };

    mockup.components.push(newComponent);
    this.mockups.set(mockupId, mockup);

    return newComponent;
  }

  updateLayout(mockupId: string, layout: Partial<LayoutConfig>): boolean {
    const mockup = this.mockups.get(mockupId);
    if (!mockup) return false;

    mockup.layout = { ...mockup.layout, ...layout };
    this.mockups.set(mockupId, mockup);

    return true;
  }

  updateColorScheme(mockupId: string, colors: Partial<ColorScheme>): boolean {
    const mockup = this.mockups.get(mockupId);
    if (!mockup) return false;

    mockup.colorScheme = { ...mockup.colorScheme, ...colors };
    this.mockups.set(mockupId, mockup);

    return true;
  }

  approveMockup(mockupId: string): boolean {
    const mockup = this.mockups.get(mockupId);
    if (!mockup) return false;

    mockup.approved = true;
    this.mockups.set(mockupId, mockup);
    logger.info("Mockup approved", { mockupId });

    return true;
  }

  generateCodeFromMockup(mockupId: string): string | null {
    const mockup = this.mockups.get(mockupId);
    if (!mockup) return null;

    const code = this.buildComponentCode(mockup);
    mockup.generatedCode = code;
    this.mockups.set(mockupId, mockup);

    return code;
  }

  private buildComponentCode(mockup: DesignMockup): string {
    const imports = new Set<string>();
    imports.add("import React from 'react';");

    const componentCode = mockup.components.map(comp => {
      return this.generateComponentJSX(comp, mockup.colorScheme);
    }).join("\n\n");

    const cssVars = `
const cssVars = {
  '--primary': '${mockup.colorScheme.primary}',
  '--secondary': '${mockup.colorScheme.secondary}',
  '--accent': '${mockup.colorScheme.accent}',
  '--background': '${mockup.colorScheme.background}',
  '--foreground': '${mockup.colorScheme.foreground}',
  '--muted': '${mockup.colorScheme.muted}',
  '--border': '${mockup.colorScheme.border}',
} as React.CSSProperties;`;

    return `${Array.from(imports).join("\n")}

${cssVars}

export default function ${this.toPascalCase(mockup.name)}() {
  return (
    <div 
      style={{ 
        ...cssVars,
        maxWidth: '${mockup.layout.maxWidth}',
        padding: '${mockup.layout.padding}',
        display: 'flex',
        flexDirection: 'column',
        gap: '${mockup.layout.gap}',
        margin: '0 auto'
      }}
    >
      ${componentCode}
    </div>
  );
}`;
  }

  private generateComponentJSX(component: MockupComponent, colors: ColorScheme): string {
    switch (component.type) {
      case "header":
        return `{/* ${component.name} */}
      <header style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        padding: '16px 24px',
        borderBottom: '1px solid var(--border)'
      }}>
        <div style={{ fontWeight: 'bold', fontSize: '1.25rem' }}>Logo</div>
        <nav style={{ display: 'flex', gap: '24px' }}>
          <a href="#">Home</a>
          <a href="#">Features</a>
          <a href="#">Pricing</a>
          <a href="#">Contact</a>
        </nav>
        <button style={{ 
          backgroundColor: 'var(--primary)', 
          color: 'white',
          padding: '8px 16px',
          borderRadius: '6px',
          border: 'none'
        }}>Get Started</button>
      </header>`;

      case "hero":
        return `{/* ${component.name} */}
      <section style={{ 
        textAlign: 'center', 
        padding: '80px 24px',
        background: 'var(--muted)'
      }}>
        <h1 style={{ fontSize: '3rem', marginBottom: '16px' }}>Welcome to Your App</h1>
        <p style={{ fontSize: '1.25rem', color: 'var(--secondary)', marginBottom: '32px' }}>
          Build something amazing with our platform
        </p>
        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
          <button style={{ 
            backgroundColor: 'var(--primary)', 
            color: 'white',
            padding: '12px 24px',
            borderRadius: '6px',
            border: 'none'
          }}>Get Started</button>
          <button style={{ 
            backgroundColor: 'transparent', 
            color: 'var(--primary)',
            padding: '12px 24px',
            borderRadius: '6px',
            border: '1px solid var(--primary)'
          }}>Learn More</button>
        </div>
      </section>`;

      case "section":
        return `{/* ${component.name} */}
      <section style={{ padding: '48px 24px' }}>
        <h2 style={{ fontSize: '2rem', marginBottom: '32px', textAlign: 'center' }}>
          ${component.name}
        </h2>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '24px'
        }}>
          {/* Content cards go here */}
        </div>
      </section>`;

      case "footer":
        return `{/* ${component.name} */}
      <footer style={{ 
        padding: '48px 24px',
        borderTop: '1px solid var(--border)',
        background: 'var(--muted)'
      }}>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '32px'
        }}>
          <div>
            <h4>Company</h4>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              <li><a href="#">About</a></li>
              <li><a href="#">Careers</a></li>
              <li><a href="#">Press</a></li>
            </ul>
          </div>
        </div>
        <p style={{ textAlign: 'center', marginTop: '32px', color: 'var(--secondary)' }}>
          © 2024 Your Company. All rights reserved.
        </p>
      </footer>`;

      default:
        return `{/* ${component.name} */}
      <div style={{ padding: '24px', border: '1px solid var(--border)', borderRadius: '8px' }}>
        {/* ${component.type} component */}
      </div>`;
    }
  }

  private toPascalCase(str: string): string {
    return str
      .split(/[\s-_]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join("");
  }

  getMockup(mockupId: string): DesignMockup | null {
    return this.mockups.get(mockupId) || null;
  }

  getProjectMockups(projectId: string): DesignMockup[] {
    return Array.from(this.mockups.values())
      .filter(m => m.projectId === projectId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  getTemplates(category?: DesignTemplate["category"]): DesignTemplate[] {
    const templates = Array.from(this.templates.values());
    if (category) {
      return templates.filter(t => t.category === category);
    }
    return templates;
  }

  getTemplate(templateId: string): DesignTemplate | null {
    return this.templates.get(templateId) || null;
  }

  getColorSchemes(): Record<DesignStyle, ColorScheme> {
    return { ...DEFAULT_COLOR_SCHEMES };
  }

  inferDesignFromPrompt(prompt: string): {
    suggestedStyle: DesignStyle;
    suggestedTemplate?: string;
    suggestedComponents: MockupComponent["type"][];
  } {
    const lowerPrompt = prompt.toLowerCase();

    let suggestedStyle: DesignStyle = "modern";
    if (lowerPrompt.includes("minimal") || lowerPrompt.includes("clean") || lowerPrompt.includes("simple")) {
      suggestedStyle = "minimal";
    } else if (lowerPrompt.includes("playful") || lowerPrompt.includes("fun") || lowerPrompt.includes("colorful")) {
      suggestedStyle = "playful";
    } else if (lowerPrompt.includes("corporate") || lowerPrompt.includes("professional") || lowerPrompt.includes("business")) {
      suggestedStyle = "corporate";
    } else if (lowerPrompt.includes("creative") || lowerPrompt.includes("artistic") || lowerPrompt.includes("bold")) {
      suggestedStyle = "creative";
    }

    let suggestedTemplate: string | undefined;
    if (lowerPrompt.includes("dashboard") || lowerPrompt.includes("admin")) {
      suggestedTemplate = "template_dashboard";
    } else if (lowerPrompt.includes("landing") || lowerPrompt.includes("homepage")) {
      suggestedTemplate = "template_landing_modern";
    } else if (lowerPrompt.includes("form") || lowerPrompt.includes("wizard")) {
      suggestedTemplate = "template_form";
    }

    const suggestedComponents: MockupComponent["type"][] = [];
    if (lowerPrompt.includes("header") || lowerPrompt.includes("nav")) suggestedComponents.push("header");
    if (lowerPrompt.includes("hero") || lowerPrompt.includes("banner")) suggestedComponents.push("hero");
    if (lowerPrompt.includes("sidebar")) suggestedComponents.push("sidebar");
    if (lowerPrompt.includes("form") || lowerPrompt.includes("input")) suggestedComponents.push("form");
    if (lowerPrompt.includes("card") || lowerPrompt.includes("tile")) suggestedComponents.push("card");
    if (lowerPrompt.includes("list") || lowerPrompt.includes("table")) suggestedComponents.push("list");
    if (lowerPrompt.includes("footer")) suggestedComponents.push("footer");
    if (lowerPrompt.includes("modal") || lowerPrompt.includes("dialog")) suggestedComponents.push("modal");

    return { suggestedStyle, suggestedTemplate, suggestedComponents };
  }

  getDesignKeywords(): DesignKeywordDefinition[] {
    return Object.values(DESIGN_KEYWORD_DEFINITIONS);
  }

  getDesignKeyword(keyword: DesignKeyword): DesignKeywordDefinition | null {
    return DESIGN_KEYWORD_DEFINITIONS[keyword] || null;
  }

  detectKeywordsInPrompt(prompt: string): DesignKeyword[] {
    const lower = prompt.toLowerCase();
    const detected: DesignKeyword[] = [];

    const patterns: Record<DesignKeyword, RegExp> = {
      glassmorphism: /glass(?:morphism)?|frosted|translucent|blur(?:red)?\s*(?:glass|card|panel)/,
      neumorphism: /neum(?:orphism)?|soft\s*ui|extruded|embossed/,
      brutalism: /brutal(?:ism|ist)?|raw\s*design|thick\s*border/,
      retro: /retro|vintage|nostalgic|old[- ]?school|classic\s*(?:design|style)/,
      "gradient-mesh": /gradient[- ]?mesh|mesh\s*gradient|multi[- ]?color\s*gradient/,
      aurora: /aurora|northern\s*lights|borealis|luminous/,
      cyberpunk: /cyber(?:punk)?|neon|futuristic|sci[- ]?fi|matrix/,
      organic: /organic|natural|earthy|blob|asymmetric/,
      "material-3": /material\s*(?:design\s*)?(?:3|you|three)|m3\s*design/,
      claymorphism: /clay(?:morphism)?|inflated|squishy|3d\s*clay/,
    };

    for (const [keyword, pattern] of Object.entries(patterns)) {
      if (pattern.test(lower)) {
        detected.push(keyword as DesignKeyword);
      }
    }

    return detected;
  }

  enhancePromptWithKeywords(prompt: string, keywords?: DesignKeyword[]): string {
    const detectedKeywords = keywords || this.detectKeywordsInPrompt(prompt);
    if (detectedKeywords.length === 0) return prompt;

    const enhancements = detectedKeywords
      .map(kw => DESIGN_KEYWORD_DEFINITIONS[kw]?.promptEnhancement)
      .filter(Boolean);

    if (enhancements.length === 0) return prompt;

    return `${prompt}\n\n--- Design Style Instructions ---\n${enhancements.join("\n\n")}`;
  }

  getKeywordCSSProperties(keywords: DesignKeyword[]): Record<string, string> {
    const merged: Record<string, string> = {};
    for (const kw of keywords) {
      const def = DESIGN_KEYWORD_DEFINITIONS[kw];
      if (def) {
        Object.assign(merged, def.cssProperties);
      }
    }
    return merged;
  }

  getKeywordTailwindClasses(keywords: DesignKeyword[]): string[] {
    const classes: string[] = [];
    for (const kw of keywords) {
      const def = DESIGN_KEYWORD_DEFINITIONS[kw];
      if (def) {
        classes.push(...def.tailwindClasses);
      }
    }
    return Array.from(new Set(classes));
  }

  getStats(): {
    enabled: boolean;
    totalMockups: number;
    approvedMockups: number;
    totalTemplates: number;
    templateUsage: Record<string, number>;
  } {
    const mockups = Array.from(this.mockups.values());
    const templates = Array.from(this.templates.values());

    const templateUsage: Record<string, number> = {};
    templates.forEach(t => {
      templateUsage[t.name] = t.usageCount;
    });

    return {
      enabled: this.enabled,
      totalMockups: mockups.length,
      approvedMockups: mockups.filter(m => m.approved).length,
      totalTemplates: templates.length,
      templateUsage
    };
  }
}

export const designModeService = DesignModeService.getInstance();
