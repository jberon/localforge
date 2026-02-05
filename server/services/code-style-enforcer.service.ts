import { logger } from "../lib/logger";

interface FormatOptions {
  printWidth: number;
  tabWidth: number;
  useTabs: boolean;
  semi: boolean;
  singleQuote: boolean;
  trailingComma: "none" | "es5" | "all";
  bracketSpacing: boolean;
  arrowParens: "avoid" | "always";
  jsxSingleQuote: boolean;
  bracketSameLine: boolean;
}

interface FormatResult {
  formatted: string;
  changed: boolean;
  issues: string[];
}

class CodeStyleEnforcerService {
  private static instance: CodeStyleEnforcerService;
  private defaultOptions: FormatOptions;

  private constructor() {
    this.defaultOptions = {
      printWidth: 100,
      tabWidth: 2,
      useTabs: false,
      semi: true,
      singleQuote: false,
      trailingComma: "es5",
      bracketSpacing: true,
      arrowParens: "always",
      jsxSingleQuote: false,
      bracketSameLine: false,
    };

    logger.info("CodeStyleEnforcerService initialized");
  }

  static getInstance(): CodeStyleEnforcerService {
    if (!CodeStyleEnforcerService.instance) {
      CodeStyleEnforcerService.instance = new CodeStyleEnforcerService();
    }
    return CodeStyleEnforcerService.instance;
  }

  setDefaultOptions(options: Partial<FormatOptions>): void {
    this.defaultOptions = { ...this.defaultOptions, ...options };
    logger.info("Default format options updated", { options: this.defaultOptions });
  }

  formatCode(code: string, options?: Partial<FormatOptions>): FormatResult {
    const opts = { ...this.defaultOptions, ...options };
    const issues: string[] = [];
    let formatted = code;

    formatted = this.normalizeLineEndings(formatted);
    formatted = this.normalizeIndentation(formatted, opts);
    formatted = this.normalizeSpacing(formatted, opts);
    formatted = this.normalizeStrings(formatted, opts);
    formatted = this.normalizeSemicolons(formatted, opts);
    formatted = this.normalizeTrailingCommas(formatted, opts);
    formatted = this.normalizeArrowFunctions(formatted, opts);
    formatted = this.normalizeBrackets(formatted, opts);
    formatted = this.normalizeImports(formatted);
    formatted = this.removeTrailingWhitespace(formatted);
    formatted = this.ensureFinalNewline(formatted);

    if (formatted !== code) {
      issues.push("Code was reformatted to match style guidelines");
    }

    return {
      formatted,
      changed: formatted !== code,
      issues,
    };
  }

