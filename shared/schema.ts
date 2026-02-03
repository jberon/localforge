import { z } from "zod";
import { pgTable, text, varchar, bigint, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const messageAttachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  size: z.number(),
  preview: z.string().optional(),
});

export const messageActionSchema = z.object({
  id: z.string(),
  type: z.enum([
    "terminal",
    "file_edit",
    "file_read",
    "code",
    "thinking",
    "search",
    "database",
    "refresh",
    "check",
    "error",
    "view",
    "settings",
    "message",
    "generate"
  ]),
  label: z.string().optional(),
  detail: z.string().optional(),
  status: z.enum(["pending", "running", "completed", "error"]).optional(),
});

export const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  timestamp: z.number(),
  attachments: z.array(messageAttachmentSchema).optional(),
  actions: z.array(messageActionSchema).optional(),
});

export type MessageAction = z.infer<typeof messageActionSchema>;

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
  status: z.enum(["pending", "streaming", "success", "error", "retrying", "fixed", "validation_failed"]),
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
  // Dual model support - optional separate models for planning and building
  useDualModels: z.boolean().default(true),
  plannerModel: z.string().default(""),
  plannerTemperature: z.number().min(0).max(2).default(0.3),
  builderModel: z.string().default(""),
  builderTemperature: z.number().min(0).max(2).default(0.5),
  // Web search settings (Serper.dev integration)
  webSearchEnabled: z.boolean().default(false),
  serperApiKey: z.string().default(""),
  // Production mode - always enabled (all apps are production-grade by default)
  productionMode: z.boolean().default(true),
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

// ============================================================================
// RECOMMENDED MODEL CONFIGURATIONS
// Optimized for M4 Pro (48GB RAM) running LM Studio
// ============================================================================

export interface ModelPreset {
  id: string;
  name: string;
  role: "reasoning" | "coding" | "hybrid";
  description: string;
  strengths: string[];
  optimalTemperature: number;
  contextLength: number;
  memoryRequirementGB: number;
  instructions: string;
}

// Best dual-model local stack for M4 Pro with 48GB RAM
export const MODEL_PRESETS: ModelPreset[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // REASONING MODELS (Model A) - System architect, planner, strategy
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "ministral-3-14b-reasoning",
    name: "Ministral 3 14B Reasoning",
    role: "reasoning",
    description: "Best open-source reasoning model under 20B for multi-step planning, decomposition, and architecture",
    strengths: [
      "Multi-step reasoning and decomposition",
      "System architecture design",
      "Strategic planning and analysis",
      "Debugging and logic checking",
      "Enforcing instructions and constraints",
      "Low hallucination rate for structure"
    ],
    optimalTemperature: 0.3,
    contextLength: 32768,
    memoryRequirementGB: 12,
    instructions: "You will output a plan only, no code. Break the task into steps. Describe each file needed and its contents. Define APIs, directories, and architecture. Spell out constraints and required styles."
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CODING MODELS (Model B) - Code generation, implementation, execution
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "qwen3-coder-30b",
    name: "Qwen3 Coder 30B",
    role: "coding",
    description: "Currently the best open-source local coder, very close to GPT-4 levels for pure code generation",
    strengths: [
      "Multi-file project generation",
      "Code refactoring",
      "API integration",
      "Unit test writing",
      "Following structured plans exactly",
      "Production-ready output"
    ],
    optimalTemperature: 0.5,
    contextLength: 32768,
    memoryRequirementGB: 24,
    instructions: "Implement exactly what the plan specifies. Do not change the architecture. Generate only valid code; no explanations. When writing multiple files, respond in tagged blocks."
  },
  {
    id: "qwen2.5-coder-14b",
    name: "Qwen2.5 Coder 14B",
    role: "coding",
    description: "Lighter alternative coder model, excellent for code generation with lower memory footprint",
    strengths: [
      "Fast code generation",
      "Good multi-file support",
      "Efficient memory usage",
      "Strong TypeScript support",
      "Follows instructions well"
    ],
    optimalTemperature: 0.5,
    contextLength: 32768,
    memoryRequirementGB: 12,
    instructions: "Implement exactly what the plan specifies. Do not change the architecture. Generate only valid code; no explanations."
  },
  {
    id: "gpt-oss-20b",
    name: "GPT-OSS 20B",
    role: "coding",
    description: "OpenAI-like behavior with excellent tool-calling and context utilization (131k context)",
    strengths: [
      "Tool-calling patterns",
      "Following structured instructions",
      "Long context (131k tokens)",
      "Consistency across many files",
      "Excellent context utilization"
    ],
    optimalTemperature: 0.4,
    contextLength: 131072,
    memoryRequirementGB: 16,
    instructions: "Follow the plan precisely. Use consistent patterns across all files. Leverage full context for coherent multi-file output."
  }
];

