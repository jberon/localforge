import { db as dbInstance } from "../db";
import { fileIndex, projectFiles } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import logger from "../lib/logger";

function getDb() {
  if (!dbInstance) {
    throw new Error("Database not initialized. Check DATABASE_URL environment variable.");
  }
  return dbInstance;
}

export interface SymbolInfo {
  name: string;
  kind: "function" | "class" | "interface" | "type" | "variable" | "constant" | "enum" | "component" | "hook" | "method" | "property";
  exported: boolean;
  line?: number;
  signature?: string;
}

export interface ImportInfo {
  module: string;
  isRelative: boolean;
  imports: string[];
}

export interface CodeSummary {
  description: string;
  purpose: string;
  dependencies: string[];
  exports: string[];
}

export interface IndexEntry {
  id: string;
  projectId: string;
  fileId: string;
  filePath: string;
  symbols: SymbolInfo[];
  imports: ImportInfo[];
  exports: string[];
  summary: CodeSummary;
  keywords: string[];
  updatedAt: number;
}

class CodeIndexService {
  async indexFile(
    projectId: string,
    fileId: string,
    filePath: string,
    content: string
  ): Promise<string> {
    const id = uuidv4();
    const now = Date.now();

    const symbols = this.extractSymbols(content, filePath);
    const imports = this.extractImports(content);
    const exports = this.extractExports(content);
    const summary = this.generateSummary(content, filePath, symbols, imports, exports);
    const keywords = this.extractKeywords(content, filePath, symbols);
    const contentHash = this.hashContent(content);

    const existing = await getDb()
      .select()
      .from(fileIndex)
      .where(eq(fileIndex.fileId, fileId));

    if (existing.length > 0) {
      await getDb().update(fileIndex).set({
        symbols,
        imports,
        exports,
        summary,
        keywords,
        contentHash,
        updatedAt: now,
      }).where(eq(fileIndex.fileId, fileId));
      return existing[0].id;
    }

    await getDb().insert(fileIndex).values({
      id,
      projectId,
      fileId,
      filePath,
      symbols,
      imports,
      exports,
      summary,
      keywords,
      contentHash,
      createdAt: now,
      updatedAt: now,
    });

    return id;
  }

