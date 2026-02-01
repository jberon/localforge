import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import OpenAI from "openai";
import { insertProjectSchema, llmSettingsSchema, dataModelSchema } from "@shared/schema";
import { z } from "zod";
import { generateFullStackProject } from "./code-generator";
import { validateGeneratedCode } from "./generators/validator";

const SYSTEM_PROMPT = `You are an expert React developer. When the user describes an app they want, you generate a complete, working React component that renders the app.

IMPORTANT RULES:
1. Output ONLY the JavaScript/JSX code - no explanations, no markdown code blocks, no commentary
2. The code must be a complete, self-contained React component
3. Use React.useState for state management
4. Use Tailwind CSS classes for styling (available via CDN)
5. The component should be rendered using ReactDOM.createRoot
6. Make the UI clean, modern, and professional
7. Handle edge cases and provide good UX
8. For data visualization, use inline styles or Tailwind - Chart.js is available if needed

CODE STRUCTURE (follow this exactly):
\`\`\`
function App() {
  // Your component logic here using React.useState, React.useEffect etc
  return (
    // Your JSX here with Tailwind classes
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
\`\`\`

Remember: Output ONLY the code, starting with "function App()" - no other text.`;

const PROMPT_ENHANCEMENT_SYSTEM = `You are a prompt enhancement specialist. Your job is to take simple, brief app descriptions and transform them into detailed, comprehensive prompts that will help an AI code generator create a better app.

RULES:
1. Keep the original intent but add helpful details
2. Add specific UI/UX suggestions (colors, layout, interactions)
3. Suggest useful features the user might want
4. Specify responsive design considerations
5. Include accessibility considerations
6. Keep the enhanced prompt concise but comprehensive (2-3 paragraphs max)
7. Output ONLY the enhanced prompt text - no explanations or labels

Example:
Input: "todo app"
Output: "Create a modern task management app with a clean, minimalist design. Include the ability to add, complete, and delete tasks. Each task should show its title with an optional description. Add priority levels (high, medium, low) with color-coded badges. Include a progress bar showing completion percentage. Use a card-based layout with subtle shadows. Tasks should animate smoothly when added or removed. Save tasks to localStorage for persistence. Use a calm color palette with a white background and soft accent colors."`;

const ERROR_FIX_SYSTEM = `You are a code debugging expert. You will receive broken React code and error messages. Fix the code so it works correctly.

RULES:
1. Output ONLY the fixed JavaScript/JSX code - no explanations
2. Maintain the original functionality and design intent
3. Fix syntax errors, missing brackets, incorrect imports
4. Ensure proper React patterns are used
5. Keep the same component structure if possible
6. The code must include ReactDOM.createRoot at the end

Output ONLY the corrected code, starting with "function App()".`;

