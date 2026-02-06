import { Router } from "express";
import { storage } from "../../storage";
import { createLLMClient, LLM_DEFAULTS, getActiveLLMClient } from "../../llm-client";
import { llmSettingsSchema, dataModelSchema, LLMSettings } from "@shared/schema";
import { generateFullStackProject } from "../../code-generator";
import { validateGeneratedCode } from "../../generators/validator";
import { z } from "zod";
import { SYSTEM_PROMPT, REFINEMENT_SYSTEM } from "../llm";
import { searchWeb, formatSearchResultsForContext } from "../../services/webSearch";
import { shouldUseWebSearch, decideWebSearchAction } from "../../services/webSearchClassifier";
import { createOrchestrator, OrchestratorEvent } from "../../services/orchestrator";
import { createProductionOrchestrator, ProductionEvent } from "../../services/productionOrchestrator";
import { generationRateLimiter } from "../../middleware/rate-limit";
import { validateBody } from "../../lib/validation";
import logger from "../../lib/logger";
import { asyncHandler } from "../../lib/async-handler";

import { registerChatRoutes } from "./chat.routes.js";
import { registerPlanBuildRoutes } from "./plan-build.routes.js";
import { registerTeamRoutes } from "./team.routes.js";

export const MAX_AUTO_RETRY = 2;

export const ERROR_FIX_SYSTEM_PROMPT = `You are a code fixer. The user will provide code that has errors. Your job is to fix the errors and return the corrected code.

CRITICAL RULES:
1. Output ONLY the complete fixed code - no explanations, no markdown code blocks
2. Keep the same structure and functionality as the original
3. Fix all syntax errors, missing imports, and logic issues
4. Make sure the code is complete and runnable

Common issues to fix:
- Missing closing braces, parentheses, or brackets
- Incomplete JSX elements
- Missing React imports or component exports
- Undefined variables or functions
- Incorrect function signatures`;

export interface ValidationOptions {
  requireRenderCall?: boolean;
}