  async indexProject(projectId: string): Promise<{ indexed: number; skipped: number }> {
    const files = await getDb()
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.projectId, projectId));

    let indexed = 0;
    let skipped = 0;

    for (const file of files) {
      const existing = await getDb()
        .select()
        .from(fileIndex)
        .where(eq(fileIndex.fileId, file.id));

      const contentHash = this.hashContent(file.content);
      
      if (existing.length > 0 && existing[0].contentHash === contentHash) {
        skipped++;
        continue;
      }

      await this.indexFile(projectId, file.id, file.path, file.content);
      indexed++;
    }

    logger.info("Project indexed", { projectId, indexed, skipped });
    return { indexed, skipped };
  }

  async searchSymbols(
    projectId: string,
    query: string,
    options?: {
      kinds?: SymbolInfo["kind"][];
      exportedOnly?: boolean;
      limit?: number;
    }
  ): Promise<Array<{ entry: typeof fileIndex.$inferSelect; matchedSymbols: SymbolInfo[] }>> {
    const allIndexes = await getDb()
      .select()
      .from(fileIndex)
      .where(eq(fileIndex.projectId, projectId));

    const results: Array<{ entry: typeof fileIndex.$inferSelect; matchedSymbols: SymbolInfo[] }> = [];
    const queryLower = query.toLowerCase();

    for (const entry of allIndexes) {
      const symbols = entry.symbols as SymbolInfo[];
      const matchedSymbols = symbols.filter(s => {
        const nameMatch = s.name.toLowerCase().includes(queryLower);
        const kindMatch = !options?.kinds || options.kinds.includes(s.kind);
        const exportMatch = !options?.exportedOnly || s.exported;
        return nameMatch && kindMatch && exportMatch;
      });

      if (matchedSymbols.length > 0) {
        results.push({ entry, matchedSymbols });
      }
    }

    if (options?.limit) {
      return results.slice(0, options.limit);
    }
    return results;
  }

  async searchByKeywords(
    projectId: string,
    keywords: string[],
    limit: number = 10
  ): Promise<Array<typeof fileIndex.$inferSelect>> {
    const allIndexes = await getDb()
      .select()
      .from(fileIndex)
      .where(eq(fileIndex.projectId, projectId));

    const queryKeywords = keywords.map(k => k.toLowerCase());

    const scored = allIndexes.map(entry => {
      const entryKeywords = (entry.keywords as string[]).map(k => k.toLowerCase());
      let score = 0;
      for (const qk of queryKeywords) {
        for (const ek of entryKeywords) {
          if (ek.includes(qk) || qk.includes(ek)) {
            score++;
          }
        }
      }
      return { entry, score };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.entry);
  }

  async findDependencies(
    projectId: string,
    filePath: string
  ): Promise<{ dependsOn: string[]; dependedBy: string[] }> {
    const allIndexes = await getDb()
      .select()
      .from(fileIndex)
      .where(eq(fileIndex.projectId, projectId));

    const targetIndex = allIndexes.find(i => i.filePath === filePath);
    if (!targetIndex) {
      return { dependsOn: [], dependedBy: [] };
    }

    const targetImports = targetIndex.imports as ImportInfo[];
    const dependsOn: string[] = [];
    
    for (const imp of targetImports) {
      if (imp.isRelative) {
        const resolved = this.resolveImport(filePath, imp.module);
        if (allIndexes.some(i => this.normalizePath(i.filePath) === this.normalizePath(resolved))) {
          dependsOn.push(resolved);
        }
      }
    }

    const dependedBy: string[] = [];
    for (const other of allIndexes) {
      if (other.filePath === filePath) continue;
      const otherImports = other.imports as ImportInfo[];
      for (const imp of otherImports) {
        if (imp.isRelative) {
          const resolved = this.resolveImport(other.filePath, imp.module);
          if (this.normalizePath(resolved) === this.normalizePath(filePath)) {
            dependedBy.push(other.filePath);
            break;
          }
        }
      }
    }

    return { dependsOn, dependedBy };
  }

  async getProjectStructure(projectId: string): Promise<{
    files: Array<{
      path: string;
      summary: CodeSummary;
      symbolCount: number;
      dependencyCount: number;
    }>;
    entryPoints: string[];
    sharedModules: string[];
  }> {
    const allIndexes = await getDb()
      .select()
      .from(fileIndex)
      .where(eq(fileIndex.projectId, projectId));

    const dependencyCounts = new Map<string, number>();
    
    for (const entry of allIndexes) {
      const deps = await this.findDependencies(projectId, entry.filePath);
      dependencyCounts.set(entry.filePath, deps.dependedBy.length);
    }

    const files = allIndexes.map(entry => ({
      path: entry.filePath,
      summary: entry.summary as CodeSummary,
      symbolCount: (entry.symbols as SymbolInfo[]).length,
      dependencyCount: dependencyCounts.get(entry.filePath) || 0,
    }));

    const entryPoints = files
      .filter(f => {
        const lower = f.path.toLowerCase();
        return lower.includes("index.") || lower.includes("main.") || lower.includes("app.");
      })
      .map(f => f.path);

    const sharedModules = files
      .filter(f => (dependencyCounts.get(f.path) || 0) >= 2)
      .sort((a, b) => b.dependencyCount - a.dependencyCount)
      .map(f => f.path);

    return { files, entryPoints, sharedModules };
  }

  async getIndex(fileId: string): Promise<typeof fileIndex.$inferSelect | null> {
    const result = await getDb()
      .select()
      .from(fileIndex)
      .where(eq(fileIndex.fileId, fileId));
    return result[0] || null;
  }

  async deleteIndex(fileId: string): Promise<void> {
    await getDb().delete(fileIndex).where(eq(fileIndex.fileId, fileId));
  }

  async getContextForGeneration(
    projectId: string,
    taskDescription: string,
    targetFiles: string[],
    maxTokens: number
  ): Promise<{
    relevantFiles: Array<{ path: string; summary: string; symbols: string[] }>;
    projectContext: string;
    tokensUsed: number;
  }> {
    const keywords = this.extractKeywordsFromText(taskDescription);
    const keywordResults = await this.searchByKeywords(projectId, keywords, 20);
    
    const allRelevant = new Set<typeof fileIndex.$inferSelect>();
    
    for (const result of keywordResults) {
      allRelevant.add(result);
    }

    for (const targetPath of targetFiles) {
      const deps = await this.findDependencies(projectId, targetPath);
      for (const depPath of [...deps.dependsOn, ...deps.dependedBy]) {
        const depIndex = await getDb()
          .select()
          .from(fileIndex)
          .where(and(
            eq(fileIndex.projectId, projectId),
            eq(fileIndex.filePath, depPath)
          ));
        if (depIndex[0]) {
          allRelevant.add(depIndex[0]);
        }
      }
    }

    const relevantArray = Array.from(allRelevant);
    const relevantFiles: Array<{ path: string; summary: string; symbols: string[] }> = [];
    let tokensUsed = 0;

    for (const entry of relevantArray) {
      const summary = entry.summary as CodeSummary;
      const symbols = (entry.symbols as SymbolInfo[])
        .filter(s => s.exported)
        .map(s => `${s.kind} ${s.name}`);
      
      const fileContext = {
        path: entry.filePath,
        summary: summary.description,
        symbols,
      };
      
      const fileTokens = this.estimateTokens(JSON.stringify(fileContext));
      if (tokensUsed + fileTokens > maxTokens * 0.8) break;
      
      relevantFiles.push(fileContext);
      tokensUsed += fileTokens;
    }

    const structure = await this.getProjectStructure(projectId);
    const projectContext = `Project has ${structure.files.length} files. Entry points: ${structure.entryPoints.join(", ")}. Shared modules: ${structure.sharedModules.slice(0, 5).join(", ")}`;
    tokensUsed += this.estimateTokens(projectContext);

    return { relevantFiles, projectContext, tokensUsed };
  }

  private extractSymbols(content: string, filePath: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];
    const lines = content.split("\n");

    const patterns = [
      { regex: /^export\s+(?:async\s+)?function\s+(\w+)/m, kind: "function" as const, exported: true },
      { regex: /^(?:async\s+)?function\s+(\w+)/m, kind: "function" as const, exported: false },
      { regex: /^export\s+class\s+(\w+)/m, kind: "class" as const, exported: true },
      { regex: /^class\s+(\w+)/m, kind: "class" as const, exported: false },
      { regex: /^export\s+interface\s+(\w+)/m, kind: "interface" as const, exported: true },
      { regex: /^interface\s+(\w+)/m, kind: "interface" as const, exported: false },
      { regex: /^export\s+type\s+(\w+)/m, kind: "type" as const, exported: true },
      { regex: /^type\s+(\w+)/m, kind: "type" as const, exported: false },
      { regex: /^export\s+const\s+(\w+)/m, kind: "constant" as const, exported: true },
      { regex: /^const\s+(\w+)/m, kind: "constant" as const, exported: false },
      { regex: /^export\s+enum\s+(\w+)/m, kind: "enum" as const, exported: true },
      { regex: /^enum\s+(\w+)/m, kind: "enum" as const, exported: false },
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      for (const pattern of patterns) {
        const match = line.match(pattern.regex);
        if (match) {
          symbols.push({
            name: match[1],
            kind: pattern.kind,
            exported: pattern.exported,
            line: i + 1,
          });
          break;
        }
      }

      if (filePath.match(/\.(tsx|jsx)$/) && line.match(/^(?:export\s+)?(?:const|function)\s+(\w+).+=.+(?:=>|return).*</)) {
        const match = line.match(/(?:const|function)\s+(\w+)/);
        if (match) {
          const existing = symbols.find(s => s.name === match[1]);
          if (existing) {
            existing.kind = "component";
          }
        }
      }

      if (line.match(/^(?:export\s+)?(?:const|function)\s+use[A-Z]\w*/)) {
        const match = line.match(/(?:const|function)\s+(use\w+)/);
        if (match) {
          const existing = symbols.find(s => s.name === match[1]);
          if (existing) {
            existing.kind = "hook";
          }
        }
      }
    }

    return symbols;
  }

  private extractImports(content: string): ImportInfo[] {
    const imports: ImportInfo[] = [];
    const importRegex = /import\s+(?:{([^}]+)}|\*\s+as\s+(\w+)|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
    
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const namedImports = match[1] ? match[1].split(",").map(s => s.trim().split(/\s+as\s+/)[0]) : [];
      const namespaceImport = match[2];
      const defaultImport = match[3];
      const modulePath = match[4];

      const importNames = [
        ...namedImports,
        namespaceImport,
        defaultImport,
      ].filter(Boolean) as string[];

      imports.push({
        module: modulePath,
        isRelative: modulePath.startsWith(".") || modulePath.startsWith("/"),
        imports: importNames,
      });
    }

    return imports;
  }

  private extractExports(content: string): string[] {
    const exports: string[] = [];
    
    const exportRegex = /export\s+(?:default\s+)?(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g;
    let match;
    while ((match = exportRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }

    const namedExportRegex = /export\s*\{([^}]+)\}/g;
    while ((match = namedExportRegex.exec(content)) !== null) {
      const names = match[1].split(",").map(s => s.trim().split(/\s+as\s+/)[0]);
      exports.push(...names);
    }

    return Array.from(new Set(exports));
  }

  private generateSummary(
    content: string,
    filePath: string,
    symbols: SymbolInfo[],
    imports: ImportInfo[],
    exports: string[]
  ): CodeSummary {
    const fileName = filePath.split("/").pop() || "";
    
    let purpose = "utility module";
    if (filePath.includes("/components/")) purpose = "React component";
    else if (filePath.includes("/hooks/")) purpose = "custom React hook";
    else if (filePath.includes("/services/")) purpose = "service layer";
    else if (filePath.includes("/routes/") || filePath.includes("/api/")) purpose = "API route handler";
    else if (filePath.includes("/types/") || filePath.includes("/interfaces/")) purpose = "type definitions";
    else if (filePath.includes("/utils/") || filePath.includes("/lib/")) purpose = "utility functions";
    else if (fileName.includes(".test.") || fileName.includes(".spec.")) purpose = "test file";
    else if (fileName === "index.ts" || fileName === "index.tsx") purpose = "module entry point";

    const exportedSymbols = symbols.filter(s => s.exported);
    const description = `${purpose} with ${exportedSymbols.length} exports: ${exportedSymbols.slice(0, 5).map(s => s.name).join(", ")}${exportedSymbols.length > 5 ? "..." : ""}`;

    const dependencies = imports
      .filter(i => !i.isRelative)
      .map(i => i.module);

    return {
      description,
      purpose,
      dependencies: Array.from(new Set(dependencies)),
      exports,
    };
  }

  private extractKeywords(content: string, filePath: string, symbols: SymbolInfo[]): string[] {
    const keywords: string[] = [];

    keywords.push(...symbols.filter(s => s.exported).map(s => s.name));

    const pathParts = filePath.split("/").filter(p => !p.startsWith("."));
    keywords.push(...pathParts);

    const commentMatches = content.match(/\/\*\*[\s\S]*?\*\/|\/\/.*/g) || [];
    for (const comment of commentMatches) {
      const words = comment
        .replace(/[\/\*@]/g, " ")
        .split(/\s+/)
        .filter(w => w.length > 3 && !w.match(/^(the|and|for|with|this|that|from)$/i));
      keywords.push(...words.slice(0, 10));
    }

    return Array.from(new Set(keywords.map(k => k.toLowerCase()))).slice(0, 50);
  }

  private extractKeywordsFromText(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2)
      .filter(w => !["the", "and", "for", "with", "this", "that", "from", "into", "create", "make", "add", "update", "delete"].includes(w));
  }

  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private resolveImport(fromPath: string, importPath: string): string {
    if (!importPath.startsWith(".")) return importPath;
    
    const fromDir = fromPath.substring(0, fromPath.lastIndexOf("/"));
    const parts = fromDir.split("/");
    const importParts = importPath.split("/");
    
    for (const part of importParts) {
      if (part === "..") {
        parts.pop();
      } else if (part !== ".") {
        parts.push(part);
      }
    }
    
    let resolved = parts.join("/");
    if (!resolved.match(/\.\w+$/)) {
      resolved += ".ts";
    }
    
    return resolved;
  }

  private normalizePath(path: string): string {
    return path
      .replace(/\\/g, "/")
      .replace(/\.tsx?$/, "")
      .replace(/\/index$/, "");
  }
}

export const codeIndexService = new CodeIndexService();
