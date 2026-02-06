import { BaseService, ManagedMap } from "../lib/base-service";

export interface ModelProfile {
  id: string;
  family: ModelFamily;
  contextWindow: number;
  optimalTemperature: {
    planning: number;
    coding: number;
    review: number;
    general: number;
  };
  instructionFormat: InstructionFormat;
  strengths: string[];
  weaknesses: string[];
  promptTips: string[];
  maxOutputTokens: number;
  supportsFunctionCalling: boolean;
  supportsStreaming: boolean;
}

export type ModelFamily = 
  | "qwen"
  | "ministral"
  | "llama"
  | "codellama"
  | "deepseek"
  | "mistral"
  | "phi"
  | "gemma"
  | "unknown";

export type InstructionFormat = 
  | "chatml"      // <|im_start|>system\n...<|im_end|>
  | "llama"       // [INST] ... [/INST]
  | "alpaca"      // ### Instruction:\n...\n### Response:
  | "vicuna"      // USER: ...\nASSISTANT:
  | "plain";      // No special formatting

export interface ContextBudget {
  systemPrompt: number;
  userMessage: number;
  codeContext: number;
  chatHistory: number;
  outputReserve: number;
  total: number;
}

export interface OptimizedPrompt {
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
  stopSequences: string[];
}

class LocalModelOptimizerService extends BaseService {
  private static instance: LocalModelOptimizerService;
  private modelProfiles: ManagedMap<string, ModelProfile>;
  private defaultContextWindow = 8192;
  
  private constructor() {
    super("LocalModelOptimizerService");
    this.modelProfiles = this.createManagedMap<string, ModelProfile>({ maxSize: 200, strategy: "lru" });
    this.initializeModelProfiles();
  }

  static getInstance(): LocalModelOptimizerService {
    if (!LocalModelOptimizerService.instance) {
      LocalModelOptimizerService.instance = new LocalModelOptimizerService();
    }
    return LocalModelOptimizerService.instance;
  }

  private initializeModelProfiles(): void {
    const profiles: ModelProfile[] = [
      {
        id: "qwen2.5-coder",
        family: "qwen",
        contextWindow: 32768,
        optimalTemperature: { planning: 0.3, coding: 0.2, review: 0.1, general: 0.5 },
        instructionFormat: "chatml",
        strengths: [
          "Excellent code generation",
          "Strong TypeScript/JavaScript",
          "Good at following code patterns",
          "Handles long code context well"
        ],
        weaknesses: [
          "May over-generate boilerplate",
          "Sometimes verbose explanations"
        ],
        promptTips: [
          "Be explicit about output format",
          "Provide concrete examples when possible",
          "Use structured JSON output requests"
        ],
        maxOutputTokens: 8192,
        supportsFunctionCalling: true,
        supportsStreaming: true
      },
      {
        id: "qwen3-coder",
        family: "qwen",
        contextWindow: 32768,
        optimalTemperature: { planning: 0.4, coding: 0.3, review: 0.2, general: 0.6 },
        instructionFormat: "chatml",
        strengths: [
          "State-of-art code generation",
          "Multi-language proficiency",
          "Strong reasoning for complex tasks",
          "Excellent at refactoring"
        ],
        weaknesses: [
          "Higher memory requirements",
          "May need explicit stop sequences"
        ],
        promptTips: [
          "Can handle complex multi-step instructions",
          "Excels with chain-of-thought prompting",
          "Use for architecture decisions"
        ],
        maxOutputTokens: 8192,
        supportsFunctionCalling: true,
        supportsStreaming: true
      },
      {
        id: "ministral",
        family: "ministral",
        contextWindow: 32768,
        optimalTemperature: { planning: 0.2, coding: 0.3, review: 0.1, general: 0.4 },
        instructionFormat: "llama",
        strengths: [
          "Strong reasoning capabilities",
          "Good at breaking down problems",
          "Efficient token usage",
          "Excellent for planning"
        ],
        weaknesses: [
          "May need more explicit code formatting",
          "Less specialized for coding than Qwen"
        ],
        promptTips: [
          "Use for planning and architecture",
          "Pair with coding model for implementation",
          "Provide clear step-by-step instructions"
        ],
        maxOutputTokens: 4096,
        supportsFunctionCalling: true,
        supportsStreaming: true
      },
      {
        id: "llama-3",
        family: "llama",
        contextWindow: 8192,
        optimalTemperature: { planning: 0.3, coding: 0.2, review: 0.1, general: 0.5 },
        instructionFormat: "llama",
        strengths: [
          "Well-balanced capabilities",
          "Good instruction following",
          "Reliable output format"
        ],
        weaknesses: [
          "Smaller context window",
          "May struggle with very long code"
        ],
        promptTips: [
          "Keep context concise",
          "Use clear section headers",
          "Prefer focused single-file tasks"
        ],
        maxOutputTokens: 4096,
        supportsFunctionCalling: false,
        supportsStreaming: true
      },
      {
        id: "deepseek-coder",
        family: "deepseek",
        contextWindow: 16384,
        optimalTemperature: { planning: 0.3, coding: 0.1, review: 0.1, general: 0.4 },
        instructionFormat: "chatml",
        strengths: [
          "Excellent at code completion",
          "Strong debugging capabilities",
          "Good at understanding code patterns"
        ],
        weaknesses: [
          "May generate incomplete responses",
          "Needs explicit end markers"
        ],
        promptTips: [
          "Use low temperature for code",
          "Provide clear output format",
          "Include examples of expected output"
        ],
        maxOutputTokens: 4096,
        supportsFunctionCalling: true,
        supportsStreaming: true
      },
      {
        id: "codellama",
        family: "codellama",
        contextWindow: 16384,
        optimalTemperature: { planning: 0.4, coding: 0.2, review: 0.2, general: 0.5 },
        instructionFormat: "llama",
        strengths: [
          "Strong code infilling",
          "Good at completing partial code",
          "Understands code structure well"
        ],
        weaknesses: [
          "Less capable for planning tasks",
          "May need more context for complex tasks"
        ],
        promptTips: [
          "Best for code completion tasks",
          "Provide surrounding code context",
          "Use for single-file modifications"
        ],
        maxOutputTokens: 4096,
        supportsFunctionCalling: false,
        supportsStreaming: true
      }
    ];

    for (const profile of profiles) {
      this.modelProfiles.set(profile.id, profile);
      this.log("Model profile registered", { modelId: profile.id, family: profile.family });
    }
  }

