import { db as dbInstance } from "../db";
import { projectFiles } from "@shared/schema";
import { eq, and, like, desc, asc } from "drizzle-orm";
import { createHash } from "crypto";
import { v4 as uuidv4 } from "uuid";
import logger from "../lib/logger";

function getDb() {
  if (!dbInstance) {
    throw new Error("Database not initialized. Check DATABASE_URL environment variable.");
  }
  return dbInstance;
}

export interface FileCreateInput {
  projectId: string;
  path: string;
  content: string;
  language?: string;
  summary?: string;
  imports?: string[];
  exports?: string[];
  dependencies?: string[];
}

export interface FileUpdateInput {
  content?: string;
  summary?: string;
  imports?: string[];
  exports?: string[];
  dependencies?: string[];
}

export interface FileQueryOptions {
  directory?: string;
  language?: string;
  search?: string;
  limit?: number;
  offset?: number;
  orderBy?: "path" | "updated" | "size" | "lines";
  order?: "asc" | "desc";
}

export interface FileSummary {
  path: string;
  language: string | null;
  lineCount: number;
  summary: string | null;
}

function computeHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function countLines(content: string): number {
  return content.split("\n").length;
}

function detectLanguage(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    css: "css",
    scss: "scss",
    html: "html",
    json: "json",
    md: "markdown",
    py: "python",
    sql: "sql",
    yaml: "yaml",
    yml: "yaml",
  };
  return langMap[ext || ""] || null;
}

export class FileStorageService {
  async createFile(input: FileCreateInput): Promise<string> {
    const id = uuidv4();
    const now = Date.now();
    const hash = computeHash(input.content);
    const lineCount = countLines(input.content);
    const size = Buffer.byteLength(input.content, "utf8");
    const language = input.language || detectLanguage(input.path);

    await getDb().insert(projectFiles).values({
      id,
      projectId: input.projectId,
      path: input.path,
      content: input.content,
      language,
      size,
      lineCount,
      hash,
      summary: input.summary || null,
      imports: input.imports || [],
      exports: input.exports || [],
      dependencies: input.dependencies || [],
      createdAt: now,
      updatedAt: now,
    });

    logger.info("File created", { id, path: input.path, projectId: input.projectId });
    return id;
  }

  async upsertFile(input: FileCreateInput): Promise<{ id: string; action: "created" | "updated" | "unchanged" }> {
    const existing = await getDb()
      .select()
      .from(projectFiles)
      .where(and(eq(projectFiles.projectId, input.projectId), eq(projectFiles.path, input.path)))
      .limit(1);

    if (existing.length === 0) {
      const id = await this.createFile(input);
      return { id, action: "created" };
    }

    const newHash = computeHash(input.content);
    if (existing[0].hash === newHash) {
      return { id: existing[0].id, action: "unchanged" };
    }

    await this.updateFile(existing[0].id, { content: input.content, summary: input.summary, imports: input.imports, exports: input.exports, dependencies: input.dependencies });
    return { id: existing[0].id, action: "updated" };
  }

  async updateFile(id: string, input: FileUpdateInput): Promise<void> {
    const updates: Record<string, unknown> = { updatedAt: Date.now() };

    if (input.content !== undefined) {
      updates.content = input.content;
      updates.hash = computeHash(input.content);
      updates.lineCount = countLines(input.content);
      updates.size = Buffer.byteLength(input.content, "utf8");
    }
    if (input.summary !== undefined) updates.summary = input.summary;
    if (input.imports !== undefined) updates.imports = input.imports;
    if (input.exports !== undefined) updates.exports = input.exports;
    if (input.dependencies !== undefined) updates.dependencies = input.dependencies;

    await getDb().update(projectFiles).set(updates).where(eq(projectFiles.id, id));
    logger.info("File updated", { id });
  }

  async getFile(id: string): Promise<typeof projectFiles.$inferSelect | null> {
    const result = await getDb().select().from(projectFiles).where(eq(projectFiles.id, id)).limit(1);
    return result[0] || null;
  }

  async getFileByPath(projectId: string, path: string): Promise<typeof projectFiles.$inferSelect | null> {
    const result = await getDb()
      .select()
      .from(projectFiles)
      .where(and(eq(projectFiles.projectId, projectId), eq(projectFiles.path, path)))
      .limit(1);
    return result[0] || null;
  }

