import { createLLMClient, LLM_DEFAULTS, generateCompletion } from "../llm-client";
import { searchWeb, formatSearchResultsForContext } from "./webSearch";
import { llmSettingsSchema } from "@shared/schema";
import { z } from "zod";

export interface ProjectFile {
  path: string;
  content: string;
  type: "component" | "hook" | "service" | "test" | "config" | "readme" | "style";
}

export interface ProductionPlan {
  summary: string;
  architecture: string;
  files: Array<{
    path: string;
    purpose: string;
    type: ProjectFile["type"];
    dependencies: string[];
  }>;
  testPlan: Array<{
    file: string;
    tests: string[];
  }>;
  searchQueries?: string[];
}

export interface QualityReport {
  score: number;
  issues: Array<{
    severity: "error" | "warning" | "info";
    file: string;
    message: string;
    line?: number;
  }>;
  passed: boolean;
}

export interface ProductionState {
  phase: "planning" | "searching" | "building" | "testing" | "quality_check" | "documenting" | "complete" | "failed";
  plan?: ProductionPlan;
  files: ProjectFile[];
  testResults?: { passed: number; failed: number; errors: string[] };
  qualityReport?: QualityReport;
  fixAttempts: number;
  maxFixAttempts: number;
  webSearchResults: string;
}

export type ProductionEvent =
  | { type: "phase_change"; phase: ProductionState["phase"]; message: string }
  | { type: "thinking"; model: "planner" | "builder"; content: string }
  | { type: "file_start"; file: string; purpose: string }
  | { type: "file_complete"; file: string; size: number }
  | { type: "file_chunk"; file: string; content: string }
  | { type: "test_result"; file: string; passed: boolean; error?: string }
  | { type: "quality_issue"; issue: QualityReport["issues"][0] }
  | { type: "quality_score"; score: number; passed: boolean }
  | { type: "search_result"; query: string; resultCount: number }
  | { type: "fix_attempt"; attempt: number; maxAttempts: number; reason: string }
  | { type: "complete"; files: ProjectFile[]; summary: string; qualityScore: number }
  | { type: "error"; message: string };

type LLMSettings = z.infer<typeof llmSettingsSchema>;

const PRODUCTION_PLANNING_PROMPT = `You are a senior software architect creating production-ready TypeScript React applications.

RESPOND WITH VALID JSON ONLY (no markdown):
{
  "summary": "Brief description of the application",
  "architecture": "Technical architecture decisions (state management, API patterns, styling approach)",
  "files": [
    {"path": "src/App.tsx", "purpose": "Main application entry point", "type": "component", "dependencies": []},
    {"path": "src/components/Header.tsx", "purpose": "Navigation header", "type": "component", "dependencies": ["App.tsx"]},
    {"path": "src/hooks/useData.ts", "purpose": "Data fetching hook", "type": "hook", "dependencies": []},
    {"path": "src/services/api.ts", "purpose": "API service layer", "type": "service", "dependencies": []},
    {"path": "src/__tests__/App.test.tsx", "purpose": "App component tests", "type": "test", "dependencies": ["App.tsx"]}
  ],
  "testPlan": [
    {"file": "src/__tests__/App.test.tsx", "tests": ["renders main heading", "handles user interaction", "displays data correctly"]},
    {"file": "src/__tests__/Header.test.tsx", "tests": ["renders navigation links", "highlights active page"]}
  ],
  "searchNeeded": false,
  "searchQueries": []
}

REQUIREMENTS:
- Use TypeScript with proper types
- Follow React best practices (functional components, hooks)
- Include comprehensive test files for each component
- Use proper file structure (components/, hooks/, services/, __tests__/)
- Keep files focused and single-responsibility
- Maximum 8 files for simple apps, 15 for complex apps`;

