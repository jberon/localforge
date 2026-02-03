import { z } from "zod";

export const taskSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  type: z.enum(["plan", "build", "fix", "search", "validate"]).optional(),
});

export const planResponseSchema = z.object({
  summary: z.string().optional(),
  architecture: z.string().optional(),
  searchNeeded: z.boolean().optional(),
  searchQueries: z.array(z.string()).optional(),
  tasks: z.array(taskSchema).optional(),
});

export type PlanResponse = z.infer<typeof planResponseSchema>;

export const businessCaseFeatureSchema = z.object({
  name: z.string(),
  description: z.string(),
  priority: z.enum(["must-have", "should-have", "nice-to-have"]).optional(),
});

export const businessCaseResponseSchema = z.object({
  appName: z.string().optional(),
  tagline: z.string().optional(),
  problemStatement: z.string().optional(),
  targetAudience: z.string().optional(),
  valueProposition: z.string().optional(),
  industry: z.string().optional(),
  competitors: z.array(z.string()).optional(),
  differentiators: z.array(z.string()).optional(),
  coreFeatures: z.array(businessCaseFeatureSchema).optional(),
  futureFeatures: z.array(z.string()).optional(),
  techStack: z.array(z.string()).optional(),
  monetization: z.string().optional(),
  pricingModel: z.string().optional(),
});

export type BusinessCaseResponse = z.infer<typeof businessCaseResponseSchema>;

export const specialistSchema = z.object({
  name: z.string(),
  title: z.string(),
  expertise: z.array(z.string()).optional(),
  personality: z.string().optional(),
  catchphrase: z.string().optional(),
  reasoning: z.string().optional(),
});

export const specialistAnalysisResponseSchema = z.object({
  needsSpecialists: z.boolean(),
  specialists: z.array(specialistSchema).optional(),
  teamStrategy: z.string().optional(),
});

export type SpecialistAnalysisResponse = z.infer<typeof specialistAnalysisResponseSchema>;

export const diagnosisResponseSchema = z.object({
  errors: z.array(z.object({
    cause: z.string(),
    fix: z.string(),
    designFlaw: z.string().optional(),
  })).optional(),
  summary: z.string().optional(),
});

export type DiagnosisResponse = z.infer<typeof diagnosisResponseSchema>;

export function validateLLMResponse<T>(
  response: unknown,
  schema: z.ZodType<T>,
  fallback?: T
): { success: true; data: T } | { success: false; error: string; fallback?: T } {
  const result = schema.safeParse(response);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  const errorMessage = result.error.issues
    .map(issue => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  
  if (fallback !== undefined) {
    return { success: false, error: errorMessage, fallback };
  }
  
  return { success: false, error: errorMessage };
}

export function extractAndValidateJSON<T>(
  text: string,
  schema: z.ZodType<T>,
): { success: true; data: T } | { success: false; error: string } {
  const jsonPatterns = [
    /```json\s*([\s\S]*?)```/,
    /```\s*([\s\S]*?)```/,
    /(\{[\s\S]*\})/,
    /(\[[\s\S]*\])/,
  ];

  let jsonStr = text;
  for (const pattern of jsonPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      jsonStr = match[1].trim();
      break;
    }
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return validateLLMResponse(parsed, schema);
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof SyntaxError 
        ? `JSON parse error: ${error.message}` 
        : `Unexpected error: ${String(error)}` 
    };
  }
}
