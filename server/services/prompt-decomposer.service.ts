import { BaseService } from "../lib/base-service";

interface DecomposedStep {
  id: number;
  description: string;
  prompt: string;
  dependsOn: number[];
  estimatedComplexity: "low" | "medium" | "high";
  category: "layout" | "data" | "logic" | "styling" | "api" | "auth" | "forms" | "navigation";
}

interface DecompositionResult {
  shouldDecompose: boolean;
  complexityScore: number;
  originalPrompt: string;
  steps: DecomposedStep[];
  estimatedTokenSavings: number;
  reason: string;
}

const COMPLEXITY_SIGNALS: { pattern: RegExp; weight: number; category: string }[] = [
  { pattern: /\b(and|also|plus|with|including|additionally)\b/gi, weight: 1, category: "conjunction" },
  { pattern: /\b(login|signup|register|auth|authentication|oauth)\b/gi, weight: 3, category: "auth" },
  { pattern: /\b(database|crud|api|endpoint|backend|server)\b/gi, weight: 3, category: "api" },
  { pattern: /\b(dashboard|admin|analytics|chart|graph|metrics)\b/gi, weight: 3, category: "data" },
  { pattern: /\b(payment|stripe|checkout|subscription|billing)\b/gi, weight: 4, category: "api" },
  { pattern: /\b(upload|download|file|image|media|storage)\b/gi, weight: 2, category: "api" },
  { pattern: /\b(responsive|mobile|tablet|desktop|breakpoint)\b/gi, weight: 1, category: "styling" },
  { pattern: /\b(dark\s*mode|theme|light\s*mode|toggle)\b/gi, weight: 1, category: "styling" },
  { pattern: /\b(form|input|validation|submit|select|dropdown)\b/gi, weight: 2, category: "forms" },
  { pattern: /\b(page|route|navigate|link|sidebar|navbar|menu)\b/gi, weight: 2, category: "navigation" },
  { pattern: /\b(search|filter|sort|pagination|infinite\s*scroll)\b/gi, weight: 2, category: "logic" },
  { pattern: /\b(notification|toast|alert|modal|dialog|popup)\b/gi, weight: 1, category: "logic" },
  { pattern: /\b(drag|drop|sortable|reorder|kanban)\b/gi, weight: 3, category: "logic" },
  { pattern: /\b(real\s*time|websocket|socket|live|streaming)\b/gi, weight: 4, category: "api" },
  { pattern: /\b(animation|transition|parallax|smooth|fade)\b/gi, weight: 1, category: "styling" },
  { pattern: /\b(table|list|grid|card|gallery)\b/gi, weight: 1, category: "layout" },
  { pattern: /\b(i18n|internationalization|localization|multi.*language)\b/gi, weight: 3, category: "logic" },
  { pattern: /\b(test|testing|unit\s*test|e2e)\b/gi, weight: 2, category: "logic" },
  { pattern: /\b(email|sms|notification|push)\b/gi, weight: 2, category: "api" },
  { pattern: /\b(map|location|geolocation|gps)\b/gi, weight: 3, category: "api" },
  { pattern: /\b(then|after\s+that|next|finally|lastly|first|second|third)\b/gi, weight: 1.5, category: "sequence" },
  { pattern: /\b(separate|different|multiple|several|various|each)\b/gi, weight: 1, category: "multiplicity" },
  { pattern: /\b(integrate|connect|sync|communicate|share\s+data)\b/gi, weight: 2, category: "integration" },
];

