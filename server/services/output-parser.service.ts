import { BaseService, ManagedMap } from "../lib/base-service";

export interface CodeBlock {
  language: string;
  content: string;
  startIndex: number;
  endIndex: number;
  isComplete: boolean;
}

export interface JsonBlock {
  raw: string;
  parsed: any | null;
  isValid: boolean;
  errors: string[];
}

export interface ParsedOutput {
  rawContent: string;
  extractedBlocks: CodeBlock[];
  jsonBlocks: JsonBlock[];
  plainText: string;
  truncationDetected: boolean;
  artifactsRemoved: string[];
  confidence: number;
  parseWarnings: string[];
}

export interface ParserConfig {
  extractCodeBlocks: boolean;
  validateJson: boolean;
  detectTruncation: boolean;
  cleanArtifacts: boolean;
  maxOutputLength: number;
}

interface ParseStats {
  confidence: number;
  truncated: boolean;
  hadArtifacts: boolean;
}

class OutputParserService extends BaseService {
  private static instance: OutputParserService;
  private statsMap: ManagedMap<string, ParseStats>;
  private defaultConfig: ParserConfig;

  private constructor() {
    super("OutputParserService");
    this.statsMap = this.createManagedMap<string, ParseStats>({ maxSize: 100, strategy: "fifo" });
    this.defaultConfig = {
      extractCodeBlocks: true,
      validateJson: true,
      detectTruncation: true,
      cleanArtifacts: true,
      maxOutputLength: 50000,
    };
  }

  static getInstance(): OutputParserService {
    if (!OutputParserService.instance) {
      OutputParserService.instance = new OutputParserService();
    }
    return OutputParserService.instance;
  }