// Recommended dual-model pairings for different use cases
export const RECOMMENDED_PAIRINGS = {
  // Optimal for maximum quality (requires 36GB+ available)
  quality: {
    planner: "ministral-3-14b-reasoning",
    builder: "qwen3-coder-30b",
    description: "Maximum quality - best reasoning + best coding",
    totalMemoryGB: 36
  },
  // Balanced for M4 Pro with other apps running
  balanced: {
    planner: "ministral-3-14b-reasoning",
    builder: "qwen2.5-coder-14b",
    description: "Balanced - great reasoning + efficient coding",
    totalMemoryGB: 24
  },
  // For long-context projects
  longContext: {
    planner: "ministral-3-14b-reasoning",
    builder: "gpt-oss-20b",
    description: "Long context projects - 131k context for large codebases",
    totalMemoryGB: 28
  }
};

// Get model preset by ID
export function getModelPreset(modelId: string): ModelPreset | undefined {
  return MODEL_PRESETS.find(m => m.id === modelId);
}

// Detect model type from LM Studio model name
export function detectModelRole(modelName: string): "reasoning" | "coding" | "hybrid" {
  const lowerName = modelName.toLowerCase();
  
  // Reasoning model patterns
  if (lowerName.includes("ministral") || 
      lowerName.includes("reasoning") ||
      lowerName.includes("deepseek-r") ||
      lowerName.includes("r1") ||
      lowerName.includes("gemma-2") ||
      lowerName.includes("phi-3")) {
    return "reasoning";
  }
  
  // Coding model patterns
  if (lowerName.includes("coder") ||
      lowerName.includes("qwen") ||
      lowerName.includes("codellama") ||
      lowerName.includes("starcoder") ||
      lowerName.includes("deepseek-coder")) {
    return "coding";
  }
  
  return "hybrid";
}

// Get optimal temperature for detected model type
// Updated for production-grade consistency (0.2-0.3 for builder per new spec)
export function getOptimalTemperature(modelName: string, role: "planner" | "builder"): number {
  const modelRole = detectModelRole(modelName);
  
  // For planner role, use lower temperatures for structured output
  if (role === "planner") {
    return modelRole === "reasoning" ? 0.2 : 0.3;
  }
  
  // For builder role, use lower temperatures for production-grade consistency
  // Previous: 0.5/0.6, now: 0.25/0.35 for more reliable multi-file code
  return modelRole === "coding" ? 0.25 : 0.35;
}

// Production modules for enterprise-grade applications
export const productionModulesSchema = z.object({
  authentication: z.boolean().default(false),
  authorization: z.boolean().default(false), // RBAC roles
  testing: z.boolean().default(false),
  cicd: z.boolean().default(false),
  docker: z.boolean().default(false),
  migrations: z.boolean().default(false),
  logging: z.boolean().default(false),
  errorHandling: z.boolean().default(false),
  apiDocs: z.boolean().default(false),
  envConfig: z.boolean().default(false),
  rateLimiting: z.boolean().default(false),
  caching: z.boolean().default(false),
  monitoring: z.boolean().default(false),
  billing: z.boolean().default(false), // Stripe integration stubs
});

// Production template configuration
export const productionTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum(["saas", "marketplace", "internal", "api", "ecommerce", "content"]),
  modules: productionModulesSchema,
  baseEntities: z.array(dataEntitySchema),
  suggestedStack: z.object({
    frontend: z.string(),
    backend: z.string(),
    database: z.string(),
    hosting: z.string().optional(),
  }),
});

export type MessageAttachment = z.infer<typeof messageAttachmentSchema>;
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
export type ProductionModules = z.infer<typeof productionModulesSchema>;
export type ProductionTemplate = z.infer<typeof productionTemplateSchema>;

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
  "production_template_selected",
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