export function validateCodeSyntax(code: string, options: ValidationOptions = {}): { valid: boolean; errors: string[]; suggestions: string[] } {
  const errors: string[] = [];
  const suggestions: string[] = [];
  
  const openBraces = (code.match(/\{/g) || []).length;
  const closeBraces = (code.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    errors.push(`Mismatched braces: ${openBraces} opening, ${closeBraces} closing`);
    suggestions.push("Check for missing closing braces '}'");
  }
  
  const openParens = (code.match(/\(/g) || []).length;
  const closeParens = (code.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    errors.push(`Mismatched parentheses: ${openParens} opening, ${closeParens} closing`);
    suggestions.push("Check for missing closing parentheses ')'");
  }
  
  const openBrackets = (code.match(/\[/g) || []).length;
  const closeBrackets = (code.match(/\]/g) || []).length;
  if (openBrackets !== closeBrackets) {
    errors.push(`Mismatched brackets: ${openBrackets} opening, ${closeBrackets} closing`);
    suggestions.push("Check for missing closing brackets ']'");
  }
  
  if (options.requireRenderCall) {
    if (code.includes('React') || code.includes('useState') || code.includes('useEffect')) {
      if (!code.includes('ReactDOM.render') && !code.includes('createRoot') && !code.includes('ReactDOM.createRoot')) {
        errors.push("Missing React render call");
        suggestions.push("Add ReactDOM.createRoot(document.getElementById('root')).render(<App />)");
      }
    }
  }
  
  const jsxOpenTags = code.match(/<([A-Z][a-zA-Z0-9]*)[^>]*(?<!\/)>/g) || [];
  const jsxSelfClosing = code.match(/<([A-Z][a-zA-Z0-9]*)[^>]*\/>/g) || [];
  const jsxCloseTags = code.match(/<\/([A-Z][a-zA-Z0-9]*)>/g) || [];
  
  if (jsxOpenTags.length - jsxSelfClosing.length > jsxCloseTags.length + 2) {
    errors.push("Possible incomplete JSX - missing closing tags");
    suggestions.push("Check that all JSX components have matching closing tags");
  }
  
  const lastLine = code.trim().split('\n').pop() || '';
  if (lastLine.match(/^\s*\/\//)) {
    errors.push("Code appears truncated (ends with comment)");
    suggestions.push("The code may be incomplete - try regenerating");
  }
  
  if (code.trim().endsWith(',') || code.trim().endsWith('(') || code.trim().endsWith('{')) {
    errors.push("Code appears truncated (ends with incomplete statement)");
    suggestions.push("The code is incomplete - try regenerating");
  }
  
  return {
    valid: errors.length === 0,
    errors,
    suggestions
  };
}

export function isValidCodeResponse(code: string): boolean {
  if (!code || code.length < 50) return false;
  
  const hasFunction = /function\s+\w+|const\s+\w+\s*=|let\s+\w+\s*=|=>\s*{|\(\)\s*{/i.test(code);
  const hasJSX = /<[A-Za-z][A-Za-z0-9]*[\s\/>]/i.test(code);
  const hasImportExport = /import\s+|export\s+(default|const|function)/i.test(code);
  
  const sentences = code.match(/[.!?]\s+[A-Z]/g) || [];
  const looksLikeNaturalLanguage = sentences.length > 5;
  
  return (hasFunction || hasJSX || hasImportExport) && !looksLikeNaturalLanguage;
}

export interface AutoFixResult {
  fixed: boolean;
  code: string;
  message: string;
  retryCount: number;
}

export async function attemptCodeFix(
  code: string,
  errors: string[],
  settings: LLMSettings,
  phase: "planner" | "builder",
  isClientConnected: () => boolean = () => true
): Promise<AutoFixResult> {
  let currentCode = code;
  let currentErrors = errors;
  let retryCount = 0;
  
  while (retryCount < MAX_AUTO_RETRY) {
    if (!isClientConnected()) {
      return { fixed: false, code: currentCode, message: "Client disconnected", retryCount };
    }
    
    retryCount++;
    
    try {
      const modelConfig = getModelForPhase(settings, phase);
      const { client: openai, isCloud } = getActiveLLMClient({
        endpoint: settings.endpoint || "http://localhost:1234/v1",
        model: modelConfig.model,
        temperature: 0.2,
      });
      
      const errorContext = currentErrors.join('\n- ');
      const fixPrompt = `The following code has errors that need to be fixed:

ERRORS:
- ${errorContext}

CODE TO FIX:
${currentCode}

Please provide the complete fixed code with all errors resolved.`;
      
      const response = await openai.chat.completions.create({
        model: isCloud ? (modelConfig.model || "gpt-4o-mini") : (modelConfig.model || "local-model"),
        messages: [
          { role: "system", content: ERROR_FIX_SYSTEM_PROMPT },
          { role: "user", content: fixPrompt }
        ],
        temperature: 0.2,
        max_tokens: LLM_DEFAULTS.maxTokens.quickApp,
      });
      
      const fixedCode = response.choices[0]?.message?.content || "";
      const cleanedFixed = fixedCode
        .replace(/^```(?:jsx?|javascript|typescript|tsx)?\n?/gm, "")
        .replace(/```$/gm, "")
        .trim();
      
      if (!isValidCodeResponse(cleanedFixed)) {
        continue;
      }
      
      const revalidation = validateCodeSyntax(cleanedFixed);
      
      if (revalidation.valid) {
        return { 
          fixed: true, 
          code: cleanedFixed, 
          message: `Code was automatically fixed after ${retryCount} attempt(s)`,
          retryCount 
        };
      }
      
      currentCode = cleanedFixed;
      currentErrors = revalidation.errors;
      
    } catch (error: any) {
      continue;
    }
  }
  
  return { 
    fixed: false, 
    code: currentCode, 
    message: `Could not fix after ${retryCount} attempts`,
    retryCount 
  };
}

export const PLANNING_SYSTEM_PROMPT = `You are an expert software architect and planner. Your job is to analyze user requests and create detailed implementation plans.

OUTPUT FORMAT: You MUST respond with valid JSON only. No markdown, no code blocks, just raw JSON.

{
  "summary": "Brief description of what will be built",
  "assumptions": ["assumption 1", "assumption 2"],
  "architecture": "High-level architecture description",
  "filePlan": [
    {"path": "App.jsx", "purpose": "Main application component", "dependencies": []},
    {"path": "components/Header.jsx", "purpose": "Navigation header", "dependencies": ["App.jsx"]}
  ],
  "steps": [
    {"id": "1", "title": "Step title", "description": "What this step does", "type": "architecture"},
    {"id": "2", "title": "Build components", "description": "Create React components", "type": "component"}
  ],
  "risks": ["potential risk 1", "potential risk 2"]
}

Step types: architecture, component, api, database, styling, testing

Be thorough but concise. Focus on practical implementation details.`;

export const chatRequestSchema = z.object({
  content: z.string().min(1, "Message content is required"),
  settings: llmSettingsSchema,
});

export const LLM_LIMITATION_PATTERNS = [
  /(?:\/\/|\/\*)\s*(?:Note:|NOTE:|Warning:|WARNING:|Important:|IMPORTANT:)\s*(?:I\s+)?(?:can(?:not|'t)|cannot|am\s+(?:not\s+)?able\s+to|don'?t\s+have\s+(?:access|the\s+ability))\s+(?:to\s+)?(?:access|fetch|retrieve|browse|connect\s+to)\s+(?:live|real(?:-time)?|external|actual)\s+(?:data|APIs?|internet|web)[^*\n]{0,100}(?:\*\/|$)/gim,
  /{\/\*\s*(?:Note:|NOTE:)\s*(?:I\s+)?(?:can(?:not|'t)|don'?t\s+have)\s+[^*]{0,100}\s*\*\/}/gim,
];

export function extractLLMLimitations(code: string): { cleanedCode: string; limitations: string[] } {
  const limitations: string[] = [];
  let cleanedCode = code;

  for (const pattern of LLM_LIMITATION_PATTERNS) {
    const matches = Array.from(code.matchAll(pattern));
    for (const match of matches) {
      let limitation = match[0]
        .replace(/^(?:\/\/|\/\*|{\/\*)\s*/, "")
        .replace(/(?:\*\/|}\s*)$/, "")
        .replace(/^(?:Note:|NOTE:|Warning:|WARNING:|Important:|IMPORTANT:)\s*/i, "")
        .trim();
      
      if (limitation.length > 10 && limitation.length < 500) {
        if (!limitations.some(l => l.toLowerCase() === limitation.toLowerCase())) {
          limitations.push(limitation);
        }
      }
    }
    cleanedCode = cleanedCode.replace(pattern, "");
  }

  cleanedCode = cleanedCode.replace(/\n{3,}/g, "\n\n").trim();

  return { cleanedCode, limitations };
}

export function getModelForPhase(settings: z.infer<typeof llmSettingsSchema>, phase: "planner" | "builder") {
  if (settings.useDualModels) {
    if (phase === "planner") {
      return {
        model: settings.plannerModel || settings.model || "",
        temperature: settings.plannerTemperature ?? LLM_DEFAULTS.temperature.planner,
      };
    } else {
      return {
        model: settings.builderModel || settings.model || "",
        temperature: settings.builderTemperature ?? LLM_DEFAULTS.temperature.builder,
      };
    }
  }
  return {
    model: settings.model || "",
    temperature: settings.temperature ?? 0.7,
  };
}

export {
  storage,
  LLM_DEFAULTS,
  getActiveLLMClient,
  llmSettingsSchema,
  dataModelSchema,
  generateFullStackProject,
  validateGeneratedCode,
  z,
  SYSTEM_PROMPT,
  REFINEMENT_SYSTEM,
  searchWeb,
  formatSearchResultsForContext,
  shouldUseWebSearch,
  decideWebSearchAction,
  createOrchestrator,
  createProductionOrchestrator,
  generationRateLimiter,
  validateBody,
  logger,
  asyncHandler,
};

export type { OrchestratorEvent, ProductionEvent };

const router = Router();

registerChatRoutes(router);
registerPlanBuildRoutes(router);
registerTeamRoutes(router);

router.use("/:id/:subpath", asyncHandler(async (req, res, next) => {
  if (res.headersSent) {
    return next();
  }
  
  const projectId = String(req.params.id);
  const project = await storage.getProject(projectId);
  
  if (!project) {
    return res.status(404).json({ error: "Project not found", projectId });
  }
  
  return res.status(404).json({ 
    error: "Unknown endpoint", 
    message: `No handler for ${req.method} ${req.path}`,
    projectId 
  });
}));

export default router;
