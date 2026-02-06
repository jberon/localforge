import { BaseService, ManagedMap } from "../lib/base-service";

interface ChunkingConfig {
  maxChunkTokens: number;
  overlapTokens: number;
  maxChunks: number;
  strategy: "sequential" | "parallel" | "hierarchical";
}

interface GenerationChunk {
  id: string;
  order: number;
  prompt: string;
  dependencies: string[];
  estimatedTokens: number;
  contextSummary: string;
  chunkType: "component" | "utility" | "api-route" | "page" | "style" | "config" | "type-definition";
}

interface ChunkingResult {
  chunks: GenerationChunk[];
  totalEstimatedTokens: number;
  strategy: string;
  metadata: {
    originalPromptLength: number;
    chunkCount: number;
  };
}

interface ChunkAnalysis {
  complexity: "simple" | "moderate" | "complex";
  componentCount: number;
  hasApiRoutes: boolean;
  hasDatabase: boolean;
  hasAuth: boolean;
  hasStyles: boolean;
  estimatedFiles: number;
  recommendedStrategy: "sequential" | "parallel" | "hierarchical";
}

interface ExtractedFeature {
  name: string;
  type: GenerationChunk["chunkType"];
  description: string;
  dependencies: string[];
}

const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  maxChunkTokens: 6000,
  overlapTokens: 200,
  maxChunks: 12,
  strategy: "sequential",
};

const TYPE_ORDER: Record<GenerationChunk["chunkType"], number> = {
  "type-definition": 0,
  "config": 1,
  "api-route": 2,
  "utility": 3,
  "component": 4,
  "page": 5,
  "style": 6,
};

class PromptChunkingService extends BaseService {
  private static instance: PromptChunkingService;
  private analysisCache: ManagedMap<string, ChunkAnalysis>;
  private totalChunksCreated: number = 0;
  private totalRequests: number = 0;

  private constructor() {
    super("PromptChunkingService");
    this.analysisCache = this.createManagedMap<string, ChunkAnalysis>({ maxSize: 200, strategy: "lru" });
  }

  static getInstance(): PromptChunkingService {
    if (!PromptChunkingService.instance) {
      PromptChunkingService.instance = new PromptChunkingService();
    }
    return PromptChunkingService.instance;
  }

