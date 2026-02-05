import { logger } from "../lib/logger";

interface SyntaxError {
  line: number;
  column: number;
  message: string;
  severity: "error" | "warning";
  code?: string;
}

interface ValidationResult {
  isValid: boolean;
  errors: SyntaxError[];
  warnings: SyntaxError[];
  partialCode: string;
  suggestedFix?: string;
}

interface BracketState {
  round: number;
  square: number;
  curly: number;
  template: number;
  jsx: number;
}

class LiveSyntaxValidatorService {
  private static instance: LiveSyntaxValidatorService;
  private jsKeywords: Set<string>;
  private tsKeywords: Set<string>;

  private constructor() {
    this.jsKeywords = new Set([
      "break", "case", "catch", "continue", "debugger", "default", "delete",
      "do", "else", "finally", "for", "function", "if", "in", "instanceof",
      "new", "return", "switch", "this", "throw", "try", "typeof", "var",
      "void", "while", "with", "class", "const", "enum", "export", "extends",
      "import", "super", "implements", "interface", "let", "package", "private",
      "protected", "public", "static", "yield", "async", "await",
    ]);
    
    this.tsKeywords = new Set([
      ...Array.from(this.jsKeywords),
      "type", "namespace", "declare", "abstract", "as", "asserts", "any",
      "boolean", "bigint", "never", "null", "number", "object", "string",
      "symbol", "undefined", "unknown", "void", "keyof", "readonly", "unique",
      "infer", "is", "module", "global", "require",
    ]);

    logger.info("LiveSyntaxValidatorService initialized");
  }

  static getInstance(): LiveSyntaxValidatorService {
    if (!LiveSyntaxValidatorService.instance) {
      LiveSyntaxValidatorService.instance = new LiveSyntaxValidatorService();
    }
    return LiveSyntaxValidatorService.instance;
  }

  validateStreaming(code: string, language: "typescript" | "javascript" = "typescript"): ValidationResult {
    const errors: SyntaxError[] = [];
    const warnings: SyntaxError[] = [];
    
    const bracketState = this.checkBrackets(code);
    const bracketErrors = this.getBracketErrors(bracketState, code);
    errors.push(...bracketErrors);
    
    const stringErrors = this.checkStrings(code);
    errors.push(...stringErrors);
    
    const syntaxErrors = this.checkCommonSyntaxErrors(code, language);
    errors.push(...syntaxErrors);
    
    const styleWarnings = this.checkStyleIssues(code);
    warnings.push(...styleWarnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      partialCode: code,
      suggestedFix: errors.length > 0 ? this.suggestFix(code, errors[0]) : undefined,
    };
  }

  private checkBrackets(code: string): BracketState {
    const state: BracketState = {
      round: 0,
      square: 0,
      curly: 0,
      template: 0,
      jsx: 0,
    };

    let inString = false;
    let stringChar = "";
    let inComment = false;
    let inMultilineComment = false;
    let inTemplate = false;
    let templateDepth = 0;
    let templateExpressionDepth = 0;

    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      const nextChar = code[i + 1];
      const prevChar = code[i - 1];

      if (inMultilineComment) {
        if (char === "*" && nextChar === "/") {
          inMultilineComment = false;
          i++;
        }
        continue;
      }

      if (inComment) {
        if (char === "\n") {
          inComment = false;
        }
        continue;
      }

      if (char === "/" && nextChar === "/") {
        inComment = true;
        continue;
      }

      if (char === "/" && nextChar === "*") {
        inMultilineComment = true;
        i++;
        continue;
      }

      if (!inString && !inTemplate) {
        if (char === '"' || char === "'" || char === "`") {
          if (char === "`") {
            inTemplate = true;
            templateDepth++;
            state.template++;
          } else {
            inString = true;
            stringChar = char;
          }
          continue;
        }
      } else if (inString) {
        if (char === stringChar && prevChar !== "\\") {
          inString = false;
          stringChar = "";
        }
        continue;
      } else if (inTemplate) {
        if (char === "`" && prevChar !== "\\") {
          templateDepth--;
          state.template--;
          if (templateDepth === 0) {
            inTemplate = false;
            templateExpressionDepth = 0;
          }
        } else if (char === "$" && nextChar === "{") {
          templateExpressionDepth++;
          i++;
        } else if (char === "}" && templateExpressionDepth > 0) {
          templateExpressionDepth--;
        } else if (char === "{" && templateExpressionDepth > 0) {
          templateExpressionDepth++;
        }
        continue;
      }

      switch (char) {
        case "(":
          state.round++;
          break;
        case ")":
          state.round--;
          break;
        case "[":
          state.square++;
          break;
        case "]":
          state.square--;
          break;
        case "{":
          state.curly++;
          break;
        case "}":
          state.curly--;
          break;
        case "<":
          if (this.isJsxContext(code, i)) {
            state.jsx++;
          }
          break;
        case ">":
          if (this.isJsxClosing(code, i)) {
            state.jsx--;
          }
          break;
      }
    }

