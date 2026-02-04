import { Router } from "express";
import { storage } from "../storage";
import { 
  createLLMClient, 
  checkConnection, 
  LLM_DEFAULTS, 
  getLLMQueueStatus, 
  getConnectionHealth, 
  getTelemetry, 
  getExtendedQueueTelemetry,
  getCircuitBreakerStatus,
  resetCircuitBreaker,
  getCloudSettings,
  setCloudSettings,
  isCloudProviderActive,
  checkCloudConnection,
  getActiveLLMClient,
} from "../llm-client";
import { llmSettingsSchema } from "@shared/schema";
import { z } from "zod";
import { llmRateLimiter } from "../middleware/rate-limit";
import logger from "../lib/logger";

const router = Router();

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
7. Output ONLY the enhanced prompt text - no explanations or labels`;

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

router.post("/status", llmRateLimiter, async (req, res) => {
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

// Queue status endpoint for UI backpressure indicator
router.get("/queue-status", (_req, res) => {
  const extendedQueue = getExtendedQueueTelemetry();
  res.json({
    queue: {
      ...getLLMQueueStatus(),
      maxQueueSize: extendedQueue.maxQueueSize,
      utilizationPercent: extendedQueue.utilizationPercent,
      isOverloaded: extendedQueue.isOverloaded,
      isFull: extendedQueue.pending >= extendedQueue.maxQueueSize,
    },
    health: getConnectionHealth(),
    telemetry: getTelemetry(),
    circuitBreaker: getCircuitBreakerStatus(),
  });
});

// Reset circuit breaker endpoint
router.post("/reset-circuit-breaker", (_req, res) => {
  resetCircuitBreaker();
  res.json({ 
    success: true, 
    message: "Circuit breaker reset",
    status: getCircuitBreakerStatus(),
  });
});

router.get("/models", async (req, res) => {
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

const enhancePromptSchema = z.object({
  prompt: z.string().min(1),
  settings: llmSettingsSchema,
});

router.post("/enhance-prompt", llmRateLimiter, async (req, res) => {
  try {
    const parsed = enhancePromptSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }

    const { prompt, settings } = parsed.data;

    const { client: openai, isCloud, provider } = getActiveLLMClient({
      endpoint: settings.endpoint,
      model: settings.model,
      temperature: LLM_DEFAULTS.temperature.creative,
    });

    const response = await openai.chat.completions.create({
      model: isCloud ? (settings.model || "gpt-4o-mini") : (settings.model || "local-model"),
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
    logger.error("Prompt enhancement error", {}, error);
    res.status(500).json({ error: "Failed to enhance prompt", details: error.message });
  }
});

const fixCodeSchema = z.object({
  code: z.string().min(1),
  errors: z.array(z.string()),
  settings: llmSettingsSchema,
});

router.post("/fix-code", llmRateLimiter, async (req, res) => {
  try {
    const parsed = fixCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }

    const { code, errors, settings } = parsed.data;

    const { client: openai, isCloud, provider } = getActiveLLMClient({
      endpoint: settings.endpoint,
      model: settings.model,
      temperature: LLM_DEFAULTS.temperature.deterministic,
    });

    const response = await openai.chat.completions.create({
      model: isCloud ? (settings.model || "gpt-4o-mini") : (settings.model || "local-model"),
      messages: [
        { role: "system", content: ERROR_FIX_SYSTEM },
        { role: "user", content: `BROKEN CODE:\n\`\`\`jsx\n${code}\n\`\`\`\n\nERRORS:\n${errors.join("\n")}` },
      ],
      temperature: LLM_DEFAULTS.temperature.deterministic,
      max_tokens: LLM_DEFAULTS.maxTokens.quickApp,
    });

    let fixedCode = response.choices[0]?.message?.content?.trim() || code;
    
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
    logger.error("Code fix error", {}, error);
    res.status(500).json({ error: "Failed to fix code", details: error.message });
  }
});

const assistCodeSchema = z.object({
  prompt: z.string().min(1),
  action: z.enum(["explain", "fix", "improve"]),
  code: z.string().min(1),
  fullCode: z.string(),
  settings: llmSettingsSchema,
});