const REFINEMENT_SYSTEM = `You are a React code modifier. You have an existing React component and a user's request to modify it. Update the code according to their request.

RULES:
1. Output ONLY the modified JavaScript/JSX code - no explanations
2. Keep all existing functionality unless explicitly asked to remove it
3. Maintain the existing code style and patterns
4. Make the requested changes cleanly and completely
5. Ensure the code still works after modifications
6. Keep the ReactDOM.createRoot at the end

Output ONLY the modified code, starting with "function App()".`;

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Get all projects
  app.get("/api/projects", async (req, res) => {
    try {
      const projects = await storage.getProjects();
      res.json(projects);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  // Get single project
  app.get("/api/projects/:id", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  // Create project
  app.post("/api/projects", async (req, res) => {
    try {
      const parsed = insertProjectSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid project data", details: parsed.error.errors });
      }
      const project = await storage.createProject({
        name: parsed.data.name || "New Project",
        messages: parsed.data.messages || [],
        description: parsed.data.description,
      });
      res.json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  // Delete project
  app.delete("/api/projects/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteProject(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete project" });
    }
  });

  // Update project code
  const updateCodeSchema = z.object({
    generatedCode: z.string(),
  });

  app.patch("/api/projects/:id/code", async (req, res) => {
    try {
      const parsed = updateCodeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }

      const project = await storage.updateProject(req.params.id, {
        generatedCode: parsed.data.generatedCode,
      });

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      res.json(project);
    } catch (error) {
      console.error("Error updating project code:", error);
      res.status(500).json({ error: "Failed to update project code" });
    }
  });

  const chatRequestSchema = z.object({
    content: z.string().min(1, "Message content is required"),
    settings: llmSettingsSchema,
  });

  // Chat with LLM and generate code (streaming)
  app.post("/api/projects/:id/chat", async (req, res) => {
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

      // Initialize generation metrics
      await storage.updateProject(projectId, {
        generationMetrics: {
          startTime,
          promptLength: content.length,
          status: "streaming",
          retryCount: 0,
        },
      });

      // Add user message
      await storage.addMessage(projectId, {
        role: "user",
        content,
      });

      // Build conversation history for context
      const updatedProject = await storage.getProject(projectId);
      const conversationHistory = updatedProject?.messages.map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })) || [];

      // Create OpenAI client pointing to LM Studio
      const openai = new OpenAI({
        baseURL: settings.endpoint || "http://localhost:1234/v1",
        apiKey: "lm-studio",
      });

      // Set up SSE headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      try {
        const stream = await openai.chat.completions.create({
          model: settings.model || "local-model",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...conversationHistory,
          ],
          temperature: settings.temperature || 0.7,
          max_tokens: 4096,
          stream: true,
        });

        let fullContent = "";

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content || "";
          if (delta) {
            fullContent += delta;
            res.write(`data: ${JSON.stringify({ type: "chunk", content: delta })}\n\n`);
          }
        }

        // Clean up the response
        let cleanedCode = fullContent
          .replace(/^```(?:jsx?|javascript|typescript|tsx)?\n?/gm, "")
          .replace(/```$/gm, "")
          .trim();

        const endTime = Date.now();

        // Add assistant message
        await storage.addMessage(projectId, {
          role: "assistant",
          content: "I've generated the app for you. Check the preview panel to see it in action!",
        });

        // Update project with generated code and metrics
        await storage.updateProject(projectId, {
          generatedCode: cleanedCode,
          generationMetrics: {
            startTime,
            endTime,
            durationMs: endTime - startTime,
            promptLength: content.length,
            responseLength: fullContent.length,
            status: "success",
            retryCount: 0,
          },
        });

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
        
        // Update metrics with error
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

  // Check LLM connection status
  app.post("/api/llm/status", async (req, res) => {
    try {
      const { endpoint } = req.body;
      const openai = new OpenAI({
        baseURL: endpoint || "http://localhost:1234/v1",
        apiKey: "lm-studio",
      });
      
      const models = await openai.models.list();
      res.json({ 
        connected: true, 
        models: models.data.map(m => m.id) 
      });
    } catch (error: any) {
      res.json({ 
        connected: false, 
        error: error.message 
      });
    }
  });

  // Prompt Enhancement - Use LLM to improve simple prompts
  const enhancePromptSchema = z.object({
    prompt: z.string().min(1),
    settings: llmSettingsSchema,
  });

  app.post("/api/llm/enhance-prompt", async (req, res) => {
    try {
      const parsed = enhancePromptSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }

      const { prompt, settings } = parsed.data;

      const openai = new OpenAI({
        baseURL: settings.endpoint || "http://localhost:1234/v1",
        apiKey: "lm-studio",
      });

      const response = await openai.chat.completions.create({
        model: settings.model || "local-model",
        messages: [
          { role: "system", content: PROMPT_ENHANCEMENT_SYSTEM },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      const enhancedPrompt = response.choices[0]?.message?.content?.trim() || prompt;
      res.json({ 
        original: prompt, 
        enhanced: enhancedPrompt,
        improvement: enhancedPrompt.length > prompt.length * 1.5 
      });
    } catch (error: any) {
      console.error("Prompt enhancement error:", error);
      res.status(500).json({ error: "Failed to enhance prompt", details: error.message });
    }
  });

  // Iterative Refinement - Modify existing generated code
  const refineRequestSchema = z.object({
    refinement: z.string().min(1),
    settings: llmSettingsSchema,
  });

  app.post("/api/projects/:id/refine", async (req, res) => {
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

      // Set up SSE headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      const openai = new OpenAI({
        baseURL: settings.endpoint || "http://localhost:1234/v1",
        apiKey: "lm-studio",
      });

      try {
        const stream = await openai.chat.completions.create({
          model: settings.model || "local-model",
          messages: [
            { role: "system", content: REFINEMENT_SYSTEM },
            { role: "user", content: `EXISTING CODE:\n\`\`\`jsx\n${project.generatedCode}\n\`\`\`\n\nMODIFICATION REQUEST: ${refinement}` },
          ],
          temperature: settings.temperature || 0.7,
          max_tokens: 4096,
          stream: true,
        });

        let fullContent = "";

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content || "";
          if (delta) {
            fullContent += delta;
            res.write(`data: ${JSON.stringify({ type: "chunk", content: delta })}\n\n`);
          }
        }

        // Clean up the response
        let cleanedCode = fullContent
          .replace(/^```(?:jsx?|javascript|typescript|tsx)?\n?/gm, "")
          .replace(/```$/gm, "")
          .trim();

        // Add refinement to messages
        await storage.addMessage(projectId, {
          role: "user",
          content: `Refine: ${refinement}`,
        });
        await storage.addMessage(projectId, {
          role: "assistant",
          content: "I've updated the app based on your feedback. Check the preview!",
        });

        // Update project with refined code
        await storage.updateProject(projectId, {
          generatedCode: cleanedCode,
        });

        const finalProject = await storage.getProject(projectId);
        res.write(`data: ${JSON.stringify({ type: "done", project: finalProject })}\n\n`);
        res.end();
      } catch (llmError: any) {
        console.error("Refinement LLM Error:", llmError);
        res.write(`data: ${JSON.stringify({ type: "error", error: llmError.message })}\n\n`);
        res.end();
      }
    } catch (error: any) {
      console.error("Refinement error:", error);
      res.write(`data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`);
      res.end();
    }
  });

  // Smart Error Recovery - Fix broken generated code
  const fixCodeSchema = z.object({
    code: z.string().min(1),
    errors: z.array(z.string()),
    settings: llmSettingsSchema,
  });

  app.post("/api/llm/fix-code", async (req, res) => {
    try {
      const parsed = fixCodeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }

      const { code, errors, settings } = parsed.data;

      const openai = new OpenAI({
        baseURL: settings.endpoint || "http://localhost:1234/v1",
        apiKey: "lm-studio",
      });

      const response = await openai.chat.completions.create({
        model: settings.model || "local-model",
        messages: [
          { role: "system", content: ERROR_FIX_SYSTEM },
          { role: "user", content: `BROKEN CODE:\n\`\`\`jsx\n${code}\n\`\`\`\n\nERRORS:\n${errors.join("\n")}` },
        ],
        temperature: 0.3,
        max_tokens: 4096,
      });

      let fixedCode = response.choices[0]?.message?.content?.trim() || code;
      
      // Clean up the response
      fixedCode = fixedCode
        .replace(/^```(?:jsx?|javascript|typescript|tsx)?\n?/gm, "")
        .replace(/```$/gm, "")
        .trim();

      res.json({ 
        original: code,
        fixed: fixedCode,
        errorsFixed: errors.length 
      });
    } catch (error: any) {
      console.error("Code fix error:", error);
      res.status(500).json({ error: "Failed to fix code", details: error.message });
    }
  });

  // AI Code Assistance - Explain, Fix, Improve code
  const assistCodeSchema = z.object({
    prompt: z.string().min(1),
    action: z.enum(["explain", "fix", "improve"]),
    code: z.string().min(1),
    fullCode: z.string(),
    settings: llmSettingsSchema,
  });

  app.post("/api/llm/assist", async (req, res) => {
    try {
      const parsed = assistCodeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }

      const { prompt, action, code, settings } = parsed.data;

      const openai = new OpenAI({
        baseURL: settings.endpoint || "http://localhost:1234/v1",
        apiKey: "lm-studio",
      });

      const systemPrompts: Record<string, string> = {
        explain: "You are a helpful coding assistant. Explain code clearly and concisely for developers of all skill levels.",
        fix: "You are an expert code debugger. Identify bugs and issues, then provide the corrected code. Return the fixed code in a code block.",
        improve: "You are a code quality expert. Suggest improvements for readability, performance, and best practices. Return the improved code in a code block.",
      };

      const response = await openai.chat.completions.create({
        model: settings.model || "local-model",
        messages: [
          { role: "system", content: systemPrompts[action] },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 2048,
      });

      const content = response.choices[0]?.message?.content?.trim() || "";

      // Extract code block if present
      const codeMatch = content.match(/```(?:jsx?|javascript|typescript|tsx)?\n?([\s\S]*?)```/);
      const suggestedCode = codeMatch ? codeMatch[1].trim() : null;

      // Remove code block from explanation
      const explanation = content.replace(/```(?:jsx?|javascript|typescript|tsx)?\n?[\s\S]*?```/g, "").trim();

      res.json({
        action,
        result: content,
        explanation: explanation || content,
        suggestedCode: action !== "explain" ? suggestedCode : null,
      });
    } catch (error: any) {
      console.error("AI assist error:", error);
      res.status(500).json({ error: "Failed to get AI assistance", details: error.message });
    }
  });

  // Generate full-stack project from data model
  const generateRequestSchema = z.object({
    projectName: z.string().min(1),
    dataModel: dataModelSchema,
    prompt: z.string().optional(),
  });

  app.post("/api/projects/:id/generate-fullstack", async (req, res) => {
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

      // Generate the full-stack project files
      const generatedFiles = generateFullStackProject(projectName, dataModel);

      // Validate the generated code
      const validation = validateGeneratedCode(generatedFiles);

      // Update project with generated files, data model, validation, and last prompt
      await storage.updateProject(projectId, {
        generatedFiles,
        dataModel,
        validation,
        lastPrompt: prompt || projectName,
      });

      // Add assistant message with validation status
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

  return httpServer;
}
