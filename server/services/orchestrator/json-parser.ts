import { z } from "zod";
import { logger } from "../../lib/logger";

export function safeParseJSON<T>(
  text: string,
  schema?: z.ZodType<T>,
  fallback?: T
): { success: true; data: T } | { success: false; error: string } {
  try {
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

    const parsed = JSON.parse(jsonStr);
    
    if (schema) {
      const result = schema.safeParse(parsed);
      if (!result.success) {
        return { 
          success: false, 
          error: `Schema validation failed: ${result.error.message}` 
        };
      }
      return { success: true, data: result.data };
    }

    return { success: true, data: parsed as T };
  } catch (error) {
    const errorMsg = error instanceof SyntaxError 
      ? `JSON parse error: ${error.message}` 
      : `Unexpected error: ${String(error)}`;
    
    if (fallback !== undefined) {
      logger.warn("JSON parse failed, using fallback", { error: errorMsg });
      return { success: true, data: fallback };
    }
    
    return { success: false, error: errorMsg };
  }
}
