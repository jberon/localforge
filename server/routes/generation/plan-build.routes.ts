import { Router } from "express";
import {
  storage,
  LLM_DEFAULTS,
  getActiveLLMClient,
  z,
  SYSTEM_PROMPT,
  dataModelSchema,
  generateFullStackProject,
  validateGeneratedCode,
  llmSettingsSchema,
  asyncHandler,
  PLANNING_SYSTEM_PROMPT,
  getModelForPhase,
  extractLLMLimitations,
} from "./index";

const generateRequestSchema = z.object({
  projectName: z.string().min(1),
  dataModel: dataModelSchema,
  prompt: z.string().optional(),
});

export function registerPlanBuildRoutes(router: Router): void {
  router.post("/:id/generate-fullstack", asyncHandler(async (req, res) => {
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
  }));

  router.post("/:id/plan", asyncHandler(async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const { prompt, settings: baseSettings, plannerSettings } = req.body;

      const project = await storage.getProject(id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

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

      const plannerConfig = getModelForPhase(settings, "planner");

      const { client: openai, isCloud } = getActiveLLMClient({
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
          model: isCloud ? (plannerConfig.model || "gpt-4o-mini") : (plannerConfig.model || "local-model"),
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
  }));

  router.post("/:id/plan/approve", asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
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
  }));

  router.post("/:id/build", asyncHandler(async (req, res) => {
    try {
      const { id } = req.params as { id: string };
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

      const { client: openai, isCloud } = getActiveLLMClient({
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
          model: isCloud ? (settings.model || "gpt-4o-mini") : (settings.model || "local-model"),
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

        const { cleanedCode, limitations } = extractLLMLimitations(codeFromMarkdown);

        const validation = validateGeneratedCode([{ path: "App.jsx", content: cleanedCode }]);

        await storage.updateProject(id, {
          generatedCode: cleanedCode,
          validation,
          plan: { ...project.plan, status: "completed" as const },
        });

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
  }));

  router.get("/:id/plan", asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const project = await storage.getProject(id);
    
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json({ plan: project.plan || null });
  }));

  router.delete("/:id/plan", asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const project = await storage.getProject(id);
    
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    await storage.updateProject(id, { plan: undefined });
    res.json({ success: true });
  }));
}
