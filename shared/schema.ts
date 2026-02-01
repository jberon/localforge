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

export const generationMetricsSchema = z.object({
  startTime: z.number(),
  endTime: z.number().optional(),
  durationMs: z.number().optional(),
  promptLength: z.number(),
  responseLength: z.number().optional(),
  status: z.enum(["pending", "streaming", "success", "error", "retrying"]),
  errorMessage: z.string().optional(),
  retryCount: z.number().default(0),
  tokenCount: z.number().optional(),
});

// Plan structure from the planning model (must be defined before projectSchema)
export const planStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  type: z.enum(["architecture", "component", "api", "database", "styling", "testing"]),
  status: z.enum(["pending", "in_progress", "completed", "skipped"]).default("pending"),
});

export const planSchema = z.object({
  id: z.string(),
  summary: z.string(),
  assumptions: z.array(z.string()).optional(),
  architecture: z.string().optional(),
  filePlan: z.array(z.object({
    path: z.string(),
    purpose: z.string(),
    dependencies: z.array(z.string()).optional(),
  })).optional(),
  dataModel: dataModelSchema.optional(),
  steps: z.array(planStepSchema),
  risks: z.array(z.string()).optional(),
  status: z.enum(["draft", "approved", "building", "completed", "failed"]).default("draft"),
  createdAt: z.number(),
  approvedAt: z.number().optional(),
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
  generationMetrics: generationMetricsSchema.optional(),
  plan: planSchema.optional(), // Current implementation plan
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

// Model settings for Plan/Build mode
export const modelConfigSchema = z.object({
  endpoint: z.string().default("http://localhost:1234/v1"),
  model: z.string().default(""),
  temperature: z.number().min(0).max(2).default(0.7),
});

export const dualModelSettingsSchema = z.object({
  mode: z.enum(["plan", "build", "auto"]).default("auto"),
  planner: modelConfigSchema.default({
    endpoint: "http://localhost:1234/v1",
    model: "",
    temperature: 0.3, // Lower for structured planning
  }),
  builder: modelConfigSchema.default({
    endpoint: "http://localhost:1234/v1",
    model: "",
    temperature: 0.5, // Medium for code generation
  }),
});

export type Message = z.infer<typeof messageSchema>;
export type Project = z.infer<typeof projectSchema>;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type LLMSettings = z.infer<typeof llmSettingsSchema>;
export type ModelConfig = z.infer<typeof modelConfigSchema>;
export type DualModelSettings = z.infer<typeof dualModelSettingsSchema>;
export type PlanStep = z.infer<typeof planStepSchema>;
export type Plan = z.infer<typeof planSchema>;
export type DataField = z.infer<typeof dataFieldSchema>;
export type DataEntity = z.infer<typeof dataEntitySchema>;
export type DataModel = z.infer<typeof dataModelSchema>;
export type GeneratedFile = z.infer<typeof generatedFileSchema>;
export type ValidationResult = z.infer<typeof validationResultSchema>;
export type GenerationMetrics = z.infer<typeof generationMetricsSchema>;

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
  generationMetrics: jsonb("generation_metrics"),
  plan: jsonb("plan"), // Current implementation plan
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

// Analytics event types
export const analyticsEventTypes = [
  "generation_started",
  "generation_completed", 
  "generation_failed",
  "template_selected",
  "project_created",
  "project_deleted",
  "code_downloaded",
  "code_refined",
  "code_edited",
  "feedback_submitted",
  "prompt_enhanced",
  "error_occurred",
] as const;

export const analyticsEventSchema = z.object({
  id: z.string(),
  type: z.enum(analyticsEventTypes),
  projectId: z.string().optional(),
  data: z.record(z.any()),
  timestamp: z.number(),
});

export const feedbackSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  rating: z.enum(["positive", "negative"]),
  comment: z.string().optional(),
  prompt: z.string(),
  generatedCode: z.string().optional(),
  templateUsed: z.string().optional(),
  timestamp: z.number(),
});

export const insightSchema = z.object({
  id: z.string(),
  type: z.enum(["pattern", "recommendation", "trend", "warning"]),
  title: z.string(),
  description: z.string(),
  actionable: z.boolean(),
  priority: z.enum(["low", "medium", "high"]),
  data: z.record(z.any()).optional(),
  generatedAt: z.number(),
  expiresAt: z.number().optional(),
});

export const analyticsOverviewSchema = z.object({
  totalGenerations: z.number(),
  successfulGenerations: z.number(),
  failedGenerations: z.number(),
  successRate: z.number(),
  averageGenerationTime: z.number(),
  templateUsage: z.record(z.number()),
  feedbackStats: z.object({
    positive: z.number(),
    negative: z.number(),
  }),
  recentTrends: z.array(z.object({
    date: z.string(),
    generations: z.number(),
    successes: z.number(),
  })),
});

export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;
export type Feedback = z.infer<typeof feedbackSchema>;
export type Insight = z.infer<typeof insightSchema>;
export type AnalyticsOverview = z.infer<typeof analyticsOverviewSchema>;
export type AnalyticsEventType = typeof analyticsEventTypes[number];

// Database tables for analytics
export const analyticsEvents = pgTable("analytics_events", {
  id: varchar("id", { length: 36 }).primaryKey(),
  type: varchar("type", { length: 50 }).notNull(),
  projectId: varchar("project_id", { length: 36 }),
  data: jsonb("data").notNull().default({}),
  timestamp: bigint("timestamp", { mode: "number" }).notNull(),
});

export const feedbacks = pgTable("feedbacks", {
  id: varchar("id", { length: 36 }).primaryKey(),
  projectId: varchar("project_id", { length: 36 }).notNull(),
  rating: varchar("rating", { length: 10 }).notNull(),
  comment: text("comment"),
  prompt: text("prompt").notNull(),
  generatedCode: text("generated_code"),
  templateUsed: varchar("template_used", { length: 100 }),
  timestamp: bigint("timestamp", { mode: "number" }).notNull(),
});

export const insights = pgTable("insights", {
  id: varchar("id", { length: 36 }).primaryKey(),
  type: varchar("type", { length: 20 }).notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  actionable: text("actionable").notNull().default("false"),
  priority: varchar("priority", { length: 10 }).notNull(),
  data: jsonb("data"),
  generatedAt: bigint("generated_at", { mode: "number" }).notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }),
});

export const insertAnalyticsEventSchema = createInsertSchema(analyticsEvents).omit({ id: true });
export const insertFeedbackSchema = createInsertSchema(feedbacks).omit({ id: true });
export const insertInsightSchema = createInsertSchema(insights).omit({ id: true });

export type AnalyticsEventDb = typeof analyticsEvents.$inferSelect;
export type FeedbackDb = typeof feedbacks.$inferSelect;
export type InsightDb = typeof insights.$inferSelect;

export const users = {} as any;
export type InsertUser = { username: string; password: string };
export type User = { id: string; username: string; password: string };
