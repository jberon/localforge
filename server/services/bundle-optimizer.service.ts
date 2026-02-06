import { BaseService } from "../lib/base-service";

interface FileInfo {
  path: string;
  content: string;
}

interface BundleAnalysis {
  totalSize: number;
  fileBreakdown: FileSize[];
  suggestions: OptimizationSuggestion[];
  potentialSavings: number;
  dependencies: DependencyAnalysis[];
}

interface FileSize {
  path: string;
  size: number;
  compressedSize: number;
  type: "component" | "utility" | "vendor" | "asset" | "other";
}

interface OptimizationSuggestion {
  type: OptimizationType;
  priority: "high" | "medium" | "low";
  filePath?: string;
  message: string;
  potentialSaving: number;
  implementation: string;
}

type OptimizationType =
  | "code_splitting"
  | "tree_shaking"
  | "lazy_loading"
  | "bundle_reduction"
  | "duplicate_dependency"
  | "large_dependency"
  | "unused_export"
  | "dynamic_import";

interface DependencyAnalysis {
  name: string;
  estimatedSize: number;
  usageCount: number;
  canBeTreeShaken: boolean;
  alternatives?: string[];
}

const KNOWN_DEPENDENCY_SIZES: Record<string, number> = {
  "react": 6500,
  "react-dom": 42000,
  "lodash": 72000,
  "moment": 67000,
  "axios": 14000,
  "date-fns": 32000,
  "@tanstack/react-query": 25000,
  "framer-motion": 45000,
  "chart.js": 65000,
  "d3": 80000,
  "three": 150000,
  "monaco-editor": 800000,
  "recharts": 85000,
  "antd": 200000,
  "@mui/material": 180000,
  "tailwindcss": 0,
  "@radix-ui/react-dialog": 8000,
  "@radix-ui/react-dropdown-menu": 12000,
  "zod": 12000,
  "react-hook-form": 9000,
};

const TREE_SHAKEABLE_PACKAGES = [
  "lodash-es",
  "date-fns",
  "@radix-ui",
  "lucide-react",
  "@tanstack",
  "framer-motion",
];

class BundleOptimizerService extends BaseService {
  private static instance: BundleOptimizerService;

  private constructor() {
    super("BundleOptimizerService");
  }

  static getInstance(): BundleOptimizerService {
    if (!BundleOptimizerService.instance) {
      BundleOptimizerService.instance = new BundleOptimizerService();
    }
    return BundleOptimizerService.instance;
  }

  async analyzeBundle(files: FileInfo[]): Promise<BundleAnalysis> {
    this.log("Analyzing bundle", { fileCount: files.length });

    const fileBreakdown = this.analyzeFileSizes(files);
    const dependencies = this.analyzeDependencies(files);
    const suggestions = this.generateSuggestions(files, fileBreakdown, dependencies);
    
    const totalSize = fileBreakdown.reduce((sum, f) => sum + f.size, 0);
    const potentialSavings = suggestions.reduce((sum, s) => sum + s.potentialSaving, 0);

    return {
      totalSize,
      fileBreakdown,
      suggestions,
      potentialSavings,
      dependencies,
    };
  }

  private analyzeFileSizes(files: FileInfo[]): FileSize[] {
    return files
      .filter(f => {
        const ext = f.path.split(".").pop()?.toLowerCase();
        return ["ts", "tsx", "js", "jsx", "css", "json"].includes(ext || "");
      })
      .map(file => {
        const size = new TextEncoder().encode(file.content).length;
        const compressedSize = Math.round(size * 0.3);
        
        return {
          path: file.path,
          size,
          compressedSize,
          type: this.categorizeFile(file.path),
        };
      })
      .sort((a, b) => b.size - a.size);
  }

  private categorizeFile(path: string): FileSize["type"] {
    if (path.includes("node_modules")) return "vendor";
    if (path.includes("components") || path.endsWith(".tsx") || path.endsWith(".jsx")) return "component";
    if (path.includes("utils") || path.includes("lib") || path.includes("helpers")) return "utility";
    if (path.match(/\.(png|jpg|svg|gif|ico|woff|woff2|ttf)$/)) return "asset";
    return "other";
  }