  detectModelFamily(modelName: string): ModelFamily {
    const name = modelName.toLowerCase();
    
    if (name.includes("qwen")) return "qwen";
    if (name.includes("ministral")) return "ministral";
    if (name.includes("llama") && name.includes("code")) return "codellama";
    if (name.includes("llama")) return "llama";
    if (name.includes("deepseek")) return "deepseek";
    if (name.includes("mistral")) return "mistral";
    if (name.includes("phi")) return "phi";
    if (name.includes("gemma")) return "gemma";
    
    return "unknown";
  }

  getModelProfile(modelName: string): ModelProfile {
    const name = modelName.toLowerCase();
    
    const entries = this.modelProfiles.entries();
    for (const [id, profile] of entries) {
      if (name.includes(id.toLowerCase())) {
        return profile;
      }
    }
    
    const family = this.detectModelFamily(modelName);
    return this.getDefaultProfile(family, modelName);
  }

  private getDefaultProfile(family: ModelFamily, modelName: string): ModelProfile {
    const familyProfiles = this.modelProfiles.values()
      .find(p => p.family === family);
    
    if (familyProfiles) {
      return { ...familyProfiles, id: modelName };
    }

    return {
      id: modelName,
      family: "unknown",
      contextWindow: this.defaultContextWindow,
      optimalTemperature: { planning: 0.3, coding: 0.2, review: 0.1, general: 0.5 },
      instructionFormat: "plain",
      strengths: ["General purpose model"],
      weaknesses: ["Unknown capabilities"],
      promptTips: ["Use clear, explicit instructions"],
      maxOutputTokens: 4096,
      supportsFunctionCalling: false,
      supportsStreaming: true
    };
  }

