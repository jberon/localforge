import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { analyticsStorage } from "./analytics-storage";
import { createLLMClient, checkConnection, LLM_DEFAULTS } from "./llm-client";
import { insertProjectSchema, llmSettingsSchema, dataModelSchema, analyticsEventTypes } from "@shared/schema";
import type { AnalyticsEventType } from "@shared/schema";
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

  // Update project name
  const updateNameSchema = z.object({
    name: z.string().min(1).max(100),
  });

  app.patch("/api/projects/:id/name", async (req, res) => {
    try {
      const parsed = updateNameSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }

      const project = await storage.updateProject(req.params.id, {
        name: parsed.data.name,
      });

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      res.json(project);
    } catch (error) {
      console.error("Error updating project name:", error);
      res.status(500).json({ error: "Failed to update project name" });
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

  // File Operations

  // Update a single file in the project
  const updateFileSchema = z.object({
    path: z.string().min(1),
    content: z.string(),
  });

  app.patch("/api/projects/:id/files", async (req, res) => {
    try {
      const parsed = updateFileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }

      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const files = project.generatedFiles || [];
      const fileIndex = files.findIndex(f => f.path === parsed.data.path);
      
      if (fileIndex >= 0) {
        files[fileIndex] = { path: parsed.data.path, content: parsed.data.content };
      } else {
        files.push({ path: parsed.data.path, content: parsed.data.content });
      }

      const updatedProject = await storage.updateProject(req.params.id, {
        generatedFiles: files,
      });

      res.json(updatedProject);
    } catch (error) {
      console.error("Error updating file:", error);
      res.status(500).json({ error: "Failed to update file" });
    }
  });

  // Create a new file in the project
  app.post("/api/projects/:id/files", async (req, res) => {
    try {
      const parsed = updateFileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }

      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const files = project.generatedFiles || [];
      const existingFile = files.find(f => f.path === parsed.data.path);
      
      if (existingFile) {
        return res.status(409).json({ error: "File already exists" });
      }

      files.push({ path: parsed.data.path, content: parsed.data.content });

      const updatedProject = await storage.updateProject(req.params.id, {
        generatedFiles: files,
      });

      res.json(updatedProject);
    } catch (error) {
      console.error("Error creating file:", error);
      res.status(500).json({ error: "Failed to create file" });
    }
  });

  // Delete a file from the project
  const deleteFileSchema = z.object({
    path: z.string().min(1),
  });

  app.delete("/api/projects/:id/files", async (req, res) => {
    try {
      const parsed = deleteFileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }
      const filePath = parsed.data.path;
      
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const files = project.generatedFiles || [];
      const fileIndex = files.findIndex(f => f.path === filePath);
      
      if (fileIndex < 0) {
        return res.status(404).json({ error: "File not found" });
      }

      files.splice(fileIndex, 1);

      const updatedProject = await storage.updateProject(req.params.id, {
        generatedFiles: files,
      });

      res.json(updatedProject);
    } catch (error) {
      console.error("Error deleting file:", error);
      res.status(500).json({ error: "Failed to delete file" });
    }
  });

  // Package Download Route
  const packageSchema = z.object({
    format: z.enum(["zip"]).default("zip"),
    includeDocker: z.boolean().default(true),
    includeCICD: z.boolean().default(false),
    includeEnvTemplate: z.boolean().default(true),
  });

  app.post("/api/projects/:id/package", async (req, res) => {
    const archiver = await import("archiver");
    
    try {
      const parsed = packageSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }

      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const files = project.generatedFiles || [];
      if (files.length === 0) {
        return res.status(400).json({ error: "No files to package" });
      }

      const safeName = project.name.toLowerCase().replace(/[^a-z0-9]/g, "_");
      const isFullStack = files.some(f => f.path.includes("server/") || f.path.includes("routes/"));
      
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}-project.zip"`);

      const archive = archiver.default("zip", { zlib: { level: 9 } });
      archive.pipe(res);

      // Sanitize file paths to prevent Zip Slip vulnerability
      const sanitizePath = (filePath: string): string | null => {
        // Normalize the path
        let normalized = filePath.replace(/\\/g, '/');
        
        // Remove leading slashes
        normalized = normalized.replace(/^\/+/, '');
        
        // Reject paths with .. traversal
        if (normalized.includes('..')) {
          console.warn(`Rejected path with traversal: ${filePath}`);
          return null;
        }
        
        // Reject absolute paths
        if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
          console.warn(`Rejected absolute path: ${filePath}`);
          return null;
        }
        
        // Ensure path stays within project directory
        const parts = normalized.split('/').filter(Boolean);
        if (parts.length === 0) {
          return null;
        }
        
        return parts.join('/');
      };

      for (const file of files) {
        const safePath = sanitizePath(file.path);
        if (safePath) {
          archive.append(file.content, { name: safePath });
        }
      }

      if (parsed.data.includeDocker) {
        const dockerfile = `FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["node", "dist/index.js"]`;
        archive.append(dockerfile, { name: "Dockerfile" });

        if (isFullStack) {
          const dockerCompose = `version: '3.8'

services:
  app:
    build: .
    container_name: ${safeName}
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/${safeName}
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:15-alpine
    container_name: ${safeName}_db
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=${safeName}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  postgres_data:`;
          archive.append(dockerCompose, { name: "docker-compose.yml" });
        }

        archive.append(`.env*
node_modules/
dist/
*.log
.DS_Store`, { name: ".dockerignore" });
      }

      if (parsed.data.includeEnvTemplate) {
        const envTemplate = `# ${project.name} Environment Configuration

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/${safeName}

# Server
PORT=3000
NODE_ENV=development

# Add your API keys below
# OPENAI_API_KEY=your-key-here
# STRIPE_SECRET_KEY=your-key-here
`;
        archive.append(envTemplate, { name: ".env.example" });
      }

      if (parsed.data.includeCICD) {
        const githubAction = `name: CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - run: npm test

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Deploy
        run: echo "Add your deployment commands here"
`;
        archive.append(githubAction, { name: ".github/workflows/ci.yml" });
      }

      const readme = `# ${project.name}

Generated by LocalForge

## Quick Start

\`\`\`bash
npm install
${isFullStack ? "npm run db:push\n" : ""}npm run dev
\`\`\`

## Docker

\`\`\`bash
docker-compose up -d
\`\`\`

## Environment Variables

Copy \`.env.example\` to \`.env\` and configure your settings.
`;
      archive.append(readme, { name: "README.md" });

      await archive.finalize();
    } catch (error) {
      console.error("Error creating package:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to create package" });
      }
    }
  });

  // Version Control Routes

  // Get all versions for a project
  app.get("/api/projects/:id/versions", async (req, res) => {
    try {
      const versions = await storage.getProjectVersions(req.params.id);
      res.json(versions);
    } catch (error) {
      console.error("Error fetching versions:", error);
      res.status(500).json({ error: "Failed to fetch versions" });
    }
  });

  // Create a new version (checkpoint)
  const createVersionSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().optional(),
    isAutoSave: z.boolean().optional(),
  });

  app.post("/api/projects/:id/versions", async (req, res) => {
    try {
      const parsed = createVersionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }

      const version = await storage.createVersion(
        req.params.id,
        parsed.data.name,
        parsed.data.description,
        parsed.data.isAutoSave
      );

      if (!version) {
        return res.status(404).json({ error: "Project not found" });
      }

      res.status(201).json(version);
    } catch (error) {
      console.error("Error creating version:", error);
      res.status(500).json({ error: "Failed to create version" });
    }
  });

  // Restore project to a specific version
  app.post("/api/projects/:id/versions/:versionId/restore", async (req, res) => {
    try {
      const project = await storage.restoreVersion(req.params.id, req.params.versionId);
      
      if (!project) {
        return res.status(404).json({ error: "Version or project not found" });
      }

      res.json(project);
    } catch (error) {
      console.error("Error restoring version:", error);
      res.status(500).json({ error: "Failed to restore version" });
    }
  });

  // Delete a version
  app.delete("/api/projects/:id/versions/:versionId", async (req, res) => {
    try {
      // Verify the version belongs to this project
      const versions = await storage.getProjectVersions(req.params.id);
      const versionExists = versions.some(v => v.id === req.params.versionId);
      
      if (!versionExists) {
        return res.status(404).json({ error: "Version not found for this project" });
      }
      
      const deleted = await storage.deleteVersion(req.params.versionId);
      
      if (!deleted) {
        return res.status(404).json({ error: "Version not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting version:", error);
      res.status(500).json({ error: "Failed to delete version" });
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

      // Create optimized OpenAI client pointing to LM Studio (with caching, extended timeout, retries)
      const openai = createLLMClient({
        endpoint: settings.endpoint || "http://localhost:1234/v1",
        model: settings.model,
        temperature: settings.temperature,
      });

      // Set up SSE headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      // Handle client disconnect for memory efficiency
      let isClientConnected = true;
      req.on("close", () => {
        isClientConnected = false;
      });

      try {
        const stream = await openai.chat.completions.create({
          model: settings.model || "local-model",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...conversationHistory,
          ],
          temperature: settings.temperature || 0.7,
          max_tokens: LLM_DEFAULTS.maxTokens.quickApp,
          stream: true,
        });

        // Use array for efficient string building (better memory on Mac M4 Pro)
        const chunks: string[] = [];

        for await (const chunk of stream) {
          if (!isClientConnected) break; // Stop processing if client disconnected
          
          const delta = chunk.choices[0]?.delta?.content || "";
          if (delta) {
            chunks.push(delta);
            res.write(`data: ${JSON.stringify({ type: "chunk", content: delta })}\n\n`);
          }
        }
        
        const fullContent = chunks.join("");

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

  // Check LLM connection status (using optimized connection checker)
  app.post("/api/llm/status", async (req, res) => {
    try {
      const { endpoint } = req.body;
      const result = await checkConnection(endpoint || "http://localhost:1234/v1");
      res.json(result);
    } catch (error: any) {
      res.json({ 
        connected: false, 
        error: error.message 
      });
    }
  });

  // Get available LM Studio models
  app.get("/api/llm/models", async (req, res) => {
    try {
      const endpoint = (req.query.endpoint as string) || "http://localhost:1234/v1";
      const result = await checkConnection(endpoint);
      
      if (result.connected && result.models) {
        res.json({ 
          success: true,
          models: result.models,
          endpoint,
        });
      } else {
        res.json({ 
          success: false,
          error: result.error || "No models available",
          endpoint,
        });
      }
    } catch (error: any) {
      res.status(500).json({ 
        success: false,
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

      const openai = createLLMClient({
        endpoint: settings.endpoint || "http://localhost:1234/v1",
        model: settings.model,
        temperature: LLM_DEFAULTS.temperature.creative,
      });

      const response = await openai.chat.completions.create({
        model: settings.model || "local-model",
        messages: [
          { role: "system", content: PROMPT_ENHANCEMENT_SYSTEM },
          { role: "user", content: prompt },
        ],
        temperature: LLM_DEFAULTS.temperature.creative,
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

      const openai = createLLMClient({
        endpoint: settings.endpoint || "http://localhost:1234/v1",
        model: settings.model,
        temperature: settings.temperature || LLM_DEFAULTS.temperature.builder,
      });

      // Handle client disconnect for memory efficiency
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

        // Use array for efficient string building
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

      const openai = createLLMClient({
        endpoint: settings.endpoint || "http://localhost:1234/v1",
        model: settings.model,
        temperature: LLM_DEFAULTS.temperature.deterministic,
      });

      const response = await openai.chat.completions.create({
        model: settings.model || "local-model",
        messages: [
          { role: "system", content: ERROR_FIX_SYSTEM },
          { role: "user", content: `BROKEN CODE:\n\`\`\`jsx\n${code}\n\`\`\`\n\nERRORS:\n${errors.join("\n")}` },
        ],
        temperature: LLM_DEFAULTS.temperature.deterministic,
        max_tokens: LLM_DEFAULTS.maxTokens.quickApp,
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

      const openai = createLLMClient({
        endpoint: settings.endpoint || "http://localhost:1234/v1",
        model: settings.model,
        temperature: LLM_DEFAULTS.temperature.planner,
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
        temperature: LLM_DEFAULTS.temperature.planner,
        max_tokens: LLM_DEFAULTS.maxTokens.plan,
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

  // ========================================
  // Analytics Routes
  // ========================================

  // Track an event
  const trackEventSchema = z.object({
    type: z.enum(analyticsEventTypes),
    projectId: z.string().optional(),
    data: z.record(z.any()).optional(),
  });

  app.post("/api/analytics/events", async (req, res) => {
    try {
      const parsed = trackEventSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid event data", details: parsed.error.errors });
      }
      
      const event = await analyticsStorage.trackEvent(
        parsed.data.type,
        parsed.data.projectId,
        parsed.data.data
      );
      res.json(event);
    } catch (error: any) {
      console.error("Track event error:", error);
      res.status(500).json({ error: "Failed to track event" });
    }
  });

  // Get events with optional filtering
  app.get("/api/analytics/events", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const type = req.query.type as AnalyticsEventType | undefined;
      
      const events = await analyticsStorage.getEvents(limit, type);
      res.json(events);
    } catch (error: any) {
      console.error("Get events error:", error);
      res.status(500).json({ error: "Failed to get events" });
    }
  });

  // Submit feedback
  const feedbackRequestSchema = z.object({
    projectId: z.string(),
    rating: z.enum(["positive", "negative"]),
    comment: z.string().optional(),
    prompt: z.string(),
    generatedCode: z.string().optional(),
    templateUsed: z.string().optional(),
  });

  app.post("/api/analytics/feedback", async (req, res) => {
    try {
      const parsed = feedbackRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid feedback data", details: parsed.error.errors });
      }
      
      const feedback = await analyticsStorage.submitFeedback(parsed.data);
      
      // Also track as event
      await analyticsStorage.trackEvent("feedback_submitted", parsed.data.projectId, {
        rating: parsed.data.rating,
        hasComment: !!parsed.data.comment,
      });
      
      res.json(feedback);
    } catch (error: any) {
      console.error("Submit feedback error:", error);
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  });

  // Get feedbacks
  app.get("/api/analytics/feedback", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const feedbacks = await analyticsStorage.getFeedbacks(limit);
      res.json(feedbacks);
    } catch (error: any) {
      console.error("Get feedbacks error:", error);
      res.status(500).json({ error: "Failed to get feedbacks" });
    }
  });

  // Get analytics overview
  app.get("/api/analytics/overview", async (req, res) => {
    try {
      const overview = await analyticsStorage.getOverview();
      res.json(overview);
    } catch (error: any) {
      console.error("Get analytics overview error:", error);
      res.status(500).json({ error: "Failed to get analytics overview" });
    }
  });

  // Get insights
  app.get("/api/analytics/insights", async (req, res) => {
    try {
      const insights = await analyticsStorage.getActiveInsights();
      res.json(insights);
    } catch (error: any) {
      console.error("Get insights error:", error);
      res.status(500).json({ error: "Failed to get insights" });
    }
  });

  // Generate insights using LLM
  const generateInsightsSchema = z.object({
    settings: llmSettingsSchema,
  });

  app.post("/api/analytics/generate-insights", async (req, res) => {
    try {
      const parsed = generateInsightsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }

      const { settings } = parsed.data;
      
      // Gather data for analysis
      const overview = await analyticsStorage.getOverview();
      const recentFeedbacks = await analyticsStorage.getFeedbacks(50);
      const positivePrompts = await analyticsStorage.getPositiveFeedbacks();
      
      const openai = createLLMClient({
        endpoint: settings.endpoint || "http://localhost:1234/v1",
        model: settings.model,
        temperature: LLM_DEFAULTS.temperature.builder,
      });

      const analysisPrompt = `You are an analytics expert. Analyze this app usage data and provide actionable insights.

DATA SUMMARY:
- Total generations: ${overview.totalGenerations}
- Success rate: ${overview.successRate.toFixed(1)}%
- Average generation time: ${(overview.averageGenerationTime / 1000).toFixed(1)}s
- Positive feedback: ${overview.feedbackStats.positive}
- Negative feedback: ${overview.feedbackStats.negative}
- Template usage: ${JSON.stringify(overview.templateUsage)}

RECENT TRENDS (last 7 days):
${overview.recentTrends.map(t => `${t.date}: ${t.generations} generations, ${t.successes} successes`).join('\n')}

SAMPLE POSITIVE FEEDBACK PROMPTS:
${positivePrompts.slice(0, 5).map(f => `- "${f.prompt.substring(0, 100)}..."`).join('\n')}

SAMPLE NEGATIVE FEEDBACK:
${recentFeedbacks.filter(f => f.rating === 'negative').slice(0, 5).map(f => `- "${f.comment || 'No comment'}"`).join('\n')}

Based on this data, provide 3-5 specific, actionable insights. For each insight include:
1. A clear title
2. Description of what the data shows
3. Whether it's actionable (yes/no)
4. Priority (high/medium/low)
5. Type (pattern/recommendation/trend/warning)

Output as JSON array:
[{"title": "...", "description": "...", "actionable": true, "priority": "high", "type": "recommendation"}]`;

      const response = await openai.chat.completions.create({
        model: settings.model || "local-model",
        messages: [
          { role: "system", content: "You are a data analyst. Respond only with valid JSON arrays." },
          { role: "user", content: analysisPrompt },
        ],
        temperature: 0.5,
        max_tokens: 2000,
      });

      const content = response.choices[0]?.message?.content?.trim() || "[]";
      
      // Parse insights from response
      let parsedInsights: any[] = [];
      try {
        // Extract JSON array from response
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          parsedInsights = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        console.error("Failed to parse insights JSON:", parseError);
      }

      // Save insights to database
      const savedInsights = [];
      for (const insight of parsedInsights) {
        if (insight.title && insight.description) {
          const saved = await analyticsStorage.saveInsight({
            type: insight.type || "recommendation",
            title: insight.title,
            description: insight.description,
            actionable: insight.actionable ?? true,
            priority: insight.priority || "medium",
            data: { source: "llm_analysis" },
            generatedAt: Date.now(),
            expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000), // Expire in 7 days
          });
          savedInsights.push(saved);
        }
      }

      res.json({ 
        generated: savedInsights.length,
        insights: savedInsights 
      });
    } catch (error: any) {
      console.error("Generate insights error:", error);
      res.status(500).json({ error: "Failed to generate insights", details: error.message });
    }
  });

  // Natural language query for analytics
  const analyticsQuerySchema = z.object({
    query: z.string().min(1),
    settings: llmSettingsSchema,
  });

  app.post("/api/analytics/query", async (req, res) => {
    try {
      const parsed = analyticsQuerySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }

      const { query, settings } = parsed.data;
      
      // Gather current data for context
      const overview = await analyticsStorage.getOverview();
      const recentEvents = await analyticsStorage.getEvents(50);
      
      const openai = createLLMClient({
        endpoint: settings.endpoint || "http://localhost:1234/v1",
        model: settings.model,
        temperature: LLM_DEFAULTS.temperature.planner,
      });

      const queryPrompt = `You are an analytics assistant. Answer the user's question about their app generation data.

CURRENT DATA:
- Total generations: ${overview.totalGenerations}
- Success rate: ${overview.successRate.toFixed(1)}%
- Successful: ${overview.successfulGenerations}, Failed: ${overview.failedGenerations}
- Average generation time: ${(overview.averageGenerationTime / 1000).toFixed(1)} seconds
- Template usage: ${JSON.stringify(overview.templateUsage)}

RECENT TRENDS (last 7 days):
${overview.recentTrends.map(t => `${t.date}: ${t.generations} generations, ${t.successes} successful`).join('\n')}

USER QUESTION: "${query}"

Provide a clear, helpful answer based on the data. Be specific with numbers when relevant. Keep the response concise but informative.`;

      const response = await openai.chat.completions.create({
        model: settings.model || "local-model",
        messages: [
          { role: "system", content: "You are a helpful analytics assistant. Give clear, data-driven answers." },
          { role: "user", content: queryPrompt },
        ],
        temperature: 0.3,
        max_tokens: 500,
      });

      const answer = response.choices[0]?.message?.content?.trim() || "I couldn't analyze that question. Try asking about success rates, templates, or trends.";
      
      res.json({ 
        answer,
        data: overview,
        visualization: "number"
      });
    } catch (error: any) {
      console.error("Analytics query error:", error);
      // Return a fallback that client can handle
      res.status(500).json({ error: "Query processing failed", details: error.message });
    }
  });

  // Get code inventory - breakdown of all generated code
  app.get("/api/analytics/code-inventory", async (req, res) => {
    try {
      const allProjects = await storage.getProjects();
      
      // Language detection helpers
      const detectLanguage = (filename: string, content: string): string => {
        const ext = filename.split('.').pop()?.toLowerCase() || '';
        const extMap: Record<string, string> = {
          'js': 'JavaScript',
          'jsx': 'React JSX',
          'ts': 'TypeScript',
          'tsx': 'React TSX',
          'html': 'HTML',
          'css': 'CSS',
          'scss': 'SCSS',
          'json': 'JSON',
          'md': 'Markdown',
          'py': 'Python',
          'sql': 'SQL',
          'sh': 'Shell',
          'yml': 'YAML',
          'yaml': 'YAML',
          'env': 'Environment',
          'dockerfile': 'Docker',
        };
        return extMap[ext] || 'Other';
      };

      const countLines = (content: string): number => {
        return content.split('\n').length;
      };

      // Process all projects
      const projectInventory = allProjects.map(project => {
        const files: Array<{ path: string; language: string; lines: number; size: number }> = [];
        let totalLines = 0;
        let totalSize = 0;
        const languageCounts: Record<string, number> = {};

        // Process generatedFiles if available
        if (project.generatedFiles && Array.isArray(project.generatedFiles)) {
          for (const file of project.generatedFiles as Array<{ path: string; content: string }>) {
            const language = detectLanguage(file.path, file.content);
            const lines = countLines(file.content);
            const size = file.content.length;
            
            files.push({ path: file.path, language, lines, size });
            totalLines += lines;
            totalSize += size;
            languageCounts[language] = (languageCounts[language] || 0) + lines;
          }
        }

        // Process generatedCode (single file apps)
        if (project.generatedCode && project.generatedCode.length > 0) {
          const lines = countLines(project.generatedCode);
          const size = project.generatedCode.length;
          files.push({ path: 'app.jsx', language: 'React JSX', lines, size });
          totalLines += lines;
          totalSize += size;
          languageCounts['React JSX'] = (languageCounts['React JSX'] || 0) + lines;
        }

        return {
          id: project.id,
          name: project.name,
          description: project.description,
          files,
          totalFiles: files.length,
          totalLines,
          totalSize,
          languageCounts,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          hasCode: totalLines > 0,
          prompt: project.lastPrompt || (project.messages as any)?.[0]?.content?.substring(0, 200),
        };
      });

      // Aggregate stats
      const totalProjects = projectInventory.length;
      const projectsWithCode = projectInventory.filter(p => p.hasCode).length;
      const totalFiles = projectInventory.reduce((sum, p) => sum + p.totalFiles, 0);
      const totalLines = projectInventory.reduce((sum, p) => sum + p.totalLines, 0);
      const totalSize = projectInventory.reduce((sum, p) => sum + p.totalSize, 0);
      
      // Aggregate language breakdown
      const languageBreakdown: Record<string, { lines: number; files: number; projects: number }> = {};
      for (const project of projectInventory) {
        for (const [lang, lines] of Object.entries(project.languageCounts)) {
          if (!languageBreakdown[lang]) {
            languageBreakdown[lang] = { lines: 0, files: 0, projects: 0 };
          }
          languageBreakdown[lang].lines += lines;
          languageBreakdown[lang].files += project.files.filter(f => f.language === lang).length;
          languageBreakdown[lang].projects += 1;
        }
      }

      res.json({
        summary: {
          totalProjects,
          projectsWithCode,
          totalFiles,
          totalLines,
          totalSize,
          averageLinesPerProject: projectsWithCode > 0 ? Math.round(totalLines / projectsWithCode) : 0,
        },
        languageBreakdown,
        projects: projectInventory.sort((a, b) => b.updatedAt - a.updatedAt),
      });
    } catch (error: any) {
      console.error("Get code inventory error:", error);
      res.status(500).json({ error: "Failed to get code inventory" });
    }
  });

  // Export all projects as a package manifest
  app.get("/api/analytics/export-manifest", async (req, res) => {
    try {
      const allProjects = await storage.getProjects();
      
      const manifest = {
        exportedAt: new Date().toISOString(),
        version: "1.0.0",
        generator: "LocalForge",
        totalProjects: allProjects.length,
        projects: allProjects.map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          prompt: p.lastPrompt || (p.messages as any)?.[0]?.content,
          hasFullStack: p.generatedFiles && (p.generatedFiles as any[]).length > 0,
          hasSingleFile: !!p.generatedCode,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
      };

      res.json(manifest);
    } catch (error: any) {
      console.error("Get export manifest error:", error);
      res.status(500).json({ error: "Failed to get export manifest" });
    }
  });

  // Get successful prompts for learning (used as examples)
  app.get("/api/analytics/successful-prompts", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const positiveFeedbacks = await analyticsStorage.getPositiveFeedbacks();
      
      const successfulPrompts = positiveFeedbacks
        .slice(0, limit)
        .map(f => ({
          prompt: f.prompt,
          template: f.templateUsed,
          timestamp: f.timestamp,
        }));
      
      res.json(successfulPrompts);
    } catch (error: any) {
      console.error("Get successful prompts error:", error);
      res.status(500).json({ error: "Failed to get successful prompts" });
    }
  });

  // ==========================================
  // PLAN & BUILD MODE ROUTES
  // ==========================================

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

  // Create a plan for a project
  app.post("/api/projects/:id/plan", async (req, res) => {
    try {
      const { id } = req.params;
      const { prompt, plannerSettings } = req.body;

      const project = await storage.getProject(id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const settings = plannerSettings || {
        endpoint: "http://localhost:1234/v1",
        model: "",
        temperature: LLM_DEFAULTS.temperature.planner,
      };

      const openai = createLLMClient({
        endpoint: settings.endpoint,
        model: settings.model,
        temperature: settings.temperature,
      });

      // Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Handle client disconnect for memory efficiency
      let isClientConnected = true;
      req.on("close", () => {
        isClientConnected = false;
      });

      try {
        const stream = await openai.chat.completions.create({
          model: settings.model || "local-model",
          messages: [
            { role: "system", content: PLANNING_SYSTEM_PROMPT },
            { role: "user", content: `Create an implementation plan for: ${prompt}` },
          ],
          temperature: settings.temperature || LLM_DEFAULTS.temperature.planner,
          max_tokens: LLM_DEFAULTS.maxTokens.plan,
          stream: true,
        });

        // Use array for efficient string building
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

        // Try to parse the plan
        let plan;
        try {
          // Clean up any markdown code blocks
          const cleaned = planContent
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "")
            .trim();
          plan = JSON.parse(cleaned);
        } catch (parseError) {
          // If parsing fails, create a basic plan structure
          plan = {
            summary: prompt,
            steps: [
              { id: "1", title: "Build application", description: prompt, type: "component" as const, status: "pending" as const }
            ],
          };
        }

        // Create the full plan object
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

        // Save plan to project
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

  // Approve a plan and optionally start building
  app.post("/api/projects/:id/plan/approve", async (req, res) => {
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

  // Build from an approved plan
  app.post("/api/projects/:id/build", async (req, res) => {
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

      // Update plan status
      await storage.updateProject(id, { 
        plan: { ...project.plan, status: "building" as const }
      });

      // Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Handle client disconnect for memory efficiency
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

        // Use array for efficient string building
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

        // Clean and validate the code
        const cleanedCode = generatedCode
          .replace(/^```(?:jsx?|javascript|typescript|tsx)?\n?/gm, "")
          .replace(/```$/gm, "")
          .trim();

        const validation = validateGeneratedCode([{ path: "App.jsx", content: cleanedCode }]);

        // Update project with generated code
        await storage.updateProject(id, {
          generatedCode: cleanedCode,
          validation,
          plan: { ...project.plan, status: "completed" as const },
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

  // Get current plan status
  app.get("/api/projects/:id/plan", async (req, res) => {
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

  // Delete/clear a plan (for rejection)
  app.delete("/api/projects/:id/plan", async (req, res) => {
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

  return httpServer;
}
