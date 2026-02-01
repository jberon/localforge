import { db } from "./db";
import { projects, projectVersions } from "@shared/schema";
import type { Project, Message, InsertProject, DataModel, GeneratedFile, ValidationResult, ProjectVersion, Plan } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, updates: Partial<Project>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<boolean>;
  addMessage(projectId: string, message: Omit<Message, "id" | "timestamp">): Promise<Message | undefined>;
  // Version control
  getProjectVersions(projectId: string): Promise<ProjectVersion[]>;
  createVersion(projectId: string, name: string, description?: string, isAutoSave?: boolean): Promise<ProjectVersion | undefined>;
  restoreVersion(projectId: string, versionId: string): Promise<Project | undefined>;
  deleteVersion(versionId: string): Promise<boolean>;
}

function dbToProject(row: typeof projects.$inferSelect): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    messages: (row.messages as Message[]) ?? [],
    generatedCode: row.generatedCode ?? undefined,
    generatedFiles: (row.generatedFiles as GeneratedFile[]) ?? undefined,
    dataModel: (row.dataModel as DataModel) ?? undefined,
    lastPrompt: row.lastPrompt ?? undefined,
    validation: (row.validation as ValidationResult) ?? undefined,
    plan: (row.plan as Plan) ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DatabaseStorage implements IStorage {
  async getProjects(): Promise<Project[]> {
    const rows = await db.select().from(projects).orderBy(projects.updatedAt);
    return rows.map(dbToProject).reverse();
  }

  async getProject(id: string): Promise<Project | undefined> {
    const [row] = await db.select().from(projects).where(eq(projects.id, id));
    return row ? dbToProject(row) : undefined;
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const id = randomUUID();
    const now = Date.now();
    
    const [row] = await db.insert(projects).values({
      id,
      name: insertProject.name,
      description: insertProject.description ?? null,
      messages: insertProject.messages ?? [],
      generatedCode: insertProject.generatedCode ?? null,
      generatedFiles: insertProject.generatedFiles ?? [],
      dataModel: insertProject.dataModel ?? null,
      createdAt: now,
      updatedAt: now,
    }).returning();
    
    return dbToProject(row);
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project | undefined> {
    const existing = await this.getProject(id);
    if (!existing) return undefined;
    
    const updateData: Partial<typeof projects.$inferInsert> = {
      updatedAt: Date.now(),
    };
    
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.messages !== undefined) updateData.messages = updates.messages;
    if (updates.generatedCode !== undefined) updateData.generatedCode = updates.generatedCode;
    if (updates.generatedFiles !== undefined) updateData.generatedFiles = updates.generatedFiles;
    if (updates.dataModel !== undefined) updateData.dataModel = updates.dataModel;
    if (updates.lastPrompt !== undefined) updateData.lastPrompt = updates.lastPrompt;
    if (updates.validation !== undefined) updateData.validation = updates.validation;
    
    const [row] = await db.update(projects)
      .set(updateData)
      .where(eq(projects.id, id))
      .returning();
    
    return row ? dbToProject(row) : undefined;
  }

  async deleteProject(id: string): Promise<boolean> {
    const result = await db.delete(projects).where(eq(projects.id, id)).returning();
    return result.length > 0;
  }

  async addMessage(projectId: string, message: Omit<Message, "id" | "timestamp">): Promise<Message | undefined> {
    const project = await this.getProject(projectId);
    if (!project) return undefined;
    
    const newMessage: Message = {
      ...message,
      id: randomUUID(),
      timestamp: Date.now(),
    };
    
    const updatedMessages = [...project.messages, newMessage];
    
    await db.update(projects)
      .set({ 
        messages: updatedMessages,
        updatedAt: Date.now(),
      })
      .where(eq(projects.id, projectId));
    
    return newMessage;
  }

  // Version Control Methods
  async getProjectVersions(projectId: string): Promise<ProjectVersion[]> {
    const rows = await db.select()
      .from(projectVersions)
      .where(eq(projectVersions.projectId, projectId))
      .orderBy(desc(projectVersions.version));
    
    return rows.map(row => ({
      id: row.id,
      projectId: row.projectId,
      version: row.version,
      name: row.name,
      description: row.description ?? undefined,
      snapshot: row.snapshot as ProjectVersion["snapshot"],
      createdAt: row.createdAt,
      isAutoSave: row.isAutoSave === "true",
    }));
  }

  async createVersion(projectId: string, name: string, description?: string, isAutoSave = false): Promise<ProjectVersion | undefined> {
    const project = await this.getProject(projectId);
    if (!project) return undefined;

    // Get current max version
    const versions = await this.getProjectVersions(projectId);
    const nextVersion = versions.length > 0 ? Math.max(...versions.map(v => v.version)) + 1 : 1;

    const id = randomUUID();
    const now = Date.now();

    const snapshot = {
      messages: project.messages,
      generatedCode: project.generatedCode,
      generatedFiles: project.generatedFiles,
      dataModel: project.dataModel,
      plan: (project as any).plan,
    };

    const [row] = await db.insert(projectVersions).values({
      id,
      projectId,
      version: nextVersion,
      name,
      description: description ?? null,
      snapshot,
      createdAt: now,
      isAutoSave: isAutoSave ? "true" : "false",
    }).returning();

    return {
      id: row.id,
      projectId: row.projectId,
      version: row.version,
      name: row.name,
      description: row.description ?? undefined,
      snapshot: row.snapshot as ProjectVersion["snapshot"],
      createdAt: row.createdAt,
      isAutoSave: row.isAutoSave === "true",
    };
  }

  async restoreVersion(projectId: string, versionId: string): Promise<Project | undefined> {
    const [versionRow] = await db.select()
      .from(projectVersions)
      .where(eq(projectVersions.id, versionId));

    if (!versionRow || versionRow.projectId !== projectId) return undefined;

    const snapshot = versionRow.snapshot as ProjectVersion["snapshot"];

    // Restore project from snapshot
    const [row] = await db.update(projects)
      .set({
        messages: snapshot.messages,
        generatedCode: snapshot.generatedCode ?? null,
        generatedFiles: snapshot.generatedFiles ?? [],
        dataModel: snapshot.dataModel ?? null,
        plan: snapshot.plan ?? null,
        updatedAt: Date.now(),
      })
      .where(eq(projects.id, projectId))
      .returning();

    return row ? dbToProject(row) : undefined;
  }

  async deleteVersion(versionId: string): Promise<boolean> {
    const result = await db.delete(projectVersions)
      .where(eq(projectVersions.id, versionId))
      .returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
