import { Router } from "express";
import { storage } from "../storage";
import { createLLMClient, LLM_DEFAULTS } from "../llm-client";
import { llmSettingsSchema, dataModelSchema, LLMSettings } from "@shared/schema";
import { generateFullStackProject } from "../code-generator";
import { validateGeneratedCode } from "../generators/validator";
import { z } from "zod";
import { SYSTEM_PROMPT, REFINEMENT_SYSTEM } from "./llm";
import { searchWeb, formatSearchResultsForContext } from "../services/webSearch";
import { shouldUseWebSearch, decideWebSearchAction } from "../services/webSearchClassifier";
import { createOrchestrator, OrchestratorEvent } from "../services/orchestrator";
import { createProductionOrchestrator, ProductionEvent } from "../services/productionOrchestrator";
import { generationRateLimiter } from "../middleware/rate-limit";
import { validateBody } from "../lib/validation";
import logger from "../lib/logger";

// Maximum auto-retry attempts for code generation
const MAX_AUTO_RETRY = 2;

// System prompt for fixing code errors
const ERROR_FIX_SYSTEM_PROMPT = `You are a code fixer. The user will provide code that has errors. Your job is to fix the errors and return the corrected code.

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

// Options for code validation
interface ValidationOptions {
  requireRenderCall?: boolean; // Only check for render when expecting full app
}

// Validate code and return detailed errors
function validateCodeSyntax(code: string, options: ValidationOptions = {}): { valid: boolean; errors: string[]; suggestions: string[] } {
  const errors: string[] = [];
  const suggestions: string[] = [];
  
  // Check for basic syntax issues
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
  
  // Only check for React render call if explicitly required (full app output)
  // Component-only output is valid without a render call
  if (options.requireRenderCall) {
    if (code.includes('React') || code.includes('useState') || code.includes('useEffect')) {
      if (!code.includes('ReactDOM.render') && !code.includes('createRoot') && !code.includes('ReactDOM.createRoot')) {
        errors.push("Missing React render call");
        suggestions.push("Add ReactDOM.createRoot(document.getElementById('root')).render(<App />)");
      }
    }
  }
  
  // Check for incomplete JSX
  const jsxOpenTags = code.match(/<([A-Z][a-zA-Z0-9]*)[^>]*(?<!\/)>/g) || [];
  const jsxSelfClosing = code.match(/<([A-Z][a-zA-Z0-9]*)[^>]*\/>/g) || [];
  const jsxCloseTags = code.match(/<\/([A-Z][a-zA-Z0-9]*)>/g) || [];
  
  // Simple heuristic: more open than close might indicate incomplete JSX
  if (jsxOpenTags.length - jsxSelfClosing.length > jsxCloseTags.length + 2) {
    errors.push("Possible incomplete JSX - missing closing tags");
    suggestions.push("Check that all JSX components have matching closing tags");
  }
  
  // Check for truncated code
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

// Check if LLM response looks like valid code (not explanations)
function isValidCodeResponse(code: string): boolean {
  if (!code || code.length < 50) return false;
  
  // Must have at least some code-like structure
  const hasFunction = /function\s+\w+|const\s+\w+\s*=|let\s+\w+\s*=|=>\s*{|\(\)\s*{/i.test(code);
  const hasJSX = /<[A-Za-z][A-Za-z0-9]*[\s\/>]/i.test(code);
  const hasImportExport = /import\s+|export\s+(default|const|function)/i.test(code);
  
  // Reject if it's mostly natural language (too many sentences)
  const sentences = code.match(/[.!?]\s+[A-Z]/g) || [];
  const looksLikeNaturalLanguage = sentences.length > 5;
  
  return (hasFunction || hasJSX || hasImportExport) && !looksLikeNaturalLanguage;
}

// Result of auto-fix attempt with retry count
interface AutoFixResult {
  fixed: boolean;
  code: string;
  message: string;
  retryCount: number;
}

// Attempt to fix code using LLM with retry loop
async function attemptCodeFix(
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
    // Check if client disconnected before each attempt
    if (!isClientConnected()) {
      return { fixed: false, code: currentCode, message: "Client disconnected", retryCount };
    }
    
    retryCount++;
    
    try {
      const modelConfig = getModelForPhase(settings, phase);
      const openai = createLLMClient({
        endpoint: settings.endpoint || "http://localhost:1234/v1",
        model: modelConfig.model,
        temperature: 0.2, // Lower temperature for fixing
      });
      
      const errorContext = currentErrors.join('\n- ');
      const fixPrompt = `The following code has errors that need to be fixed:

ERRORS:
- ${errorContext}

CODE TO FIX:
${currentCode}

