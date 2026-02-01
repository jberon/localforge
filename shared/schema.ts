import { z } from "zod";
import { pgTable, text, varchar, bigint, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  timestamp: z.number(),
});

export const dataFieldSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["text", "number", "boolean", "date", "email", "url", "textarea"]),
  required: z.boolean(),
  defaultValue: z.string().optional(),
});

export const dataEntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  fields: z.array(dataFieldSchema),
});

export const dataModelSchema = z.object({
  entities: z.array(dataEntitySchema),
  enableDatabase: z.boolean(),
});

export const generatedFileSchema = z.object({
  path: z.string(),
  content: z.string(),
});

export const validationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
});

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  messages: z.array(messageSchema),
  generatedCode: z.string().optional(),
  generatedFiles: z.array(generatedFileSchema).optional(),
  dataModel: dataModelSchema.optional(),
  lastPrompt: z.string().optional(),
  validation: validationResultSchema.optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const insertProjectSchema = projectSchema.omit({ id: true, createdAt: true, updatedAt: true });
export const insertMessageSchema = messageSchema.omit({ id: true, timestamp: true });

export const llmSettingsSchema = z.object({
  endpoint: z.string().default("http://localhost:1234/v1"),
  model: z.string().default(""),
  temperature: z.number().min(0).max(2).default(0.7),
});

export type Message = z.infer<typeof messageSchema>;
export type Project = z.infer<typeof projectSchema>;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type LLMSettings = z.infer<typeof llmSettingsSchema>;
export type DataField = z.infer<typeof dataFieldSchema>;
export type DataEntity = z.infer<typeof dataEntitySchema>;
export type DataModel = z.infer<typeof dataModelSchema>;
export type GeneratedFile = z.infer<typeof generatedFileSchema>;
export type ValidationResult = z.infer<typeof validationResultSchema>;

// Database table for persistent project storage
export const projects = pgTable("projects", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  messages: jsonb("messages").notNull().default([]),
  generatedCode: text("generated_code"),
  generatedFiles: jsonb("generated_files").default([]),
  dataModel: jsonb("data_model"),
  lastPrompt: text("last_prompt"),
  validation: jsonb("validation"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const insertProjectDbSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ProjectDb = typeof projects.$inferSelect;
export type InsertProjectDb = z.infer<typeof insertProjectDbSchema>;

export const users = {} as any;
export type InsertUser = { username: string; password: string };
export type User = { id: string; username: string; password: string };