router.post("/assist", llmRateLimiter, async (req, res) => {
  try {
    const parsed = assistCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    }

    const { prompt, action, code, settings } = parsed.data;

    const { client: openai, isCloud } = getActiveLLMClient({
      endpoint: settings.endpoint,
      model: settings.model,
      temperature: LLM_DEFAULTS.temperature.planner,
    });

    const systemPrompts: Record<string, string> = {
      explain: "You are a helpful coding assistant. Explain code clearly and concisely for developers of all skill levels.",
      fix: "You are an expert code debugger. Identify bugs and issues, then provide the corrected code. Return the fixed code in a code block.",
      improve: "You are a code quality expert. Suggest improvements for readability, performance, and best practices. Return the improved code in a code block.",
    };

    const response = await openai.chat.completions.create({
      model: isCloud ? (settings.model || "gpt-4o-mini") : (settings.model || "local-model"),
      messages: [
        { role: "system", content: systemPrompts[action] },
        { role: "user", content: prompt },
      ],
      temperature: LLM_DEFAULTS.temperature.planner,
      max_tokens: LLM_DEFAULTS.maxTokens.plan,
    });

    const content = response.choices[0]?.message?.content?.trim() || "";

    const codeMatch = content.match(/```(?:jsx?|javascript|typescript|tsx)?\n?([\s\S]*?)```/);
    const suggestedCode = codeMatch ? codeMatch[1].trim() : null;

    const explanation = content.replace(/```(?:jsx?|javascript|typescript|tsx)?\n?[\s\S]*?```/g, "").trim();

    res.json({
      action,
      result: content,
      explanation: explanation || content,
      suggestedCode: action !== "explain" ? suggestedCode : null,
    });
  } catch (error: any) {
    logger.error("AI assist error", {}, error);
    res.status(500).json({ error: "Failed to get AI assistance", details: error.message });
  }
});

// Cloud LLM provider test endpoint
router.post("/test-cloud", async (req, res) => {
  try {
    const { provider, apiKey, baseUrl, model } = req.body;
    
    if (!provider || !apiKey) {
      return res.status(400).json({ error: "Provider and API key are required" });
    }

    let testUrl = baseUrl;
    let headers: Record<string, string> = {};
    let testBody: Record<string, unknown> = {};

    // Configure provider-specific settings
    switch (provider) {
      case "openai":
        testUrl = baseUrl || "https://api.openai.com/v1";
        headers = {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        };
        testBody = {
          model: model || "gpt-4o-mini",
          messages: [{ role: "user", content: "Hi" }],
          max_tokens: 5,
        };
        break;
        
      case "anthropic":
        testUrl = baseUrl || "https://api.anthropic.com/v1";
        headers = {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        };
        testBody = {
          model: model || "claude-3-haiku-20240307",
          messages: [{ role: "user", content: "Hi" }],
          max_tokens: 5,
        };
        break;
        
      case "google":
        testUrl = `${baseUrl || "https://generativelanguage.googleapis.com/v1beta"}/models/${model || "gemini-pro"}:generateContent?key=${apiKey}`;
        headers = { "Content-Type": "application/json" };
        testBody = {
          contents: [{ parts: [{ text: "Hi" }] }],
          generationConfig: { maxOutputTokens: 5 },
        };
        break;
        
      case "groq":
      case "together":
      case "custom":
        testUrl = baseUrl || (provider === "groq" ? "https://api.groq.com/openai/v1" : "https://api.together.xyz/v1");
        headers = {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        };
        testBody = {
          model: model || (provider === "groq" ? "llama-3.1-8b-instant" : "meta-llama/Llama-3-8b-chat-hf"),
          messages: [{ role: "user", content: "Hi" }],
          max_tokens: 5,
        };
        break;
        
      default:
        return res.status(400).json({ error: "Unknown provider" });
    }

    let endpoint: string;
    if (provider === "google") {
      endpoint = testUrl;
    } else if (provider === "anthropic") {
      endpoint = `${testUrl}/messages`;
    } else {
      endpoint = `${testUrl}/chat/completions`;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(testBody),
    });

    if (response.ok) {
      logger.info("Cloud LLM connection test successful", { provider });
      res.json({ connected: true, provider });
    } else {
      const errorText = await response.text();
      logger.warn("Cloud LLM connection test failed", { provider, status: response.status, error: errorText });
      res.status(400).json({ connected: false, error: errorText });
    }
  } catch (error: any) {
    logger.error("Cloud LLM test error", { error: error.message });
    res.status(500).json({ connected: false, error: error.message });
  }
});

// Cloud LLM settings - uses centralized llm-client storage
router.get("/cloud-settings", (_req, res) => {
  res.json(getCloudSettings());
});

router.post("/cloud-settings", (req, res) => {
  setCloudSettings(req.body);
  logger.info("Cloud LLM settings updated", { provider: req.body.provider });
  res.json({ success: true });
});

// Get active LLM provider status
router.get("/active-provider", async (_req, res) => {
  const cloudActive = isCloudProviderActive();
  const settings = getCloudSettings();
  
  if (cloudActive) {
    const cloudStatus = await checkCloudConnection();
    res.json({
      provider: settings.provider,
      isCloud: true,
      connected: cloudStatus.connected,
      error: cloudStatus.error,
    });
  } else {
    const localStatus = await checkConnection();
    res.json({
      provider: "local",
      isCloud: false,
      connected: localStatus.connected,
      error: localStatus.error,
    });
  }
});

export { SYSTEM_PROMPT, REFINEMENT_SYSTEM };
export default router;