const FEATURE_EXTRACTORS: { pattern: RegExp; category: DecomposedStep["category"]; label: string }[] = [
  { pattern: /(?:user\s+)?(?:login|signup|sign\s*up|auth(?:entication)?|registration|sign\s*in)/gi, category: "auth", label: "Authentication system" },
  { pattern: /dashboard(?:\s+(?:with|for|showing))?\s*/gi, category: "data", label: "Dashboard with data display" },
  { pattern: /(?:nav(?:bar|igation)?|sidebar|header\s*menu|top\s*menu)/gi, category: "navigation", label: "Navigation structure" },
  { pattern: /(?:contact\s+form|survey|questionnaire|registration\s+form|input\s+form)/gi, category: "forms", label: "Form component" },
  { pattern: /(?:search|filter)\s*(?:and\s*(?:filter|sort|search))?/gi, category: "logic", label: "Search/filter functionality" },
  { pattern: /(?:api|backend|server|endpoint|rest\s*api)/gi, category: "api", label: "API endpoints" },
  { pattern: /(?:stripe|payment|checkout|billing|subscription)\s*(?:integration|system|flow|page)?/gi, category: "api", label: "Payment integration" },
  { pattern: /(?:product\s+)?(?:catalog|listing|gallery|collection)/gi, category: "layout", label: "Product catalog/listing" },
  { pattern: /shopping\s*cart/gi, category: "logic", label: "Shopping cart" },
  { pattern: /order\s*(?:history|tracking|management)/gi, category: "data", label: "Order management" },
  { pattern: /admin\s*(?:panel|dashboard|page|section)/gi, category: "data", label: "Admin panel" },
  { pattern: /(?:dark\s*mode|theme\s*toggle|light.*dark)/gi, category: "styling", label: "Dark mode / theme support" },
  { pattern: /(?:drag|drop|sortable|reorder|kanban)/gi, category: "logic", label: "Drag and drop functionality" },
  { pattern: /(?:chart|graph|visualization|analytics)\s*(?:chart|display|view)?/gi, category: "data", label: "Data visualization" },
  { pattern: /(?:email|sms)\s*(?:notification|alert|update)/gi, category: "api", label: "Email/SMS notifications" },
  { pattern: /(?:upload|file|image)\s*(?:upload|picker|selector|management)/gi, category: "api", label: "File upload handling" },
  { pattern: /(?:real\s*time|live\s*update|websocket)/gi, category: "api", label: "Real-time updates" },
  { pattern: /(?:user\s+)?(?:profile|account|settings)\s*(?:page|section)?/gi, category: "forms", label: "User profile/settings" },
  { pattern: /(?:comment|review|rating|feedback)\s*(?:system|section)?/gi, category: "logic", label: "Comments/reviews system" },
  { pattern: /(?:blog|post|article|content)\s*(?:system|management|editor)?/gi, category: "data", label: "Content management" },
];

const DECOMPOSITION_THRESHOLD = 8;

class PromptDecomposerService extends BaseService {
  private static instance: PromptDecomposerService;

  private constructor() {
    super("PromptDecomposerService");
  }

  static getInstance(): PromptDecomposerService {
    if (!PromptDecomposerService.instance) {
      PromptDecomposerService.instance = new PromptDecomposerService();
    }
    return PromptDecomposerService.instance;
  }

  analyzeComplexity(prompt: string): { score: number; categories: string[]; featureCount: number } {
    let score = 0;
    const categories = new Set<string>();

    for (const signal of COMPLEXITY_SIGNALS) {
      const regex = new RegExp(signal.pattern.source, signal.pattern.flags);
      const matches = prompt.match(regex);
      if (matches) {
        score += matches.length * signal.weight;
        categories.add(signal.category);
      }
    }

    const features = this.extractFeatures(prompt);
    score += features.length * 2;

    const sentenceCount = prompt.split(/[.!?\n]/).filter(s => s.trim().length > 10).length;
    if (sentenceCount > 3) score += (sentenceCount - 3);

    const wordCount = prompt.split(/\s+/).length;
    if (wordCount > 50) score += Math.floor((wordCount - 50) / 20);

    return {
      score,
      categories: Array.from(categories),
      featureCount: features.length,
    };
  }

  decompose(prompt: string): DecompositionResult {
    const analysis = this.analyzeComplexity(prompt);

    if (analysis.score < DECOMPOSITION_THRESHOLD) {
      return {
        shouldDecompose: false,
        complexityScore: analysis.score,
        originalPrompt: prompt,
        steps: [],
        estimatedTokenSavings: 0,
        reason: `Complexity score ${analysis.score} below threshold ${DECOMPOSITION_THRESHOLD}`,
      };
    }

    const features = this.extractFeatures(prompt);
    const steps = this.buildSteps(prompt, features);

    if (steps.length <= 1) {
      return {
        shouldDecompose: false,
        complexityScore: analysis.score,
        originalPrompt: prompt,
        steps: [],
        estimatedTokenSavings: 0,
        reason: "Only one feature detected, no decomposition needed",
      };
    }

    const estimatedTokenSavings = Math.floor(prompt.length * 0.3 * (steps.length - 1));

    this.log("Prompt decomposed", {
      complexityScore: analysis.score,
      stepCount: steps.length,
      categories: analysis.categories,
      estimatedTokenSavings,
    });

    const result: DecompositionResult = {
      shouldDecompose: true,
      complexityScore: analysis.score,
      originalPrompt: prompt,
      steps,
      estimatedTokenSavings,
      reason: `Complexity score ${analysis.score} with ${steps.length} distinct features`,
    };

    if (analysis.score >= 15) {
      const optimized = this.optimizeForContextWindow(result, 8192);
      return optimized;
    }

    return result;
  }