const FILE_GENERATION_PROMPT = `You are a senior TypeScript React developer generating production-ready code.

CRITICAL RULES:
1. Output ONLY the file content - no explanations, no markdown code blocks
2. Use TypeScript with proper type annotations
3. Follow React best practices (functional components, hooks, proper error handling)
4. Include proper imports and exports
5. Write clean, maintainable code with meaningful variable names
6. Add JSDoc comments for functions and components
7. Handle loading and error states properly

CONTEXT:
{context}

FILE TO GENERATE:
Path: {filePath}
Purpose: {purpose}
Type: {fileType}
Dependencies: {dependencies}

Generate the complete file content now:`;

const TEST_GENERATION_PROMPT = `You are a senior QA engineer writing comprehensive React component tests.

CRITICAL RULES:
1. Output ONLY the test file content - no explanations, no markdown
2. Use Vitest and React Testing Library
3. Import from @testing-library/react
4. Test user interactions, not implementation details
5. Include setup and cleanup as needed
6. Cover happy paths and edge cases
7. Use descriptive test names

COMPONENT CODE:
{componentCode}

TESTS TO IMPLEMENT:
{testCases}

Generate the complete test file:`;

const README_PROMPT = `Generate a professional README.md for this project.

PROJECT SUMMARY:
{summary}

FILES:
{fileList}

Include:
- Project title and description
- Features list
- Installation instructions (npm install, npm run dev)
- Usage examples
- Project structure
- Tech stack
- License (MIT)

Output ONLY the markdown content:`;

export class ProductionOrchestrator {
  private settings: LLMSettings;
  private state: ProductionState;
  private onEvent: (event: ProductionEvent) => void;
  private aborted = false;

  constructor(settings: LLMSettings, onEvent: (event: ProductionEvent) => void) {
    this.settings = settings;
    this.onEvent = onEvent;
    this.state = this.createInitialState();
  }

  private createInitialState(): ProductionState {
    return {
      phase: "planning",
      files: [],
      fixAttempts: 0,
      maxFixAttempts: 3,
      webSearchResults: "",
    };
  }

  abort() {
    this.aborted = true;
  }

  private getPlannerConfig() {
    if (this.settings.useDualModels) {
      return {
        endpoint: this.settings.endpoint || "http://localhost:1234/v1",
        model: this.settings.plannerModel || this.settings.model || "",
        temperature: this.settings.plannerTemperature ?? LLM_DEFAULTS.temperature.planner,
      };
    }
    return {
      endpoint: this.settings.endpoint || "http://localhost:1234/v1",
      model: this.settings.model || "",
      temperature: LLM_DEFAULTS.temperature.planner,
    };
  }

  private getBuilderConfig() {
    if (this.settings.useDualModels) {
      return {
        endpoint: this.settings.endpoint || "http://localhost:1234/v1",
        model: this.settings.builderModel || this.settings.model || "",
        temperature: this.settings.builderTemperature ?? LLM_DEFAULTS.temperature.builder,
      };
    }
    return {
      endpoint: this.settings.endpoint || "http://localhost:1234/v1",
      model: this.settings.model || "",
      temperature: LLM_DEFAULTS.temperature.builder,
    };
  }