  private normalizeLineEndings(code: string): string {
    return code.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  private normalizeIndentation(code: string, opts: FormatOptions): string {
    const lines = code.split("\n");
    const indent = opts.useTabs ? "\t" : " ".repeat(opts.tabWidth);
    
    return lines.map(line => {
      const match = line.match(/^(\s*)/);
      if (!match) return line;
      
      const leadingSpace = match[1];
      const content = line.slice(leadingSpace.length);
      
      if (content.length === 0) return "";
      
      let level = 0;
      if (opts.useTabs) {
        level = leadingSpace.replace(/ {2,4}/g, "\t").split("\t").length - 1;
      } else {
        const spaces = leadingSpace.replace(/\t/g, " ".repeat(opts.tabWidth));
        level = Math.floor(spaces.length / opts.tabWidth);
      }
      
      return indent.repeat(level) + content;
    }).join("\n");
  }

  private normalizeSpacing(code: string, opts: FormatOptions): string {
    const lines = code.split("\n");
    const result = lines.map(line => {
      const { codeParts, literals } = this.extractStringLiterals(line);
      let processed = codeParts;

      processed = processed.replace(/\s*,\s*/g, ", ");

      processed = processed.replace(/(?<!=)\s*(?<![=!<>])==(?!=)\s*/g, " == ");
      processed = processed.replace(/\s*===\s*/g, " === ");
      processed = processed.replace(/\s*!==\s*/g, " !== ");
      processed = processed.replace(/\s*>=\s*/g, " >= ");
      processed = processed.replace(/\s*<=\s*/g, " <= ");
      processed = processed.replace(/\s*!=(?!=)\s*/g, " != ");
      processed = processed.replace(/\s*&&\s*/g, " && ");
      processed = processed.replace(/\s*\|\|\s*/g, " || ");
      processed = processed.replace(/\s*\?\?\s*/g, " ?? ");

      processed = processed.replace(/\s*=>\s*/g, " => ");

      processed = processed.replace(/(?<![=!<>+\-*/%&|^])=(?![=>])\s*/g, " = ");

      if (opts.bracketSpacing) {
        processed = processed.replace(/{\s*([^}\s])/g, "{ $1");
        processed = processed.replace(/([^{\s])\s*}/g, "$1 }");
      }

      processed = processed.replace(/  +/g, " ");

      return this.restoreStringLiterals(processed, literals);
    }).join("\n");

    return result.replace(/\n{3,}/g, "\n\n");
  }

  private extractStringLiterals(line: string): { codeParts: string; literals: string[] } {
    const literals: string[] = [];
    let result = "";
    let i = 0;

    while (i < line.length) {
      if (line[i] === "/" && line[i + 1] === "/") {
        literals.push(line.slice(i));
        result += `\x00STR${literals.length - 1}\x00`;
        break;
      }

      if (line[i] === '"' || line[i] === "'" || line[i] === "`") {
        const quote = line[i];
        let j = i + 1;
        while (j < line.length && line[j] !== quote) {
          if (line[j] === "\\") j++;
          j++;
        }
        const literal = line.slice(i, j + 1);
        literals.push(literal);
        result += `\x00STR${literals.length - 1}\x00`;
        i = j + 1;
      } else {
        result += line[i];
        i++;
      }
    }

    return { codeParts: result, literals };
  }

  private restoreStringLiterals(code: string, literals: string[]): string {
    return code.replace(/\x00STR(\d+)\x00/g, (_, idx) => literals[parseInt(idx)]);
  }

  private normalizeStrings(code: string, opts: FormatOptions): string {
    const quote = opts.singleQuote ? "'" : '"';
    const altQuote = opts.singleQuote ? '"' : "'";
    
    return code.replace(new RegExp(`${altQuote}([^${altQuote}\\\\]*(\\\\.[^${altQuote}\\\\]*)*)${altQuote}`, "g"), (match, content) => {
      if (content.includes(quote)) {
        return match;
      }
      return quote + content + quote;
    });
  }

  private normalizeSemicolons(code: string, opts: FormatOptions): string {
    const lines = code.split("\n");
    
    return lines.map(line => {
      const trimmed = line.trim();
      
      if (!trimmed || 
          trimmed.startsWith("//") || 
          trimmed.startsWith("/*") ||
          trimmed.startsWith("*") ||
          trimmed.endsWith("{") ||
          trimmed.endsWith(",") ||
          trimmed === "}" ||
          trimmed.endsWith("(") ||
          /^(if|else|for|while|switch|try|catch|finally|class|interface|type|enum|function|export|import)\b/.test(trimmed)) {
        return line;
      }

      if (opts.semi) {
        if (!trimmed.endsWith(";") && !trimmed.endsWith("}")) {
          if (/^(const|let|var|return|throw|break|continue)\b/.test(trimmed) ||
              /\)$/.test(trimmed) ||
              /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*=/.test(trimmed)) {
            return line.replace(/\s*$/, ";");
          }
        }
      } else {
        if (trimmed.endsWith(";")) {
          return line.replace(/;\s*$/, "");
        }
      }

      return line;
    }).join("\n");
  }