  async listFiles(projectId: string, options: FileQueryOptions = {}): Promise<typeof projectFiles.$inferSelect[]> {
    const conditions = [eq(projectFiles.projectId, projectId)];
    if (options.directory) {
      conditions.push(like(projectFiles.path, `${options.directory}%`));
    }
    if (options.language) {
      conditions.push(eq(projectFiles.language, options.language));
    }
    if (options.search) {
      conditions.push(like(projectFiles.path, `%${options.search}%`));
    }

    let orderColumn: typeof projectFiles.path | typeof projectFiles.updatedAt | typeof projectFiles.size | typeof projectFiles.lineCount;
    switch (options.orderBy) {
      case "updated":
        orderColumn = projectFiles.updatedAt;
        break;
      case "size":
        orderColumn = projectFiles.size;
        break;
      case "lines":
        orderColumn = projectFiles.lineCount;
        break;
      default:
        orderColumn = projectFiles.path;
    }

    const result = await getDb()
      .select()
      .from(projectFiles)
      .where(and(...conditions))
      .orderBy(options.order === "desc" ? desc(orderColumn) : asc(orderColumn))
      .limit(options.limit || 1000)
      .offset(options.offset || 0);

    return result;
  }

  async deleteFile(id: string): Promise<void> {
    await getDb().delete(projectFiles).where(eq(projectFiles.id, id));
    logger.info("File deleted", { id });
  }

  async deleteProjectFiles(projectId: string): Promise<number> {
    const result = await getDb().delete(projectFiles).where(eq(projectFiles.projectId, projectId)).returning();
    logger.info("Project files deleted", { projectId, count: result.length });
    return result.length;
  }

  async getProjectStats(projectId: string): Promise<{
    totalFiles: number;
    totalLines: number;
    totalSize: number;
    byLanguage: Record<string, { files: number; lines: number }>;
  }> {
    const files = await getDb()
      .select({
        language: projectFiles.language,
        lineCount: projectFiles.lineCount,
        size: projectFiles.size,
      })
      .from(projectFiles)
      .where(eq(projectFiles.projectId, projectId));

    const stats = {
      totalFiles: files.length,
      totalLines: 0,
      totalSize: 0,
      byLanguage: {} as Record<string, { files: number; lines: number }>,
    };

    for (const file of files) {
      stats.totalLines += file.lineCount;
      stats.totalSize += file.size;
      const lang = file.language || "unknown";
      if (!stats.byLanguage[lang]) {
        stats.byLanguage[lang] = { files: 0, lines: 0 };
      }
      stats.byLanguage[lang].files++;
      stats.byLanguage[lang].lines += file.lineCount;
    }

    return stats;
  }

  async getFileSummaries(projectId: string): Promise<FileSummary[]> {
    const files = await getDb()
      .select({
        path: projectFiles.path,
        language: projectFiles.language,
        lineCount: projectFiles.lineCount,
        summary: projectFiles.summary,
      })
      .from(projectFiles)
      .where(eq(projectFiles.projectId, projectId))
      .orderBy(asc(projectFiles.path));

    return files;
  }

  async getFilesForContext(projectId: string, maxTokens: number): Promise<{ path: string; content: string; tokens: number }[]> {
    const files = await getDb()
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.projectId, projectId))
      .orderBy(desc(projectFiles.updatedAt));

    const result: { path: string; content: string; tokens: number }[] = [];
    let totalTokens = 0;

    for (const file of files) {
      const estimatedTokens = Math.ceil(file.content.length / 4);
      if (totalTokens + estimatedTokens > maxTokens) continue;
      result.push({ path: file.path, content: file.content, tokens: estimatedTokens });
      totalTokens += estimatedTokens;
    }

    return result;
  }

  async migrateFromJson(projectId: string, files: { path: string; content: string }[]): Promise<{ created: number; updated: number; unchanged: number }> {
    const stats = { created: 0, updated: 0, unchanged: 0 };

    for (const file of files) {
      const result = await this.upsertFile({
        projectId,
        path: file.path,
        content: file.content,
      });
      stats[result.action]++;
    }

    logger.info("Migration completed", { projectId, ...stats });
    return stats;
  }
}

export const fileStorageService = new FileStorageService();