Please provide the complete fixed code with all errors resolved.`;
      
      const response = await openai.chat.completions.create({
        model: modelConfig.model || "local-model",
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
      
      // Verify the response looks like code, not explanations
      if (!isValidCodeResponse(cleanedFixed)) {
        continue; // Try again
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
      
      // Update for next iteration
      currentCode = cleanedFixed;
      currentErrors = revalidation.errors;
      
    } catch (error: any) {
      // Continue retrying on error
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

const router = Router();

const PLANNING_SYSTEM_PROMPT = `You are an expert software architect and planner. Your job is to analyze user requests and create detailed implementation plans.

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

const chatRequestSchema = z.object({
  content: z.string().min(1, "Message content is required"),
  settings: llmSettingsSchema,
});

// Common LLM limitation patterns to detect and extract from generated code
// These are more targeted to avoid false positives on legitimate comments
const LLM_LIMITATION_PATTERNS = [
  // Direct inability statements - must start with "Note:" or similar prefix
  /(?:\/\/|\/\*)\s*(?:Note:|NOTE:|Warning:|WARNING:|Important:|IMPORTANT:)\s*(?:I\s+)?(?:can(?:not|'t)|cannot|am\s+(?:not\s+)?able\s+to|don'?t\s+have\s+(?:access|the\s+ability))\s+(?:to\s+)?(?:access|fetch|retrieve|browse|connect\s+to)\s+(?:live|real(?:-time)?|external|actual)\s+(?:data|APIs?|internet|web)[^*\n]{0,100}(?:\*\/|$)/gim,
  // JSX limitation comments
  /{\/\*\s*(?:Note:|NOTE:)\s*(?:I\s+)?(?:can(?:not|'t)|don'?t\s+have)\s+[^*]{0,100}\s*\*\/}/gim,
];

// Extract and clean LLM limitation messages from generated code
function extractLLMLimitations(code: string): { cleanedCode: string; limitations: string[] } {
  const limitations: string[] = [];
  let cleanedCode = code;

  for (const pattern of LLM_LIMITATION_PATTERNS) {
    const matches = Array.from(code.matchAll(pattern));
    for (const match of matches) {
      let limitation = match[0]
        // Remove comment markers
        .replace(/^(?:\/\/|\/\*|{\/\*)\s*/, "")
        .replace(/(?:\*\/|}\s*)$/, "")
        // Clean up common prefixes
        .replace(/^(?:Note:|NOTE:|Warning:|WARNING:|Important:|IMPORTANT:)\s*/i, "")
        .trim();
      
      if (limitation.length > 10 && limitation.length < 500) {
        // Avoid duplicates
        if (!limitations.some(l => l.toLowerCase() === limitation.toLowerCase())) {
          limitations.push(limitation);
        }
      }
    }
    // Remove the limitation comments from the code
    cleanedCode = cleanedCode.replace(pattern, "");
  }

  // Clean up any resulting empty lines from removal
  cleanedCode = cleanedCode.replace(/\n{3,}/g, "\n\n").trim();

  return { cleanedCode, limitations };
}

// Helper to get model settings based on phase (planning vs building)
function getModelForPhase(settings: z.infer<typeof llmSettingsSchema>, phase: "planner" | "builder") {
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

router.post("/:id/chat", generationRateLimiter, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid chat request", details: parsed.error.errors });
    }
    const { content, settings } = parsed.data;
    const projectId = String(req.params.id);
    
    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    await storage.updateProject(projectId, {
      generationMetrics: {
        startTime,
        promptLength: content.length,
        status: "streaming",
        retryCount: 0,
      },
    });

    await storage.addMessage(projectId, {
      role: "user",
      content,
    });

    const updatedProject = await storage.getProject(projectId);
    const conversationHistory = updatedProject?.messages.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })) || [];

    // Use builder model when dual models are enabled
    const builderConfig = getModelForPhase(settings, "builder");
    
    const openai = createLLMClient({
      endpoint: settings.endpoint || "http://localhost:1234/v1",
      model: builderConfig.model,
      temperature: builderConfig.temperature,
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    let isClientConnected = true;
    req.on("close", () => {
      isClientConnected = false;
    });

    // Web Search Integration
    let webSearchContext = "";
    let webSearchUsed = false;
    let webSearchAction: "search" | "skip" | "ask_permission" = "skip";
    
    try {
      // Check if web search might be helpful for this query
      const classificationResult = await shouldUseWebSearch(content, settings);
      console.log(`[webSearch] Classification: ${classificationResult.needsWeb ? "USE_WEB" : "NO_WEB"}`);
      
      const decision = decideWebSearchAction(
        classificationResult.needsWeb,
        settings.webSearchEnabled ?? false,
        !!settings.serperApiKey
      );
      webSearchAction = decision.action;
      console.log(`[webSearch] Decision: ${decision.action} - ${decision.reason}`);
      
      if (decision.action === "search" && settings.serperApiKey) {
        res.write(`data: ${JSON.stringify({ type: "status", message: "Searching the web..." })}\n\n`);
        
        const searchResult = await searchWeb(content, settings.serperApiKey);
        
        if (searchResult.success && searchResult.results.length > 0) {
          webSearchContext = formatSearchResultsForContext(searchResult.results);
          webSearchUsed = true;
          console.log(`[webSearch] Found ${searchResult.results.length} results`);
          res.write(`data: ${JSON.stringify({ type: "status", message: `Found ${searchResult.results.length} web results` })}\n\n`);
        } else if (!searchResult.success) {
          console.log(`[webSearch] Failed: ${searchResult.error}`);
          res.write(`data: ${JSON.stringify({ type: "status", message: "Web search unavailable, using local knowledge" })}\n\n`);
        }
      } else if (decision.action === "ask_permission") {
        // Send a special event asking for permission
        res.write(`data: ${JSON.stringify({ 
          type: "web_search_permission", 
          message: "This request may benefit from web search. Would you like to enable it?",
          needsApiKey: !settings.serperApiKey
        })}\n\n`);
      }
    } catch (classifyError: any) {
      console.error(`[webSearch] Classification error: ${classifyError.message}`);
      // Continue without web search
    }

    // Build the messages with optional web search context
    const systemMessage = webSearchUsed && webSearchContext
      ? `${SYSTEM_PROMPT}\n\n${webSearchContext}`
      : SYSTEM_PROMPT;

    try {
      const stream = await openai.chat.completions.create({
        model: builderConfig.model || "local-model",
        messages: [
          { role: "system", content: systemMessage },
          ...conversationHistory,
        ],
        temperature: builderConfig.temperature,
        max_tokens: LLM_DEFAULTS.maxTokens.quickApp,
        stream: true,
      });

      const chunks: string[] = [];

      for await (const chunk of stream) {
        if (!isClientConnected) break;
        
        const delta = chunk.choices[0]?.delta?.content || "";
        if (delta) {
          chunks.push(delta);
          res.write(`data: ${JSON.stringify({ type: "chunk", content: delta })}\n\n`);
        }
      }
      
      const fullContent = chunks.join("");

      let codeFromMarkdown = fullContent
        .replace(/^```(?:jsx?|javascript|typescript|tsx)?\n?/gm, "")
        .replace(/```$/gm, "")
        .trim();

      // Extract LLM limitations and clean the code
      let { cleanedCode, limitations } = extractLLMLimitations(codeFromMarkdown);

      const endTime = Date.now();

      // Only show success message if we actually generated code
      if (cleanedCode && cleanedCode.length > 50) {
        // Validate the generated code
        const validation = validateCodeSyntax(cleanedCode);
        let retryCount = 0;
        let wasAutoFixed = false;
        
        // Attempt auto-fix if validation fails and client is still connected
        if (!validation.valid && validation.errors.length > 0 && isClientConnected) {
          res.write(`data: ${JSON.stringify({ type: "status", message: "Validating code..." })}\n\n`);
          
          // Try to fix the code with retry loop
          res.write(`data: ${JSON.stringify({ type: "status", message: "Found issues, attempting auto-fix..." })}\n\n`);
          
          const fixResult = await attemptCodeFix(
            cleanedCode, 
            validation.errors, 
            settings, 
            "builder",
            () => isClientConnected
          );
          retryCount = fixResult.retryCount;
          
          if (fixResult.fixed) {
            cleanedCode = fixResult.code;
            wasAutoFixed = true;
            res.write(`data: ${JSON.stringify({ type: "status", message: `Code fixed after ${retryCount} attempt(s)!` })}\n\n`);
          } else {
            // Send validation errors to client
            res.write(`data: ${JSON.stringify({ 
              type: "validation_errors", 
              errors: validation.errors,
              suggestions: validation.suggestions 
            })}\n\n`);
          }
        }
        
        // Check final validation state
        const finalValidation = validateCodeSyntax(cleanedCode);
        const codeIsValid = finalValidation.valid || wasAutoFixed;
        
        // Only persist valid code to avoid storing broken output
        if (codeIsValid || validation.valid) {
          // Build response message with any limitations and fix status surfaced
          let responseMessage = "I've generated the app for you. Check the preview panel to see it in action!";
          
          if (wasAutoFixed) {
            responseMessage = "I generated the app and automatically fixed some issues. Check the preview!";
          }
          
          if (limitations.length > 0) {
            responseMessage += "\n\n**Note:** " + limitations.join(" ");
          }
          
          if (!finalValidation.valid && !wasAutoFixed) {
            responseMessage += "\n\n**Warning:** The code may have some issues. " + finalValidation.suggestions.join(" ");
          }

          await storage.addMessage(projectId, {
            role: "assistant",
            content: responseMessage,
          });

          await storage.updateProject(projectId, {
            generatedCode: cleanedCode,
            generationMetrics: {
              startTime,
              endTime: Date.now(),
              durationMs: Date.now() - startTime,
              promptLength: content.length,
              responseLength: fullContent.length,
              status: wasAutoFixed ? "fixed" : "success",
              retryCount,
            },
          });
        } else {
          // Validation failed - don't persist broken code
          await storage.addMessage(projectId, {
            role: "assistant",
            content: `I couldn't generate a valid app - the code had issues that couldn't be fixed automatically. Please try again with a simpler request.\n\n**Issues found:** ${validation.errors.join(", ")}`,
          });

          await storage.updateProject(projectId, {
            generationMetrics: {
              startTime,
              endTime: Date.now(),
              durationMs: Date.now() - startTime,
              promptLength: content.length,
              responseLength: fullContent.length,
              status: "validation_failed",
              errorMessage: validation.errors.join(", "),
              retryCount,
            },
          });
        }
      } else {
        await storage.addMessage(projectId, {
          role: "assistant",
          content: "I couldn't generate the app. The response was empty or incomplete. Please try again or check that LM Studio is running properly.",
        });

        await storage.updateProject(projectId, {
          generationMetrics: {
            startTime,
            endTime,
            durationMs: endTime - startTime,
            promptLength: content.length,
            responseLength: fullContent.length,
            status: "error",
            errorMessage: "Empty or incomplete response",
            retryCount: 0,
          },
        });
      }

      const finalProject = await storage.getProject(projectId);
      res.write(`data: ${JSON.stringify({ type: "done", project: finalProject })}\n\n`);
      res.end();
    } catch (llmError: any) {
      console.error("LLM Error:", llmError);
      
      const errorEndTime = Date.now();
      
      await storage.addMessage(projectId, {
        role: "assistant",
        content: `I couldn't connect to your local LLM. Make sure LM Studio is running and the local server is started. Error: ${llmError.message}`,
      });
      
      await storage.updateProject(projectId, {
        generationMetrics: {
          startTime,
          endTime: errorEndTime,
          durationMs: errorEndTime - startTime,
          promptLength: content.length,
          status: "error",
          errorMessage: llmError.message,
          retryCount: 0,
        },
      });
      
      const finalProject = await storage.getProject(projectId);
      res.write(`data: ${JSON.stringify({ type: "error", error: llmError.message, project: finalProject })}\n\n`);
      res.end();
    }
  } catch (error: any) {
    console.error("Chat error:", error);
    res.write(`data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`);
    res.end();
  }
});

