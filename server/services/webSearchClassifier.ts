import OpenAI from "openai";
import type { LLMSettings } from "@shared/schema";
import { logger } from "../lib/logger";

const CLASSIFIER_PROMPT = `You are a classifier that decides whether a user question requires fresh information from the internet.

If the question depends on:
- current events,
- recent news or prices,
- travel schedules,
- live documentation changes,
- or anything that clearly requires up-to-date web data,

answer with exactly: USE_WEB

Otherwise, if the question can be answered from general knowledge or code already available locally, answer with exactly: NO_WEB.

No explanation, just one of these two tokens.

User question: "<USER_MESSAGE>"`;

export async function shouldUseWebSearch(
  userMessage: string,
  settings: LLMSettings
): Promise<{ needsWeb: boolean; reason?: string }> {
  try {
    logger.info("Classifying web search need", { message: userMessage.substring(0, 100) });

    const client = new OpenAI({
      baseURL: settings.endpoint,
      apiKey: "lm-studio",
      timeout: 30000,
    });

    const prompt = CLASSIFIER_PROMPT.replace("<USER_MESSAGE>", userMessage);

    const response = await client.chat.completions.create({
      model: settings.model || "",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 20,
      temperature: 0.1,
    });

    const answer = response.choices[0]?.message?.content?.trim().toUpperCase() || "";
    
    const needsWeb = answer.includes("USE_WEB");
    
    logger.info("Web search classification complete", { answer, needsWeb });

    return {
      needsWeb,
      reason: needsWeb ? "Question requires up-to-date information" : "Can be answered from general knowledge",
    };
  } catch (error: any) {
    logger.error("Web search classification error", { error: error.message });
    return {
      needsWeb: false,
      reason: `Classification failed: ${error.message}`,
    };
  }
}

export interface WebSearchDecision {
  action: "search" | "skip" | "ask_permission";
  reason: string;
}

export function decideWebSearchAction(
  needsWeb: boolean,
  webSearchEnabled: boolean,
  hasApiKey: boolean
): WebSearchDecision {
  if (!needsWeb) {
    return {
      action: "skip",
      reason: "Question can be answered without web search",
    };
  }

  if (webSearchEnabled && hasApiKey) {
    return {
      action: "search",
      reason: "Web search is enabled and API key is configured",
    };
  }

  return {
    action: "ask_permission",
    reason: webSearchEnabled 
      ? "Web search is enabled but API key is missing" 
      : "Web search is disabled but may help with this question",
  };
}
