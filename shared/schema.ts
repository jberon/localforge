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

export const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  timestamp: z.number(),
  attachments: z.array(messageAttachmentSchema).optional(),
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
  useDualModels: z.boolean().default(false),
  plannerModel: z.string().default(""),
  plannerTemperature: z.number().min(0).max(2).default(0.3),
  builderModel: z.string().default(""),
  builderTemperature: z.number().min(0).max(2).default(0.5),
  // Web search settings (Serper.dev integration)
  webSearchEnabled: z.boolean().default(false),
  serperApiKey: z.string().default(""),
  // Production mode - generates multi-file TypeScript projects with tests
  productionMode: z.boolean().default(false),
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
    id: "aria",
    name: "Aria",
    title: "Product Architect",
    role: "architect",
    avatar: "brain",
    color: "purple",
    expertise: ["system design", "architecture", "requirements analysis", "technical planning"],
    personality: "Visionary thinker who sees the big picture. Breaks complex problems into elegant solutions. Always asks 'why' before 'how'.",
    catchphrase: "Let me map out the architecture...",
    isCore: true,
    inspiration: "Steve Jobs' design philosophy meets systems thinking",
  },
  {
    id: "forge",
    name: "Forge",
    title: "Senior Engineer",
    role: "engineer",
    avatar: "hammer",
    color: "orange",
    expertise: ["React", "TypeScript", "full-stack development", "performance optimization", "clean code"],
    personality: "Pragmatic craftsman who writes elegant, maintainable code. Believes in doing things right the first time.",
    catchphrase: "Building something solid here...",
    isCore: true,
    inspiration: "John Carmack's technical excellence",
  },
  {
    id: "pixel",
    name: "Pixel",
    title: "UX Designer",
    role: "designer",
    avatar: "palette",
    color: "pink",
    expertise: ["user experience", "interface design", "accessibility", "visual hierarchy", "Tailwind CSS"],
    personality: "Empathetic designer who obsesses over every detail. Believes great design is invisible.",
    catchphrase: "Making it feel right...",
    isCore: true,
    inspiration: "Jony Ive's minimalist aesthetic",
  },
  {
    id: "scout",
    name: "Scout",
    title: "Research Analyst",
    role: "analyst",
    avatar: "search",
    color: "blue",
    expertise: ["market research", "API documentation", "competitive analysis", "trend spotting"],
    personality: "Curious investigator who finds the best solutions. Connects dots others miss.",
    catchphrase: "Let me dig into this...",
    isCore: true,
    inspiration: "Data-driven decision making",
  },
  {
    id: "sentinel",
    name: "Sentinel",
    title: "Quality Guardian",
    role: "quality",
    avatar: "shield",
    color: "green",
    expertise: ["testing", "code review", "security", "error handling", "validation"],
    personality: "Meticulous guardian who catches issues before they become problems. Nothing ships without approval.",
    catchphrase: "Running validation checks...",
    isCore: true,
    inspiration: "NASA-level quality standards",
  },
];

export const users = {} as any;
export type InsertUser = { username: string; password: string };
export type User = { id: string; username: string; password: string };
