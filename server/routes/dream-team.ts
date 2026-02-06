import { Router } from "express";
import { createLLMClient } from "../llm-client";
import { createDreamTeamService } from "../services/dreamTeam";
import { CORE_DREAM_TEAM } from "@shared/schema";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler";

const router = Router();

const dreamTeamDiscussionSchema = z.object({
  topic: z.string(),
  context: z.string(),
  personas: z.array(z.object({
    id: z.string(),
    name: z.string(),
    title: z.string(),
    focus: z.array(z.string()),
    personality: z.string(),
  })),
  discussionDepth: z.enum(["brief", "balanced", "thorough"]).default("balanced"),
  endpoint: z.string().optional(),
  temperature: z.number().optional(),
});

const generateBusinessCaseSchema = z.object({
  projectId: z.string(),
  userRequest: z.string(),
  context: z.string().optional(),
  endpoint: z.string(),
  model: z.string(),
  temperature: z.number().optional(),
});

const analyzeSpecialistsSchema = z.object({
  projectId: z.string(),
  endpoint: z.string(),
  model: z.string(),
  temperature: z.number().optional(),
});

router.get("/members", (req, res) => {
  res.json({
    core: CORE_DREAM_TEAM,
    description: "The core Dream Team members available for all projects",
  });
});

router.get("/projects/:projectId/team", asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const endpoint = (req.query.endpoint as string) || "http://localhost:1234/v1";
  const model = (req.query.model as string) || "";
  
  const service = createDreamTeamService({
    endpoint,
    reasoningModel: model,
  });
  
  const team = await service.getFullTeam(projectId);
  res.json(team);
}));

router.get("/projects/:projectId/activity", asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const limit = parseInt(req.query.limit as string) || 50;
  const endpoint = (req.query.endpoint as string) || "http://localhost:1234/v1";
  const model = (req.query.model as string) || "";
  
  const service = createDreamTeamService({
    endpoint,
    reasoningModel: model,
  });
  
  const logs = await service.getActivityLog(projectId, limit);
  res.json({ logs });
}));

router.get("/projects/:projectId/business-case", asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const endpoint = (req.query.endpoint as string) || "http://localhost:1234/v1";
  const model = (req.query.model as string) || "";
  
  const service = createDreamTeamService({
    endpoint,
    reasoningModel: model,
  });
  
  const businessCase = await service.getBusinessCase(projectId);
  res.json({ businessCase });
}));

router.get("/projects/:projectId/readme", asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const endpoint = (req.query.endpoint as string) || "http://localhost:1234/v1";
  const model = (req.query.model as string) || "";
  
  const service = createDreamTeamService({
    endpoint,
    reasoningModel: model,
  });
  
  const readme = await service.getReadme(projectId);
  res.json({ readme });
}));

router.post("/business-case/generate", async (req, res) => {
  const parsed = generateBusinessCaseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
  }

  const { projectId, userRequest, context, endpoint, model, temperature } = parsed.data;
  
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const service = createDreamTeamService({
    endpoint,
    reasoningModel: model,
    temperature,
  });

  try {
    const businessCase = await service.generateBusinessCase(
      projectId,
      userRequest,
      context,
      (chunk) => {
        res.write(`data: ${JSON.stringify({ type: "thinking", content: chunk })}\n\n`);
      }
    );

    res.write(`data: ${JSON.stringify({ type: "complete", businessCase })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error: any) {
    res.write(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`);
    res.end();
  }
});

router.post("/specialists/analyze", async (req, res) => {
  const parsed = analyzeSpecialistsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
  }

  const { projectId, endpoint, model, temperature } = parsed.data;
  
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const service = createDreamTeamService({
    endpoint,
    reasoningModel: model,
    temperature,
  });

  try {
    const businessCase = await service.getBusinessCase(projectId);
    if (!businessCase) {
      res.write(`data: ${JSON.stringify({ type: "error", message: "No business case found for this project" })}\n\n`);
      res.end();
      return;
    }

    const specialists = await service.analyzeAndCreateSpecialists(
      projectId,
      businessCase,
      (chunk) => {
        res.write(`data: ${JSON.stringify({ type: "thinking", content: chunk })}\n\n`);
      }
    );

    res.write(`data: ${JSON.stringify({ type: "complete", specialists })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error: any) {
    res.write(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`);
    res.end();
  }
});