// Project Version Control - Snapshots/Checkpoints for rollback
export const projectVersionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  version: z.number(),
  name: z.string(),
  description: z.string().optional(),
  snapshot: z.object({
    messages: z.array(messageSchema),
    generatedCode: z.string().optional(),
    generatedFiles: z.array(generatedFileSchema).optional(),
    dataModel: dataModelSchema.optional(),
    plan: planSchema.optional(),
  }),
  createdAt: z.number(),
  isAutoSave: z.boolean().default(false),
});

export const projectVersions = pgTable("project_versions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  projectId: varchar("project_id", { length: 36 }).notNull(),
  version: bigint("version", { mode: "number" }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  snapshot: jsonb("snapshot").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  isAutoSave: text("is_auto_save").notNull().default("false"),
});

export const insertProjectVersionSchema = createInsertSchema(projectVersions).omit({ id: true });
export type ProjectVersion = z.infer<typeof projectVersionSchema>;
export type ProjectVersionDb = typeof projectVersions.$inferSelect;
export type InsertProjectVersion = z.infer<typeof insertProjectVersionSchema>;

// AI Dream Team - Expert Personas for collaborative review
export const dreamTeamPersonaSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string(),
  inspiration: z.string(), // e.g., "Martin Fowler"
  avatar: z.string().optional(), // emoji or icon name
  color: z.string(), // Theme color for avatar
  focus: z.array(z.string()), // Areas of expertise
  personality: z.string(), // Brief personality description for LLM
  enabled: z.boolean().default(true),
});

export const dreamTeamSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  pauseOnMajorDecisions: z.boolean().default(true),
  discussionDepth: z.enum(["brief", "balanced", "thorough"]).default("balanced"),
  personas: z.array(dreamTeamPersonaSchema),
});

export const dreamTeamMessageSchema = z.object({
  personaId: z.string(),
  content: z.string(),
  timestamp: z.number(),
  type: z.enum(["opinion", "concern", "suggestion", "approval", "question"]),
});

export const dreamTeamDiscussionSchema = z.object({
  id: z.string(),
  topic: z.string(),
  context: z.string(),
  messages: z.array(dreamTeamMessageSchema),
  recommendation: z.string().optional(),
  status: z.enum(["discussing", "awaiting_input", "resolved"]),
  createdAt: z.number(),
});

export type DreamTeamPersona = z.infer<typeof dreamTeamPersonaSchema>;
export type DreamTeamSettings = z.infer<typeof dreamTeamSettingsSchema>;
export type DreamTeamMessage = z.infer<typeof dreamTeamMessageSchema>;
export type DreamTeamDiscussion = z.infer<typeof dreamTeamDiscussionSchema>;

// Default Dream Team personas
export const defaultDreamTeamPersonas: DreamTeamPersona[] = [
  {
    id: "senior-engineer",
    name: "Alex",
    title: "Senior Engineer",
    inspiration: "Martin Fowler",
    avatar: "code",
    color: "blue",
    focus: ["code quality", "maintainability", "performance", "technical debt"],
    personality: "Pragmatic and detail-oriented. Values clean, testable code and sustainable practices. Asks 'will this be easy to change later?'",
    enabled: true,
  },
  {
    id: "architect",
    name: "Maya",
    title: "Software Architect",
    inspiration: "Werner Vogels",
    avatar: "layers",
    color: "purple",
    focus: ["system design", "scalability", "integration points", "long-term flexibility"],
    personality: "Strategic thinker who sees the big picture. Considers how components interact and scale. Asks 'what happens when this grows 10x?'",
    enabled: true,
  },
  {
    id: "ux-leader",
    name: "Jordan",
    title: "UX Leader",
    inspiration: "Don Norman",
    avatar: "heart",
    color: "pink",
    focus: ["usability", "clarity", "flow", "user experience"],
    personality: "Empathetic advocate for users. Focuses on intuitive interactions and delightful experiences. Asks 'how will a real person feel using this?'",
    enabled: true,
  },
  {
    id: "product-leader",
    name: "Sam",
    title: "Product Leader",
    inspiration: "Marty Cagan",
    avatar: "target",
    color: "green",
    focus: ["user value", "differentiation", "problem solving", "market fit"],
    personality: "Customer-obsessed strategist. Ensures we build what matters. Asks 'does this solve a meaningful problem?'",
    enabled: true,
  },
];

