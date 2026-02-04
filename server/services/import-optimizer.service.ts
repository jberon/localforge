import logger from "../lib/logger";

interface FileInfo {
  path: string;
  content: string;
}

interface ImportOptimizationResult {
  files: FileOptimization[];
  summary: OptimizationSummary;
  unusedDependencies: string[];
  suggestions: ImportSuggestion[];
}

interface FileOptimization {
  filePath: string;
  issues: ImportIssue[];
  optimizedImports?: string;
  savings: number;
}

interface ImportIssue {
  type: ImportIssueType;
  line: number;
  import: string;
  message: string;
  suggestion: string;
}

type ImportIssueType =
  | "unused_import"
  | "duplicate_import"
  | "unorganized"
  | "namespace_import"
  | "default_when_named"
  | "circular_dependency"
  | "missing_type_import";

interface OptimizationSummary {
  totalFiles: number;
  filesWithIssues: number;
  unusedImports: number;
  duplicateImports: number;
  potentialSavings: number;
}

interface ImportSuggestion {
  type: "remove" | "reorganize" | "convert" | "split";
  filePath: string;
  message: string;
  before: string;
  after: string;
}

interface ParsedImport {
  line: number;
  raw: string;
  type: "default" | "named" | "namespace" | "side_effect" | "type";
  source: string;
  specifiers: string[];
  isTypeOnly: boolean;
}

class ImportOptimizerService {
  private static instance: ImportOptimizerService;

  private constructor() {}

  static getInstance(): ImportOptimizerService {
    if (!ImportOptimizerService.instance) {
      ImportOptimizerService.instance = new ImportOptimizerService();
    }
    return ImportOptimizerService.instance;
  }

  async optimizeImports(files: FileInfo[]): Promise<ImportOptimizationResult> {
    logger.info("Optimizing imports", { fileCount: files.length });

    const fileOptimizations: FileOptimization[] = [];
    const allImports = new Map<string, number>();
    let totalUnused = 0;
    let totalDuplicates = 0;

    for (const file of files) {
      if (!this.isSourceFile(file.path)) continue;

      const optimization = this.analyzeFile(file);
      if (optimization.issues.length > 0) {
        fileOptimizations.push(optimization);
        totalUnused += optimization.issues.filter(i => i.type === "unused_import").length;
        totalDuplicates += optimization.issues.filter(i => i.type === "duplicate_import").length;
      }

      const imports = this.parseImports(file.content);
      for (const imp of imports) {
        if (!imp.source.startsWith(".")) {
          allImports.set(imp.source, (allImports.get(imp.source) || 0) + 1);
        }
      }
    }

    const unusedDependencies = this.findUnusedDependencies(files, allImports);
    const suggestions = this.generateSuggestions(fileOptimizations);
    const potentialSavings = fileOptimizations.reduce((sum, f) => sum + f.savings, 0);

    logger.info("Import optimization complete", {
      filesWithIssues: fileOptimizations.length,
      totalUnused,
      totalDuplicates,
      unusedDependencies: unusedDependencies.length,
    });

    return {
      files: fileOptimizations,
      summary: {
        totalFiles: files.filter(f => this.isSourceFile(f.path)).length,
        filesWithIssues: fileOptimizations.length,
        unusedImports: totalUnused,
        duplicateImports: totalDuplicates,
        potentialSavings,
      },
      unusedDependencies,
      suggestions,
    };
  }

  private isSourceFile(path: string): boolean {
    const ext = path.split(".").pop()?.toLowerCase();
    return ["ts", "tsx", "js", "jsx"].includes(ext || "");
  }