  calculateContextBudget(
    modelName: string,
    taskType: "planning" | "coding" | "review" | "general"
  ): ContextBudget {
    const profile = this.getModelProfile(modelName);
    const total = profile.contextWindow;
    const outputReserve = Math.min(profile.maxOutputTokens, Math.floor(total * 0.25));
    const available = total - outputReserve;
    
    let allocation: { system: number; user: number; code: number; history: number };
    
    switch (taskType) {
      case "planning":
        allocation = { system: 0.15, user: 0.25, code: 0.35, history: 0.25 };
        break;
      case "coding":
        allocation = { system: 0.10, user: 0.15, code: 0.55, history: 0.20 };
        break;
      case "review":
        allocation = { system: 0.10, user: 0.10, code: 0.60, history: 0.20 };
        break;
      default:
        allocation = { system: 0.15, user: 0.20, code: 0.40, history: 0.25 };
    }
    
    return {
      systemPrompt: Math.floor(available * allocation.system),
      userMessage: Math.floor(available * allocation.user),
      codeContext: Math.floor(available * allocation.code),
      chatHistory: Math.floor(available * allocation.history),
      outputReserve,
      total
    };
  }

  getOptimalTemperature(
    modelName: string,
    taskType: "planning" | "coding" | "review" | "general"
  ): number {
    const profile = this.getModelProfile(modelName);
    return profile.optimalTemperature[taskType];
  }

  formatInstruction(
    modelName: string,
    systemPrompt: string,
    userPrompt: string
  ): { system: string; user: string } {
    const profile = this.getModelProfile(modelName);
    
    switch (profile.instructionFormat) {
      case "chatml":
        return {
          system: systemPrompt,
          user: userPrompt
        };
      
      case "llama":
        return {
          system: `<<SYS>>\n${systemPrompt}\n<</SYS>>`,
          user: `[INST] ${userPrompt} [/INST]`
        };
      
      case "alpaca":
        return {
          system: `### Instruction:\n${systemPrompt}`,
          user: `### Input:\n${userPrompt}\n\n### Response:`
        };
      
      case "vicuna":
        return {
          system: `SYSTEM: ${systemPrompt}`,
          user: `USER: ${userPrompt}\nASSISTANT:`
        };
      
      default:
        return { system: systemPrompt, user: userPrompt };
    }
  }

  optimizePromptForModel(
    modelName: string,
    systemPrompt: string,
    userPrompt: string,
    taskType: "planning" | "coding" | "review" | "general"
  ): OptimizedPrompt {
    const profile = this.getModelProfile(modelName);
    const formatted = this.formatInstruction(modelName, systemPrompt, userPrompt);
    
    let enhancedSystem = formatted.system;
    
    if (profile.family === "qwen") {
      enhancedSystem = this.enhanceForQwen(enhancedSystem, taskType);
    } else if (profile.family === "ministral" || profile.family === "mistral") {
      enhancedSystem = this.enhanceForMinistral(enhancedSystem, taskType);
    } else if (profile.family === "llama" || profile.family === "codellama") {
      enhancedSystem = this.enhanceForLlama(enhancedSystem, taskType);
    }
    
    const stopSequences = this.getStopSequences(profile.family, taskType);
    
    return {
      systemPrompt: enhancedSystem,
      userPrompt: formatted.user,
      temperature: profile.optimalTemperature[taskType],
      maxTokens: profile.maxOutputTokens,
      stopSequences
    };
  }

  private enhanceForQwen(systemPrompt: string, taskType: string): string {
    const qwenTips = [
      "Output your response in a structured format.",
      "Be concise and avoid unnecessary explanations.",
      "Follow the exact output format specified."
    ];
    
    if (taskType === "coding") {
      return `${systemPrompt}\n\nIMPORTANT: ${qwenTips.join(" ")} Output only valid code without markdown code blocks unless specifically requested.`;
    }
    return `${systemPrompt}\n\n${qwenTips[0]}`;
  }

  private enhanceForMinistral(systemPrompt: string, taskType: string): string {
    if (taskType === "planning") {
      return `${systemPrompt}\n\nThink step-by-step. Break down complex problems into smaller, manageable parts. Be thorough but focused.`;
    }
    return systemPrompt;
  }

  private enhanceForLlama(systemPrompt: string, taskType: string): string {
    if (taskType === "coding") {
      return `${systemPrompt}\n\nFocus on writing clean, working code. Keep responses focused and avoid lengthy explanations.`;
    }
    return systemPrompt;
  }

  private getStopSequences(family: ModelFamily, taskType: string): string[] {
    const baseStops: string[] = [];
    
    switch (family) {
      case "qwen":
        baseStops.push("<|im_end|>", "<|endoftext|>");
        break;
      case "llama":
      case "codellama":
        baseStops.push("</s>", "[/INST]");
        break;
      case "ministral":
      case "mistral":
        baseStops.push("</s>");
        break;
    }
    
    if (taskType === "coding") {
      baseStops.push("\n\n---", "\n\nExplanation:", "\n\nNote:");
    }
    
    return baseStops;
  }

