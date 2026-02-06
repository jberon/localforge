import * as fs from "fs";
import * as path from "path";
import { BaseService } from "../lib/base-service";

export interface ImportInfo {
  source: string;
  specifiers: string[];
  isDefault: boolean;
  isNamespace: boolean;
  line: number;
}

export interface DependencyIssue {
  file: string;
  line: number;
  importSource: string;
  type: "missing_package" | "missing_local" | "unresolved_alias";
  suggestion?: string;
  packageName?: string;
}

export interface ResolutionResult {
  issues: DependencyIssue[];
  suggestions: PackageSuggestion[];
  autoFixable: DependencyIssue[];
}

export interface PackageSuggestion {
  packageName: string;
  reason: string;
  isDevDependency: boolean;
  usedIn: string[];
}

// Common package mappings for auto-detection
const PACKAGE_MAPPINGS: Record<string, { package: string; isDev?: boolean }> = {
  "react": { package: "react" },
  "react-dom": { package: "react-dom" },
  "lodash": { package: "lodash" },
  "axios": { package: "axios" },
  "express": { package: "express" },
  "zod": { package: "zod" },
  "uuid": { package: "uuid" },
  "dayjs": { package: "dayjs" },
  "date-fns": { package: "date-fns" },
  "clsx": { package: "clsx" },
  "tailwind-merge": { package: "tailwind-merge" },
  "class-variance-authority": { package: "class-variance-authority" },
  "lucide-react": { package: "lucide-react" },
  "@radix-ui": { package: "@radix-ui/react-icons" },
  "@tanstack/react-query": { package: "@tanstack/react-query" },
  "@hookform/resolvers": { package: "@hookform/resolvers" },
  "react-hook-form": { package: "react-hook-form" },
  "framer-motion": { package: "framer-motion" },
  "recharts": { package: "recharts" },
  "vitest": { package: "vitest", isDev: true },
  "@testing-library": { package: "@testing-library/react", isDev: true },
  "typescript": { package: "typescript", isDev: true },
  "eslint": { package: "eslint", isDev: true },
};

export class DependencyResolutionService extends BaseService {
  private static instance: DependencyResolutionService;

  private constructor() {
    super("DependencyResolutionService");
  }

  static getInstance(): DependencyResolutionService {
    if (!DependencyResolutionService.instance) {
      DependencyResolutionService.instance = new DependencyResolutionService();
    }
    return DependencyResolutionService.instance;
  }

  analyzeFile(filePath: string, content: string): ImportInfo[] {
    const imports: ImportInfo[] = [];
    const lines = content.split("\n");

    // Match various import patterns
    const importPatterns = [
      // import x from 'y'
      /^import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/,
      // import { x, y } from 'z'
      /^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/,
      // import * as x from 'y'
      /^import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/,
      // import 'x' (side effect)
      /^import\s+['"]([^'"]+)['"]/,
      // require('x')
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      for (const pattern of importPatterns) {
        const match = line.match(pattern);
        if (match) {
          if (pattern.source.includes("\\{")) {
            // Named imports
            const specifiers = match[1].split(",").map(s => s.trim().split(" as ")[0].trim());
            imports.push({
              source: match[2],
              specifiers,
              isDefault: false,
              isNamespace: false,
              line: i + 1,
            });
          } else if (pattern.source.includes("\\*")) {
            // Namespace import
            imports.push({
              source: match[2],
              specifiers: [match[1]],
              isDefault: false,
              isNamespace: true,
              line: i + 1,
            });
          } else if (match.length === 3) {
            // Default import
            imports.push({
              source: match[2],
              specifiers: [match[1]],
              isDefault: true,
              isNamespace: false,
              line: i + 1,
            });
          } else {
            // Side effect or require
            imports.push({
              source: match[1],
              specifiers: [],
              isDefault: false,
              isNamespace: false,
              line: i + 1,
            });
          }
          break;
        }
      }
    }

    return imports;
  }

  async resolveImports(
    projectPath: string,
    files: Array<{ path: string; content: string }>
  ): Promise<ResolutionResult> {
    const issues: DependencyIssue[] = [];
    const packageSuggestions = new Map<string, PackageSuggestion>();
    
    // Load package.json to check installed packages
    const installedPackages = this.getInstalledPackages(projectPath);
    
    for (const file of files) {
      const imports = this.analyzeFile(file.path, file.content);
      
      for (const imp of imports) {
        const issue = this.checkImport(
          file.path,
          imp,
          projectPath,
          installedPackages
        );
        
        if (issue) {
          issues.push(issue);
          
          // Add package suggestion if applicable
          if (issue.type === "missing_package" && issue.packageName) {
            const existing = packageSuggestions.get(issue.packageName);
            if (existing) {
              existing.usedIn.push(file.path);
            } else {
              const mapping = this.findPackageMapping(issue.importSource);
              packageSuggestions.set(issue.packageName, {
                packageName: issue.packageName,
                reason: `Required by import: ${issue.importSource}`,
                isDevDependency: mapping?.isDev || false,
                usedIn: [file.path],
              });
            }
          }
        }
      }
    }

    return {
      issues,
      suggestions: Array.from(packageSuggestions.values()),
      autoFixable: issues.filter(i => i.type === "missing_package" && i.packageName),
    };
  }