  destroy(): void {
    this.analysisCache.clear();
    this.log("PromptChunkingService shutting down");
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  analyzeComplexity(prompt: string): ChunkAnalysis {
    const cached = this.analysisCache.get(prompt);
    if (cached) return cached;

    const componentMatches = prompt.match(/\b(component|widget|button|form|modal|dialog|card|list|table|nav|header|footer|sidebar|panel|menu|tab|dropdown|input|select|checkbox|radio)\b/gi) || [];
    const componentCount = componentMatches.length;

    const hasApiRoutes = /\b(api|route|endpoint|REST|GET|POST|PUT|DELETE|PATCH|fetch|request|server)\b/i.test(prompt);
    const hasDatabase = /\b(database|db|sql|postgres|mongo|schema|table|query|migration|model|ORM|drizzle|prisma|sequelize)\b/i.test(prompt);
    const hasAuth = /\b(auth|login|signup|register|password|session|token|JWT|OAuth|permission|role|user account)\b/i.test(prompt);
    const hasStyles = /\b(style|css|theme|tailwind|sass|scss|animation|responsive|dark mode|layout|grid|flexbox)\b/i.test(prompt);

    let estimatedFiles = 1;
    if (componentCount > 0) estimatedFiles += componentCount;
    if (hasApiRoutes) estimatedFiles += 2;
    if (hasDatabase) estimatedFiles += 2;
    if (hasAuth) estimatedFiles += 2;
    if (hasStyles) estimatedFiles += 1;

    let complexity: ChunkAnalysis["complexity"];
    let recommendedStrategy: ChunkingConfig["strategy"];

    const complexityScore = componentCount + (hasApiRoutes ? 2 : 0) + (hasDatabase ? 2 : 0) + (hasAuth ? 2 : 0) + (hasStyles ? 1 : 0);

    if (complexityScore <= 2) {
      complexity = "simple";
      recommendedStrategy = "sequential";
    } else if (complexityScore <= 6) {
      complexity = "moderate";
      recommendedStrategy = "sequential";
    } else {
      complexity = "complex";
      recommendedStrategy = "hierarchical";
    }

    const analysis: ChunkAnalysis = {
      complexity,
      componentCount,
      hasApiRoutes,
      hasDatabase,
      hasAuth,
      hasStyles,
      estimatedFiles,
      recommendedStrategy,
    };

    this.analysisCache.set(prompt, analysis);
    return analysis;
  }

  chunkPrompt(prompt: string, config?: Partial<ChunkingConfig>): ChunkingResult {
    const mergedConfig = { ...DEFAULT_CHUNKING_CONFIG, ...config };
    const analysis = this.analyzeComplexity(prompt);
    this.totalRequests++;

    if (analysis.complexity === "simple") {
      const singleChunk: GenerationChunk = {
        id: `chunk_${Date.now()}_0`,
        order: 0,
        prompt,
        dependencies: [],
        estimatedTokens: this.estimateTokens(prompt),
        contextSummary: "",
        chunkType: "component",
      };
      this.totalChunksCreated += 1;
      return {
        chunks: [singleChunk],
        totalEstimatedTokens: singleChunk.estimatedTokens,
        strategy: mergedConfig.strategy,
        metadata: {
          originalPromptLength: prompt.length,
          chunkCount: 1,
        },
      };
    }

    const features = this.extractFeatures(prompt);
    const chunks = this.buildChunks(features, "", mergedConfig);
    const limitedChunks = chunks.slice(0, mergedConfig.maxChunks);
    const totalEstimatedTokens = limitedChunks.reduce((sum, c) => sum + c.estimatedTokens, 0);
    this.totalChunksCreated += limitedChunks.length;

    return {
      chunks: limitedChunks,
      totalEstimatedTokens,
      strategy: analysis.recommendedStrategy,
      metadata: {
        originalPromptLength: prompt.length,
        chunkCount: limitedChunks.length,
      },
    };
  }

  extractFeatures(prompt: string): ExtractedFeature[] {
    const features: ExtractedFeature[] = [];
    const lines = prompt.split(/[.!?\n]+/).filter(l => l.trim().length > 0);

    const typePattern = /\b(type|interface|types|schema|model|enum)\b/i;
    const apiPattern = /\b(api|route|endpoint|REST|server|GET|POST|PUT|DELETE|PATCH)\b/i;
    const componentPattern = /\b(component|widget|button|form|modal|dialog|card|list|table|nav|header|footer|sidebar|panel)\b/i;
    const pagePattern = /\b(page|screen|view|dashboard|landing|home)\b/i;
    const stylePattern = /\b(style|css|theme|tailwind|sass|scss|animation|responsive|dark mode)\b/i;
    const configPattern = /\b(config|env|setup|environment|settings|configuration|initialize)\b/i;
    const utilityPattern = /\b(helper|util|utility|function|service|middleware|hook|lib)\b/i;

    const seen = new Set<string>();

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length < 5) continue;

      if (typePattern.test(trimmed)) {
        const nameMatch = trimmed.match(/\b(type|interface|schema|model|enum)\s+(\w+)/i);
        const name = nameMatch ? nameMatch[2] : `TypeDef_${features.length}`;
        if (!seen.has(`type-definition:${name}`)) {
          seen.add(`type-definition:${name}`);
          features.push({ name, type: "type-definition", description: trimmed, dependencies: [] });
        }
      }

      if (apiPattern.test(trimmed)) {
        const nameMatch = trimmed.match(/\b(api|route|endpoint)\s+(?:for\s+)?(\w+)/i);
        const name = nameMatch ? nameMatch[2] : `ApiRoute_${features.length}`;
        if (!seen.has(`api-route:${name}`)) {
          seen.add(`api-route:${name}`);
          features.push({ name, type: "api-route", description: trimmed, dependencies: [] });
        }
      }

      if (pagePattern.test(trimmed)) {
        const nameMatch = trimmed.match(/\b(page|screen|view|dashboard|landing|home)\s*(\w*)/i);
        const name = nameMatch ? (nameMatch[2] || nameMatch[1]) : `Page_${features.length}`;
        if (!seen.has(`page:${name}`)) {
          seen.add(`page:${name}`);
          features.push({ name, type: "page", description: trimmed, dependencies: [] });
        }
      } else if (componentPattern.test(trimmed)) {
        const nameMatch = trimmed.match(/\b(component|widget|button|form|modal|dialog|card|list|table|nav|header|footer|sidebar|panel)\s*(\w*)/i);
        const name = nameMatch ? (nameMatch[2] || nameMatch[1]) : `Component_${features.length}`;
        if (!seen.has(`component:${name}`)) {
          seen.add(`component:${name}`);
          features.push({ name, type: "component", description: trimmed, dependencies: [] });
        }
      }

      if (stylePattern.test(trimmed)) {
        const name = `Styles_${features.length}`;
        if (!seen.has(`style:${name}`)) {
          seen.add(`style:${name}`);
          features.push({ name, type: "style", description: trimmed, dependencies: [] });
        }
      }

      if (configPattern.test(trimmed)) {
        const nameMatch = trimmed.match(/\b(config|setup|settings|configuration)\s*(\w*)/i);
        const name = nameMatch ? (nameMatch[2] || nameMatch[1]) : `Config_${features.length}`;
        if (!seen.has(`config:${name}`)) {
          seen.add(`config:${name}`);
          features.push({ name, type: "config", description: trimmed, dependencies: [] });
        }
      }

      if (utilityPattern.test(trimmed) && !apiPattern.test(trimmed) && !componentPattern.test(trimmed)) {
        const nameMatch = trimmed.match(/\b(helper|util|utility|function|service|middleware|hook|lib)\s*(\w*)/i);
        const name = nameMatch ? (nameMatch[2] || nameMatch[1]) : `Utility_${features.length}`;
        if (!seen.has(`utility:${name}`)) {
          seen.add(`utility:${name}`);
          features.push({ name, type: "utility", description: trimmed, dependencies: [] });
        }
      }
    }