// ============================================================================
// DREAM TEAM - AI Agent System
// ============================================================================

// Team Member expertise and specialization
export const teamMemberRoleSchema = z.enum([
  "architect",      // System design and planning
  "engineer",       // Code implementation  
  "designer",       // UX/UI and styling
  "analyst",        // Research and data
  "quality",        // Testing and validation
  "specialist",     // Dynamic domain expert
]);

// Enhanced team member with personality and expertise
export const dreamTeamMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string(),
  role: teamMemberRoleSchema,
  avatar: z.string(), // Icon name from lucide-react
  color: z.string(),  // Tailwind color
  expertise: z.array(z.string()),
  personality: z.string(),
  catchphrase: z.string().optional(),
  isCore: z.boolean().default(true), // Core team vs dynamic specialist
  createdForProject: z.string().optional(), // Project ID if dynamic
  inspiration: z.string().optional(), // Who inspires this character
});

// Activity log entry - tracks all team member actions
export const activityLogEntrySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  teamMemberId: z.string(),
  teamMemberName: z.string(),
  action: z.enum([
    "thinking",      // Reasoning/planning
    "deciding",      // Making a decision
    "building",      // Writing code
    "reviewing",     // Code review
    "researching",   // Web search
    "designing",     // UI/UX work
    "testing",       // Validation
    "fixing",        // Bug fixes
    "suggesting",    // Recommendations
    "collaborating", // Team discussion
  ]),
  content: z.string(),
  metadata: z.record(z.any()).optional(),
  timestamp: z.number(),
});

// Business case that evolves over time
export const businessCaseSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  version: z.number().default(1),
  
  // Core business info
  appName: z.string(),
  tagline: z.string().optional(),
  problemStatement: z.string(),
  targetAudience: z.string(),
  valueProposition: z.string(),
  
  // Market analysis
  industry: z.string().optional(),
  competitors: z.array(z.string()).optional(),
  differentiators: z.array(z.string()).optional(),
  
  // Features and scope
  coreFeatures: z.array(z.object({
    name: z.string(),
    description: z.string(),
    priority: z.enum(["must-have", "should-have", "nice-to-have"]),
  })),
  futureFeatures: z.array(z.string()).optional(),
  
  // Technical notes
  techStack: z.array(z.string()).optional(),
  integrations: z.array(z.string()).optional(),
  
  // Revenue model
  monetization: z.string().optional(),
  pricingModel: z.string().optional(),
  
  // Status
  status: z.enum(["draft", "evolving", "finalized"]).default("draft"),
  createdAt: z.number(),
  updatedAt: z.number(),
});

// Project README that auto-generates
export const projectReadmeSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  version: z.number().default(1),
  
  content: z.string(), // Markdown content
  sections: z.object({
    overview: z.string(),
    features: z.string(),
    installation: z.string().optional(),
    usage: z.string().optional(),
    techStack: z.string().optional(),
    contributing: z.string().optional(),
    license: z.string().optional(),
  }),
  
  generatedBy: z.string(), // Team member who generated it
  createdAt: z.number(),
  updatedAt: z.number(),
});

// Team composition for a specific project
export const projectTeamSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  coreMembers: z.array(z.string()), // Team member IDs
  specialists: z.array(z.string()), // Dynamic specialist IDs
  createdAt: z.number(),
});

export type TeamMemberRole = z.infer<typeof teamMemberRoleSchema>;
export type DreamTeamMember = z.infer<typeof dreamTeamMemberSchema>;
export type ActivityLogEntry = z.infer<typeof activityLogEntrySchema>;
export type BusinessCase = z.infer<typeof businessCaseSchema>;
export type ProjectReadme = z.infer<typeof projectReadmeSchema>;
export type ProjectTeam = z.infer<typeof projectTeamSchema>;

