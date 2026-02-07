import { BaseService, ManagedMap } from "../lib/base-service";

interface ContextReduction {
  projectId: string;
  targetFile: string;
  userMessage: string;
  originalTokenEstimate: number;
  reducedTokenEstimate: number;
  reductionPercentage: number;
  focusedSummary: string;
  relevantSnippets: { file: string; snippet: string; reason: string }[];
  timestamp: number;
}

class TwoPassContextService extends BaseService {
  private static instance: TwoPassContextService;
  private reductions: ManagedMap<string, ContextReduction>;

  private constructor() {
    super("TwoPassContextService");
    this.reductions = this.createManagedMap<string, ContextReduction>({ maxSize: 200, strategy: "lru" });
  }

  static getInstance(): TwoPassContextService {
    if (!TwoPassContextService.instance) {
      TwoPassContextService.instance = new TwoPassContextService();
    }
    return TwoPassContextService.instance;
  }

  generateContextQuery(
    targetFile: string,
    userMessage: string,
    relatedFiles: { path: string; content: string }[]
  ): string {
    const parts: string[] = [];

    parts.push("I need to make the following change:");
    parts.push(`Target file: ${targetFile}`);
    parts.push(`User request: ${userMessage}`);
    parts.push("");
    parts.push("Here are related files in this project. For each file, tell me:");
    parts.push("1. Is this file relevant to the change? (yes/no)");
    parts.push("2. If yes, what specific parts are needed? (list the exports, types, or functions)");
    parts.push("3. What is the key information I need from this file? (1-2 sentences)");
    parts.push("");

    for (const file of relatedFiles) {
      parts.push(`### ${file.path}`);
      const truncatedContent = file.content.length > 2000
        ? file.content.slice(0, 2000) + "\n... (truncated)"
        : file.content;
      parts.push("```");
      parts.push(truncatedContent);
      parts.push("```");
      parts.push("");
    }

    return parts.join("\n");
  }

  reduceContext(
    projectId: string,
    targetFile: string,
    userMessage: string,
    relatedFiles: { path: string; content: string }[],
    maxTokenBudget: number = 3000
  ): ContextReduction {
    const originalTokenEstimate = this.estimateTokens(
      relatedFiles.map(f => f.content).join("\n")
    );

    const relevantSnippets = this.extractRelevantSnippets(
      targetFile,
      userMessage,
      relatedFiles,
      maxTokenBudget
    );

    const focusedSummary = this.buildFocusedSummary(
      targetFile,
      userMessage,
      relevantSnippets
    );

    const reducedTokenEstimate = this.estimateTokens(focusedSummary);

    const reduction: ContextReduction = {
      projectId,
      targetFile,
      userMessage,
      originalTokenEstimate,
      reducedTokenEstimate,
      reductionPercentage: originalTokenEstimate > 0
        ? Math.round((1 - reducedTokenEstimate / originalTokenEstimate) * 100)
        : 0,
      focusedSummary,
      relevantSnippets,
      timestamp: Date.now(),
    };

    const key = `${projectId}_${targetFile}_${Date.now()}`;
    this.reductions.set(key, reduction);

    this.log("Context reduced", {
      projectId,
      targetFile,
      originalTokens: originalTokenEstimate,
      reducedTokens: reducedTokenEstimate,
      reductionPct: reduction.reductionPercentage,
    });

    return reduction;
  }

  buildFocusedPrompt(
    targetFile: string,
    targetContent: string,
    userMessage: string,
    contextReduction: ContextReduction
  ): string {
    const parts: string[] = [];

    parts.push("## Context from Related Files");
    parts.push(contextReduction.focusedSummary);
    parts.push("");
    parts.push("## Target File to Modify");
    parts.push(`File: ${targetFile}`);
    parts.push("```");
    parts.push(targetContent);
    parts.push("```");
    parts.push("");
    parts.push("## Requested Change");
    parts.push(userMessage);

    return parts.join("\n");
  }

