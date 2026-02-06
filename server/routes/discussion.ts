import { Router, Request, Response } from "express";
import { discussionModeService } from "../services/discussion-mode.service";
import { getActiveLLMClient } from "../llm-client";
import { z } from "zod";
import logger from "../lib/logger";
import { asyncHandler } from "../lib/async-handler";

const router = Router();

const discussMessageSchema = z.object({
  projectId: z.string(),
  message: z.string().min(1).max(10000),
  sessionId: z.string().optional(),
});

router.post("/message", async (req: Request, res: Response) => {
  try {
    const body = discussMessageSchema.parse(req.body);
    const { projectId, message } = body;

    const session = body.sessionId
      ? discussionModeService.getSession(body.sessionId) || discussionModeService.getOrCreateSession(projectId)
      : discussionModeService.getOrCreateSession(projectId);

    discussionModeService.addMessage(session.id, "user", message);

    const intentClassification = discussionModeService.classifyIntent(message);

    const contextMessages = discussionModeService.buildContextMessages(session.id);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    res.write(`data: ${JSON.stringify({ type: "session", sessionId: session.id })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: "intent", ...intentClassification })}\n\n`);

    try {
      const llmResult = getActiveLLMClient();

      if (!llmResult) {
        const fallbackResponse = generateFallbackResponse(message, intentClassification.intent);
        res.write(`data: ${JSON.stringify({ type: "chunk", content: fallbackResponse })}\n\n`);
        discussionModeService.addMessage(session.id, "assistant", fallbackResponse);
        res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
        res.end();
        return;
      }

      const messages = [
        { role: "system" as const, content: discussionModeService.getSystemPrompt() },
        ...contextMessages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
      ];

      const stream = await llmResult.client.chat.completions.create({
        model: "",
        messages,
        temperature: 0.7,
        max_tokens: 2000,
        stream: true,
      });

      let fullResponse = "";

      for await (const chunk of stream) {
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ type: "chunk", content })}\n\n`);
        }
      }

      const analysis = discussionModeService.analyzeConversation(session.id);
      const canApply = analysis.hasActionableIdeas;

      discussionModeService.addMessage(session.id, "assistant", fullResponse, {
        suggestions: analysis.suggestedPrompt ? [analysis.suggestedPrompt] : undefined,
        canApply,
      });

      if (intentClassification.intent === "build" && intentClassification.confidence > 0.7) {
        res.write(`data: ${JSON.stringify({
          type: "suggestion",
          action: "switch_to_build",
          message: "It sounds like you're ready to build! Switch to Build mode to start implementing.",
          suggestedPrompt: analysis.suggestedPrompt,
        })}\n\n`);
      }

      res.write(`data: ${JSON.stringify({
        type: "analysis",
        ...analysis,
      })}\n\n`);

      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    } catch (llmError: any) {
      logger.error("Discussion LLM error", { error: llmError.message });
      const fallbackResponse = generateFallbackResponse(message, intentClassification.intent);
      res.write(`data: ${JSON.stringify({ type: "chunk", content: fallbackResponse })}\n\n`);
      discussionModeService.addMessage(session.id, "assistant", fallbackResponse);
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    }

    res.end();
  } catch (error: any) {
    logger.error("Discussion message error", { error: error.message });
    if (!res.headersSent) {
      res.status(400).json({ error: error.message || "Failed to process discussion message" });
    }
  }
});

router.get("/session/:projectId", asyncHandler((req: Request, res: Response) => {
  const projectId = req.params.projectId as string;
  const session = discussionModeService.getSessionByProject(projectId);
  if (!session) {
    return res.json({ session: null, messages: [] });
  }
  res.json({
    session: {
      id: session.id,
      projectId: session.projectId,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt,
      messageCount: session.messages.length,
    },
    messages: session.messages,
  });
}));

router.post("/analyze/:sessionId", asyncHandler((req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;
  const analysis = discussionModeService.analyzeConversation(sessionId);
  res.json(analysis);
}));

router.post("/classify-intent", (req: Request, res: Response) => {
  try {
    const { message } = z.object({ message: z.string() }).parse(req.body);
    const classification = discussionModeService.classifyIntent(message);
    res.json(classification);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete("/session/:projectId", asyncHandler((req: Request, res: Response) => {
  const projectId = req.params.projectId as string;
  const cleared = discussionModeService.clearProjectSession(projectId);
  res.json({ cleared });
}));

router.get("/stats", asyncHandler((_req: Request, res: Response) => {
  const stats = discussionModeService.getStats();
  res.json(stats);
}));

function generateFallbackResponse(message: string, intent: string): string {
  if (intent === "build") {
    return "It sounds like you're ready to start building! I'd suggest switching to **Build mode** to begin implementing your ideas. You can switch using the mode toggle at the top of the chat.\n\nBefore you do, here are a few things to consider:\n- Do you have a clear picture of the core features?\n- Have you decided on the tech stack?\n- What's the minimum viable version you'd want to see first?";
  }

  const responses = [
    "That's an interesting direction! Let me share some thoughts:\n\n- **Architecture**: Consider starting with a clean separation of concerns - a React frontend with an Express backend is a solid foundation.\n- **Data model**: Think about what entities you'll need and how they relate to each other.\n- **User flow**: Map out the key user journeys before diving into implementation.\n\nWhat aspect would you like to explore further?",
    "Great question! Here's how I'd think about this:\n\n- **Start simple**: Build the core value proposition first, then layer on features.\n- **Scalability**: Choose patterns that won't box you in as the app grows.\n- **User experience**: Focus on making the most common actions effortless.\n\nWhich of these areas is most important to you right now?",
    "Let's break this down:\n\n- **What problem does this solve?** Getting clear on this helps prioritize features.\n- **Who is the target user?** This shapes the design and complexity level.\n- **What's the timeline?** This determines whether to build custom or use existing solutions.\n\nWant to dig deeper into any of these?",
  ];

  return responses[Math.floor(Math.random() * responses.length)];
}

export default router;
