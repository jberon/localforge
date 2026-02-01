import OpenAI from "openai";

interface LLMClientConfig {
  endpoint: string;
  model?: string;
  temperature?: number;
}

interface StreamOptions {
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  maxTokens?: number;
  onChunk?: (chunk: string) => void;
}

const DEFAULT_ENDPOINT = "http://localhost:1234/v1";
const LOCAL_API_KEY = "lm-studio";

const clientCache = new Map<string, OpenAI>();

export function createLLMClient(config: LLMClientConfig): OpenAI {
  const endpoint = config.endpoint || DEFAULT_ENDPOINT;
  
  if (clientCache.has(endpoint)) {
    return clientCache.get(endpoint)!;
  }

  const client = new OpenAI({
    baseURL: endpoint,
    apiKey: LOCAL_API_KEY,
    timeout: 120000,
    maxRetries: 2,
  });

  clientCache.set(endpoint, client);
  return client;
}

export async function streamCompletion(
  config: LLMClientConfig,
  options: StreamOptions
): Promise<string> {
  const client = createLLMClient(config);
  
  // Use provided maxTokens or default to fullStack limit (optimized for 48GB M4 Pro)
  const maxTokens = options.maxTokens || LLM_DEFAULTS.maxTokens.fullStack;
  
  const stream = await client.chat.completions.create({
    model: config.model || "local-model",
    messages: [
      { role: "system", content: options.systemPrompt },
      ...options.messages,
    ],
    temperature: config.temperature ?? 0.7,
    max_tokens: maxTokens,
    stream: true,
  });

  let fullContent = "";

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || "";
    if (delta) {
      fullContent += delta;
      options.onChunk?.(delta);
    }
  }

  return fullContent;
}

export async function generateCompletion(
  config: LLMClientConfig,
  systemPrompt: string,
  userPrompt: string,
  maxTokens = LLM_DEFAULTS.maxTokens.quickApp
): Promise<string> {
  const client = createLLMClient(config);

  const response = await client.chat.completions.create({
    model: config.model || "local-model",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: config.temperature ?? 0.7,
    max_tokens: maxTokens,
  });

  return response.choices[0]?.message?.content || "";
}

export async function checkConnection(endpoint: string): Promise<{
  connected: boolean;
  models?: string[];
  error?: string;
}> {
  try {
    const client = createLLMClient({ endpoint });
    const models = await client.models.list();
    const modelIds = models.data?.map((m) => m.id) || [];
    
    return {
      connected: true,
      models: modelIds,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      connected: false,
      error: message,
    };
  }
}

export function clearClientCache(): void {
  clientCache.clear();
}

// Optimized for Mac M4 Pro with 48GB unified memory
// These higher limits take advantage of larger local models (32B+ params)
export const LLM_DEFAULTS = {
  temperature: {
    planner: 0.2,      // Lower for structured, deterministic planning
    builder: 0.4,      // Slightly lower for more consistent code generation
    creative: 0.7,     // Keep higher for exploratory features
    deterministic: 0.1,// Near-zero for precise, repeatable outputs
    refine: 0.3,       // Low temp for careful code modifications
  },
  maxTokens: {
    quickApp: 8192,    // 2x increase - single component apps
    fullStack: 16384,  // 2x increase - complete applications
    production: 32768, // 2x increase - enterprise-grade apps
    plan: 4096,        // 2x increase - detailed planning
    analysis: 2048,    // For intent detection and analysis
  },
  // Recommended models for 48GB M4 Pro (sorted by capability)
  recommendedModels: {
    coding: [
      "qwen2.5-coder-32b-instruct",    // Best balance of speed/quality
      "deepseek-coder-v2-lite-instruct", // Fast, excellent for code
      "codellama-34b-instruct",         // Strong code generation
    ],
    general: [
      "qwen2.5-32b-instruct",          // Excellent all-around
      "llama-3.1-70b-instruct-q4",     // High quality, fits in 48GB
      "mistral-large-instruct-2407",   // Good reasoning
    ],
    fast: [
      "qwen2.5-coder-7b-instruct",     // Very fast, good quality
      "deepseek-coder-6.7b-instruct",  // Lightweight, responsive
      "codellama-7b-instruct",         // Quick iterations
    ],
  },
  // Context window recommendations based on model size
  contextWindows: {
    "7b": 8192,
    "13b": 16384,
    "32b": 32768,
    "70b": 16384,  // Lower due to memory constraints
  },
} as const;