  private extractRelevantSnippets(
    targetFile: string,
    userMessage: string,
    relatedFiles: { path: string; content: string }[],
    maxTokenBudget: number
  ): { file: string; snippet: string; reason: string }[] {
    const snippets: { file: string; snippet: string; reason: string; score: number }[] = [];
    const messageKeywords = this.extractKeywords(userMessage);

    for (const file of relatedFiles) {
      if (file.path === targetFile) continue;

      const fileRelevance = this.scoreFileRelevance(file, targetFile, messageKeywords);
      if (fileRelevance < 0.2) continue;

      const exports = this.extractExports(file.content);
      const types = this.extractTypeDefinitions(file.content);
      const imports = this.extractImportedFrom(file.content, targetFile);

      const snippetParts: string[] = [];
      let reason = "";

      if (imports.length > 0) {
        snippetParts.push(`Imports from target: ${imports.join(", ")}`);
        reason = "imports from target file";
      }

      if (exports.length > 0) {
        const relevantExports = exports.filter(e =>
          messageKeywords.some(k => e.toLowerCase().includes(k))
        );
        if (relevantExports.length > 0) {
          snippetParts.push(`Relevant exports: ${relevantExports.join(", ")}`);
          reason = reason || `exports relevant to: ${relevantExports.join(", ")}`;
        } else if (fileRelevance > 0.5) {
          snippetParts.push(`Exports: ${exports.slice(0, 5).join(", ")}`);
          reason = reason || "high relevance file";
        }
      }

      if (types.length > 0) {
        const relevantTypes = types.filter(t =>
          messageKeywords.some(k => t.toLowerCase().includes(k))
        );
        if (relevantTypes.length > 0) {
          snippetParts.push(`Types: ${relevantTypes.join(", ")}`);
          reason = reason || `defines types: ${relevantTypes.join(", ")}`;
        }
      }

      if (snippetParts.length === 0 && fileRelevance > 0.4) {
        const firstLines = file.content.split("\n").slice(0, 10).join("\n");
        snippetParts.push(firstLines);
        reason = "structurally related file";
      }

      if (snippetParts.length > 0) {
        snippets.push({
          file: file.path,
          snippet: snippetParts.join("\n"),
          reason,
          score: fileRelevance,
        });
      }
    }

    snippets.sort((a, b) => b.score - a.score);

    const result: { file: string; snippet: string; reason: string }[] = [];
    let tokenBudget = maxTokenBudget;

    for (const snippet of snippets) {
      const snippetTokens = this.estimateTokens(snippet.snippet);
      if (snippetTokens > tokenBudget) break;
      tokenBudget -= snippetTokens;
      result.push({ file: snippet.file, snippet: snippet.snippet, reason: snippet.reason });
    }

    return result;
  }

  private buildFocusedSummary(
    targetFile: string,
    userMessage: string,
    snippets: { file: string; snippet: string; reason: string }[]
  ): string {
    if (snippets.length === 0) {
      return `No additional context needed for modifying ${targetFile}.`;
    }

    const parts: string[] = [];
    parts.push(`Related context for modifying ${targetFile}:`);
    parts.push("");

    for (const snippet of snippets) {
      parts.push(`### ${snippet.file} (${snippet.reason})`);
      parts.push(snippet.snippet);
      parts.push("");
    }

    return parts.join("\n");
  }

  private scoreFileRelevance(
    file: { path: string; content: string },
    targetFile: string,
    messageKeywords: string[]
  ): number {
    let score = 0;
    const lower = file.content.toLowerCase();
    const targetBasename = targetFile.replace(/\.[^.]+$/, "").split("/").pop() || "";

    if (lower.includes(targetBasename.toLowerCase())) {
      score += 0.4;
    }

    const matchedKeywords = messageKeywords.filter(k => lower.includes(k));
    score += matchedKeywords.length * 0.15;

    if (file.path.includes("types") || file.path.includes("schema") || file.path.includes("shared")) {
      score += 0.3;
    }

    if (file.path.includes("util") || file.path.includes("helper") || file.path.includes("lib")) {
      score += 0.1;
    }

    return Math.min(score, 1);
  }

  private extractExports(code: string): string[] {
    const exports: string[] = [];
    const patterns = [
      /export\s+(?:default\s+)?(?:function|class|const|let|var|type|interface)\s+(\w+)/g,
      /export\s+\{([^}]+)\}/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        if (match[1]) {
          if (match[1].includes(",")) {
            exports.push(...match[1].split(",").map(s => s.trim().split(/\s+/)[0]));
          } else {
            exports.push(match[1]);
          }
        }
      }
    }

    return Array.from(new Set(exports));
  }

  private extractTypeDefinitions(code: string): string[] {
    const types: string[] = [];
    const pattern = /(?:type|interface)\s+(\w+)/g;
    let match;
    while ((match = pattern.exec(code)) !== null) {
      types.push(match[1]);
    }
    return types;
  }

  private extractImportedFrom(code: string, targetFile: string): string[] {
    const imports: string[] = [];
    const targetBasename = targetFile.replace(/\.[^.]+$/, "").split("/").pop() || "";
    const pattern = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;

    let match;
    while ((match = pattern.exec(code)) !== null) {
      if (match[2].includes(targetBasename)) {
        imports.push(...match[1].split(",").map(s => s.trim()));
      }
    }

    return imports;
  }

  private extractKeywords(text: string): string[] {
    const stopwords = new Set([
      "the", "a", "an", "is", "are", "can", "be", "in", "on", "at", "to",
      "for", "of", "with", "and", "or", "it", "this", "that", "i", "me",
      "my", "make", "change", "update", "add", "remove", "fix", "please",
      "want", "need", "should", "would", "could",
    ]);
    return text.toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(w => w.length > 2 && !stopwords.has(w));
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  destroy(): void {
    this.reductions.clear();
    this.log("TwoPassContextService destroyed");
  }
}

export const twoPassContextService = TwoPassContextService.getInstance();
