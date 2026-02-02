import { Router } from "express";
import { storage } from "../storage";
import { createLLMClient, LLM_DEFAULTS } from "../llm-client";
import { llmSettingsSchema, dataModelSchema } from "@shared/schema";
import { generateFullStackProject } from "../code-generator";
import { validateGeneratedCode } from "../generators/validator";
import { z } from "zod";
import { SYSTEM_PROMPT, REFINEMENT_SYSTEM } from "./llm";

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

      let cleanedCode = fullContent
        .replace(/^```(?:jsx?|javascript|typescript|tsx)?\n?/gm, "")
        .replace(/```$/gm, "")
        .trim();

      const endTime = Date.now();

      // Only show success message if we actually generated code
      if (cleanedCode && cleanedCode.length > 50) {
        await storage.addMessage(projectId, {
          role: "assistant",
          content: "I've generated the app for you. Check the preview panel to see it in action!",
        });

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

      let cleanedCode = fullContent
        .replace(/^```(?:jsx?|javascript|typescript|tsx)?\n?/gm, "")
        .replace(/```$/gm, "")
        .trim();

      await storage.addMessage(projectId, {
        role: "user",
        content: `Refine: ${refinement}`,
      });

      // Only show success if we actually got refined code
      if (cleanedCode && cleanedCode.length > 50) {
        await storage.addMessage(projectId, {
          role: "assistant",
          content: "I've updated the app based on your feedback. Check the preview!",
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
    const { prompt, settings: baseSettings } = req.body;

    const project = await storage.getProject(id);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Parse settings with defaults
    const parsedSettings = llmSettingsSchema.safeParse(baseSettings);
    const settings = parsedSettings.success ? parsedSettings.data : {
      endpoint: "http://localhost:1234/v1",
      model: "",
      temperature: LLM_DEFAULTS.temperature.planner,
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

      const cleanedCode = generatedCode
        .replace(/^```(?:jsx?|javascript|typescript|tsx)?\n?/gm, "")
        .replace(/```$/gm, "")
        .trim();

      const validation = validateGeneratedCode([{ path: "App.jsx", content: cleanedCode }]);

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