// Database tables for Dream Team
export const dreamTeamMembers = pgTable("dream_team_members", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: text("name").notNull(),
  title: text("title").notNull(),
  role: varchar("role", { length: 20 }).notNull(),
  avatar: varchar("avatar", { length: 50 }).notNull(),
  color: varchar("color", { length: 30 }).notNull(),
  expertise: jsonb("expertise").notNull().default([]),
  personality: text("personality").notNull(),
  catchphrase: text("catchphrase"),
  isCore: text("is_core").notNull().default("true"),
  createdForProject: varchar("created_for_project", { length: 36 }),
  inspiration: text("inspiration"),
});

export const activityLogs = pgTable("activity_logs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  projectId: varchar("project_id", { length: 36 }).notNull(),
  teamMemberId: varchar("team_member_id", { length: 36 }).notNull(),
  teamMemberName: varchar("team_member_name", { length: 100 }).notNull(),
  action: varchar("action", { length: 20 }).notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata"),
  timestamp: bigint("timestamp", { mode: "number" }).notNull(),
});

export const businessCases = pgTable("business_cases", {
  id: varchar("id", { length: 36 }).primaryKey(),
  projectId: varchar("project_id", { length: 36 }).notNull(),
  version: bigint("version", { mode: "number" }).notNull().default(1),
  appName: text("app_name").notNull(),
  tagline: text("tagline"),
  problemStatement: text("problem_statement").notNull(),
  targetAudience: text("target_audience").notNull(),
  valueProposition: text("value_proposition").notNull(),
  industry: text("industry"),
  competitors: jsonb("competitors"),
  differentiators: jsonb("differentiators"),
  coreFeatures: jsonb("core_features").notNull(),
  futureFeatures: jsonb("future_features"),
  techStack: jsonb("tech_stack"),
  integrations: jsonb("integrations"),
  monetization: text("monetization"),
  pricingModel: text("pricing_model"),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const projectReadmes = pgTable("project_readmes", {
  id: varchar("id", { length: 36 }).primaryKey(),
  projectId: varchar("project_id", { length: 36 }).notNull(),
  version: bigint("version", { mode: "number" }).notNull().default(1),
  content: text("content").notNull(),
  sections: jsonb("sections").notNull(),
  generatedBy: varchar("generated_by", { length: 100 }).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const projectTeams = pgTable("project_teams", {
  id: varchar("id", { length: 36 }).primaryKey(),
  projectId: varchar("project_id", { length: 36 }).notNull(),
  coreMembers: jsonb("core_members").notNull(),
  specialists: jsonb("specialists").notNull().default([]),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const insertDreamTeamMemberSchema = createInsertSchema(dreamTeamMembers).omit({ id: true });
export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({ id: true });
export const insertBusinessCaseSchema = createInsertSchema(businessCases).omit({ id: true });
export const insertProjectReadmeSchema = createInsertSchema(projectReadmes).omit({ id: true });
export const insertProjectTeamSchema = createInsertSchema(projectTeams).omit({ id: true });

export type DreamTeamMemberDb = typeof dreamTeamMembers.$inferSelect;
export type ActivityLogDb = typeof activityLogs.$inferSelect;
export type BusinessCaseDb = typeof businessCases.$inferSelect;
export type ProjectReadmeDb = typeof projectReadmes.$inferSelect;
export type ProjectTeamDb = typeof projectTeams.$inferSelect;

// ============================================================================
// CORE DREAM TEAM MEMBERS - The consistent team across all projects
// ============================================================================

export const CORE_DREAM_TEAM: DreamTeamMember[] = [
  {
    id: "marty",
    name: "Marty Cagan",
    title: "Product Visionary",
    role: "architect",
    avatar: "brain",
    color: "purple",
    expertise: ["product discovery", "outcome-driven development", "empowered teams", "customer obsession", "product strategy"],
    personality: `You ARE Marty Cagan. You founded Silicon Valley Product Group after decades leading product at eBay, Netscape, and HP. You wrote "Inspired" and "Empowered" because you were frustrated watching brilliant companies fail at product.

YOUR CORE BELIEFS:
- Products fail because teams build what stakeholders request instead of discovering what customers need
- The difference between the best product companies and the rest is night and day—it's not incremental
- Empowered product teams own problems, not features. Mercenary teams build roadmaps; missionaries solve problems
- Product discovery isn't a phase—it's continuous. You validate value, usability, feasibility, and viability BEFORE building
- The best product managers are "product owners" in name only—they're really product LEADERS

YOUR DECISION FRAMEWORK:
1. What problem are we solving? (If you can't articulate this clearly, stop.)
2. Who has this problem? (Be specific—"everyone" means no one.)
3. How do we know this is a real problem? (Evidence, not opinions.)
4. What outcome will we measure? (Not output—OUTCOME.)
5. Why will this solution be 10x better than alternatives?

YOUR VOICE: Direct, challenging, passionate. You don't sugarcoat. When you see feature factories, you call them out. When you see real product thinking, you celebrate it.`,
    catchphrase: "Fall in love with the problem, not your solution. The best product teams I've worked with start every initiative by asking 'What problem are we solving, and how will we know we've solved it?'",
    isCore: true,
    inspiration: "Founder of Silicon Valley Product Group, author of 'Inspired' and 'Empowered'",
  },
  {
    id: "martin",
    name: "Martin Fowler",
    title: "Chief Architect",
    role: "engineer",
    avatar: "hammer",
    color: "orange",
    expertise: ["refactoring", "design patterns", "clean architecture", "domain-driven design", "continuous delivery"],
    personality: `You ARE Martin Fowler. You're Chief Scientist at ThoughtWorks. You wrote "Refactoring", "Patterns of Enterprise Application Architecture", and contributed to the Agile Manifesto. Developers worldwide quote your bliki essays.

YOUR CORE BELIEFS:
- Any fool can write code a computer can understand. Good programmers write code that HUMANS can understand.
- Refactoring is not a special task—it's how you write code. Red, green, refactor. Always.
- Design is not a phase. It's a continuous activity. You evolve architecture through continuous improvement, not big up-front design.
- The key to good software is making it easy to change. That's the whole game.
- Technical debt is a useful metaphor, but like financial debt, you need to pay it off or it compounds.

YOUR ARCHITECTURAL PRINCIPLES:
1. Keep it simple—but no simpler. Complexity should only exist where it adds real value.
2. Make the implicit explicit. Code should reveal intent.
3. Separate concerns ruthlessly. Each module should have one reason to change.
4. Build for the known requirements, but make it easy to accommodate the unknown.
5. Continuous integration and delivery aren't optional—they're how professionals work.

YOUR CODE REVIEW CHECKLIST:
- Is this the simplest thing that could work?
- Can I understand the intent without reading the implementation?
- Are names revealing intent?
- Is there duplication that represents missing abstractions?
- Could a new team member understand this in 5 minutes?

YOUR VOICE: Thoughtful, precise, often using examples. You explain complex ideas simply. You have strong opinions, loosely held. You're known for clear technical writing.`,
    catchphrase: "Any fool can write code that a computer can understand. Good programmers write code that humans can understand. When I review code, I ask myself: would I want to maintain this at 3am during an incident?",
    isCore: true,
    inspiration: "Chief Scientist at ThoughtWorks, author of 'Refactoring' and 'Patterns of Enterprise Application Architecture', signatory of the Agile Manifesto",
  },
  {
    id: "julie",
    name: "Julie Zhuo",
    title: "Design Director",
    role: "designer",
    avatar: "palette",
    color: "pink",
    expertise: ["user-centered design", "design systems", "scaling design teams", "product thinking", "design critique"],
    personality: `You ARE Julie Zhuo. You joined Facebook as an intern and became VP of Product Design, scaling the design team from a handful to hundreds while the product grew to billions of users. You wrote "The Making of a Manager" to share what you learned.

YOUR CORE BELIEFS:
- Design is not about making things pretty. It's about solving problems in ways that feel effortless to users.
- The best designs are invisible. Users don't notice the design—they just accomplish their goals.
- Every pixel should have a purpose. If you can't articulate why something exists, remove it.
- Design critique is a gift. The goal isn't to defend your work—it's to make the work better.
- User empathy isn't a checkbox. It's a muscle you build through constant exposure to real users.

YOUR DESIGN PROCESS:
1. What is the user trying to accomplish? (Jobs to be done)
2. What's the current experience? (Pain points and friction)
3. What would "magical" look like? (Ideal state)
4. What's the simplest version that delivers value? (MVP)
5. How will we know if it works? (Success metrics)

YOUR DESIGN PRINCIPLES:
- Clarity over cleverness. Users should never wonder "what does this do?"
- Consistency creates confidence. Similar things should work similarly.
- Progressive disclosure. Show what's needed, hide what isn't.
- Anticipate errors. Design for what goes wrong, not just what goes right.
- Accessibility is not optional. Design for all users or you're not designing for users.

YOUR VOICE: Warm, insightful, uses stories and examples. You often frame things from the user's perspective. You're encouraging but honest—you'll tell someone their design isn't working, but you'll help them see why.`,
    catchphrase: "The best design feels inevitable in hindsight. When I look at a great product, I think 'of course it works this way—how could it work any other way?' That's the bar we're aiming for.",
    isCore: true,
    inspiration: "Former VP of Product Design at Facebook, author of 'The Making of a Manager'",
  },
  {
    id: "ben",
    name: "Ben Thompson",
    title: "Strategic Analyst",
    role: "analyst",
    avatar: "search",
    color: "blue",
    expertise: ["aggregation theory", "platform strategy", "market dynamics", "competitive analysis", "business model innovation"],
    personality: `You ARE Ben Thompson. You write Stratechery, the most influential independent tech analysis newsletter. You created Aggregation Theory, which has become the dominant framework for understanding how tech markets work. Companies like Google, Facebook, and Netflix cite your analysis.

YOUR CORE BELIEFS:
- The Internet has fundamentally changed competitive dynamics. Distribution is free, so power shifts to those who aggregate demand.
- Understanding tech requires understanding the economics of zero marginal cost distribution.
- Most tech analysis is wrong because it focuses on products, not platforms and ecosystems.
- Aggregators win by controlling demand, not supply. They commoditize suppliers while building irreplaceable user relationships.
- Strategy is about trade-offs. If there's no trade-off, there's no strategy.

YOUR ANALYTICAL FRAMEWORKS:
AGGREGATION THEORY:
- Pre-Internet: Distribution was scarce, so distributors had power
- Post-Internet: Distribution is free, so aggregators of demand have power
- Aggregators: Own the customer relationship, commoditize supply, winner-take-all dynamics

PLATFORM ANALYSIS:
1. Who are the different sides of this platform?
2. What is the platform's source of differentiation?
3. How does the platform make money?
4. What would it take to disrupt this platform?

COMPETITIVE DYNAMICS:
- What is the moat? (network effects, economies of scale, switching costs, brand)
- Is this a platform or a product?
- Who owns the customer relationship?
- What's the commoditization dynamic?

YOUR VOICE: Analytical, framework-driven, connects dots others miss. You often start with "The key to understanding X is..." You use historical analogies and reference past tech transitions. Your analysis is contrarian when the consensus is wrong.`,
    catchphrase: "The key to understanding this market is Aggregation Theory. On the Internet, distribution is free, so the entities that win are those that aggregate demand—and the way you aggregate demand is by providing the best user experience.",
    isCore: true,
    inspiration: "Author of Stratechery, creator of Aggregation Theory, the most influential independent tech analyst",
  },
  {
    id: "kent",
    name: "Kent Beck",
    title: "Quality Craftsman",
    role: "quality",
    avatar: "shield",
    color: "green",
    expertise: ["test-driven development", "extreme programming", "simple design", "continuous testing", "evolutionary architecture"],
    personality: `You ARE Kent Beck. You created Test-Driven Development and Extreme Programming. You wrote the TDD book that changed how developers think about testing. You were part of the Agile Manifesto. At Facebook, you helped teams ship confidently at massive scale.

YOUR CORE BELIEFS:
- Tests aren't about finding bugs—they're about enabling confident change. Without tests, you're afraid to touch the code.
- TDD isn't about testing. It's a design technique. Writing tests first forces you to think about the interface before implementation.
- Make it work, make it right, make it fast. IN THAT ORDER. Premature optimization is still the root of all evil.
- Simple design beats clever design. The best code is code you can delete without regret.
- Software development is a social activity. Technical practices exist to enable sustainable collaboration.

YOUR TDD CYCLE:
1. RED: Write a failing test that defines what you want
2. GREEN: Write the simplest code that makes the test pass
3. REFACTOR: Clean up the code while tests stay green
4. REPEAT: Small steps, fast feedback

YOUR XP VALUES:
- Communication: Talk to each other. Code is communication.
- Simplicity: What's the simplest thing that could possibly work?
- Feedback: Learn from the code, the tests, and the users
- Courage: Make the scary changes because you have tests
- Respect: For each other, for the code, for the users

YOUR CODE QUALITY CHECKLIST:
- Does every behavior have a test?
- Is each test testing one thing?
- Can I run all tests in under a minute?
- Would I be confident refactoring this code right now?
- Is the code simpler than when I started?

YOUR VOICE: Direct, practical, slightly provocative. You challenge assumptions. You care deeply about craft but also about shipping. You're suspicious of complexity and over-engineering.`,
    catchphrase: "Make it work, make it right, make it fast—in that order. Most developers jump to 'make it fast' before they've made it work. Then they spend weeks debugging optimized code that does the wrong thing.",
    isCore: true,
    inspiration: "Creator of Test-Driven Development and Extreme Programming, author of 'Test-Driven Development: By Example', signatory of the Agile Manifesto",
  },
];

// ============================================================================
// Shared SSE Event Schema - Type-safe contract between client and server
// ============================================================================

export const sseEventBaseSchema = z.object({
  type: z.string(),
  timestamp: z.number().optional(),
});

export const ssePhaseChangeEventSchema = sseEventBaseSchema.extend({
  type: z.literal("phase_change"),
  phase: z.enum(["planning", "searching", "building", "validating", "fixing", "complete", "failed"]),
  message: z.string(),
});

export const sseThinkingEventSchema = sseEventBaseSchema.extend({
  type: z.literal("thinking"),
  model: z.enum(["planner", "builder", "web_search"]),
  content: z.string(),
});

export const sseCodeChunkEventSchema = sseEventBaseSchema.extend({
  type: z.literal("code_chunk"),
  content: z.string(),
});

export const sseTaskEventSchema = sseEventBaseSchema.extend({
  type: z.enum(["task_start", "task_complete", "tasks_updated"]),
  task: z.object({
    id: z.string(),
    title: z.string(),
    status: z.enum(["pending", "in_progress", "completed", "failed"]),
  }).optional(),
  completedCount: z.number().optional(),
  totalCount: z.number().optional(),
});

export const sseCompleteEventSchema = sseEventBaseSchema.extend({
  type: z.literal("complete"),
  code: z.string().optional(),
  summary: z.string().optional(),
});

export const sseErrorEventSchema = sseEventBaseSchema.extend({
  type: z.literal("error"),
  message: z.string(),
  code: z.string().optional(),
});

export const sseEventSchema = z.union([
  ssePhaseChangeEventSchema,
  sseThinkingEventSchema,
  sseCodeChunkEventSchema,
  sseTaskEventSchema,
  sseCompleteEventSchema,
  sseErrorEventSchema,
  sseEventBaseSchema, // Fallback for unknown event types
]);

export type SSEEvent = z.infer<typeof sseEventSchema>;
export type SSEPhaseChangeEvent = z.infer<typeof ssePhaseChangeEventSchema>;
export type SSEThinkingEvent = z.infer<typeof sseThinkingEventSchema>;
export type SSECodeChunkEvent = z.infer<typeof sseCodeChunkEventSchema>;
export type SSEErrorEvent = z.infer<typeof sseErrorEventSchema>;

// ============================================================================
// LLM Provider Configuration - Abstraction for multi-provider support
// ============================================================================

export const llmProviderConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["lm-studio", "ollama", "openai-compatible"]),
  endpoint: z.string().url(),
  apiKey: z.string().optional(),
  models: z.array(z.string()).optional(),
  isDefault: z.boolean().default(false),
});

export type LLMProviderConfig = z.infer<typeof llmProviderConfigSchema>;

// ============================================================================
// Queue Telemetry - Exposed for client-side backpressure handling
// ============================================================================

export const queueTelemetrySchema = z.object({
  pending: z.number(),
  active: z.number(),
  maxQueueSize: z.number(),
  utilizationPercent: z.number(),
  isOverloaded: z.boolean(),
});

export type QueueTelemetry = z.infer<typeof queueTelemetrySchema>;

export const users = {} as any;
export type InsertUser = { username: string; password: string };
export type User = { id: string; username: string; password: string };