  buildSequentialPrompts(decomposition: DecompositionResult, existingCode?: string): string[] {
    if (!decomposition.shouldDecompose) return [decomposition.originalPrompt];

    const prompts: string[] = [];

    for (let i = 0; i < decomposition.steps.length; i++) {
      const step = decomposition.steps[i];
      let prompt = "";

      if (i === 0) {
        prompt = `Build the foundation for the following application. Focus ONLY on: ${step.description}\n\n`;
        prompt += `Full app context (for reference only, don't build everything): ${decomposition.originalPrompt}\n\n`;
        prompt += `For this step, implement ONLY: ${step.prompt}\n`;
        prompt += `Create a clean, working foundation that other features can be added to later.`;
      } else {
        prompt = `Add the following feature to the existing code. Focus ONLY on: ${step.description}\n\n`;
        prompt += step.prompt + "\n";
        prompt += `IMPORTANT: Preserve ALL existing functionality. Only ADD the new feature.\n`;
        prompt += `Do not remove or restructure existing code unless absolutely necessary.`;
      }

      prompts.push(prompt);
    }

    return prompts;
  }

  private extractFeatures(prompt: string): { category: DecomposedStep["category"]; label: string; match: string }[] {
    const features: { category: DecomposedStep["category"]; label: string; match: string }[] = [];
    const seen = new Set<string>();

    for (const extractor of FEATURE_EXTRACTORS) {
      const regex = new RegExp(extractor.pattern.source, extractor.pattern.flags);
      const match = regex.exec(prompt);
      if (match && !seen.has(extractor.label)) {
        seen.add(extractor.label);
        features.push({
          category: extractor.category,
          label: extractor.label,
          match: match[0],
        });
      }
    }

    return features;
  }

  private buildSteps(prompt: string, features: { category: DecomposedStep["category"]; label: string; match: string }[]): DecomposedStep[] {
    if (features.length === 0) return [];

    const categoryOrder: DecomposedStep["category"][] = [
      "layout", "navigation", "data", "forms", "logic", "auth", "api", "styling",
    ];

    features.sort((a, b) => {
      const aIdx = categoryOrder.indexOf(a.category);
      const bIdx = categoryOrder.indexOf(b.category);
      return aIdx - bIdx;
    });

    const steps: DecomposedStep[] = [];

    for (let i = 0; i < features.length; i++) {
      const feature = features[i];
      const dependsOn: number[] = [];

      if (i > 0) dependsOn.push(i);

      if (feature.category === "auth" || feature.category === "api") {
        const layoutStep = steps.find(s => s.category === "layout" || s.category === "navigation");
        if (layoutStep && !dependsOn.includes(layoutStep.id)) {
          dependsOn.push(layoutStep.id);
        }
      }

      steps.push({
        id: i + 1,
        description: feature.label,
        prompt: this.buildStepPrompt(feature, prompt),
        dependsOn,
        estimatedComplexity: this.estimateStepComplexity(feature.category),
        category: feature.category,
      });
    }

    return steps;
  }

  private buildStepPrompt(feature: { category: DecomposedStep["category"]; label: string; match: string }, originalPrompt: string): string {
    const context = this.extractRelevantContext(originalPrompt, feature.match);
    return `${feature.label}: ${context}`;
  }

  private extractRelevantContext(prompt: string, matchText: string): string {
    const idx = prompt.toLowerCase().indexOf(matchText.toLowerCase());
    if (idx === -1) return matchText;

    const start = Math.max(0, prompt.lastIndexOf(".", idx - 1) + 1);
    const end = Math.min(prompt.length, prompt.indexOf(".", idx + matchText.length) + 1 || prompt.length);

    return prompt.slice(start, end).trim() || matchText;
  }

