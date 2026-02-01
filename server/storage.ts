import { db } from "./db";
import { projects } from "@shared/schema";
import type { Project, Message, InsertProject, DataModel, GeneratedFile, ValidationResult } from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, updates: Partial<Project>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<boolean>;
  addMessage(projectId: string, message: Omit<Message, "id" | "timestamp">): Promise<Message | undefined>;
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
}

export const storage = new DatabaseStorage();
