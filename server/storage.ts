import type { Project, Message, InsertProject } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, updates: Partial<Project>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<boolean>;
  addMessage(projectId: string, message: Omit<Message, "id" | "timestamp">): Promise<Message | undefined>;
}

export class MemStorage implements IStorage {
  private projects: Map<string, Project>;

  constructor() {
    this.projects = new Map();
  }

  async getProjects(): Promise<Project[]> {
    return Array.from(this.projects.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getProject(id: string): Promise<Project | undefined> {
    return this.projects.get(id);
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const id = randomUUID();
    const now = Date.now();
    const project: Project = {
      ...insertProject,
      id,
      messages: insertProject.messages || [],
      createdAt: now,
      updatedAt: now,
    };
    this.projects.set(id, project);
    return project;
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project | undefined> {
    const project = this.projects.get(id);
    if (!project) return undefined;
    
    const updated: Project = {
      ...project,
      ...updates,
      id,
      updatedAt: Date.now(),
    };
    this.projects.set(id, updated);
    return updated;
  }

  async deleteProject(id: string): Promise<boolean> {
    return this.projects.delete(id);
  }

  async addMessage(projectId: string, message: Omit<Message, "id" | "timestamp">): Promise<Message | undefined> {
    const project = this.projects.get(projectId);
    if (!project) return undefined;
    
    const newMessage: Message = {
      ...message,
      id: randomUUID(),
      timestamp: Date.now(),
    };
    
    project.messages.push(newMessage);
    project.updatedAt = Date.now();
    this.projects.set(projectId, project);
    
    return newMessage;
  }
}

export const storage = new MemStorage();