  estimateContextWindow(step: DecomposedStep): number {
    const baseTokens = Math.ceil(step.prompt.length / 3.5);
    const categoryMultiplier: Record<string, number> = {
      layout: 1.2,
      navigation: 1.3,
      data: 1.5,
      forms: 1.4,
      logic: 1.6,
      auth: 2.0,
      api: 1.8,
      styling: 1.0,
    };
    const complexityMultiplier = step.estimatedComplexity === "high" ? 2.5 : step.estimatedComplexity === "medium" ? 1.5 : 1.0;
    const multiplier = (categoryMultiplier[step.category] || 1.3) * complexityMultiplier;
    return Math.ceil(baseTokens * multiplier);
  }

  optimizeForContextWindow(decomposition: DecompositionResult, maxContextTokens: number = 8192): DecompositionResult {
    if (!decomposition.shouldDecompose) return decomposition;

    const optimizedSteps: DecomposedStep[] = [];
    let mergeBuffer: DecomposedStep[] = [];
    let mergeTokens = 0;

    for (const step of decomposition.steps) {
      const estimatedTokens = this.estimateContextWindow(step);

      if (estimatedTokens > maxContextTokens * 0.7) {
        if (mergeBuffer.length > 0) {
          optimizedSteps.push(this.mergeSteps(mergeBuffer));
          mergeBuffer = [];
          mergeTokens = 0;
        }
        const subSteps = this.splitLargeStep(step, maxContextTokens);
        optimizedSteps.push(...subSteps);
      } else if (mergeTokens + estimatedTokens < maxContextTokens * 0.5 &&
                 mergeBuffer.length > 0 &&
                 step.estimatedComplexity === "low" &&
                 mergeBuffer[mergeBuffer.length - 1].estimatedComplexity === "low") {
        mergeBuffer.push(step);
        mergeTokens += estimatedTokens;
      } else {
        if (mergeBuffer.length > 0) {
          optimizedSteps.push(this.mergeSteps(mergeBuffer));
          mergeBuffer = [];
          mergeTokens = 0;
        }
        mergeBuffer.push(step);
        mergeTokens = estimatedTokens;
      }
    }

    if (mergeBuffer.length > 0) {
      optimizedSteps.push(this.mergeSteps(mergeBuffer));
    }

    optimizedSteps.forEach((step, idx) => {
      step.id = idx + 1;
      step.dependsOn = idx > 0 ? [idx] : [];
    });

    this.log("Context window optimization", {
      originalSteps: decomposition.steps.length,
      optimizedSteps: optimizedSteps.length,
      maxContextTokens,
    });

    return {
      ...decomposition,
      steps: optimizedSteps,
      estimatedTokenSavings: decomposition.estimatedTokenSavings * 1.2,
      reason: `${decomposition.reason} (optimized for ${maxContextTokens} token context window)`,
    };
  }

  private mergeSteps(steps: DecomposedStep[]): DecomposedStep {
    if (steps.length === 1) return steps[0];
    return {
      id: steps[0].id,
      description: steps.map(s => s.description).join(" + "),
      prompt: steps.map(s => s.prompt).join("\n\nAlso implement: "),
      dependsOn: steps[0].dependsOn,
      estimatedComplexity: steps.some(s => s.estimatedComplexity === "high") ? "high" :
                            steps.some(s => s.estimatedComplexity === "medium") ? "medium" : "low",
      category: steps[0].category,
    };
  }

  private splitLargeStep(step: DecomposedStep, maxTokens: number): DecomposedStep[] {
    const subSteps: DecomposedStep[] = [
      {
        ...step,
        id: step.id,
        description: `${step.description} - Structure & Layout`,
        prompt: `Set up the basic structure and layout for: ${step.prompt}. Focus only on the HTML/JSX structure and component hierarchy. Don't implement business logic yet.`,
        estimatedComplexity: "medium",
      },
      {
        ...step,
        id: step.id + 1,
        description: `${step.description} - Logic & Integration`,
        prompt: `Add logic, state management, and integration for: ${step.prompt}. The structure is already in place, now add the interactive behavior, API calls, and data flow.`,
        dependsOn: [step.id],
        estimatedComplexity: step.estimatedComplexity,
      },
    ];
    return subSteps;
  }

  private estimateStepComplexity(category: DecomposedStep["category"]): "low" | "medium" | "high" {
    switch (category) {
      case "styling": return "low";
      case "layout":
      case "navigation": return "low";
      case "forms":
      case "logic":
      case "data": return "medium";
      case "auth":
      case "api": return "high";
      default: return "medium";
    }
  }

  destroy(): void {
    this.log("PromptDecomposerService destroyed");
  }
}

export const promptDecomposerService = PromptDecomposerService.getInstance();