  private analyzeDependencies(files: FileInfo[]): DependencyAnalysis[] {
    const dependencyUsage = new Map<string, number>();

    for (const file of files) {
      const imports = Array.from(file.content.matchAll(/import\s+.*\s+from\s+['"]([^'"./][^'"]*)['"]/g));
      
      for (const match of imports) {
        let pkg = match[1];
        if (pkg.startsWith("@")) {
          pkg = pkg.split("/").slice(0, 2).join("/");
        } else {
          pkg = pkg.split("/")[0];
        }
        
        dependencyUsage.set(pkg, (dependencyUsage.get(pkg) || 0) + 1);
      }
    }

    return Array.from(dependencyUsage.entries())
      .map(([name, usageCount]) => ({
        name,
        estimatedSize: KNOWN_DEPENDENCY_SIZES[name] || 10000,
        usageCount,
        canBeTreeShaken: TREE_SHAKEABLE_PACKAGES.some(p => name.startsWith(p)),
        alternatives: this.getAlternatives(name),
      }))
      .sort((a, b) => b.estimatedSize - a.estimatedSize);
  }

  private getAlternatives(packageName: string): string[] | undefined {
    const alternatives: Record<string, string[]> = {
      "lodash": ["lodash-es (tree-shakeable)", "native ES methods"],
      "moment": ["date-fns (smaller)", "dayjs (smaller)"],
      "axios": ["fetch (native)", "ky (smaller)"],
      "uuid": ["crypto.randomUUID() (native)"],
      "classnames": ["clsx (smaller)"],
      "chart.js": ["lightweight-charts", "uplot"],
    };
    return alternatives[packageName];
  }

  private generateSuggestions(
    files: FileInfo[],
    fileBreakdown: FileSize[],
    dependencies: DependencyAnalysis[]
  ): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    const largeFiles = fileBreakdown.filter(f => f.size > 50000);
    for (const file of largeFiles) {
      suggestions.push({
        type: "code_splitting",
        priority: "high",
        filePath: file.path,
        message: `Large file detected (${Math.round(file.size / 1024)}KB): Consider splitting into smaller modules`,
        potentialSaving: Math.round(file.size * 0.3),
        implementation: "Split into smaller, focused modules and use dynamic imports for non-critical code",
      });
    }

    const lazyLoadCandidates = files.filter(f => 
      (f.path.includes("pages/") || f.path.includes("views/")) &&
      !f.content.includes("React.lazy")
    );
    for (const file of lazyLoadCandidates.slice(0, 5)) {
      suggestions.push({
        type: "lazy_loading",
        priority: "medium",
        filePath: file.path,
        message: `Page component could be lazily loaded: ${file.path}`,
        potentialSaving: Math.round(new TextEncoder().encode(file.content).length * 0.5),
        implementation: "const Component = React.lazy(() => import('./Component'))",
      });
    }

    const largeDeps = dependencies.filter(d => d.estimatedSize > 50000);
    for (const dep of largeDeps) {
      if (dep.alternatives && dep.alternatives.length > 0) {
        suggestions.push({
          type: "large_dependency",
          priority: "medium",
          message: `Large dependency "${dep.name}" (~${Math.round(dep.estimatedSize / 1024)}KB)`,
          potentialSaving: Math.round(dep.estimatedSize * 0.5),
          implementation: `Consider alternatives: ${dep.alternatives.join(", ")}`,
        });
      }
    }

    const nonTreeShakeable = dependencies.filter(d => 
      !d.canBeTreeShaken && d.usageCount <= 3 && d.estimatedSize > 20000
    );
    for (const dep of nonTreeShakeable.slice(0, 3)) {
      suggestions.push({
        type: "tree_shaking",
        priority: "low",
        message: `"${dep.name}" is used ${dep.usageCount} times but may not tree-shake well`,
        potentialSaving: Math.round(dep.estimatedSize * 0.2),
        implementation: "Import only specific functions/components instead of the entire package",
      });
    }

    for (const file of files) {
      const dynamicImportMatches = file.content.match(/import\(['"]([^'"]+)['"]\)/g);
      if (!dynamicImportMatches && file.path.includes("components/")) {
        const heavyImports = file.content.match(/import\s+.*\s+from\s+['"](?:chart|monaco|three|d3)/g);
        if (heavyImports) {
          suggestions.push({
            type: "dynamic_import",
            priority: "high",
            filePath: file.path,
            message: "Heavy library imported statically - use dynamic import",
            potentialSaving: 50000,
            implementation: "const HeavyLib = await import('heavy-library')",
          });
        }
      }
    }

    for (const file of files) {
      const starImports = Array.from(file.content.matchAll(/import\s+\*\s+as\s+\w+\s+from\s+['"]([^'"]+)['"]/g));
      for (const match of starImports) {
        const pkg = match[1];
        if (!pkg.startsWith(".")) {
          suggestions.push({
            type: "tree_shaking",
            priority: "medium",
            filePath: file.path,
            message: `Namespace import "* as" prevents tree-shaking for "${pkg}"`,
            potentialSaving: 5000,
            implementation: "Import only the specific exports you need: import { func1, func2 } from 'package'",
          });
        }
      }
    }

    return suggestions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority] || 
             b.potentialSaving - a.potentialSaving;
    });
  }

  estimateBundleSize(dependencies: string[]): number {
    let total = 0;
    for (const dep of dependencies) {
      const baseDep = dep.startsWith("@") 
        ? dep.split("/").slice(0, 2).join("/")
        : dep.split("/")[0];
      total += KNOWN_DEPENDENCY_SIZES[baseDep] || 10000;
    }
    return total;
  }

  getSizeBreakdown(files: FileInfo[]): { byType: Record<string, number>; total: number } {
    const byType: Record<string, number> = {
      component: 0,
      utility: 0,
      vendor: 0,
      asset: 0,
      other: 0,
    };

    let total = 0;
    for (const file of files) {
      const size = new TextEncoder().encode(file.content).length;
      const type = this.categorizeFile(file.path);
      byType[type] += size;
      total += size;
    }

    return { byType, total };
  }

  destroy(): void {
    this.log("BundleOptimizerService shutting down");
  }
}

export const bundleOptimizerService = BundleOptimizerService.getInstance();