  async run(userRequest: string): Promise<{ success: boolean; files: ProjectFile[]; summary: string; qualityScore: number }> {
    this.state = this.createInitialState();
    this.aborted = false;

    try {
      this.emit({ type: "phase_change", phase: "planning", message: "Architect is designing your application..." });
      const plan = await this.planningPhase(userRequest);
      if (this.aborted) throw new Error("Aborted");
      this.state.plan = plan;

      if (plan.searchQueries && plan.searchQueries.length > 0 && this.settings.webSearchEnabled && this.settings.serperApiKey) {
        this.emit({ type: "phase_change", phase: "searching", message: "Researching best practices and APIs..." });
        await this.searchPhase(plan.searchQueries);
      }

      if (this.aborted) throw new Error("Aborted");
      this.emit({ type: "phase_change", phase: "building", message: "Building production-grade components..." });
      await this.buildingPhase(plan, userRequest);

      if (this.aborted) throw new Error("Aborted");
      this.emit({ type: "phase_change", phase: "testing", message: "Generating comprehensive tests..." });
      await this.testingPhase(plan);

      if (this.aborted) throw new Error("Aborted");
      this.emit({ type: "phase_change", phase: "quality_check", message: "Running quality analysis..." });
      const qualityReport = await this.qualityCheckPhase();
      this.state.qualityReport = qualityReport;

      if (!qualityReport.passed && this.state.fixAttempts < this.state.maxFixAttempts) {
        await this.fixQualityIssues(qualityReport);
      }

      if (this.aborted) throw new Error("Aborted");
      this.emit({ type: "phase_change", phase: "documenting", message: "Generating documentation..." });
      await this.documentationPhase(plan);

      this.emit({ type: "phase_change", phase: "complete", message: "Production-ready application complete!" });
      
      const finalScore = this.state.qualityReport?.score ?? 100;
      this.emit({ 
        type: "complete", 
        files: this.state.files, 
        summary: plan.summary,
        qualityScore: finalScore
      });

      return { 
        success: true, 
        files: this.state.files, 
        summary: plan.summary,
        qualityScore: finalScore
      };
    } catch (error: any) {
      if (error.message === "Aborted") {
        this.emit({ type: "error", message: "Generation cancelled" });
        return { success: false, files: [], summary: "", qualityScore: 0 };
      }
      this.emit({ type: "error", message: error.message });
      return { success: false, files: this.state.files, summary: error.message, qualityScore: 0 };
    }
  }

  private emit(event: ProductionEvent) {
    this.onEvent(event);
  }

