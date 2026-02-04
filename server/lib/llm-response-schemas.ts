import { z } from "zod";

export const llmTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  type: z.enum(["plan", "build", "refine", "test", "review", "design"]).default("build"),
  status: z.enum(["pending", "in_progress", "completed", "failed"]).default("pending"),
  fileTarget: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
});

export const llmPlanResponseSchema = z.object({
  summary: z.string(),
  architecture: z.string().optional(),
  qualityProfile: z.enum(["prototype", "demo", "production"]).default("demo"),
  designNotes: z.string().optional(),
  stackProfile: z.string().optional(),
  searchNeeded: z.boolean().default(false),
  searchQueries: z.array(z.string()).optional(),
  tasks: z.array(llmTaskSchema),
});

export const llmCodeBlockSchema = z.object({
  path: z.string(),
  content: z.string(),
  type: z.enum(["component", "hook", "service", "test", "config", "readme", "style"]).optional(),
});

export const llmBuildResponseSchema = z.object({
  files: z.array(llmCodeBlockSchema).optional(),
  explanation: z.string().optional(),
});

export const llmReviewResponseSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.string()).default([]),
  issues: z.array(z.object({
    severity: z.enum(["high", "medium", "low"]).default("low"),
    file: z.string().optional(),
    description: z.string(),
  })).default([]),
  recommendations: z.array(z.string()).default([]),
});

export const llmRefineResponseSchema = z.object({
  changes: z.array(z.object({
    file: z.string(),
    action: z.enum(["modify", "add", "delete"]),
    content: z.string().optional(),
    reason: z.string().optional(),
  })),
  summary: z.string().optional(),
});

export const llmQuestionResponseSchema = z.object({
  answer: z.string(),
  followUp: z.array(z.string()).optional(),
  codeExample: z.string().optional(),
});

export type LLMPlanResponse = z.infer<typeof llmPlanResponseSchema>;
export type LLMBuildResponse = z.infer<typeof llmBuildResponseSchema>;
export type LLMReviewResponse = z.infer<typeof llmReviewResponseSchema>;
export type LLMRefineResponse = z.infer<typeof llmRefineResponseSchema>;
export type LLMQuestionResponse = z.infer<typeof llmQuestionResponseSchema>;
export type LLMTask = z.infer<typeof llmTaskSchema>;

export interface SafeParseResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  raw?: unknown;
}

export function extractJSON(text: string): string | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? jsonMatch[0] : null;
}

export function safeParseJSON<T>(
  text: string,
  schema: z.ZodSchema<T>,
  options: { extractFromText?: boolean } = { extractFromText: true }
): SafeParseResult<T> {
  try {
    let jsonStr = text;
    
    if (options.extractFromText) {
      const extracted = extractJSON(text);
      if (!extracted) {
        return {
          success: false,
          error: "No JSON object found in response",
          raw: text,
        };
      }
      jsonStr = extracted;
    }

    const parsed = JSON.parse(jsonStr);
    const result = schema.safeParse(parsed);

    if (result.success) {
      return {
        success: true,
        data: result.data,
      };
    }

    return {
      success: false,
      error: result.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; "),
      raw: parsed,
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "JSON parse error",
      raw: text,
    };
  }
}

export function parsePlanResponse(text: string): SafeParseResult<LLMPlanResponse> {
  const result = safeParseJSON(text, llmPlanResponseSchema);
  if (result.success && result.data) {
    const data = result.data;
    const normalizedData: LLMPlanResponse = {
      summary: data.summary,
      qualityProfile: data.qualityProfile ?? "demo",
      searchNeeded: data.searchNeeded ?? false,
      architecture: data.architecture,
      designNotes: data.designNotes,
      stackProfile: data.stackProfile,
      searchQueries: data.searchQueries,
      tasks: (data.tasks || []).map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        type: t.type ?? "build",
        status: t.status ?? "pending",
        fileTarget: t.fileTarget,
        dependencies: t.dependencies,
      })),
    };
    return { success: true, data: normalizedData };
  }
  return result as SafeParseResult<LLMPlanResponse>;
}

export function parseReviewResponse(text: string): SafeParseResult<LLMReviewResponse> {
  const result = safeParseJSON(text, llmReviewResponseSchema);
  if (result.success && result.data) {
    const data = result.data;
    const normalizedData: LLMReviewResponse = {
      summary: data.summary,
      strengths: data.strengths ?? [],
      issues: (data.issues ?? []).map(i => ({
        severity: i.severity ?? "low",
        file: i.file,
        description: i.description,
      })),
      recommendations: data.recommendations ?? [],
    };
    return { success: true, data: normalizedData };
  }
  return result as SafeParseResult<LLMReviewResponse>;
}

export function parseRefineResponse(text: string): SafeParseResult<LLMRefineResponse> {
  return safeParseJSON(text, llmRefineResponseSchema);
}
