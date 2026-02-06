import { BaseService } from "../lib/base-service";

interface FileInfo {
  path: string;
  content: string;
}

interface DeduplicationResult {
  duplicates: DuplicateGroup[];
  suggestions: RefactoringSuggestion[];
  summary: DeduplicationSummary;
  potentialSavings: number;
}

interface DuplicateGroup {
  hash: string;
  type: "exact" | "similar" | "structural";
  instances: DuplicateInstance[];
  lineCount: number;
  suggestion: string;
}

interface DuplicateInstance {
  filePath: string;
  startLine: number;
  endLine: number;
  code: string;
}

interface RefactoringSuggestion {
  type: RefactoringType;
  priority: "high" | "medium" | "low";
  description: string;
  affectedFiles: string[];
  estimatedSaving: number;
  implementation: string;
}

type RefactoringType =
  | "extract_function"
  | "extract_component"
  | "extract_hook"
  | "extract_constant"
  | "extract_utility"
  | "merge_similar";

interface DeduplicationSummary {
  totalDuplicateGroups: number;
  exactDuplicates: number;
  similarPatterns: number;
  linesOfDuplicateCode: number;
  filesAffected: number;
}

interface CodeBlock {
  content: string;
  normalized: string;
  hash: string;
  filePath: string;
  startLine: number;
  endLine: number;
}

class CodeDeduplicationService extends BaseService {
  private static instance: CodeDeduplicationService;
  private minBlockSize = 3;

  private constructor() {
    super("CodeDeduplicationService");
  }

  static getInstance(): CodeDeduplicationService {
    if (!CodeDeduplicationService.instance) {
      CodeDeduplicationService.instance = new CodeDeduplicationService();
    }
    return CodeDeduplicationService.instance;
  }

  destroy(): void {
    this.log("CodeDeduplicationService shutting down");
  }

  async findDuplicates(files: FileInfo[]): Promise<DeduplicationResult> {
    this.log("Scanning for duplicate code", { fileCount: files.length });

    const codeBlocks = this.extractCodeBlocks(files);
    const duplicateGroups = this.findDuplicateBlocks(codeBlocks);
    const suggestions = this.generateRefactoringSuggestions(duplicateGroups, files);

    const linesOfDuplicateCode = duplicateGroups.reduce(
      (sum, group) => sum + group.lineCount * (group.instances.length - 1),
      0
    );

    const affectedFiles = new Set<string>();
    for (const group of duplicateGroups) {
      for (const instance of group.instances) {
        affectedFiles.add(instance.filePath);
      }
    }

    const summary: DeduplicationSummary = {
      totalDuplicateGroups: duplicateGroups.length,
      exactDuplicates: duplicateGroups.filter(g => g.type === "exact").length,
      similarPatterns: duplicateGroups.filter(g => g.type === "similar" || g.type === "structural").length,
      linesOfDuplicateCode,
      filesAffected: affectedFiles.size,
    };

    const potentialSavings = suggestions.reduce((sum, s) => sum + s.estimatedSaving, 0);

    this.log("Deduplication analysis complete", {
      duplicateGroups: duplicateGroups.length,
      linesOfDuplicateCode,
      potentialSavings,
    });

    return {
      duplicates: duplicateGroups,
      suggestions,
      summary,
      potentialSavings,
    };
  }

  private extractCodeBlocks(files: FileInfo[]): CodeBlock[] {
    const blocks: CodeBlock[] = [];

    for (const file of files) {
      const ext = file.path.split(".").pop()?.toLowerCase();
      if (!["ts", "tsx", "js", "jsx"].includes(ext || "")) continue;

      const lines = file.content.split("\n");
      
      for (let i = 0; i < lines.length; i++) {
        for (let blockSize = this.minBlockSize; blockSize <= Math.min(30, lines.length - i); blockSize++) {
          const blockLines = lines.slice(i, i + blockSize);
          const content = blockLines.join("\n");
          
          if (this.isSignificantBlock(content)) {
            const normalized = this.normalizeCode(content);
            blocks.push({
              content,
              normalized,
              hash: this.hashCode(normalized),
              filePath: file.path,
              startLine: i + 1,
              endLine: i + blockSize,
            });
          }
        }
      }
    }

    return blocks;
  }

  private isSignificantBlock(content: string): boolean {
    const trimmed = content.trim();
    
    if (trimmed.length < 50) return false;
    if (trimmed.split("\n").every(l => l.trim().startsWith("//"))) return false;
    if (trimmed.split("\n").every(l => l.trim().startsWith("import"))) return false;
    if (/^[{}()\[\];,\s]*$/.test(trimmed)) return false;
    
    return true;
  }

