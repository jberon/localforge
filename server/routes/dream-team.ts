import { Router } from "express";
import { createLLMClient } from "../llm-client";
import { z } from "zod";

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

router.post("/discuss", async (req, res) => {
  try {
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
  } catch (error: any) {
    console.error("Dream Team discussion error:", error);
    res.status(500).json({ error: "Failed to generate discussion", details: error.message });
  }
});

export default router;
