import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import OpenAI from "openai";
import { insertProjectSchema, llmSettingsSchema } from "@shared/schema";
import { z } from "zod";

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

  // Chat with LLM and generate code
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
        apiKey: "lm-studio", // LM Studio doesn't require a real key
      });

      try {
        const completion = await openai.chat.completions.create({
          model: settings.model || "local-model",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...conversationHistory,
          ],
          temperature: settings.temperature || 0.7,
          max_tokens: 4096,
        });

        const assistantContent = completion.choices[0]?.message?.content || "";
        
        // Clean up the response - remove markdown code blocks if present
        let cleanedCode = assistantContent
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
        res.json(finalProject);
      } catch (llmError: any) {
        console.error("LLM Error:", llmError);
        
        // Add error message to conversation
        await storage.addMessage(projectId, {
          role: "assistant",
          content: `I couldn't connect to your local LLM. Make sure LM Studio is running and the local server is started. Error: ${llmError.message}`,
        });
        
        const finalProject = await storage.getProject(projectId);
        res.status(503).json({ 
          error: "Could not connect to LM Studio",
          message: llmError.message,
          project: finalProject,
        });
      }
    } catch (error: any) {
      console.error("Chat error:", error);
      res.status(500).json({ error: "Failed to process chat", message: error.message });
    }
  });

  return httpServer;
}
