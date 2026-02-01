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

  const chatRequestSchema = z.object({
    content: z.string().min(1, "Message content is required"),
    settings: llmSettingsSchema,
  });

  // Chat with LLM and generate code (streaming)
  app.post("/api/projects/:id/chat", async (req, res) => {
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

        // Add assistant message
        await storage.addMessage(projectId, {
          role: "assistant",
          content: "I've generated the app for you. Check the preview panel to see it in action!",
        });

        // Update project with generated code
        await storage.updateProject(projectId, {
          generatedCode: cleanedCode,
        });

        const finalProject = await storage.getProject(projectId);
        res.write(`data: ${JSON.stringify({ type: "done", project: finalProject })}\n\n`);
        res.end();
      } catch (llmError: any) {
        console.error("LLM Error:", llmError);
        
        await storage.addMessage(projectId, {
          role: "assistant",
          content: `I couldn't connect to your local LLM. Make sure LM Studio is running and the local server is started. Error: ${llmError.message}`,
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
