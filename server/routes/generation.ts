import { Router } from "express";
import { storage } from "../storage";
import { createLLMClient, LLM_DEFAULTS } from "../llm-client";
import { llmSettingsSchema, dataModelSchema, LLMSettings } from "@shared/schema";
import { generateFullStackProject } from "../code-generator";
import { validateGeneratedCode } from "../generators/validator";
import { z } from "zod";
import { SYSTEM_PROMPT, REFINEMENT_SYSTEM } from "./llm";

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

// Validate code and return detailed errors
function validateCodeSyntax(code: string): { valid: boolean; errors: string[]; suggestions: string[] } {
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
  
  // Check for React-specific issues
  if (code.includes('React') || code.includes('useState') || code.includes('useEffect')) {
    if (!code.includes('ReactDOM.render') && !code.includes('createRoot') && !code.includes('ReactDOM.createRoot')) {
      errors.push("Missing React render call");
      suggestions.push("Add ReactDOM.createRoot(document.getElementById('root')).render(<App />)");
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

// Attempt to fix code using LLM
async function attemptCodeFix(
  code: string,
  errors: string[],
  settings: LLMSettings,
  phase: "planner" | "builder"
): Promise<{ fixed: boolean; code: string; message: string }> {
  try {
    const modelConfig = getModelForPhase(settings, phase);
    const openai = createLLMClient({
      endpoint: settings.endpoint || "http://localhost:1234/v1",
      model: modelConfig.model,
      temperature: 0.2, // Lower temperature for fixing
    });
    
    const errorContext = errors.join('\n- ');
    const fixPrompt = `The following code has errors that need to be fixed:

ERRORS:
- ${errorContext}

CODE TO FIX:
${code}

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
    
    if (cleanedFixed && cleanedFixed.length > 50) {
      const revalidation = validateCodeSyntax(cleanedFixed);
      if (revalidation.valid) {
        return { fixed: true, code: cleanedFixed, message: "Code was automatically fixed" };
      }
    }
    
    return { fixed: false, code: code, message: "Could not automatically fix the code" };
  } catch (error: any) {
    return { fixed: false, code: code, message: `Fix attempt failed: ${error.message}` };
  }
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
    const matches = code.matchAll(pattern);
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

router.post("/:id/chat", async (req, res) => {
  const startTime = Date.now();
  
  try {
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid chat request", details: parsed.error.errors });
    }
    const { content, settings } = parsed.data;
    const projectId = req.params.id;
    
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

    try {
      const stream = await openai.chat.completions.create({
        model: builderConfig.model || "local-model",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
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
        
        // Attempt auto-fix if validation fails
        if (!validation.valid && validation.errors.length > 0) {
          res.write(`data: ${JSON.stringify({ type: "status", message: "Validating code..." })}\n\n`);
          
          // Try to fix the code
          res.write(`data: ${JSON.stringify({ type: "status", message: "Found issues, attempting auto-fix..." })}\n\n`);
          
          const fixResult = await attemptCodeFix(cleanedCode, validation.errors, settings, "builder");
          retryCount = 1;
          
          if (fixResult.fixed) {
            cleanedCode = fixResult.code;
            wasAutoFixed = true;
            res.write(`data: ${JSON.stringify({ type: "status", message: "Code fixed successfully!" })}\n\n`);
          } else {
            // Send validation errors to client
            res.write(`data: ${JSON.stringify({ 
              type: "validation_errors", 
              errors: validation.errors,
              suggestions: validation.suggestions 
            })}\n\n`);
          }
        }
        
        // Build response message with any limitations and fix status surfaced
        let responseMessage = "I've generated the app for you. Check the preview panel to see it in action!";
        
        if (wasAutoFixed) {
          responseMessage = "I generated the app and automatically fixed some issues. Check the preview!";
        }
        
        if (limitations.length > 0) {
          responseMessage += "\n\n**Note:** " + limitations.join(" ");
        }
        
        // Add validation warnings if any remain
        const finalValidation = validateCodeSyntax(cleanedCode);
        if (!finalValidation.valid) {
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

router.post("/:id/refine", async (req, res) => {
  try {
    const parsed = refineRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }

    const { refinement, settings } = parsed.data;
    const projectId = req.params.id;

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

    const openai = createLLMClient({
      endpoint: settings.endpoint || "http://localhost:1234/v1",
      model: settings.model,
      temperature: settings.temperature || LLM_DEFAULTS.temperature.builder,
    });

    let isClientConnected = true;
    req.on("close", () => {
      isClientConnected = false;
    });

    try {
      const stream = await openai.chat.completions.create({
        model: settings.model || "local-model",
        messages: [
          { role: "system", content: REFINEMENT_SYSTEM },
          { role: "user", content: `EXISTING CODE:\n\`\`\`jsx\n${project.generatedCode}\n\`\`\`\n\nMODIFICATION REQUEST: ${refinement}` },
        ],
        temperature: settings.temperature || LLM_DEFAULTS.temperature.builder,
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
        
        // Attempt auto-fix if validation fails
        if (!validation.valid && validation.errors.length > 0) {
          res.write(`data: ${JSON.stringify({ type: "status", message: "Validating refined code..." })}\n\n`);
          
          const fixResult = await attemptCodeFix(cleanedCode, validation.errors, settings, "builder");
          
          if (fixResult.fixed) {
            cleanedCode = fixResult.code;
            wasAutoFixed = true;
            res.write(`data: ${JSON.stringify({ type: "status", message: "Code fixed successfully!" })}\n\n`);
          }
        }
        
        // Build response message with any limitations surfaced
        let responseMessage = wasAutoFixed 
          ? "I've updated the app and fixed some issues. Check the preview!"
          : "I've updated the app based on your feedback. Check the preview!";
        
        if (limitations.length > 0) {
          responseMessage += "\n\n**Note:** " + limitations.join(" ");
        }
        
        // Add validation warnings if any remain
        const finalValidation = validateCodeSyntax(cleanedCode);
        if (!finalValidation.valid) {
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
    const projectId = req.params.id;

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
      useDualModels: false,
      plannerModel: "",
      plannerTemperature: LLM_DEFAULTS.temperature.planner,
      builderModel: "",
      builderTemperature: LLM_DEFAULTS.temperature.builder,
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

export default router;