  parse(rawOutput: string, config?: Partial<ParserConfig>): ParsedOutput {
    const cfg = { ...this.defaultConfig, ...config };
    const parseWarnings: string[] = [];

    let text = rawOutput;
    if (text.length > cfg.maxOutputLength) {
      text = text.slice(0, cfg.maxOutputLength);
      parseWarnings.push(`Output truncated from ${rawOutput.length} to ${cfg.maxOutputLength} characters`);
    }

    let artifactsRemoved: string[] = [];
    if (cfg.cleanArtifacts) {
      const artifactResult = this.cleanArtifacts(text);
      text = artifactResult.cleaned;
      artifactsRemoved = artifactResult.removed;
    }

    let extractedBlocks: CodeBlock[] = [];
    let plainText = text;
    if (cfg.extractCodeBlocks) {
      const codeResult = this.extractCodeBlocks(text);
      extractedBlocks = codeResult.blocks;
      plainText = codeResult.plainText;
    }

    let jsonBlocks: JsonBlock[] = [];
    if (cfg.validateJson) {
      jsonBlocks = this.validateJsonBlocks(plainText);
    }

    let truncationDetected = false;
    if (cfg.detectTruncation) {
      truncationDetected = this.detectTruncation(text, extractedBlocks);
    }

    const output: ParsedOutput = {
      rawContent: rawOutput,
      extractedBlocks,
      jsonBlocks,
      plainText,
      truncationDetected,
      artifactsRemoved,
      confidence: 0,
      parseWarnings,
    };

    output.confidence = this.computeConfidence(output);

    const statsId = `parse_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.statsMap.set(statsId, {
      confidence: output.confidence,
      truncated: truncationDetected,
      hadArtifacts: artifactsRemoved.length > 0,
    });

    return output;
  }

  cleanArtifacts(text: string): { cleaned: string; removed: string[] } {
    let cleaned = text;
    const removed: string[] = [];

    const eosTokens = [
      "<|endoftext|>",
      "<|im_end|>",
      "<|im_start|>",
      "</s>",
      "[INST]",
      "[/INST]",
      "<s>",
    ];
    for (const token of eosTokens) {
      if (cleaned.includes(token)) {
        cleaned = cleaned.split(token).join("");
        removed.push(`end-of-sequence token: ${token}`);
      }
    }

    const rolePrefixPattern = /^(Assistant|Human|System|User):\s*/gm;
    if (rolePrefixPattern.test(cleaned)) {
      cleaned = cleaned.replace(rolePrefixPattern, "");
      removed.push("role prefixes");
    }

    const repeatedTokenPattern = /(\b\S+\b)(\s+\1){2,}/g;
    if (repeatedTokenPattern.test(cleaned)) {
      cleaned = cleaned.replace(repeatedTokenPattern, "$1");
      removed.push("repeated token sequences");
    }

    const excessiveDashes = /(-{3,}\s*){3,}/g;
    if (excessiveDashes.test(cleaned)) {
      cleaned = cleaned.replace(excessiveDashes, "---\n");
      removed.push("excessive markdown separators (---)");
    }

    const excessiveStars = /(\*{3,}\s*){3,}/g;
    if (excessiveStars.test(cleaned)) {
      cleaned = cleaned.replace(excessiveStars, "***\n");
      removed.push("excessive markdown separators (***)");
    }

    const repeatedHeaders = /(^#{1,6}\s+.+$\n?)\1{2,}/gm;
    if (repeatedHeaders.test(cleaned)) {
      cleaned = cleaned.replace(repeatedHeaders, "$1");
      removed.push("repeated headers");
    }

    const instructionEchoPatterns = [
      /^You are a.*?\n(.*?\n){0,5}/m,
      /^<\|system\|>[^]*?<\|end\|>/gm,
      /^### (System|Instructions?):.*?\n(.*?\n){0,10}/m,
    ];
    for (const pattern of instructionEchoPatterns) {
      if (pattern.test(cleaned)) {
        cleaned = cleaned.replace(pattern, "");
        removed.push("instruction echoing");
        break;
      }
    }

    cleaned = cleaned.trim();

    return { cleaned, removed };
  }

  extractCodeBlocks(text: string): { blocks: CodeBlock[]; plainText: string } {
    const blocks: CodeBlock[] = [];
    const codeBlockRegex = /```(\w*)\n?([\s\S]*?)(?:```|$)/g;
    let match: RegExpExecArray | null;
    let plainText = text;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      const fullMatch = match[0];
      const language = match[1] || "text";
      const content = match[2];
      const startIndex = match.index;
      const endIndex = startIndex + fullMatch.length;
      const hasClosingFence = fullMatch.endsWith("```");

      let isComplete = hasClosingFence;
      if (hasClosingFence) {
        isComplete = this.hasBalancedBrackets(content);
      }

      blocks.push({
        language,
        content: content.trimEnd(),
        startIndex,
        endIndex,
        isComplete,
      });
    }

    for (let i = blocks.length - 1; i >= 0; i--) {
      const block = blocks[i];
      plainText =
        plainText.slice(0, block.startIndex) + plainText.slice(block.endIndex);
    }

    plainText = plainText.replace(/\n{3,}/g, "\n\n").trim();

    return { blocks, plainText };
  }

