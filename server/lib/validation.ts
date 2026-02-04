import { z } from "zod";
import { Request, Response, NextFunction } from "express";

export const projectIdSchema = z.object({
  id: z.string().uuid("Invalid project ID format"),
});

export const createProjectSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  messages: z.array(z.any()).optional(),
  generatedCode: z.string().optional(),
  generatedFiles: z.array(z.any()).optional(),
});

export const llmSettingsSchema = z.object({
  endpoint: z.string().url("Invalid endpoint URL").optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  useDualModels: z.boolean().optional(),
  plannerModel: z.string().optional(),
  builderModel: z.string().optional(),
  plannerTemperature: z.number().min(0).max(2).optional(),
  builderTemperature: z.number().min(0).max(2).optional(),
  webSearchEnabled: z.boolean().optional(),
  serperApiKey: z.string().optional(),
});

export const generateRequestSchema = z.object({
  prompt: z.string().min(1, "Prompt is required").max(10000, "Prompt too long"),
  settings: llmSettingsSchema.optional(),
  existingCode: z.string().optional(),
  projectId: z.string().uuid().optional(),
});

export const fileOperationSchema = z.object({
  path: z.string().min(1, "Path is required").max(500, "Path too long"),
  content: z.string().optional(),
});

export const versionSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export function validateBody<T extends z.ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    
    if (!result.success) {
      const errors = result.error.errors.map(e => ({
        path: e.path.join("."),
        message: e.message,
      }));
      
      return res.status(400).json({
        error: "Validation failed",
        details: errors,
      });
    }
    
    req.body = result.data;
    next();
  };
}

export function validateParams<T extends z.ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    
    if (!result.success) {
      const errors = result.error.errors.map(e => ({
        path: e.path.join("."),
        message: e.message,
      }));
      
      return res.status(400).json({
        error: "Invalid parameters",
        details: errors,
      });
    }
    
    next();
  };
}

export function validateQuery<T extends z.ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    
    if (!result.success) {
      const errors = result.error.errors.map(e => ({
        path: e.path.join("."),
        message: e.message,
      }));
      
      return res.status(400).json({
        error: "Invalid query parameters",
        details: errors,
      });
    }
    
    next();
  };
}