  private analyzeFile(file: FileInfo): FileOptimization {
    const issues: ImportIssue[] = [];
    const imports = this.parseImports(file.content);
    const usedIdentifiers = this.findUsedIdentifiers(file.content, imports);

    for (const imp of imports) {
      if (imp.type === "side_effect") continue;

      for (const specifier of imp.specifiers) {
        const identifier = specifier.split(" as ").pop() || specifier;
        if (!usedIdentifiers.has(identifier)) {
          issues.push({
            type: "unused_import",
            line: imp.line,
            import: specifier,
            message: `Unused import: ${specifier}`,
            suggestion: `Remove '${specifier}' from import statement`,
          });
        }
      }

      if (imp.type === "namespace") {
        const namespaceUsages = this.countNamespaceUsages(file.content, imp.specifiers[0]);
        if (namespaceUsages < 3) {
          issues.push({
            type: "namespace_import",
            line: imp.line,
            import: imp.raw,
            message: `Namespace import used only ${namespaceUsages} times`,
            suggestion: "Convert to named imports for better tree-shaking",
          });
        }
      }
    }

    const sourceGroups = new Map<string, ParsedImport[]>();
    for (const imp of imports) {
      const existing = sourceGroups.get(imp.source) || [];
      existing.push(imp);
      sourceGroups.set(imp.source, existing);
    }

    for (const [source, group] of Array.from(sourceGroups.entries())) {
      if (group.length > 1) {
        issues.push({
          type: "duplicate_import",
          line: group[0].line,
          import: source,
          message: `Multiple imports from '${source}'`,
          suggestion: "Combine into a single import statement",
        });
      }
    }

    if (!this.areImportsOrganized(imports)) {
      issues.push({
        type: "unorganized",
        line: imports[0]?.line || 1,
        import: "",
        message: "Imports are not organized by type",
        suggestion: "Group imports: external packages, then local modules",
      });
    }

    const savings = issues.filter(i => i.type === "unused_import").length * 50;

    return {
      filePath: file.path,
      issues,
      savings,
      optimizedImports: issues.length > 0 ? this.generateOptimizedImports(imports, issues) : undefined,
    };
  }