  validateJsonBlocks(text: string): JsonBlock[] {
    const jsonBlocks: JsonBlock[] = [];
    const jsonPattern = /[{\[]/g;
    let match: RegExpExecArray | null;

    while ((match = jsonPattern.exec(text)) !== null) {
      const startChar = match[0];
      const startIdx = match.index;
      const extracted = this.extractJsonCandidate(text, startIdx, startChar);

      if (!extracted || extracted.length < 2) continue;

      const result = this.tryParseJson(extracted);
      jsonBlocks.push(result);
    }

    return jsonBlocks;
  }

  detectTruncation(text: string, codeBlocks: CodeBlock[]): boolean {
    const unclosedFences = (text.match(/```/g) || []).length % 2 !== 0;
    if (unclosedFences) return true;

    const hasIncompleteBlocks = codeBlocks.some((b) => !b.isComplete);
    if (hasIncompleteBlocks) return true;

    const trimmed = text.trimEnd();
    if (trimmed.length === 0) return false;

    const lastChar = trimmed[trimmed.length - 1];
    const terminalPunctuation = new Set([".", "!", "?", ";", "}", ")", "]", "`", '"', "'"]);
    if (!terminalPunctuation.has(lastChar)) {
      const lastWord = trimmed.split(/\s/).pop() || "";
      if (lastWord.length > 0 && /^[a-zA-Z]/.test(lastWord) && !/[.!?;:,})\]`"']$/.test(lastWord)) {
        return true;
      }
    }

    let openBrackets = 0;
    let openBraces = 0;
    let openParens = 0;
    let inString = false;
    let stringChar = "";

    for (let i = 0; i < trimmed.length; i++) {
      const c = trimmed[i];
      const prev = trimmed[i - 1];

      if (inString) {
        if (c === stringChar && prev !== "\\") {
          inString = false;
        }
        continue;
      }

      if (c === '"' || c === "'" || c === "`") {
        inString = true;
        stringChar = c;
        continue;
      }

      if (c === "(") openParens++;
      else if (c === ")") openParens--;
      else if (c === "[") openBrackets++;
      else if (c === "]") openBrackets--;
      else if (c === "{") openBraces++;
      else if (c === "}") openBraces--;
    }

    if (openBrackets > 0 || openBraces > 0 || openParens > 0) return true;

    return false;
  }

  repairTruncatedCode(code: string, language: string): string {
    let repaired = code;

    let inString = false;
    let stringChar = "";
    for (let i = 0; i < repaired.length; i++) {
      const c = repaired[i];
      const prev = repaired[i - 1];
      if (inString) {
        if (c === stringChar && prev !== "\\") {
          inString = false;
        }
      } else if (c === '"' || c === "'" || c === "`") {
        inString = true;
        stringChar = c;
      }
    }
    if (inString) {
      repaired += stringChar;
    }

    let openParens = 0;
    let openBrackets = 0;
    let openBraces = 0;
    inString = false;
    stringChar = "";

    for (let i = 0; i < repaired.length; i++) {
      const c = repaired[i];
      const prev = repaired[i - 1];
      if (inString) {
        if (c === stringChar && prev !== "\\") inString = false;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        inString = true;
        stringChar = c;
        continue;
      }
      if (c === "(") openParens++;
      else if (c === ")") openParens--;
      else if (c === "[") openBrackets++;
      else if (c === "]") openBrackets--;
      else if (c === "{") openBraces++;
      else if (c === "}") openBraces--;
    }

    while (openParens > 0) {
      repaired += ")";
      openParens--;
    }
    while (openBrackets > 0) {
      repaired += "]";
      openBrackets--;
    }
    while (openBraces > 0) {
      repaired += "}";
      openBraces--;
    }

    const jsxLangs = ["jsx", "tsx", "react", "javascript", "typescript"];
    if (jsxLangs.includes(language.toLowerCase())) {
      const openTagPattern = /<(\w+)[^>]*>/g;
      const closeTagPattern = /<\/(\w+)>/g;
      const selfClosingPattern = /<\w+[^>]*\/>/g;

      const textWithoutSelfClosing = repaired.replace(selfClosingPattern, "");
      const openTags: string[] = [];
      let tagMatch: RegExpExecArray | null;

      while ((tagMatch = openTagPattern.exec(textWithoutSelfClosing)) !== null) {
        openTags.push(tagMatch[1]);
      }
      while ((tagMatch = closeTagPattern.exec(textWithoutSelfClosing)) !== null) {
        const idx = openTags.lastIndexOf(tagMatch[1]);
        if (idx !== -1) {
          openTags.splice(idx, 1);
        }
      }

      for (let i = openTags.length - 1; i >= 0; i--) {
        repaired += `</${openTags[i]}>`;
      }
    }

    return repaired;
  }

  computeConfidence(output: ParsedOutput): number {
    let score = 1.0;

    if (output.truncationDetected) {
      score -= 0.3;
    }

    score -= output.artifactsRemoved.length * 0.05;

    for (const jb of output.jsonBlocks) {
      if (!jb.isValid) {
        score -= 0.1;
      }
    }

    for (const cb of output.extractedBlocks) {
      if (!cb.isComplete) {
        score -= 0.15;
      }
    }

    return Math.max(0, score);
  }

  getStats(): {
    totalParsed: number;
    averageConfidence: number;
    truncationRate: number;
    artifactRate: number;
  } {
    const entries = this.statsMap.values();
    const total = entries.length;

    if (total === 0) {
      return {
        totalParsed: 0,
        averageConfidence: 0,
        truncationRate: 0,
        artifactRate: 0,
      };
    }

    let totalConfidence = 0;
    let truncatedCount = 0;
    let artifactCount = 0;

    for (const entry of entries) {
      totalConfidence += entry.confidence;
      if (entry.truncated) truncatedCount++;
      if (entry.hadArtifacts) artifactCount++;
    }

    return {
      totalParsed: total,
      averageConfidence: totalConfidence / total,
      truncationRate: truncatedCount / total,
      artifactRate: artifactCount / total,
    };
  }

  private hasBalancedBrackets(content: string): boolean {
    let parens = 0;
    let brackets = 0;
    let braces = 0;
    let inString = false;
    let stringChar = "";

    for (let i = 0; i < content.length; i++) {
      const c = content[i];
      const prev = content[i - 1];

      if (inString) {
        if (c === stringChar && prev !== "\\") inString = false;
        continue;
      }

      if (c === '"' || c === "'" || c === "`") {
        inString = true;
        stringChar = c;
        continue;
      }

      if (c === "(") parens++;
      else if (c === ")") parens--;
      else if (c === "[") brackets++;
      else if (c === "]") brackets--;
      else if (c === "{") braces++;
      else if (c === "}") braces--;
    }

    return parens === 0 && brackets === 0 && braces === 0;
  }

  private extractJsonCandidate(text: string, startIdx: number, startChar: string): string | null {
    const endChar = startChar === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let stringChar = "";

    for (let i = startIdx; i < text.length; i++) {
      const c = text[i];
      const prev = text[i - 1];

      if (inString) {
        if (c === stringChar && prev !== "\\") {
          inString = false;
        }
        continue;
      }

      if (c === '"' || c === "'") {
        inString = true;
        stringChar = c;
        continue;
      }

      if (c === startChar) depth++;
      else if (c === endChar) {
        depth--;
        if (depth === 0) {
          return text.slice(startIdx, i + 1);
        }
      }
    }

    return null;
  }

  private tryParseJson(raw: string): JsonBlock {
    const errors: string[] = [];

    try {
      const parsed = JSON.parse(raw);
      return { raw, parsed, isValid: true, errors: [] };
    } catch (e: any) {
      errors.push(e.message);
    }

    let fixed = raw;

    fixed = fixed.replace(/,\s*([}\]])/g, "$1");

    try {
      const parsed = JSON.parse(fixed);
      return { raw, parsed, isValid: true, errors: [] };
    } catch (parseErr1) {
      this.log("JSON parse attempt 1 failed, trying quote replacement", { error: String(parseErr1) });
    }

    fixed = fixed.replace(/'/g, '"');

    try {
      const parsed = JSON.parse(fixed);
      return { raw, parsed, isValid: true, errors: [] };
    } catch (parseErr2) {
      this.log("JSON parse attempt 2 failed, trying key quoting", { error: String(parseErr2) });
    }

    fixed = raw.replace(/(['"])?(\w+)(['"])?\s*:/g, '"$2":');
    fixed = fixed.replace(/,\s*([}\]])/g, "$1");

    try {
      const parsed = JSON.parse(fixed);
      return { raw, parsed, isValid: true, errors: [] };
    } catch (e: any) {
      errors.push(e.message);
    }

    return { raw, parsed: null, isValid: false, errors };
  }

  destroy(): void {
    this.statsMap.clear();
    this.log("OutputParserService shutting down");
  }
}

export const outputParserService = OutputParserService.getInstance();