    if (features.length === 0) {
      features.push({
        name: "MainFeature",
        type: "component",
        description: prompt.substring(0, 500),
        dependencies: [],
      });
    }

    return features;
  }

  buildChunks(features: ExtractedFeature[], contextSummary: string, config: ChunkingConfig): GenerationChunk[] {
    const sorted = [...features].sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type]);
    const chunks: GenerationChunk[] = [];
    const timestamp = Date.now();

    const typeDefIds: string[] = [];
    const configIds: string[] = [];
    const apiRouteIds: string[] = [];
    const utilityIds: string[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const feature = sorted[i];
      const chunkId = `chunk_${timestamp}_${i}`;
      let dependencies: string[] = [];

      switch (feature.type) {
        case "type-definition":
          typeDefIds.push(chunkId);
          break;
        case "config":
          dependencies = [...typeDefIds];
          configIds.push(chunkId);
          break;
        case "api-route":
          dependencies = [...typeDefIds];
          apiRouteIds.push(chunkId);
          break;
        case "utility":
          dependencies = [...typeDefIds];
          utilityIds.push(chunkId);
          break;
        case "component":
        case "page":
          dependencies = [...apiRouteIds, ...utilityIds];
          break;
        case "style":
          dependencies = [...typeDefIds];
          break;
      }

      const previousChunks = chunks.map(c => ({ id: c.id, chunkType: c.chunkType, name: feature.name }));
      const chunkPrompt = this.buildChunkPrompt(feature, previousChunks);

      const chunk: GenerationChunk = {
        id: chunkId,
        order: i,
        prompt: chunkPrompt,
        dependencies,
        estimatedTokens: this.estimateTokens(chunkPrompt),
        contextSummary: contextSummary || (chunks.length > 0
          ? `Previously generated: ${chunks.map(c => `${c.chunkType} (${c.id})`).join(", ")}`
          : ""),
        chunkType: feature.type,
      };

      chunks.push(chunk);
    }

    return chunks;
  }

  buildChunkPrompt(feature: ExtractedFeature, previousChunks: Array<{ id: string; chunkType: string; name: string }>): string {
    let prompt = `Generate ${feature.type}: ${feature.name}\n\n`;
    prompt += `Task: ${feature.description}\n\n`;

    if (previousChunks.length > 0) {
      prompt += `Context - Previously generated chunks:\n`;
      for (const prev of previousChunks) {
        prompt += `- ${prev.chunkType}: ${prev.name} (${prev.id})\n`;
      }
      prompt += `\nEnsure compatibility with the previously generated code.\n\n`;
    }

    switch (feature.type) {
      case "type-definition":
        prompt += "Output format: Export TypeScript interfaces and types. Use explicit types, no 'any'.\n";
        break;
      case "config":
        prompt += "Output format: Export configuration objects and environment setup.\n";
        break;
      case "api-route":
        prompt += "Output format: Export route handlers with proper request/response typing.\n";
        break;
      case "utility":
        prompt += "Output format: Export utility functions with clear input/output types.\n";
        break;
      case "component":
      case "page":
        prompt += "Output format: Export React component with props interface. Include necessary imports.\n";
        break;
      case "style":
        prompt += "Output format: Export CSS/style definitions. Use consistent design tokens.\n";
        break;
    }

    return prompt;
  }

  mergeChunkOutputs(outputs: Array<{ chunkId: string; code: string; metadata?: Record<string, unknown> }>): string {
    const chunkTypeFromId = (id: string): number => {
      for (const output of outputs) {
        if (output.chunkId === id && output.metadata?.chunkType) {
          const t = output.metadata.chunkType as GenerationChunk["chunkType"];
          return TYPE_ORDER[t] ?? 99;
        }
      }
      return 99;
    };

    const sorted = [...outputs].sort((a, b) => {
      const orderA = a.metadata?.order as number ?? chunkTypeFromId(a.chunkId);
      const orderB = b.metadata?.order as number ?? chunkTypeFromId(b.chunkId);
      return orderA - orderB;
    });

    const sections: string[] = [];

    for (const output of sorted) {
      if (output.code.trim().length > 0) {
        sections.push(output.code.trim());
      }
    }

    return sections.join("\n\n");
  }

  getStats(): { totalChunksCreated: number; averageChunksPerRequest: number } {
    return {
      totalChunksCreated: this.totalChunksCreated,
      averageChunksPerRequest: this.totalRequests > 0 ? this.totalChunksCreated / this.totalRequests : 0,
    };
  }
}

export const promptChunkingService = PromptChunkingService.getInstance();