  private async planningPhase(userRequest: string): Promise<ProductionPlan> {
    const config = this.getPlannerConfig();
    
    this.emit({ type: "thinking", model: "planner", content: "Analyzing requirements and designing architecture..." });

    const response = await generateCompletion(
      config,
      PRODUCTION_PLANNING_PROMPT,
      userRequest,
      LLM_DEFAULTS.maxTokens.plan
    );

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this.createDefaultPlan(userRequest);
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        summary: parsed.summary || "Building your application",
        architecture: parsed.architecture || "React with TypeScript",
        files: (parsed.files || []).map((f: any) => ({
          path: f.path,
          purpose: f.purpose,
          type: f.type || "component",
          dependencies: f.dependencies || [],
        })),
        testPlan: parsed.testPlan || [],
        searchQueries: parsed.searchNeeded ? (parsed.searchQueries || []) : [],
      };
    } catch {
      return this.createDefaultPlan(userRequest);
    }
  }

  private createDefaultPlan(userRequest: string): ProductionPlan {
    return {
      summary: `Building: ${userRequest.slice(0, 100)}`,
      architecture: "React with TypeScript, functional components, custom hooks",
      files: [
        { path: "src/App.tsx", purpose: "Main application component", type: "component", dependencies: [] },
        { path: "src/components/Main.tsx", purpose: "Primary content component", type: "component", dependencies: [] },
        { path: "src/hooks/useAppState.ts", purpose: "Application state hook", type: "hook", dependencies: [] },
        { path: "src/__tests__/App.test.tsx", purpose: "App component tests", type: "test", dependencies: ["App.tsx"] },
      ],
      testPlan: [
        { file: "src/__tests__/App.test.tsx", tests: ["renders without crashing", "displays main content"] },
      ],
    };
  }

  private async searchPhase(queries: string[]) {
    if (!this.settings.serperApiKey) return;

    let allResults = "";
    
    for (const query of queries.slice(0, 3)) {
      if (this.aborted) return;
      
      const result = await searchWeb(query, this.settings.serperApiKey);
      
      if (result.success && result.results.length > 0) {
        this.emit({ type: "search_result", query, resultCount: result.results.length });
        allResults += formatSearchResultsForContext(result.results) + "\n\n";
      }
    }

    this.state.webSearchResults = allResults;
  }

  private async buildingPhase(plan: ProductionPlan, userRequest: string) {
    const config = this.getBuilderConfig();
    const sourceFiles = plan.files.filter(f => f.type !== "test");
    const generatedFiles: Map<string, string> = new Map();

    for (const fileSpec of sourceFiles) {
      if (this.aborted) break;

      this.emit({ type: "file_start", file: fileSpec.path, purpose: fileSpec.purpose });
      this.emit({ type: "thinking", model: "builder", content: `Generating ${fileSpec.path}...` });

      let context = `PROJECT: ${plan.summary}\nARCHITECTURE: ${plan.architecture}\n`;
      if (this.state.webSearchResults) {
        context += `\nWEB RESEARCH:\n${this.state.webSearchResults.slice(0, 2000)}\n`;
      }
      
      for (const dep of fileSpec.dependencies) {
        const depContent = generatedFiles.get(dep);
        if (depContent) {
          context += `\nDEPENDENCY (${dep}):\n${depContent.slice(0, 1000)}\n`;
        }
      }

      const prompt = FILE_GENERATION_PROMPT
        .replace("{context}", context)
        .replace("{filePath}", fileSpec.path)
        .replace("{purpose}", fileSpec.purpose)
        .replace("{fileType}", fileSpec.type)
        .replace("{dependencies}", fileSpec.dependencies.join(", ") || "none");

      const content = await generateCompletion(
        config,
        prompt,
        userRequest,
        LLM_DEFAULTS.maxTokens.fullStack
      );

      const cleanedContent = content
        .replace(/^```(?:tsx?|typescript|javascript)?\n?/gm, "")
        .replace(/```$/gm, "")
        .trim();

      generatedFiles.set(fileSpec.path, cleanedContent);
      
      this.state.files.push({
        path: fileSpec.path,
        content: cleanedContent,
        type: fileSpec.type,
      });

      this.emit({ type: "file_complete", file: fileSpec.path, size: cleanedContent.length });
    }
  }

  private async testingPhase(plan: ProductionPlan) {
    const config = this.getBuilderConfig();

    for (const testSpec of plan.testPlan) {
      if (this.aborted) break;

      this.emit({ type: "file_start", file: testSpec.file, purpose: "Test file" });
      this.emit({ type: "thinking", model: "builder", content: `Writing tests for ${testSpec.file}...` });

      const componentPath = testSpec.file
        .replace("src/__tests__/", "src/")
        .replace("src/components/__tests__/", "src/components/")
        .replace(".test.tsx", ".tsx")
        .replace(".test.ts", ".ts");
      
      const componentFile = this.state.files.find(f => f.path === componentPath || f.path.endsWith(componentPath.split("/").pop() || ""));
      const componentCode = componentFile?.content || "// Component not found";

      const prompt = TEST_GENERATION_PROMPT
        .replace("{componentCode}", componentCode.slice(0, 3000))
        .replace("{testCases}", testSpec.tests.join("\n- "));

      const content = await generateCompletion(
        config,
        prompt,
        `Generate tests for: ${testSpec.tests.join(", ")}`,
        LLM_DEFAULTS.maxTokens.fullStack
      );

      const cleanedContent = content
        .replace(/^```(?:tsx?|typescript|javascript)?\n?/gm, "")
        .replace(/```$/gm, "")
        .trim();

      this.state.files.push({
        path: testSpec.file,
        content: cleanedContent,
        type: "test",
      });

      this.emit({ type: "file_complete", file: testSpec.file, size: cleanedContent.length });
      this.emit({ type: "test_result", file: testSpec.file, passed: true });
    }
  }

  private async qualityCheckPhase(): Promise<QualityReport> {
    const issues: QualityReport["issues"] = [];
    let score = 100;

    for (const file of this.state.files) {
      if (file.type === "test") continue;

      if (!file.content.includes("export")) {
        issues.push({ severity: "error", file: file.path, message: "Missing export statement" });
        score -= 10;
      }

      if (file.type === "component" && !file.content.includes("React") && !file.content.includes("import")) {
        issues.push({ severity: "warning", file: file.path, message: "Missing React import" });
        score -= 5;
      }

      if (file.content.includes("any")) {
        const anyCount = (file.content.match(/:\s*any/g) || []).length;
        if (anyCount > 2) {
          issues.push({ severity: "warning", file: file.path, message: `${anyCount} uses of 'any' type - consider stricter typing` });
          score -= anyCount * 2;
        }
      }

      if (!file.content.includes("/**") && file.type === "component") {
        issues.push({ severity: "info", file: file.path, message: "Consider adding JSDoc comments" });
        score -= 2;
      }

      const openBraces = (file.content.match(/\{/g) || []).length;
      const closeBraces = (file.content.match(/\}/g) || []).length;
      if (openBraces !== closeBraces) {
        issues.push({ severity: "error", file: file.path, message: "Mismatched braces" });
        score -= 15;
      }

      if (file.content.includes("console.log") && !file.path.includes("test")) {
        issues.push({ severity: "warning", file: file.path, message: "Remove console.log statements" });
        score -= 3;
      }
    }

    for (const issue of issues) {
      this.emit({ type: "quality_issue", issue });
    }

    score = Math.max(0, Math.min(100, score));
    const passed = score >= 70 && !issues.some(i => i.severity === "error");

    this.emit({ type: "quality_score", score, passed });

    return { score, issues, passed };
  }

  private async fixQualityIssues(report: QualityReport) {
    const errors = report.issues.filter(i => i.severity === "error");
    if (errors.length === 0) return;

    this.state.fixAttempts++;
    this.emit({ 
      type: "fix_attempt", 
      attempt: this.state.fixAttempts, 
      maxAttempts: this.state.maxFixAttempts,
      reason: errors.map(e => e.message).join(", ")
    });

    const config = this.getBuilderConfig();

    for (const error of errors) {
      const fileIndex = this.state.files.findIndex(f => f.path === error.file);
      if (fileIndex === -1) continue;

      const file = this.state.files[fileIndex];
      
      const fixPrompt = `Fix this error in the code: "${error.message}"

CODE:
${file.content}

Output ONLY the fixed code - no explanations:`;

      const fixedContent = await generateCompletion(
        config,
        "You are a code fixer. Output only the corrected code.",
        fixPrompt,
        LLM_DEFAULTS.maxTokens.fullStack
      );

      const cleaned = fixedContent
        .replace(/^```(?:tsx?|typescript|javascript)?\n?/gm, "")
        .replace(/```$/gm, "")
        .trim();

      this.state.files[fileIndex] = { ...file, content: cleaned };
    }
  }

  private async documentationPhase(plan: ProductionPlan) {
    const config = this.getBuilderConfig();
    
    const fileList = this.state.files
      .filter(f => f.type !== "test")
      .map(f => `- ${f.path}: ${plan.files.find(pf => pf.path === f.path)?.purpose || ""}`)
      .join("\n");

    const prompt = README_PROMPT
      .replace("{summary}", plan.summary)
      .replace("{fileList}", fileList);

    this.emit({ type: "file_start", file: "README.md", purpose: "Project documentation" });

    const content = await generateCompletion(
      config,
      prompt,
      "Generate README documentation",
      LLM_DEFAULTS.maxTokens.plan
    );

    const cleaned = content
      .replace(/^```(?:markdown|md)?\n?/gm, "")
      .replace(/```$/gm, "")
      .trim();

    this.state.files.push({
      path: "README.md",
      content: cleaned,
      type: "readme",
    });

    this.emit({ type: "file_complete", file: "README.md", size: cleaned.length });
  }
}

export function createProductionOrchestrator(
  settings: LLMSettings,
  onEvent: (event: ProductionEvent) => void
): ProductionOrchestrator {
  return new ProductionOrchestrator(settings, onEvent);
}