    return state;
  }

  private isJsxContext(code: string, index: number): boolean {
    const before = code.slice(Math.max(0, index - 20), index);
    return /return\s*$|=\s*$|\(\s*$/.test(before);
  }

  private isJsxClosing(code: string, index: number): boolean {
    const before = code.slice(Math.max(0, index - 10), index);
    return /<\/?\w+[^>]*$/.test(before);
  }

  private getBracketErrors(state: BracketState, code: string): SyntaxError[] {
    const errors: SyntaxError[] = [];
    const lines = code.split("\n");
    const lastLine = lines.length;

    if (state.round < 0) {
      errors.push({
        line: lastLine,
        column: 0,
        message: "Unmatched closing parenthesis ')'",
        severity: "error",
      });
    }

    if (state.square < 0) {
      errors.push({
        line: lastLine,
        column: 0,
        message: "Unmatched closing bracket ']'",
        severity: "error",
      });
    }

    if (state.curly < 0) {
      errors.push({
        line: lastLine,
        column: 0,
        message: "Unmatched closing brace '}'",
        severity: "error",
      });
    }

    return errors;
  }

  private checkStrings(code: string): SyntaxError[] {
    const errors: SyntaxError[] = [];
    const lines = code.split("\n");

    lines.forEach((line, lineIndex) => {
      let inString = false;
      let stringChar = "";
      let stringStart = 0;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const prevChar = line[i - 1];

        if (!inString && (char === '"' || char === "'")) {
          inString = true;
          stringChar = char;
          stringStart = i;
        } else if (inString && char === stringChar && prevChar !== "\\") {
          inString = false;
        }
      }

      if (inString && stringChar !== "`") {
        errors.push({
          line: lineIndex + 1,
          column: stringStart,
          message: `Unterminated string literal (started with ${stringChar})`,
          severity: "error",
        });
      }
    });

    return errors;
  }

  private checkCommonSyntaxErrors(code: string, language: "typescript" | "javascript"): SyntaxError[] {
    const errors: SyntaxError[] = [];
    const lines = code.split("\n");

    const patterns: Array<{ pattern: RegExp; message: string; severity: "error" | "warning" }> = [
      { pattern: /\)\s*{.*}\s*else/, message: "Else clause on same line as closing brace", severity: "warning" },
      { pattern: /=\s*=\s*=\s*=/, message: "Invalid equality operator (====)", severity: "error" },
      { pattern: /\bfunction\s+\(/, message: "Missing function name or use arrow function", severity: "warning" },
      { pattern: /\bconst\s+\w+\s*:\s*$/, message: "Missing type annotation value", severity: "error" },
      { pattern: /import\s+{[^}]*$/, message: "Incomplete import statement", severity: "warning" },
      { pattern: /export\s+default\s+function\s*$/, message: "Incomplete function export", severity: "warning" },
      { pattern: /=>\s*$/, message: "Arrow function missing body", severity: "warning" },
      { pattern: /\breturn\s+$/, message: "Return statement missing value", severity: "warning" },
    ];

    lines.forEach((line, lineIndex) => {
      const trimmed = line.trim();
      
      if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
        return;
      }

      for (const { pattern, message, severity } of patterns) {
        if (pattern.test(line)) {
          errors.push({
            line: lineIndex + 1,
            column: 0,
            message,
            severity,
          });
        }
      }

      if (language === "typescript") {
        if (/:\s*any\b/.test(line)) {
          errors.push({
            line: lineIndex + 1,
            column: line.indexOf(": any"),
            message: "Consider using a more specific type instead of 'any'",
            severity: "warning",
          });
        }
      }
    });

    return errors;
  }

  private checkStyleIssues(code: string): SyntaxError[] {
    const warnings: SyntaxError[] = [];
    const lines = code.split("\n");

    lines.forEach((line, lineIndex) => {
      if (line.length > 120) {
        warnings.push({
          line: lineIndex + 1,
          column: 120,
          message: `Line exceeds 120 characters (${line.length})`,
          severity: "warning",
        });
      }

      if (/\t/.test(line) && /^ +/.test(line)) {
        warnings.push({
          line: lineIndex + 1,
          column: 0,
          message: "Mixed tabs and spaces in indentation",
          severity: "warning",
        });
      }

      if (/console\.(log|error|warn|debug|info)/.test(line) && !line.includes("// eslint-disable")) {
        warnings.push({
          line: lineIndex + 1,
          column: line.indexOf("console."),
          message: "Console statement detected - consider using a logger",
          severity: "warning",
        });
      }
    });

    return warnings;
  }

  private suggestFix(code: string, error: SyntaxError): string | undefined {
    if (error.message.includes("Unmatched closing parenthesis")) {
      return "Add opening parenthesis '(' or remove extra closing ')'";
    }
    if (error.message.includes("Unmatched closing bracket")) {
      return "Add opening bracket '[' or remove extra closing ']'";
    }
    if (error.message.includes("Unmatched closing brace")) {
      return "Add opening brace '{' or remove extra closing '}'";
    }
    if (error.message.includes("Unterminated string")) {
      return "Close the string with the matching quote character";
    }
    return undefined;
  }

  validateChunk(chunk: string, previousCode: string): { 
    isValid: boolean; 
    earlyError?: SyntaxError;
  } {
    const fullCode = previousCode + chunk;
    const result = this.validateStreaming(fullCode);
    
    const criticalError = result.errors.find(e => 
      e.message.includes("Unmatched closing") && 
      !e.message.includes("opening")
    );

    return {
      isValid: !criticalError,
      earlyError: criticalError,
    };
  }

  getCompletionHints(code: string): string[] {
    const hints: string[] = [];
    const state = this.checkBrackets(code);

    if (state.round > 0) {
      hints.push(`Need ${state.round} closing parenthesis ')'`);
    }
    if (state.square > 0) {
      hints.push(`Need ${state.square} closing bracket ']'`);
    }
    if (state.curly > 0) {
      hints.push(`Need ${state.curly} closing brace '}'`);
    }
    if (state.template > 0) {
      hints.push(`Need ${state.template} closing backtick '\`'`);
    }

    return hints;
  }
}

export const liveSyntaxValidatorService = LiveSyntaxValidatorService.getInstance();
