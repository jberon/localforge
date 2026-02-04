import logger from "../lib/logger";

interface FileInfo {
  path: string;
  content: string;
  language?: string;
}

interface DocumentationResult {
  readme: string;
  jsdocSuggestions: JsdocSuggestion[];
  projectSummary: ProjectSummary;
}

interface JsdocSuggestion {
  filePath: string;
  line: number;
  functionName: string;
  suggestedDoc: string;
}

interface ProjectSummary {
  name: string;
  description: string;
  mainFeatures: string[];
  techStack: string[];
  fileCount: number;
  dependencies: string[];
}

interface FunctionInfo {
  name: string;
  params: string[];
  returnType?: string;
  line: number;
  isAsync: boolean;
  isExported: boolean;
}

class AutoDocumentationService {
  private static instance: AutoDocumentationService;

  private constructor() {}

  static getInstance(): AutoDocumentationService {
    if (!AutoDocumentationService.instance) {
      AutoDocumentationService.instance = new AutoDocumentationService();
    }
    return AutoDocumentationService.instance;
  }

  async generateDocumentation(
    files: FileInfo[],
    projectName: string = "Generated Project"
  ): Promise<DocumentationResult> {
    logger.info("Generating documentation", { fileCount: files.length, projectName });

    const projectSummary = this.analyzeProject(files, projectName);
    const jsdocSuggestions = this.generateJsdocSuggestions(files);
    const readme = this.generateReadme(projectSummary, files);

    return {
      readme,
      jsdocSuggestions,
      projectSummary,
    };
  }