  compressContext(
    content: string,
    maxTokens: number,
    preserveStructure: boolean = true
  ): string {
    const estimatedTokens = this.estimateTokens(content);
    
    if (estimatedTokens <= maxTokens) {
      return content;
    }

    const ratio = maxTokens / estimatedTokens;
    const lines = content.split("\n");
    
    if (preserveStructure) {
      return this.smartCompress(lines, ratio);
    }
    
    const targetLength = Math.floor(content.length * ratio);
    return content.slice(0, targetLength) + "\n... [truncated]";
  }

  private smartCompress(lines: string[], ratio: number): string {
    const priorityLines: { line: string; priority: number; index: number }[] = [];
    
    lines.forEach((line, index) => {
      let priority = 1;
      
      if (line.match(/^(import|export|function|class|interface|type|const|let|var)\s/)) {
        priority = 5;
      } else if (line.match(/^\s*(return|throw|if|else|for|while|switch)\s/)) {
        priority = 4;
      } else if (line.match(/^\s*\/\//)) {
        priority = 1;
      } else if (line.match(/^\s*\*|^\s*\/\*|\*\//)) {
        priority = 0.5;
      } else if (line.trim() === "") {
        priority = 0.3;
      } else {
        priority = 2;
      }
      
      priorityLines.push({ line, priority, index });
    });
    
    const sorted = [...priorityLines].sort((a, b) => b.priority - a.priority);
    
    const targetCount = Math.floor(lines.length * ratio);
    const selectedIndices = new Set(
      sorted.slice(0, targetCount).map(p => p.index)
    );
    
    const result: string[] = [];
    let lastIncluded = -1;
    
    for (let i = 0; i < lines.length; i++) {
      if (selectedIndices.has(i)) {
        if (lastIncluded !== -1 && i - lastIncluded > 1) {
          result.push("  // ...");
        }
        result.push(lines[i]);
        lastIncluded = i;
      }
    }
    
    return result.join("\n");
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 3.5);
  }

  getRecommendedModelPairing(): { planner: string; builder: string; reviewer: string } {
    return {
      planner: "ministral-3-14b",
      builder: "qwen2.5-coder-14b",
      reviewer: "qwen3-coder-30b"
    };
  }

  analyzePromptComplexity(prompt: string): {
    complexity: "simple" | "moderate" | "complex";
    suggestedModel: "fast" | "balanced" | "powerful";
    estimatedTokens: number;
    features: string[];
  } {
    const tokens = this.estimateTokens(prompt);
    const features: string[] = [];
    let complexityScore = 0;
    
    if (prompt.match(/build|create|generate|implement/i)) {
      features.push("generation");
      complexityScore += 2;
    }
    if (prompt.match(/fix|debug|error|bug/i)) {
      features.push("debugging");
      complexityScore += 1;
    }
    if (prompt.match(/refactor|improve|optimize/i)) {
      features.push("refactoring");
      complexityScore += 2;
    }
    if (prompt.match(/api|database|backend|server/i)) {
      features.push("backend");
      complexityScore += 2;
    }
    if (prompt.match(/component|ui|frontend|react|vue/i)) {
      features.push("frontend");
      complexityScore += 1;
    }
    if (prompt.match(/test|testing|spec/i)) {
      features.push("testing");
      complexityScore += 1;
    }
    if (tokens > 500) complexityScore += 2;
    if (tokens > 1000) complexityScore += 2;
    
    let complexity: "simple" | "moderate" | "complex";
    let suggestedModel: "fast" | "balanced" | "powerful";
    
    if (complexityScore <= 2) {
      complexity = "simple";
      suggestedModel = "fast";
    } else if (complexityScore <= 5) {
      complexity = "moderate";
      suggestedModel = "balanced";
    } else {
      complexity = "complex";
      suggestedModel = "powerful";
    }
    
    return { complexity, suggestedModel, estimatedTokens: tokens, features };
  }

  destroy(): void {
    this.modelProfiles.clear();
    this.log("LocalModelOptimizerService destroyed");
  }
}

export const localModelOptimizerService = LocalModelOptimizerService.getInstance();