  private parseImports(content: string): ParsedImport[] {
    const imports: ParsedImport[] = [];
    const lines = content.split("\n");

    const importPattern = /^import\s+(.+)\s+from\s+['"]([^'"]+)['"]/;
    const sideEffectPattern = /^import\s+['"]([^'"]+)['"]/;
    const typeImportPattern = /^import\s+type\s+(.+)\s+from\s+['"]([^'"]+)['"]/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (!line.startsWith("import")) continue;

      const typeMatch = line.match(typeImportPattern);
      if (typeMatch) {
        imports.push({
          line: i + 1,
          raw: line,
          type: "type",
          source: typeMatch[2],
          specifiers: this.parseSpecifiers(typeMatch[1]),
          isTypeOnly: true,
        });
        continue;
      }

      const sideEffectMatch = line.match(sideEffectPattern);
      if (sideEffectMatch && !line.includes(" from ")) {
        imports.push({
          line: i + 1,
          raw: line,
          type: "side_effect",
          source: sideEffectMatch[1],
          specifiers: [],
          isTypeOnly: false,
        });
        continue;
      }

      const match = line.match(importPattern);
      if (match) {
        const specifierPart = match[1];
        const source = match[2];

        let type: ParsedImport["type"] = "named";
        let specifiers: string[] = [];

        if (specifierPart.includes("* as")) {
          type = "namespace";
          const nsMatch = specifierPart.match(/\*\s+as\s+(\w+)/);
          specifiers = nsMatch ? [nsMatch[1]] : [];
        } else if (specifierPart.startsWith("{")) {
          type = "named";
          specifiers = this.parseSpecifiers(specifierPart);
        } else {
          const defaultMatch = specifierPart.match(/^(\w+)/);
          if (defaultMatch) {
            type = "default";
            specifiers = [defaultMatch[1]];
            
            const namedMatch = specifierPart.match(/\{([^}]+)\}/);
            if (namedMatch) {
              specifiers.push(...this.parseSpecifiers(`{${namedMatch[1]}}`));
            }
          }
        }

        imports.push({
          line: i + 1,
          raw: line,
          type,
          source,
          specifiers,
          isTypeOnly: false,
        });
      }
    }

    return imports;
  }

  private parseSpecifiers(specifierString: string): string[] {
    const content = specifierString.replace(/[{}]/g, "").trim();
    if (!content) return [];

    return content
      .split(",")
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  private findUsedIdentifiers(content: string, imports: ParsedImport[]): Set<string> {
    const used = new Set<string>();
    
    const importSection = content.split("\n")
      .findIndex(line => !line.trim().startsWith("import") && line.trim().length > 0);
    const codeContent = content.split("\n").slice(importSection).join("\n");

    for (const imp of imports) {
      for (const specifier of imp.specifiers) {
        const identifier = specifier.split(" as ").pop() || specifier;
        const identifierPattern = new RegExp(`\\b${identifier}\\b`);
        
        if (identifierPattern.test(codeContent)) {
          used.add(identifier);
        }
      }
    }

    return used;
  }

  private countNamespaceUsages(content: string, namespace: string): number {
    const pattern = new RegExp(`\\b${namespace}\\.\\w+`, "g");
    const matches = content.match(pattern);
    return matches ? matches.length : 0;
  }

  private areImportsOrganized(imports: ParsedImport[]): boolean {
    if (imports.length < 2) return true;

    let seenLocal = false;
    for (const imp of imports) {
      const isLocal = imp.source.startsWith(".");
      if (seenLocal && !isLocal) return false;
      if (isLocal) seenLocal = true;
    }

    return true;
  }

  private generateOptimizedImports(
    imports: ParsedImport[],
    issues: ImportIssue[]
  ): string {
    const unusedSpecifiers = new Set(
      issues
        .filter(i => i.type === "unused_import")
        .map(i => i.import)
    );

    const optimizedImports: ParsedImport[] = [];

    for (const imp of imports) {
      if (imp.type === "side_effect") {
        optimizedImports.push(imp);
        continue;
      }

      const filteredSpecifiers = imp.specifiers.filter(s => {
        const identifier = s.split(" as ").pop() || s;
        return !unusedSpecifiers.has(s) && !unusedSpecifiers.has(identifier);
      });

      if (filteredSpecifiers.length > 0) {
        optimizedImports.push({
          ...imp,
          specifiers: filteredSpecifiers,
        });
      }
    }

    const external = optimizedImports.filter(i => !i.source.startsWith("."));
    const local = optimizedImports.filter(i => i.source.startsWith("."));

    const formatImport = (imp: ParsedImport): string => {
      if (imp.type === "side_effect") {
        return `import '${imp.source}';`;
      }
      if (imp.type === "namespace") {
        return `import * as ${imp.specifiers[0]} from '${imp.source}';`;
      }
      if (imp.type === "default" && imp.specifiers.length === 1) {
        return `import ${imp.specifiers[0]} from '${imp.source}';`;
      }
      if (imp.isTypeOnly) {
        return `import type { ${imp.specifiers.join(", ")} } from '${imp.source}';`;
      }
      return `import { ${imp.specifiers.join(", ")} } from '${imp.source}';`;
    };

    const lines = [
      ...external.map(formatImport),
      "",
      ...local.map(formatImport),
    ].filter((line, i, arr) => !(line === "" && arr[i - 1] === ""));

    return lines.join("\n");
  }

  private findUnusedDependencies(
    files: FileInfo[],
    usedPackages: Map<string, number>
  ): string[] {
    const packageJsonFile = files.find(f => f.path.endsWith("package.json"));
    if (!packageJsonFile) return [];

    try {
      const pkg = JSON.parse(packageJsonFile.content);
      const declaredDeps = new Set([
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.devDependencies || {}),
      ]);

      const unused: string[] = [];
      for (const dep of Array.from(declaredDeps)) {
        if (!usedPackages.has(dep) && !this.isImplicitDependency(dep)) {
          unused.push(dep);
        }
      }

      return unused;
    } catch {
      return [];
    }
  }

  private isImplicitDependency(name: string): boolean {
    const implicit = [
      "typescript", "vite", "@types", "eslint", "prettier", "vitest",
      "jest", "tailwindcss", "postcss", "autoprefixer", "tsx", "esbuild",
      "@vitejs", "drizzle-kit", "@eslint",
    ];
    return implicit.some(i => name.startsWith(i));
  }

  private generateSuggestions(files: FileOptimization[]): ImportSuggestion[] {
    const suggestions: ImportSuggestion[] = [];

    for (const file of files.slice(0, 10)) {
      const unusedIssues = file.issues.filter(i => i.type === "unused_import");
      if (unusedIssues.length > 0 && file.optimizedImports) {
        suggestions.push({
          type: "remove",
          filePath: file.filePath,
          message: `Remove ${unusedIssues.length} unused import(s)`,
          before: unusedIssues.map(i => i.import).join(", "),
          after: "Removed",
        });
      }

      const namespaceIssues = file.issues.filter(i => i.type === "namespace_import");
      for (const issue of namespaceIssues) {
        suggestions.push({
          type: "convert",
          filePath: file.filePath,
          message: "Convert namespace import to named imports",
          before: issue.import,
          after: "import { specific, imports } from 'package';",
        });
      }
    }

    return suggestions;
  }
}

export const importOptimizerService = ImportOptimizerService.getInstance();