router.post("/readme/generate", async (req, res) => {
  const schema = z.object({
    projectId: z.string(),
    endpoint: z.string(),
    model: z.string(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
  }

  const { projectId, endpoint, model } = parsed.data;
  
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const service = createDreamTeamService({
    endpoint,
    reasoningModel: model,
  });

  try {
    const businessCase = await service.getBusinessCase(projectId);
    if (!businessCase) {
      res.write(`data: ${JSON.stringify({ type: "error", message: "No business case found" })}\n\n`);
      res.end();
      return;
    }

    const readme = await service.generateReadme(
      projectId,
      businessCase,
      (chunk) => {
        res.write(`data: ${JSON.stringify({ type: "thinking", content: chunk })}\n\n`);
      }
    );

    res.write(`data: ${JSON.stringify({ type: "complete", readme })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error: any) {
    res.write(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`);
    res.end();
  }
});

router.post("/discuss", asyncHandler(async (req, res) => {
  const parsed = dreamTeamDiscussionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
  }

  const { topic, context, personas, discussionDepth, endpoint, temperature } = parsed.data;
  
  const depthConfig = {
    brief: { messagesPerPersona: 1, maxTokens: 1024 },
    balanced: { messagesPerPersona: 1, maxTokens: 2048 },
    thorough: { messagesPerPersona: 2, maxTokens: 4096 },
  };
  const config = depthConfig[discussionDepth];

  const personaDescriptions = personas.map(p => 
    `- ${p.name} (${p.title}): Focuses on ${p.focus.join(", ")}. ${p.personality}`
  ).join("\n");

  const systemPrompt = `You are simulating a collaborative discussion between expert advisors reviewing a software development decision. Each persona has a unique perspective and expertise.

THE EXPERTS:
${personaDescriptions}

DISCUSSION FORMAT:
Generate a realistic discussion where each expert shares their perspective on the topic. Output as JSON array with this structure:
[
  {"personaId": "persona-id", "content": "their comment", "type": "opinion|concern|suggestion|approval|question"},
  ...
]

Keep each response concise but insightful (1-3 sentences). After all perspectives, add a final entry summarizing the team's recommendation.

Rules:
1. Each persona must contribute ${config.messagesPerPersona} message(s)
2. Responses should reflect each persona's unique focus areas
3. Include a mix of opinions, concerns, and suggestions
4. End with a clear recommendation that synthesizes all perspectives
5. Be practical and actionable`;

  const client = createLLMClient({ endpoint: endpoint || "http://localhost:1234/v1" });
  
  const response = await client.chat.completions.create({
    model: "",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `TOPIC: ${topic}\n\nCONTEXT: ${context}\n\nPlease begin the discussion.` }
    ],
    temperature: temperature ?? 0.7,
    max_tokens: config.maxTokens,
  });

  const content = response.choices[0]?.message?.content || "[]";
  
  let messages: any[] = [];
  let recommendation = "";
  
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      messages = JSON.parse(jsonMatch[0]);
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && (lastMsg.type === "suggestion" || lastMsg.content.toLowerCase().includes("recommend"))) {
        recommendation = lastMsg.content;
      }
    }
  } catch (parseError) {
    messages = personas.map(p => ({
      personaId: p.id,
      content: `As ${p.title}, I think this needs careful consideration of ${p.focus[0]}.`,
      type: "opinion",
      timestamp: Date.now(),
    }));
    recommendation = "The team recommends proceeding with careful attention to all perspectives raised.";
  }

  messages = messages.map((m: any, i: number) => ({
    ...m,
    timestamp: Date.now() + (i * 1000),
  }));

  res.json({
    id: `discussion-${Date.now()}`,
    topic,
    context,
    messages,
    recommendation,
    status: "awaiting_input",
    createdAt: Date.now(),
  });
}));

export default router;