  private normalizeCode(code: string): string {
    return code
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/['"`][^'"`]*['"`]/g, "STRING")
      .replace(/\b\d+\b/g, "NUM")
      .replace(/\s+/g, " ")
      .trim();
  }

  private hashCode(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  private findDuplicateBlocks(blocks: CodeBlock[]): DuplicateGroup[] {
    const hashMap = new Map<string, CodeBlock[]>();

    for (const block of blocks) {
      const existing = hashMap.get(block.hash) || [];
      existing.push(block);
      hashMap.set(block.hash, existing);
    }

    const duplicateGroups: DuplicateGroup[] = [];
    const processedHashes = new Set<string>();

    for (const [hash, blockGroup] of Array.from(hashMap.entries())) {
      if (blockGroup.length < 2) continue;
      if (processedHashes.has(hash)) continue;

      const uniqueFiles = new Set(blockGroup.map((b: CodeBlock) => b.filePath));
      if (uniqueFiles.size < 2 && blockGroup.length < 3) continue;

      const filteredBlocks = this.filterOverlappingBlocks(blockGroup);
      if (filteredBlocks.length < 2) continue;

      const isExact = filteredBlocks.every(b => b.content === filteredBlocks[0].content);
      const lineCount = filteredBlocks[0].endLine - filteredBlocks[0].startLine + 1;

      duplicateGroups.push({
        hash,
        type: isExact ? "exact" : "similar",
        instances: filteredBlocks.map(b => ({
          filePath: b.filePath,
          startLine: b.startLine,
          endLine: b.endLine,
          code: b.content,
        })),
        lineCount,
        suggestion: this.generateDuplicateSuggestion(filteredBlocks[0].content),
      });

      processedHashes.add(hash);
    }

    return duplicateGroups
      .sort((a, b) => (b.lineCount * b.instances.length) - (a.lineCount * a.instances.length))
      .slice(0, 20);
  }

  private filterOverlappingBlocks(blocks: CodeBlock[]): CodeBlock[] {
    const filtered: CodeBlock[] = [];
    
    for (const block of blocks) {
      const overlaps = filtered.some(existing => 
        existing.filePath === block.filePath &&
        !(block.endLine < existing.startLine || block.startLine > existing.endLine)
      );
      
      if (!overlaps) {
        filtered.push(block);
      }
    }

    return filtered;
  }

  private generateDuplicateSuggestion(code: string): string {
    if (code.includes("useState") || code.includes("useEffect")) {
      return "Extract into a custom React hook";
    }
    if (code.includes("return") && code.includes("<")) {
      return "Extract into a reusable React component";
    }
    if (code.includes("fetch") || code.includes("axios")) {
      return "Extract into an API utility function";
    }
    if (/^const\s+\w+\s*=/.test(code.trim())) {
      return "Extract into a shared constant or configuration";
    }
    return "Extract into a shared utility function";
  }

  private generateRefactoringSuggestions(
    duplicates: DuplicateGroup[],
    files: FileInfo[]
  ): RefactoringSuggestion[] {
    const suggestions: RefactoringSuggestion[] = [];

    for (const group of duplicates) {
      const code = group.instances[0].code;
      const affectedFiles = Array.from(new Set(group.instances.map(i => i.filePath)));
      const estimatedSaving = group.lineCount * (group.instances.length - 1) * 30;

      let type: RefactoringType;
      let implementation: string;

      if (code.includes("useState") || code.includes("useEffect") || code.includes("useCallback")) {
        type = "extract_hook";
        implementation = `Create a custom hook in hooks/ directory and import where needed`;
      } else if (code.includes("return") && code.includes("<") && code.includes("/>")) {
        type = "extract_component";
        implementation = `Create a reusable component accepting props for the variable parts`;
      } else if (/^const\s+\w+\s*=\s*[{[]/.test(code.trim())) {
        type = "extract_constant";
        implementation = `Move to a shared constants file and import where needed`;
      } else {
        type = "extract_function";
        implementation = `Create a utility function in utils/ or lib/ directory`;
      }

      suggestions.push({
        type,
        priority: group.instances.length > 3 || group.lineCount > 10 ? "high" : "medium",
        description: group.suggestion,
        affectedFiles,
        estimatedSaving,
        implementation,
      });
    }

    const similarPatterns = this.findSimilarPatterns(files);
    suggestions.push(...similarPatterns);

    return suggestions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority] ||
             b.estimatedSaving - a.estimatedSaving;
    });
  }

  private findSimilarPatterns(files: FileInfo[]): RefactoringSuggestion[] {
    const patterns: RefactoringSuggestion[] = [];
    const apiCallPattern = /(?:fetch|axios)\s*\([^)]+\)/g;
    const statePattern = /const\s*\[\w+,\s*set\w+\]\s*=\s*useState/g;

    let apiCallCount = 0;
    let stateCount = 0;
    const filesWithApiCalls: string[] = [];
    const filesWithState: string[] = [];

    for (const file of files) {
      const apiMatches = file.content.match(apiCallPattern);
      const stateMatches = file.content.match(statePattern);

      if (apiMatches && apiMatches.length > 2) {
        apiCallCount += apiMatches.length;
        filesWithApiCalls.push(file.path);
      }
      if (stateMatches && stateMatches.length > 3) {
        stateCount += stateMatches.length;
        filesWithState.push(file.path);
      }
    }

    if (apiCallCount > 5) {
      patterns.push({
        type: "extract_utility",
        priority: "medium",
        description: "Multiple similar API calls detected - consider creating an API client",
        affectedFiles: filesWithApiCalls,
        estimatedSaving: apiCallCount * 20,
        implementation: "Create an API client class or hook that centralizes fetch logic, error handling, and authentication",
      });
    }

    if (stateCount > 10) {
      patterns.push({
        type: "extract_hook",
        priority: "low",
        description: "Many useState declarations - consider grouping related state",
        affectedFiles: filesWithState,
        estimatedSaving: stateCount * 10,
        implementation: "Group related state into useReducer or custom hooks for better organization",
      });
    }

    return patterns;
  }
}

export const codeDeduplicationService = CodeDeduplicationService.getInstance();
