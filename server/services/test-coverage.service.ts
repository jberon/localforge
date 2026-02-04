import logger from "../lib/logger";

interface FileInfo {
  path: string;
  content: string;
}

interface CoverageResult {
  overallCoverage: number;
  filesCovered: FileCoverage[];
  uncoveredFiles: string[];
  suggestions: TestSuggestion[];
  summary: CoverageSummary;
}

interface FileCoverage {
  filePath: string;
  coverage: number;
  testFile?: string;
  testedFunctions: string[];
  untestedFunctions: string[];
}

interface TestSuggestion {
  filePath: string;
  functionName: string;
  priority: "high" | "medium" | "low";
  suggestedTest: string;
  reason: string;
}

interface CoverageSummary {
  totalFiles: number;
  filesWithTests: number;
  totalFunctions: number;
  testedFunctions: number;
  criticalUntested: number;
}

interface FunctionInfo {
  name: string;
  isExported: boolean;
  isAsync: boolean;
  complexity: number;
  line: number;
}

class TestCoverageService {
  private static instance: TestCoverageService;

  private constructor() {}

  static getInstance(): TestCoverageService {
    if (!TestCoverageService.instance) {
      TestCoverageService.instance = new TestCoverageService();
    }
    return TestCoverageService.instance;
  }

  async analyzeCoverage(files: FileInfo[]): Promise<CoverageResult> {
    logger.info("Analyzing test coverage", { fileCount: files.length });

    const sourceFiles = files.filter(f => this.isSourceFile(f.path));
    const testFiles = files.filter(f => this.isTestFile(f.path));

    const filesCovered: FileCoverage[] = [];
    const uncoveredFiles: string[] = [];
    const suggestions: TestSuggestion[] = [];

    let totalFunctions = 0;
    let testedFunctions = 0;
    let criticalUntested = 0;

    for (const sourceFile of sourceFiles) {
      const functions = this.extractFunctions(sourceFile.content);
      totalFunctions += functions.length;

      const matchingTestFile = this.findMatchingTestFile(sourceFile.path, testFiles);
      const testedFunctionNames = matchingTestFile 
        ? this.extractTestedFunctions(matchingTestFile.content, sourceFile.path)
        : [];

      const testedFuncs = functions.filter(f => 
        testedFunctionNames.some(t => t.includes(f.name))
      );
      const untestedFuncs = functions.filter(f => 
        !testedFunctionNames.some(t => t.includes(f.name))
      );

      testedFunctions += testedFuncs.length;

      if (testedFuncs.length > 0 || matchingTestFile) {
        filesCovered.push({
          filePath: sourceFile.path,
          coverage: functions.length > 0 
            ? Math.round((testedFuncs.length / functions.length) * 100)
            : 100,
          testFile: matchingTestFile?.path,
          testedFunctions: testedFuncs.map(f => f.name),
          untestedFunctions: untestedFuncs.map(f => f.name),
        });
      } else if (functions.length > 0) {
        uncoveredFiles.push(sourceFile.path);
      }

      for (const func of untestedFuncs) {
        if (func.isExported && func.complexity > 1) {
          criticalUntested++;
          suggestions.push(this.generateTestSuggestion(sourceFile.path, func));
        }
      }
    }

    const overallCoverage = totalFunctions > 0
      ? Math.round((testedFunctions / totalFunctions) * 100)
      : 100;

    return {
      overallCoverage,
      filesCovered,
      uncoveredFiles,
      suggestions: suggestions.slice(0, 20),
      summary: {
        totalFiles: sourceFiles.length,
        filesWithTests: filesCovered.length,
        totalFunctions,
        testedFunctions,
        criticalUntested,
      },
    };
  }

  private isSourceFile(path: string): boolean {
    if (this.isTestFile(path)) return false;
    const ext = path.split(".").pop()?.toLowerCase();
    return ["ts", "tsx", "js", "jsx"].includes(ext || "");
  }

  private isTestFile(path: string): boolean {
    return path.includes(".test.") || 
           path.includes(".spec.") || 
           path.includes("__tests__");
  }

  private findMatchingTestFile(sourcePath: string, testFiles: FileInfo[]): FileInfo | undefined {
    const baseName = sourcePath.split("/").pop()?.replace(/\.(ts|tsx|js|jsx)$/, "");
    if (!baseName) return undefined;

    return testFiles.find(tf => {
      const testBaseName = tf.path.split("/").pop();
      return testBaseName?.includes(baseName);
    });
  }