  private analyzeProject(files: FileInfo[], projectName: string): ProjectSummary {
    const techStack = new Set<string>();
    const dependencies = new Set<string>();
    const features: string[] = [];

    for (const file of files) {
      const ext = file.path.split(".").pop()?.toLowerCase();
      
      if (ext === "tsx" || ext === "jsx") {
        techStack.add("React");
      }
      if (ext === "ts" || ext === "tsx") {
        techStack.add("TypeScript");
      }
      if (file.path.includes("tailwind")) {
        techStack.add("Tailwind CSS");
      }
      if (file.content.includes("express")) {
        techStack.add("Express.js");
      }
      if (file.content.includes("drizzle")) {
        techStack.add("Drizzle ORM");
      }
      if (file.content.includes("postgres") || file.content.includes("pg")) {
        techStack.add("PostgreSQL");
      }

      const importMatches = Array.from(file.content.matchAll(/import\s+.*\s+from\s+['"]([^'"./][^'"]*)['"]/g));
      for (const match of importMatches) {
        const pkg = match[1].split("/")[0];
        if (!pkg.startsWith("@") || pkg.includes("/")) {
          dependencies.add(pkg);
        } else {
          dependencies.add(match[1].split("/").slice(0, 2).join("/"));
        }
      }

      if (file.content.includes("useAuth") || file.content.includes("login")) {
        if (!features.includes("Authentication")) features.push("Authentication");
      }
      if (file.content.includes("useQuery") || file.content.includes("useMutation")) {
        if (!features.includes("Data Fetching")) features.push("Data Fetching");
      }
      if (file.content.includes("form") || file.content.includes("Form")) {
        if (!features.includes("Form Handling")) features.push("Form Handling");
      }
    }

    const componentFiles = files.filter(f => 
      f.path.includes("components") || f.path.endsWith(".tsx") || f.path.endsWith(".jsx")
    );
    const apiFiles = files.filter(f => 
      f.path.includes("api") || f.path.includes("routes") || f.path.includes("server")
    );

    if (componentFiles.length > 0) features.push("React Components");
    if (apiFiles.length > 0) features.push("REST API");

    return {
      name: projectName,
      description: this.generateDescription(files, techStack),
      mainFeatures: features,
      techStack: Array.from(techStack),
      fileCount: files.length,
      dependencies: Array.from(dependencies).slice(0, 20),
    };
  }

  private generateDescription(files: FileInfo[], techStack: Set<string>): string {
    const hasReact = techStack.has("React");
    const hasExpress = techStack.has("Express.js");
    const hasDb = techStack.has("PostgreSQL") || techStack.has("Drizzle ORM");

    if (hasReact && hasExpress && hasDb) {
      return "A full-stack web application with React frontend, Express.js backend, and PostgreSQL database.";
    } else if (hasReact && hasExpress) {
      return "A web application with React frontend and Express.js backend.";
    } else if (hasReact) {
      return "A React-based frontend application.";
    } else if (hasExpress) {
      return "An Express.js backend API service.";
    }
    
    return "A generated application project.";
  }

  private generateJsdocSuggestions(files: FileInfo[]): JsdocSuggestion[] {
    const suggestions: JsdocSuggestion[] = [];

    for (const file of files) {
      if (!file.path.endsWith(".ts") && !file.path.endsWith(".tsx") && 
          !file.path.endsWith(".js") && !file.path.endsWith(".jsx")) {
        continue;
      }

      const functions = this.extractFunctions(file.content);
      
      for (const func of functions) {
        if (!this.hasJsdoc(file.content, func.line)) {
          suggestions.push({
            filePath: file.path,
            line: func.line,
            functionName: func.name,
            suggestedDoc: this.generateJsdoc(func),
          });
        }
      }
    }

    return suggestions.slice(0, 50);
  }

  private extractFunctions(content: string): FunctionInfo[] {
    const functions: FunctionInfo[] = [];
    const lines = content.split("\n");

    const patterns = [
      /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/,
      /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)(?:\s*:\s*([^=]+))?\s*=>/,
      /^(?:export\s+)?(?:async\s+)?(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*\{/,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          const [, name, params, returnType] = match;
          if (name && !["if", "for", "while", "switch", "catch"].includes(name)) {
            functions.push({
              name,
              params: params ? params.split(",").map(p => p.trim()).filter(Boolean) : [],
              returnType: returnType?.trim(),
              line: i + 1,
              isAsync: line.includes("async"),
              isExported: line.includes("export"),
            });
          }
          break;
        }
      }
    }

    return functions;
  }

  private hasJsdoc(content: string, line: number): boolean {
    const lines = content.split("\n");
    if (line <= 1) return false;
    
    for (let i = line - 2; i >= Math.max(0, line - 10); i--) {
      const prevLine = lines[i].trim();
      if (prevLine.startsWith("*/")) return true;
      if (prevLine && !prevLine.startsWith("*") && !prevLine.startsWith("//")) break;
    }
    
    return false;
  }

  private generateJsdoc(func: FunctionInfo): string {
    const lines = ["/**"];
    lines.push(` * ${this.generateFunctionDescription(func.name)}`);
    
    for (const param of func.params) {
      const paramName = param.split(":")[0].trim().replace(/[?=].*/, "");
      if (paramName) {
        lines.push(` * @param ${paramName} - Parameter description`);
      }
    }
    
    if (func.returnType && func.returnType !== "void") {
      lines.push(` * @returns ${func.returnType.trim()}`);
    }
    
    lines.push(" */");
    return lines.join("\n");
  }

  private generateFunctionDescription(name: string): string {
    const words = name.replace(/([A-Z])/g, " $1").toLowerCase().trim().split(" ");
    
    const verb = words[0];
    const rest = words.slice(1).join(" ");
    
    const verbMappings: Record<string, string> = {
      get: "Retrieves",
      set: "Sets",
      fetch: "Fetches",
      create: "Creates",
      update: "Updates",
      delete: "Deletes",
      handle: "Handles",
      on: "Event handler for",
      is: "Checks if",
      has: "Checks whether",
      validate: "Validates",
      parse: "Parses",
      format: "Formats",
      render: "Renders",
      load: "Loads",
      save: "Saves",
      init: "Initializes",
      process: "Processes",
    };

    const mappedVerb = verbMappings[verb] || `${verb.charAt(0).toUpperCase() + verb.slice(1)}s`;
    return rest ? `${mappedVerb} ${rest}` : `${mappedVerb} the operation`;
  }

  private generateReadme(summary: ProjectSummary, files: FileInfo[]): string {
    const sections: string[] = [];

    sections.push(`# ${summary.name}\n`);
    sections.push(`${summary.description}\n`);

    if (summary.mainFeatures.length > 0) {
      sections.push("## Features\n");
      for (const feature of summary.mainFeatures) {
        sections.push(`- ${feature}`);
      }
      sections.push("");
    }

    if (summary.techStack.length > 0) {
      sections.push("## Tech Stack\n");
      for (const tech of summary.techStack) {
        sections.push(`- ${tech}`);
      }
      sections.push("");
    }

    sections.push("## Getting Started\n");
    sections.push("### Prerequisites\n");
    sections.push("- Node.js 18+ installed");
    sections.push("- npm or yarn package manager");
    if (summary.techStack.includes("PostgreSQL")) {
      sections.push("- PostgreSQL database");
    }
    sections.push("");

    sections.push("### Installation\n");
    sections.push("```bash");
    sections.push("# Install dependencies");
    sections.push("npm install");
    sections.push("");
    sections.push("# Start development server");
    sections.push("npm run dev");
    sections.push("```\n");

    const componentFiles = files.filter(f => f.path.includes("components"));
    const pageFiles = files.filter(f => f.path.includes("pages"));
    const apiFiles = files.filter(f => f.path.includes("routes") || f.path.includes("api"));

    sections.push("## Project Structure\n");
    sections.push("```");
    if (componentFiles.length > 0) sections.push("├── components/    # React components");
    if (pageFiles.length > 0) sections.push("├── pages/         # Page components");
    if (apiFiles.length > 0) sections.push("├── server/        # Backend API");
    sections.push("└── ...");
    sections.push("```\n");

    if (summary.dependencies.length > 0) {
      sections.push("## Key Dependencies\n");
      for (const dep of summary.dependencies.slice(0, 10)) {
        sections.push(`- \`${dep}\``);
      }
      sections.push("");
    }

    sections.push("## License\n");
    sections.push("MIT License\n");

    return sections.join("\n");
  }

  generateQuickReadme(projectName: string, description: string, features: string[]): string {
    return `# ${projectName}

${description}

## Features

${features.map(f => `- ${f}`).join("\n")}

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

## License

MIT License
`;
  }
}

export const autoDocumentationService = AutoDocumentationService.getInstance();
