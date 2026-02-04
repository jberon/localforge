import { db as dbInstance } from "../db";

function getDb() {
  if (!dbInstance) {
    throw new Error("Database not initialized. Check DATABASE_URL environment variable.");
  }
  return dbInstance;
}
import { generationChunks, estimateTokens, CONTEXT_LIMITS } from "@shared/schema";
import { eq, and, inArray, asc, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import logger from "../lib/logger";

export interface ChunkCreateInput {
  projectId: string;
  pipelineId?: string;
  parentChunkId?: string;
  type: "architecture" | "schema" | "component" | "api" | "styling" | "testing" | "documentation" | "integration" | "refactor";
  title: string;
  description: string;
  prompt: string;
  targetFiles: string[];
  dependencies?: string[];
  contextFiles?: string[];
  priority?: number;
  estimatedTokens?: number;
}

export interface TaskDecomposition {
  chunks: ChunkCreateInput[];
  estimatedTotalTokens: number;
  suggestedOrder: string[];
  parallelGroups: string[][];
}

const CHUNK_TYPE_PRIORITY: Record<string, number> = {
  architecture: 100,
  schema: 90,
  api: 80,
  component: 70,
  styling: 60,
  integration: 50,
  testing: 40,
  documentation: 30,
  refactor: 20,
};

export class ChunkService {
  async createChunk(input: ChunkCreateInput): Promise<string> {
    const id = uuidv4();
    const now = Date.now();
    const priority = input.priority ?? CHUNK_TYPE_PRIORITY[input.type] ?? 0;

    await getDb().insert(generationChunks).values({
      id,
      projectId: input.projectId,
      pipelineId: input.pipelineId || null,
      parentChunkId: input.parentChunkId || null,
      type: input.type,
      title: input.title,
      description: input.description,
      prompt: input.prompt,
      targetFiles: input.targetFiles,
      dependencies: input.dependencies || [],
      contextFiles: input.contextFiles || [],
      status: "pending",
      priority,
      estimatedTokens: input.estimatedTokens || estimateTokens(input.prompt),
      createdAt: now,
    });

    logger.info("Chunk created", { id, type: input.type, title: input.title });
    return id;
  }

  async createChunks(inputs: ChunkCreateInput[]): Promise<string[]> {
    const ids: string[] = [];
    for (const input of inputs) {
      const id = await this.createChunk(input);
      ids.push(id);
    }
    return ids;
  }

  async getChunk(id: string): Promise<typeof generationChunks.$inferSelect | null> {
    const result = await getDb().select().from(generationChunks).where(eq(generationChunks.id, id)).limit(1);
    return result[0] || null;
  }

  async getPipelineChunks(pipelineId: string): Promise<typeof generationChunks.$inferSelect[]> {
    return await getDb()
      .select()
      .from(generationChunks)
      .where(eq(generationChunks.pipelineId, pipelineId))
      .orderBy(desc(generationChunks.priority), asc(generationChunks.createdAt));
  }

  async getProjectChunks(projectId: string): Promise<typeof generationChunks.$inferSelect[]> {
    return await getDb()
      .select()
      .from(generationChunks)
      .where(eq(generationChunks.projectId, projectId))
      .orderBy(desc(generationChunks.priority), asc(generationChunks.createdAt));
  }

  async updateChunkStatus(id: string, status: "pending" | "in_progress" | "completed" | "failed" | "skipped", result?: { filesCreated: string[]; filesModified: string[]; errors: string[] }): Promise<void> {
    const updates: Record<string, unknown> = { status };
    if (status === "in_progress") updates.startedAt = Date.now();
    if (status === "completed" || status === "failed") {
      updates.completedAt = Date.now();
      if (result) updates.result = result;
    }
    await getDb().update(generationChunks).set(updates).where(eq(generationChunks.id, id));
  }

  async setChunkOutput(id: string, output: string, actualTokens?: number): Promise<void> {
    await getDb().update(generationChunks).set({
      output,
      actualTokens: actualTokens || estimateTokens(output),
    }).where(eq(generationChunks.id, id));
  }

  async incrementRetry(id: string): Promise<number> {
    const chunk = await this.getChunk(id);
    if (!chunk) throw new Error("Chunk not found");
    const newCount = chunk.retryCount + 1;
    await getDb().update(generationChunks).set({ retryCount: newCount }).where(eq(generationChunks.id, id));
    return newCount;
  }

  async getNextPendingChunk(pipelineId: string): Promise<typeof generationChunks.$inferSelect | null> {
    const pendingChunks = await getDb()
      .select()
      .from(generationChunks)
      .where(and(eq(generationChunks.pipelineId, pipelineId), eq(generationChunks.status, "pending")))
      .orderBy(desc(generationChunks.priority), asc(generationChunks.createdAt));

    for (const chunk of pendingChunks) {
      const deps = chunk.dependencies as string[];
      if (deps.length === 0) return chunk;
      const depChunks = await getDb()
        .select({ status: generationChunks.status })
        .from(generationChunks)
        .where(inArray(generationChunks.id, deps));
      const allComplete = depChunks.every((c: { status: string | null }) => c.status === "completed");
      if (allComplete) return chunk;
    }

    return null;
  }

  async getParallelReadyChunks(pipelineId: string, maxConcurrent: number = 3): Promise<typeof generationChunks.$inferSelect[]> {
    const result: typeof generationChunks.$inferSelect[] = [];
    const pendingChunks = await getDb()
      .select()
      .from(generationChunks)
      .where(and(eq(generationChunks.pipelineId, pipelineId), eq(generationChunks.status, "pending")))
      .orderBy(desc(generationChunks.priority), asc(generationChunks.createdAt));

    for (const chunk of pendingChunks) {
      if (result.length >= maxConcurrent) break;
      const deps = chunk.dependencies as string[];
      if (deps.length === 0) {
        result.push(chunk);
        continue;
      }
      const depChunks = await getDb()
        .select({ status: generationChunks.status })
        .from(generationChunks)
        .where(inArray(generationChunks.id, deps));
      const allComplete = depChunks.every((c: { status: string | null }) => c.status === "completed");
      if (allComplete) result.push(chunk);
    }

    return result;
  }

  decomposePrompt(prompt: string, projectType: string, maxTokensPerChunk: number = CONTEXT_LIMITS.medium): TaskDecomposition {
    const chunks: ChunkCreateInput[] = [];
    const words = prompt.toLowerCase();

    const hasDatabase = words.includes("database") || words.includes("storage") || words.includes("persist") || words.includes("sql");
    const hasAuth = words.includes("auth") || words.includes("login") || words.includes("user") || words.includes("account");
    const hasApi = words.includes("api") || words.includes("endpoint") || words.includes("rest") || words.includes("graphql");
    const hasDashboard = words.includes("dashboard") || words.includes("admin") || words.includes("analytics");
    const hasChat = words.includes("chat") || words.includes("message") || words.includes("real-time");
    const hasTests = words.includes("test") || words.includes("testing") || words.includes("tdd");

    chunks.push({
      projectId: "",
      type: "architecture",
      title: "Project Architecture",
      description: "Define folder structure, dependencies, and core configuration",
      prompt: `Create the project architecture for: ${prompt}\n\nDefine: folder structure, package.json dependencies, TypeScript config, and core utilities.`,
      targetFiles: ["package.json", "tsconfig.json", "src/index.ts", "src/types.ts"],
      priority: 100,
    });

    if (hasDatabase) {
      chunks.push({
        projectId: "",
        type: "schema",
        title: "Database Schema",
        description: "Design and implement database tables and relationships",
        prompt: `Design the database schema for: ${prompt}\n\nCreate Drizzle ORM schema with proper types, relations, and indexes.`,
        targetFiles: ["src/db/schema.ts", "src/db/index.ts"],
        dependencies: [],
        priority: 90,
      });
    }

    if (hasAuth) {
      chunks.push({
        projectId: "",
        type: "api",
        title: "Authentication System",
        description: "Implement user authentication and session management",
        prompt: `Implement authentication for: ${prompt}\n\nCreate login/register endpoints, session handling, and middleware.`,
        targetFiles: ["src/auth/index.ts", "src/middleware/auth.ts"],
        dependencies: hasDatabase ? ["schema"] : [],
        priority: 85,
      });
    }

    if (hasApi) {
      chunks.push({
        projectId: "",
        type: "api",
        title: "API Endpoints",
        description: "Create REST/GraphQL API endpoints",
        prompt: `Implement API endpoints for: ${prompt}\n\nCreate CRUD operations with proper validation and error handling.`,
        targetFiles: ["src/routes/index.ts"],
        dependencies: hasDatabase ? ["schema"] : [],
        priority: 80,
      });
    }

    chunks.push({
      projectId: "",
      type: "component",
      title: "Core UI Components",
      description: "Build reusable UI components",
      prompt: `Create core UI components for: ${prompt}\n\nBuild responsive React components with Tailwind CSS.`,
      targetFiles: ["src/components/"],
      priority: 70,
    });

    if (hasDashboard) {
      chunks.push({
        projectId: "",
        type: "component",
        title: "Dashboard Pages",
        description: "Create dashboard views and charts",
        prompt: `Build dashboard pages for: ${prompt}\n\nCreate data visualization and admin interfaces.`,
        targetFiles: ["src/pages/dashboard/"],
        dependencies: ["components"],
        priority: 65,
      });
    }

    if (hasChat) {
      chunks.push({
        projectId: "",
        type: "integration",
        title: "Real-time Features",
        description: "Implement WebSocket/SSE for real-time updates",
        prompt: `Add real-time features for: ${prompt}\n\nImplement WebSocket or SSE for live updates.`,
        targetFiles: ["src/socket/index.ts", "src/hooks/useRealtime.ts"],
        priority: 55,
      });
    }

    chunks.push({
      projectId: "",
      type: "styling",
      title: "Styling & Theming",
      description: "Apply consistent styling and dark mode",
      prompt: `Style the application for: ${prompt}\n\nApply Tailwind CSS, dark mode, and responsive design.`,
      targetFiles: ["src/styles/", "tailwind.config.ts"],
      priority: 50,
    });

    if (hasTests) {
      chunks.push({
        projectId: "",
        type: "testing",
        title: "Test Suite",
        description: "Write unit and integration tests",
        prompt: `Create tests for: ${prompt}\n\nWrite Vitest tests for components and API endpoints.`,
        targetFiles: ["src/__tests__/"],
        priority: 40,
      });
    }

    chunks.push({
      projectId: "",
      type: "documentation",
      title: "Documentation",
      description: "Write README and API documentation",
      prompt: `Document the project: ${prompt}\n\nCreate README with setup instructions and API docs.`,
      targetFiles: ["README.md", "docs/"],
      priority: 30,
    });

    const estimatedTotalTokens = chunks.reduce((sum, c) => sum + estimateTokens(c.prompt), 0);
    const suggestedOrder = chunks.map((_, i) => `chunk-${i}`);
    const parallelGroups = this.groupParallelChunks(chunks);

    return {
      chunks,
      estimatedTotalTokens,
      suggestedOrder,
      parallelGroups,
    };
  }

  private groupParallelChunks(chunks: ChunkCreateInput[]): string[][] {
    const groups: string[][] = [];
    const byPriority = new Map<number, string[]>();

    chunks.forEach((chunk, i) => {
      const p = chunk.priority || 0;
      if (!byPriority.has(p)) byPriority.set(p, []);
      byPriority.get(p)!.push(`chunk-${i}`);
    });

    const sortedPriorities = Array.from(byPriority.keys()).sort((a, b) => b - a);
    for (const p of sortedPriorities) {
      groups.push(byPriority.get(p)!);
    }

    return groups;
  }
}

export const chunkService = new ChunkService();