  private extractFunctions(content: string): FunctionInfo[] {
    const functions: FunctionInfo[] = [];
    const lines = content.split("\n");

    const patterns = [
      { regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/, async: true },
      { regex: /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::\s*[^=]+)?\s*=>/, async: false },
      { regex: /^(?:export\s+)?(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/, async: false },
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      for (const { regex } of patterns) {
        const match = line.match(regex);
        if (match && match[1]) {
          const name = match[1];
          if (!["if", "for", "while", "switch", "catch", "constructor"].includes(name)) {
            functions.push({
              name,
              isExported: line.startsWith("export"),
              isAsync: line.includes("async"),
              complexity: this.estimateComplexity(content, i),
              line: i + 1,
            });
          }
          break;
        }
      }
    }

    return functions;
  }

  private estimateComplexity(content: string, startLine: number): number {
    const lines = content.split("\n");
    let complexity = 1;
    let braceCount = 0;
    let started = false;

    for (let i = startLine; i < Math.min(startLine + 100, lines.length); i++) {
      const line = lines[i];
      
      braceCount += (line.match(/\{/g) || []).length;
      braceCount -= (line.match(/\}/g) || []).length;
      
      if (braceCount > 0) started = true;
      if (started && braceCount === 0) break;

      if (/\b(if|else|for|while|switch|case|catch|&&|\|\||\?)\b/.test(line)) {
        complexity++;
      }
    }

    return Math.min(complexity, 10);
  }

  private extractTestedFunctions(testContent: string, sourcePath: string): string[] {
    const testedFunctions: string[] = [];
    
    const describeMatches = Array.from(testContent.matchAll(/(?:describe|it|test)\s*\(\s*['"`]([^'"`]+)['"`]/g));
    for (const match of describeMatches) {
      testedFunctions.push(match[1]);
    }

    const sourceBaseName = sourcePath.split("/").pop()?.replace(/\.(ts|tsx|js|jsx)$/, "");
    if (sourceBaseName && testContent.includes(sourceBaseName)) {
      testedFunctions.push(sourceBaseName);
    }

    return testedFunctions;
  }

  private generateTestSuggestion(filePath: string, func: FunctionInfo): TestSuggestion {
    const isComponent = filePath.endsWith(".tsx") || filePath.endsWith(".jsx");
    
    let suggestedTest: string;
    let priority: TestSuggestion["priority"];
    let reason: string;

    if (isComponent) {
      suggestedTest = `
import { render, screen } from '@testing-library/react';
import { ${func.name} } from '${filePath.replace(/\.(tsx|jsx)$/, "")}';

describe('${func.name}', () => {
  it('renders correctly', () => {
    render(<${func.name} />);
    // Add assertions for expected content
  });

  it('handles user interaction', () => {
    render(<${func.name} />);
    // Add interaction tests
  });
});`.trim();
      priority = func.complexity > 3 ? "high" : "medium";
      reason = `Component with complexity ${func.complexity} should have render and interaction tests`;
    } else {
      suggestedTest = `
import { ${func.name} } from '${filePath.replace(/\.(ts|js)$/, "")}';

describe('${func.name}', () => {
  it('handles valid input', ${func.isAsync ? "async " : ""}() => {
    ${func.isAsync ? "const result = await " : "const result = "}${func.name}(/* valid input */);
    expect(result).toBeDefined();
  });

  it('handles edge cases', ${func.isAsync ? "async " : ""}() => {
    // Test edge cases and error conditions
  });
});`.trim();
      priority = func.isExported && func.complexity > 2 ? "high" : "low";
      reason = `Exported function with complexity ${func.complexity} needs unit tests`;
    }

    return {
      filePath,
      functionName: func.name,
      priority,
      suggestedTest,
      reason,
    };
  }

  generateTestTemplate(
    functionName: string,
    isAsync: boolean,
    isComponent: boolean,
    importPath: string
  ): string {
    if (isComponent) {
      return `
import { render, screen, fireEvent } from '@testing-library/react';
import { ${functionName} } from '${importPath}';

describe('${functionName}', () => {
  it('renders without crashing', () => {
    render(<${functionName} />);
  });

  it('displays expected content', () => {
    render(<${functionName} />);
    // expect(screen.getByText('...')).toBeInTheDocument();
  });
});
`.trim();
    }

    return `
import { describe, it, expect${isAsync ? ", vi" : ""} } from 'vitest';
import { ${functionName} } from '${importPath}';

describe('${functionName}', () => {
  it('returns expected result for valid input', ${isAsync ? "async " : ""}() => {
    ${isAsync ? "const result = await " : "const result = "}${functionName}(/* input */);
    expect(result).toBeDefined();
  });

  it('handles empty input', ${isAsync ? "async " : ""}() => {
    // Test with empty/null input
  });

  it('throws on invalid input', ${isAsync ? "async " : ""}() => {
    ${isAsync ? "await expect(" : "expect(() =>"}${functionName}(null)${isAsync ? ").rejects.toThrow()" : ").toThrow()"};
  });
});
`.trim();
  }
}

export const testCoverageService = TestCoverageService.getInstance();