  private normalizeTrailingCommas(code: string, opts: FormatOptions): string {
    if (opts.trailingComma === "none") {
      return code.replace(/,(\s*[}\]])/g, "$1");
    }
    
    if (opts.trailingComma === "all" || opts.trailingComma === "es5") {
      return code.replace(/([^,\s])(\s*\n\s*[}\]])/g, "$1,$2");
    }
    
    return code;
  }

  private normalizeArrowFunctions(code: string, opts: FormatOptions): string {
    if (opts.arrowParens === "always") {
      return code.replace(/(\s|^)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/g, "$1($2) =>");
    } else {
      return code.replace(/\(([a-zA-Z_$][a-zA-Z0-9_$]*)\)\s*=>/g, "$1 =>");
    }
  }

  private normalizeBrackets(code: string, opts: FormatOptions): string {
    if (opts.bracketSameLine) {
      return code.replace(/>\n\s*</g, "><");
    }
    return code;
  }

  private normalizeImports(code: string): string {
    const lines = code.split("\n");
    const importLines: string[] = [];
    const otherLines: string[] = [];
    let inImportBlock = true;

    for (const line of lines) {
      if (inImportBlock && line.trim().startsWith("import ")) {
        importLines.push(line);
      } else if (inImportBlock && line.trim() === "") {
        continue;
      } else {
        inImportBlock = false;
        otherLines.push(line);
      }
    }

    if (importLines.length === 0) {
      return code;
    }

    const nodeModules: string[] = [];
    const localModules: string[] = [];
    const relativeModules: string[] = [];

    for (const imp of importLines) {
      if (imp.includes('from "./') || imp.includes('from "../') || imp.includes("from './") || imp.includes("from '../")) {
        relativeModules.push(imp);
      } else if (imp.includes('from "@/') || imp.includes("from '@/")) {
        localModules.push(imp);
      } else {
        nodeModules.push(imp);
      }
    }

    const sortedImports = [
      ...nodeModules.sort(),
      ...(nodeModules.length > 0 && localModules.length > 0 ? [""] : []),
      ...localModules.sort(),
      ...(localModules.length > 0 && relativeModules.length > 0 ? [""] : []),
      ...(nodeModules.length > 0 && localModules.length === 0 && relativeModules.length > 0 ? [""] : []),
      ...relativeModules.sort(),
    ];

    return [...sortedImports, "", ...otherLines].join("\n");
  }

  private removeTrailingWhitespace(code: string): string {
    return code.split("\n").map(line => line.replace(/\s+$/, "")).join("\n");
  }

  private ensureFinalNewline(code: string): string {
    if (!code.endsWith("\n")) {
      return code + "\n";
    }
    return code;
  }

  formatMultipleFiles(files: Array<{ path: string; content: string }>): Array<{ path: string; result: FormatResult }> {
    return files.map(file => {
      const language = this.detectLanguage(file.path);
      const options = this.getLanguageOptions(language);
      
      return {
        path: file.path,
        result: this.formatCode(file.content, options),
      };
    });
  }

  private detectLanguage(filePath: string): "typescript" | "javascript" | "css" | "json" | "other" {
    if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) {
      return "typescript";
    }
    if (filePath.endsWith(".js") || filePath.endsWith(".jsx")) {
      return "javascript";
    }
    if (filePath.endsWith(".css") || filePath.endsWith(".scss")) {
      return "css";
    }
    if (filePath.endsWith(".json")) {
      return "json";
    }
    return "other";
  }

  private getLanguageOptions(language: string): Partial<FormatOptions> {
    switch (language) {
      case "json":
        return { tabWidth: 2, trailingComma: "none", semi: false };
      default:
        return {};
    }
  }

  generateEslintConfig(): object {
    return {
      root: true,
      env: { browser: true, es2021: true, node: true },
      extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:react/recommended",
        "plugin:react-hooks/recommended",
      ],
      parser: "@typescript-eslint/parser",
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
      plugins: ["@typescript-eslint", "react"],
      rules: {
        "semi": ["error", this.defaultOptions.semi ? "always" : "never"],
        "quotes": ["error", this.defaultOptions.singleQuote ? "single" : "double"],
        "comma-dangle": ["error", this.defaultOptions.trailingComma],
        "max-len": ["warn", { code: this.defaultOptions.printWidth }],
        "indent": ["error", this.defaultOptions.tabWidth],
        "react/react-in-jsx-scope": "off",
        "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      },
      settings: { react: { version: "detect" } },
    };
  }

  generatePrettierConfig(): object {
    return {
      printWidth: this.defaultOptions.printWidth,
      tabWidth: this.defaultOptions.tabWidth,
      useTabs: this.defaultOptions.useTabs,
      semi: this.defaultOptions.semi,
      singleQuote: this.defaultOptions.singleQuote,
      trailingComma: this.defaultOptions.trailingComma,
      bracketSpacing: this.defaultOptions.bracketSpacing,
      arrowParens: this.defaultOptions.arrowParens,
      jsxSingleQuote: this.defaultOptions.jsxSingleQuote,
      bracketSameLine: this.defaultOptions.bracketSameLine,
    };
  }
}

export const codeStyleEnforcerService = CodeStyleEnforcerService.getInstance();