  private checkImport(
    filePath: string,
    imp: ImportInfo,
    projectPath: string,
    installedPackages: Set<string>
  ): DependencyIssue | null {
    const source = imp.source;

    // Skip relative imports that exist
    if (source.startsWith(".") || source.startsWith("/")) {
      return this.checkLocalImport(filePath, imp, projectPath);
    }

    // Skip Node.js built-in modules
    const builtins = ["fs", "path", "http", "https", "url", "util", "stream", "events", "crypto", "os", "child_process", "buffer", "querystring", "zlib"];
    if (builtins.includes(source) || source.startsWith("node:")) {
      return null;
    }

    // Check if package is installed
    const packageName = this.getPackageName(source);
    if (!installedPackages.has(packageName)) {
      return {
        file: filePath,
        line: imp.line,
        importSource: source,
        type: "missing_package",
        packageName,
        suggestion: `npm install ${packageName}`,
      };
    }

    return null;
  }

  private checkLocalImport(
    filePath: string,
    imp: ImportInfo,
    projectPath: string
  ): DependencyIssue | null {
    const fileDir = path.dirname(path.join(projectPath, filePath));
    const extensions = [".ts", ".tsx", ".js", ".jsx", ".json", ""];
    
    for (const ext of extensions) {
      const fullPath = path.resolve(fileDir, imp.source + ext);
      if (fs.existsSync(fullPath)) {
        return null;
      }
      // Check for index file
      const indexPath = path.resolve(fileDir, imp.source, `index${ext}`);
      if (fs.existsSync(indexPath)) {
        return null;
      }
    }

    // Check if it's an alias (starts with @)
    if (imp.source.startsWith("@/") || imp.source.startsWith("@")) {
      return {
        file: filePath,
        line: imp.line,
        importSource: imp.source,
        type: "unresolved_alias",
        suggestion: "Check tsconfig.json paths configuration",
      };
    }

    return {
      file: filePath,
      line: imp.line,
      importSource: imp.source,
      type: "missing_local",
      suggestion: `Create file: ${imp.source}`,
    };
  }

  private getPackageName(importSource: string): string {
    // Handle scoped packages (@org/package)
    if (importSource.startsWith("@")) {
      const parts = importSource.split("/");
      if (parts.length >= 2) {
        return `${parts[0]}/${parts[1]}`;
      }
    }
    // Regular package (first part before /)
    return importSource.split("/")[0];
  }

  private getInstalledPackages(projectPath: string): Set<string> {
    const packages = new Set<string>();
    
    try {
      const packageJsonPath = path.join(projectPath, "package.json");
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
        
        const deps = packageJson.dependencies || {};
        const devDeps = packageJson.devDependencies || {};
        
        for (const pkg of Object.keys(deps)) {
          packages.add(pkg);
        }
        for (const pkg of Object.keys(devDeps)) {
          packages.add(pkg);
        }
      }
    } catch (error) {
      this.logWarn("Failed to read package.json", { error });
    }

    return packages;
  }

  private findPackageMapping(importSource: string): { package: string; isDev?: boolean } | undefined {
    const packageName = this.getPackageName(importSource);
    
    // Direct match
    if (PACKAGE_MAPPINGS[packageName]) {
      return PACKAGE_MAPPINGS[packageName];
    }
    
    // Prefix match for scoped packages
    for (const [prefix, mapping] of Object.entries(PACKAGE_MAPPINGS)) {
      if (packageName.startsWith(prefix)) {
        return mapping;
      }
    }
    
    return undefined;
  }

  generateInstallCommands(suggestions: PackageSuggestion[]): string[] {
    const commands: string[] = [];
    
    const prodDeps = suggestions.filter(s => !s.isDevDependency).map(s => s.packageName);
    const devDeps = suggestions.filter(s => s.isDevDependency).map(s => s.packageName);
    
    if (prodDeps.length > 0) {
      commands.push(`npm install ${prodDeps.join(" ")}`);
    }
    
    if (devDeps.length > 0) {
      commands.push(`npm install -D ${devDeps.join(" ")}`);
    }
    
    return commands;
  }

  findUnusedImports(filePath: string, content: string): ImportInfo[] {
    const imports = this.analyzeFile(filePath, content);
    const unused: ImportInfo[] = [];

    for (const imp of imports) {
      // Check if any specifier is used in the file
      const isUsed = imp.specifiers.some(specifier => {
        // Remove the import line itself from the search
        const contentWithoutImport = content.split("\n").filter((_, i) => i !== imp.line - 1).join("\n");
        // Use word boundary to avoid partial matches
        const regex = new RegExp(`\\b${specifier}\\b`);
        return regex.test(contentWithoutImport);
      });

      if (!isUsed && imp.specifiers.length > 0) {
        unused.push(imp);
      }
    }

    return unused;
  }

  destroy(): void {
    this.log("DependencyResolutionService shutting down");
  }
}

export const dependencyResolutionService = DependencyResolutionService.getInstance();