const refineRequestSchema = z.object({
  refinement: z.string().min(1),
  settings: llmSettingsSchema,
});

router.post("/:id/refine", generationRateLimiter, async (req, res) => {
  try {
    const parsed = refineRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }

    const { refinement, settings } = parsed.data;
    const projectId = String(req.params.id);

    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (!project.generatedCode) {
      return res.status(400).json({ error: "No generated code to refine" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Use dual model support for refinement (builder model)
    const builderConfig = getModelForPhase(settings, "builder");

    const openai = createLLMClient({
      endpoint: settings.endpoint || "http://localhost:1234/v1",
      model: builderConfig.model,
      temperature: builderConfig.temperature,
    });

    let isClientConnected = true;
    req.on("close", () => {
      isClientConnected = false;
    });

    try {
      const stream = await openai.chat.completions.create({
        model: builderConfig.model || "local-model",
        messages: [
          { role: "system", content: REFINEMENT_SYSTEM },
          { role: "user", content: `EXISTING CODE:\n\`\`\`jsx\n${project.generatedCode}\n\`\`\`\n\nMODIFICATION REQUEST: ${refinement}` },
        ],
        temperature: builderConfig.temperature,
        max_tokens: LLM_DEFAULTS.maxTokens.quickApp,
        stream: true,
      });

      const chunks: string[] = [];

      for await (const chunk of stream) {
        if (!isClientConnected) break;
        
        const delta = chunk.choices[0]?.delta?.content || "";
        if (delta) {
          chunks.push(delta);
          res.write(`data: ${JSON.stringify({ type: "chunk", content: delta })}\n\n`);
        }
      }
      
      const fullContent = chunks.join("");

      let codeFromMarkdown = fullContent
        .replace(/^```(?:jsx?|javascript|typescript|tsx)?\n?/gm, "")
        .replace(/```$/gm, "")
        .trim();

      // Extract LLM limitations and clean the code
      let { cleanedCode, limitations } = extractLLMLimitations(codeFromMarkdown);

      await storage.addMessage(projectId, {
        role: "user",
        content: `Refine: ${refinement}`,
      });

      // Only show success if we actually got refined code
      if (cleanedCode && cleanedCode.length > 50) {
        // Validate the refined code
        const validation = validateCodeSyntax(cleanedCode);
        let wasAutoFixed = false;
        let retryCount = 0;
        
        // Attempt auto-fix if validation fails and client is still connected
        if (!validation.valid && validation.errors.length > 0 && isClientConnected) {
          res.write(`data: ${JSON.stringify({ type: "status", message: "Validating refined code..." })}\n\n`);
          
          const fixResult = await attemptCodeFix(
            cleanedCode, 
            validation.errors, 
            settings, 
            "builder",
            () => isClientConnected
          );
          retryCount = fixResult.retryCount;
          
          if (fixResult.fixed) {
            cleanedCode = fixResult.code;
            wasAutoFixed = true;
            res.write(`data: ${JSON.stringify({ type: "status", message: `Code fixed after ${retryCount} attempt(s)!` })}\n\n`);
          }
        }
        
        // Check final validation state
        const finalValidation = validateCodeSyntax(cleanedCode);
        const codeIsValid = finalValidation.valid || wasAutoFixed;
        
        // Only persist code if it's valid - don't overwrite good code with broken code
        if (codeIsValid || validation.valid) {
          // Build response message with any limitations surfaced
          let responseMessage = wasAutoFixed 
            ? `I've updated the app and fixed ${retryCount} issue(s). Check the preview!`
            : "I've updated the app based on your feedback. Check the preview!";
          
          if (limitations.length > 0) {
            responseMessage += "\n\n**Note:** " + limitations.join(" ");
          }
          
          if (!finalValidation.valid && !wasAutoFixed) {
            responseMessage += "\n\n**Warning:** " + finalValidation.suggestions.join(" ");
          }

          await storage.addMessage(projectId, {
            role: "assistant",
            content: responseMessage,
          });

          await storage.updateProject(projectId, {
            generatedCode: cleanedCode,
          });
        } else {
          // Validation failed after retries - keep original code
          await storage.addMessage(projectId, {
            role: "assistant",
            content: `I couldn't safely update the app - the generated code had issues that couldn't be fixed automatically. Your original code is preserved.\n\n**Issues found:** ${validation.errors.join(", ")}`,
          });
        }
      } else {
        await storage.addMessage(projectId, {
          role: "assistant",
          content: "I couldn't refine the app. The response was empty or incomplete. Please try again.",
        });
      }

      const finalProject = await storage.getProject(projectId);
      res.write(`data: ${JSON.stringify({ type: "done", project: finalProject })}\n\n`);
      res.end();
    } catch (llmError: any) {
      console.error("Refinement LLM Error:", llmError);
      await storage.addMessage(projectId, {
        role: "assistant",
        content: `I couldn't refine the app. Error: ${llmError.message}`,
      });
      res.write(`data: ${JSON.stringify({ type: "error", error: llmError.message })}\n\n`);
      res.end();
    }
  } catch (error: any) {
    console.error("Refinement error:", error);
    res.write(`data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`);
    res.end();
  }
});

const generateRequestSchema = z.object({
  projectName: z.string().min(1),
  dataModel: dataModelSchema,
  prompt: z.string().optional(),
});

router.post("/:id/generate-fullstack", async (req, res) => {
  try {
    const parsed = generateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }

    const { projectName, dataModel, prompt } = parsed.data;
    const projectId = String(req.params.id);

    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const generatedFiles = generateFullStackProject(projectName, dataModel);
    const validation = validateGeneratedCode(generatedFiles);

    await storage.updateProject(projectId, {
      generatedFiles,
      dataModel,
      validation,
      lastPrompt: prompt || projectName,
    });

    const validationNote = validation.valid 
      ? "" 
      : ` Note: ${validation.warnings.length} warnings found during validation.`;
    await storage.addMessage(projectId, {
      role: "assistant",
      content: `I've generated a complete full-stack project with ${dataModel.entities.length} data entities.${validationNote} You can download the project files and preview the generated code.`,
    });

    const finalProject = await storage.getProject(projectId);
    res.json(finalProject);
  } catch (error: any) {
    console.error("Generate fullstack error:", error);
    res.status(500).json({ error: "Failed to generate project", details: error.message });
  }
});

router.post("/:id/plan", async (req, res) => {
  try {
    const { id } = req.params;
    // Support both 'settings' (new) and 'plannerSettings' (legacy) for backward compatibility
    const { prompt, settings: baseSettings, plannerSettings } = req.body;

    const project = await storage.getProject(id);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Parse settings with defaults - prefer 'settings' over legacy 'plannerSettings'
    const rawSettings = baseSettings || plannerSettings;
    const parsedSettings = llmSettingsSchema.safeParse(rawSettings);
    const settings = parsedSettings.success ? parsedSettings.data : {
      endpoint: rawSettings?.endpoint || "http://localhost:1234/v1",
      model: rawSettings?.model || "",
      temperature: rawSettings?.temperature ?? LLM_DEFAULTS.temperature.planner,
      useDualModels: true,
      plannerModel: "",
      plannerTemperature: LLM_DEFAULTS.temperature.planner,
      builderModel: "",
      builderTemperature: LLM_DEFAULTS.temperature.builder,
      webSearchEnabled: false,
      serperApiKey: "",
      productionMode: true,
    };

    // Use planner model when dual models are enabled
    const plannerConfig = getModelForPhase(settings, "planner");

    const openai = createLLMClient({
      endpoint: settings.endpoint,
      model: plannerConfig.model,
      temperature: plannerConfig.temperature,
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let isClientConnected = true;
    req.on("close", () => {
      isClientConnected = false;
    });

    try {
      const stream = await openai.chat.completions.create({
        model: plannerConfig.model || "local-model",
        messages: [
          { role: "system", content: PLANNING_SYSTEM_PROMPT },
          { role: "user", content: `Create an implementation plan for: ${prompt}` },
        ],
        temperature: plannerConfig.temperature,
        max_tokens: LLM_DEFAULTS.maxTokens.plan,
        stream: true,
      });

      const planChunks: string[] = [];

      for await (const chunk of stream) {
        if (!isClientConnected) break;
        
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          planChunks.push(content);
          res.write(`data: ${JSON.stringify({ type: "chunk", content })}\n\n`);
        }
      }
      
      const planContent = planChunks.join("");

      let plan;
      try {
        const cleaned = planContent
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();
        plan = JSON.parse(cleaned);
      } catch (parseError) {
        plan = {
          summary: prompt,
          steps: [
            { id: "1", title: "Build application", description: prompt, type: "component" as const, status: "pending" as const }
          ],
        };
      }

      const fullPlan = {
        id: crypto.randomUUID(),
        summary: plan.summary || prompt,
        assumptions: plan.assumptions || [],
        architecture: plan.architecture || "",
        filePlan: plan.filePlan || [],
        dataModel: plan.dataModel,
        steps: (plan.steps || []).map((s: any, i: number) => ({
          id: s.id || String(i + 1),
          title: s.title || `Step ${i + 1}`,
          description: s.description || "",
          type: s.type || "component",
          status: "pending" as const,
        })),
        risks: plan.risks || [],
        status: "draft" as const,
        createdAt: Date.now(),
      };

      await storage.updateProject(id, { plan: fullPlan });

      res.write(`data: ${JSON.stringify({ type: "plan", plan: fullPlan })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();

    } catch (error: any) {
      res.write(`data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`);
      res.end();
    }
  } catch (error: any) {
    console.error("Plan error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/:id/plan/approve", async (req, res) => {
  try {
    const { id } = req.params;
    const project = await storage.getProject(id);
    
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (!project.plan) {
      return res.status(400).json({ error: "No plan to approve" });
    }

    const approvedPlan = {
      ...project.plan,
      status: "approved" as const,
      approvedAt: Date.now(),
    };

    await storage.updateProject(id, { plan: approvedPlan });
    res.json({ success: true, plan: approvedPlan });
  } catch (error: any) {
    console.error("Approve plan error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/:id/build", async (req, res) => {
  try {
    const { id } = req.params;
    const { builderSettings } = req.body;

    const project = await storage.getProject(id);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (!project.plan) {
      return res.status(400).json({ error: "No plan found. Create a plan first." });
    }

    if (project.plan.status !== "approved") {
      return res.status(400).json({ error: "Plan must be approved before building." });
    }

    const settings = builderSettings || {
      endpoint: "http://localhost:1234/v1",
      model: "",
      temperature: LLM_DEFAULTS.temperature.builder,
    };

    const openai = createLLMClient({
      endpoint: settings.endpoint,
      model: settings.model,
      temperature: settings.temperature,
    });

    await storage.updateProject(id, { 
      plan: { ...project.plan, status: "building" as const }
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let isClientConnected = true;
    req.on("close", () => {
      isClientConnected = false;
    });

    const buildPrompt = `Based on this implementation plan, generate a complete, working React application:

PLAN:
${JSON.stringify(project.plan, null, 2)}

ORIGINAL REQUEST: ${project.lastPrompt || project.plan.summary}

Generate complete, working code that implements this plan. Follow the file structure suggested in the plan.`;

    try {
      const stream = await openai.chat.completions.create({
        model: settings.model || "local-model",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildPrompt },
        ],
        temperature: settings.temperature || LLM_DEFAULTS.temperature.builder,
        max_tokens: LLM_DEFAULTS.maxTokens.fullStack,
        stream: true,
      });

      const codeChunks: string[] = [];

      for await (const chunk of stream) {
        if (!isClientConnected) break;
        
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          codeChunks.push(content);
          res.write(`data: ${JSON.stringify({ type: "chunk", content })}\n\n`);
        }
      }
      
      const generatedCode = codeChunks.join("");

      const codeFromMarkdown = generatedCode
        .replace(/^```(?:jsx?|javascript|typescript|tsx)?\n?/gm, "")
        .replace(/```$/gm, "")
        .trim();

      // Extract LLM limitations and clean the code
      const { cleanedCode, limitations } = extractLLMLimitations(codeFromMarkdown);

      const validation = validateGeneratedCode([{ path: "App.jsx", content: cleanedCode }]);

      await storage.updateProject(id, {
        generatedCode: cleanedCode,
        validation,
        plan: { ...project.plan, status: "completed" as const },
      });

      // Add chat message with any limitations surfaced
      let buildMessage = "Build completed! Your app is ready in the preview.";
      if (limitations.length > 0) {
        buildMessage += "\n\n**Note:** " + limitations.join(" ");
      }
      await storage.addMessage(id, {
        role: "assistant",
        content: buildMessage,
      });

      res.write(`data: ${JSON.stringify({ type: "code", code: cleanedCode })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "validation", validation })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();

    } catch (error: any) {
      await storage.updateProject(id, { 
        plan: { ...project.plan, status: "failed" as const }
      });
      res.write(`data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`);
      res.end();
    }
  } catch (error: any) {
    console.error("Build error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/:id/plan", async (req, res) => {
  try {
    const { id } = req.params;
    const project = await storage.getProject(id);
    
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json({ plan: project.plan || null });
  } catch (error: any) {
    console.error("Get plan error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.delete("/:id/plan", async (req, res) => {
  try {
    const { id } = req.params;
    const project = await storage.getProject(id);
    
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    await storage.updateProject(id, { plan: undefined });
    res.json({ success: true });
  } catch (error: any) {
    console.error("Delete plan error:", error);
    res.status(500).json({ error: error.message });
  }
});

// AI Dream Team - Autonomous dual-model orchestration
const dreamTeamRequestSchema = z.object({
  content: z.string().min(1, "Request is required"),
  settings: llmSettingsSchema,
});

router.post("/:id/dream-team", generationRateLimiter, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const parsed = dreamTeamRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    
    const { content, settings } = parsed.data;
    const projectId = String(req.params.id);
    
    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    await storage.addMessage(projectId, {
      role: "user",
      content,
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    let isClientConnected = true;
    req.on("close", () => {
      isClientConnected = false;
      orchestrator?.abort();
    });

    const orchestrator = createOrchestrator(settings, (event: OrchestratorEvent) => {
      if (!isClientConnected) return;
      
      switch (event.type) {
        case "phase_change":
          res.write(`data: ${JSON.stringify({ type: "phase", phase: event.phase, message: event.message })}\n\n`);
          break;
        case "thinking":
          res.write(`data: ${JSON.stringify({ type: "thinking", model: event.model, content: event.content })}\n\n`);
          break;
        case "code_chunk":
          res.write(`data: ${JSON.stringify({ type: "chunk", content: event.content })}\n\n`);
          break;
        case "task_start":
          res.write(`data: ${JSON.stringify({ type: "task_start", task: event.task })}\n\n`);
          break;
        case "task_complete":
          res.write(`data: ${JSON.stringify({ type: "task_complete", task: event.task })}\n\n`);
          break;
        case "tasks_updated":
          res.write(`data: ${JSON.stringify({ type: "tasks_updated", tasks: event.tasks, completedCount: event.completedCount, totalCount: event.totalCount })}\n\n`);
          break;
        case "search_result":
          res.write(`data: ${JSON.stringify({ type: "search", query: event.query, count: event.resultCount })}\n\n`);
          break;
        case "validation":
          res.write(`data: ${JSON.stringify({ type: "validation", valid: event.valid, errors: event.errors })}\n\n`);
          break;
        case "fix_attempt":
          res.write(`data: ${JSON.stringify({ type: "fix_attempt", attempt: event.attempt, max: event.maxAttempts })}\n\n`);
          break;
        case "status":
          res.write(`data: ${JSON.stringify({ type: "status", message: event.message })}\n\n`);
          break;
        case "complete":
          break;
        case "error":
          res.write(`data: ${JSON.stringify({ type: "error", message: event.message })}\n\n`);
          break;
      }
    }, projectId);

    const result = await orchestrator.run(content, project.generatedCode || undefined);

    if (result.success && result.code) {
      await storage.updateProject(projectId, {
        generatedCode: result.code,
        generationMetrics: {
          startTime,
          endTime: Date.now(),
          durationMs: Date.now() - startTime,
          promptLength: content.length,
          responseLength: result.code.length,
          status: "success",
          retryCount: 0,
        },
      });

      await storage.addMessage(projectId, {
        role: "assistant",
        content: `**AI Dream Team completed!**\n\n${result.summary}\n\nCheck the preview to see your app in action!`,
      });
    } else {
      await storage.addMessage(projectId, {
        role: "assistant",
        content: `Dream Team encountered an issue: ${result.summary}. Please try again or simplify your request.`,
      });
    }

    const finalProject = await storage.getProject(projectId);
    res.write(`data: ${JSON.stringify({ type: "done", project: finalProject, success: result.success })}\n\n`);
    res.end();
    
  } catch (error: any) {
    console.error("Dream Team error:", error);
    res.write(`data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`);
    res.end();
  }
});

// Production Mode - Multi-file TypeScript projects with tests
const productionRequestSchema = z.object({
  content: z.string().min(1, "Request is required"),
  settings: llmSettingsSchema,
});

router.post("/:id/production", generationRateLimiter, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const parsed = productionRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }
    
    const { content, settings } = parsed.data;
    const projectId = String(req.params.id);
    
    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    await storage.addMessage(projectId, {
      role: "user",
      content: `[Production Mode] ${content}`,
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    let isClientConnected = true;
    let orchestrator: ReturnType<typeof createProductionOrchestrator> | null = null;
    
    req.on("close", () => {
      isClientConnected = false;
      orchestrator?.abort();
    });

    orchestrator = createProductionOrchestrator(settings, (event: ProductionEvent) => {
      if (!isClientConnected) return;
      
      switch (event.type) {
        case "phase_change":
          res.write(`data: ${JSON.stringify({ type: "phase", phase: event.phase, message: event.message })}\n\n`);
          break;
        case "thinking":
          res.write(`data: ${JSON.stringify({ type: "thinking", model: event.model, content: event.content })}\n\n`);
          break;
        case "file_start":
          res.write(`data: ${JSON.stringify({ type: "file_start", file: event.file, purpose: event.purpose })}\n\n`);
          break;
        case "file_complete":
          res.write(`data: ${JSON.stringify({ type: "file_complete", file: event.file, size: event.size })}\n\n`);
          break;
        case "file_chunk":
          res.write(`data: ${JSON.stringify({ type: "file_chunk", file: event.file, content: event.content })}\n\n`);
          break;
        case "test_result":
          res.write(`data: ${JSON.stringify({ type: "test_result", file: event.file, passed: event.passed, error: event.error })}\n\n`);
          break;
        case "quality_issue":
          res.write(`data: ${JSON.stringify({ type: "quality_issue", issue: event.issue })}\n\n`);
          break;
        case "quality_score":
          res.write(`data: ${JSON.stringify({ type: "quality_score", score: event.score, passed: event.passed })}\n\n`);
          break;
        case "search_result":
          res.write(`data: ${JSON.stringify({ type: "search", query: event.query, count: event.resultCount })}\n\n`);
          break;
        case "fix_attempt":
          res.write(`data: ${JSON.stringify({ type: "fix_attempt", attempt: event.attempt, max: event.maxAttempts, reason: event.reason })}\n\n`);
          break;
        case "complete":
          break;
        case "error":
          res.write(`data: ${JSON.stringify({ type: "error", message: event.message })}\n\n`);
          break;
      }
    });

    const result = await orchestrator.run(content);

    if (result.success && result.files.length > 0) {
      const generatedFiles = result.files.map(f => ({
        path: f.path,
        content: f.content,
        language: f.path.endsWith('.tsx') ? 'typescript' : f.path.endsWith('.ts') ? 'typescript' : f.path.endsWith('.md') ? 'markdown' : 'text',
      }));

      await storage.updateProject(projectId, {
        generatedFiles,
        generationMetrics: {
          startTime,
          endTime: Date.now(),
          durationMs: Date.now() - startTime,
          promptLength: content.length,
          responseLength: result.files.reduce((acc, f) => acc + f.content.length, 0),
          status: "success",
          retryCount: 0,
        },
      });

      await storage.addMessage(projectId, {
        role: "assistant",
        content: `**Production Build Complete!**\n\n${result.summary}\n\n**Quality Score:** ${result.qualityScore}/100\n\n**Files Generated:** ${result.files.length}\n- ${result.files.map(f => f.path).join('\n- ')}\n\nCheck the Files tab to view and download your project!`,
      });
    } else {
      await storage.addMessage(projectId, {
        role: "assistant",
        content: `Production build encountered an issue: ${result.summary}. Please try again.`,
      });
    }

    const finalProject = await storage.getProject(projectId);
    res.write(`data: ${JSON.stringify({ 
      type: "done", 
      project: finalProject, 
      success: result.success,
      files: result.files,
      qualityScore: result.qualityScore
    })}\n\n`);
    res.end();
    
  } catch (error: any) {
    console.error("Production mode error:", error);
    res.write(`data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`);
    res.end();
  }
});

// Catch-all handler for unknown project sub-routes
// Returns proper 404 instead of falling through to Vite
router.use("/:id/:subpath", async (req, res, next) => {
  // Only catch routes that haven't been handled
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
});

export default router;
