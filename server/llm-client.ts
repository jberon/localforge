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
  
  const maxTokens = options.maxTokens || 8192;
  
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
  maxTokens = 4096
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

export const LLM_DEFAULTS = {
  temperature: {
    planner: 0.3,
    builder: 0.5,
    creative: 0.7,
    deterministic: 0.1,
  },
  maxTokens: {
    quickApp: 4096,
    fullStack: 8192,
    production: 16384,
    plan: 2048,
  },
} as const;
