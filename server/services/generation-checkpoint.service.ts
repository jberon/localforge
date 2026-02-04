import logger from "../lib/logger";
import { v4 as uuidv4 } from "uuid";

export interface FileState {
  path: string;
  content: string;
  hash: string;
  createdAt: number;
}

export interface GenerationCheckpoint {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  files: FileState[];
  metadata: {
    prompt?: string;
    taskType?: string;
    modelUsed?: string;
    tokensUsed?: number;
  };
  createdAt: number;
  isAutoSave: boolean;
}

export interface CheckpointRecoveryResult {
  success: boolean;
  restoredFiles: string[];
  errors: string[];
}

export class GenerationCheckpointService {
  private static instance: GenerationCheckpointService;
  
  private checkpoints: Map<string, GenerationCheckpoint[]> = new Map();
  private autoSaveInterval = 30000; // Auto-save every 30 seconds during generation
  private maxCheckpointsPerProject = 20;
  private pendingFiles: Map<string, FileState[]> = new Map();
  private autoSaveTimers: Map<string, NodeJS.Timeout> = new Map();

  private constructor() {}

  static getInstance(): GenerationCheckpointService {
    if (!GenerationCheckpointService.instance) {
      GenerationCheckpointService.instance = new GenerationCheckpointService();
    }
    return GenerationCheckpointService.instance;
  }

  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  startGeneration(projectId: string, metadata?: GenerationCheckpoint["metadata"]): string {
    const generationId = uuidv4();
    this.pendingFiles.set(generationId, []);
    
    // Start auto-save timer
    const timer = setInterval(() => {
      this.autoSaveCheckpoint(projectId, generationId, metadata);
    }, this.autoSaveInterval);
    
    this.autoSaveTimers.set(generationId, timer);
    
    logger.info("Generation started with checkpoint tracking", { projectId, generationId });
    return generationId;
  }

  addFile(generationId: string, path: string, content: string): void {
    const pending = this.pendingFiles.get(generationId);
    if (!pending) {
      logger.warn("No pending generation found", { generationId });
      return;
    }

    const fileState: FileState = {
      path,
      content,
      hash: this.hashContent(content),
      createdAt: Date.now(),
    };

    // Update or add file
    const existingIndex = pending.findIndex(f => f.path === path);
    if (existingIndex >= 0) {
      pending[existingIndex] = fileState;
    } else {
      pending.push(fileState);
    }

    logger.debug("File added to checkpoint", { generationId, path, contentLength: content.length });
  }

  private autoSaveCheckpoint(
    projectId: string,
    generationId: string,
    metadata?: GenerationCheckpoint["metadata"]
  ): void {
    const pending = this.pendingFiles.get(generationId);
    if (!pending || pending.length === 0) {
      return;
    }

    this.createCheckpoint(projectId, `Auto-save ${new Date().toISOString()}`, {
      ...metadata,
    }, [...pending], true);
  }

  finishGeneration(
    projectId: string,
    generationId: string,
    name: string,
    metadata?: GenerationCheckpoint["metadata"]
  ): GenerationCheckpoint | null {
    const pending = this.pendingFiles.get(generationId);
    if (!pending) {
      logger.warn("No pending generation found", { generationId });
      return null;
    }

    // Clear auto-save timer
    const timer = this.autoSaveTimers.get(generationId);
    if (timer) {
      clearInterval(timer);
      this.autoSaveTimers.delete(generationId);
    }

    // Create final checkpoint
    const checkpoint = this.createCheckpoint(projectId, name, metadata, [...pending], false);
    
    // Clean up pending files
    this.pendingFiles.delete(generationId);

    logger.info("Generation finished, checkpoint created", { 
      projectId, 
      generationId, 
      checkpointId: checkpoint.id,
      fileCount: pending.length,
    });

    return checkpoint;
  }

  cancelGeneration(generationId: string): void {
    // Clear auto-save timer
    const timer = this.autoSaveTimers.get(generationId);
    if (timer) {
      clearInterval(timer);
      this.autoSaveTimers.delete(generationId);
    }

    // Clean up pending files
    this.pendingFiles.delete(generationId);

    logger.info("Generation cancelled", { generationId });
  }

  createCheckpoint(
    projectId: string,
    name: string,
    metadata: GenerationCheckpoint["metadata"] = {},
    files: FileState[],
    isAutoSave: boolean
  ): GenerationCheckpoint {
    const checkpoint: GenerationCheckpoint = {
      id: uuidv4(),
      projectId,
      name,
      files,
      metadata,
      createdAt: Date.now(),
      isAutoSave,
    };

    const projectCheckpoints = this.checkpoints.get(projectId) || [];
    projectCheckpoints.unshift(checkpoint);

    // Limit checkpoints per project (keep manual checkpoints longer)
    if (projectCheckpoints.length > this.maxCheckpointsPerProject) {
      // Remove oldest auto-save checkpoints first
      const autoSaves = projectCheckpoints.filter(c => c.isAutoSave);
      const manualSaves = projectCheckpoints.filter(c => !c.isAutoSave);
      
      const maxAutoSaves = Math.floor(this.maxCheckpointsPerProject * 0.6);
      const maxManualSaves = Math.floor(this.maxCheckpointsPerProject * 0.4);
      
      const trimmedAutoSaves = autoSaves.slice(0, maxAutoSaves);
      const trimmedManualSaves = manualSaves.slice(0, maxManualSaves);
      
      this.checkpoints.set(projectId, [...trimmedManualSaves, ...trimmedAutoSaves].sort((a, b) => b.createdAt - a.createdAt));
    } else {
      this.checkpoints.set(projectId, projectCheckpoints);
    }

    logger.info("Checkpoint created", { 
      projectId, 
      checkpointId: checkpoint.id, 
      name, 
      fileCount: files.length,
      isAutoSave,
    });

    return checkpoint;
  }

  getCheckpoints(projectId: string, options?: { 
    limit?: number; 
    includeAutoSaves?: boolean;
  }): GenerationCheckpoint[] {
    let checkpoints = this.checkpoints.get(projectId) || [];
    
    if (options?.includeAutoSaves === false) {
      checkpoints = checkpoints.filter(c => !c.isAutoSave);
    }
    
    if (options?.limit) {
      checkpoints = checkpoints.slice(0, options.limit);
    }
    
    return checkpoints;
  }

  getCheckpoint(projectId: string, checkpointId: string): GenerationCheckpoint | null {
    const projectCheckpoints = this.checkpoints.get(projectId) || [];
    return projectCheckpoints.find(c => c.id === checkpointId) || null;
  }

  getLatestCheckpoint(projectId: string): GenerationCheckpoint | null {
    const projectCheckpoints = this.checkpoints.get(projectId) || [];
    return projectCheckpoints[0] || null;
  }

  async recoverFromCheckpoint(
    projectId: string,
    checkpointId: string,
    writeFile: (path: string, content: string) => Promise<void>
  ): Promise<CheckpointRecoveryResult> {
    const checkpoint = this.getCheckpoint(projectId, checkpointId);
    
    if (!checkpoint) {
      return {
        success: false,
        restoredFiles: [],
        errors: [`Checkpoint not found: ${checkpointId}`],
      };
    }

    const restoredFiles: string[] = [];
    const errors: string[] = [];

    for (const file of checkpoint.files) {
      try {
        await writeFile(file.path, file.content);
        restoredFiles.push(file.path);
      } catch (error) {
        errors.push(`Failed to restore ${file.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const success = errors.length === 0;
    
    logger.info("Checkpoint recovery completed", {
      projectId,
      checkpointId,
      success,
      restoredCount: restoredFiles.length,
      errorCount: errors.length,
    });

    return { success, restoredFiles, errors };
  }

  deleteCheckpoint(projectId: string, checkpointId: string): boolean {
    const projectCheckpoints = this.checkpoints.get(projectId) || [];
    const index = projectCheckpoints.findIndex(c => c.id === checkpointId);
    
    if (index >= 0) {
      projectCheckpoints.splice(index, 1);
      this.checkpoints.set(projectId, projectCheckpoints);
      logger.info("Checkpoint deleted", { projectId, checkpointId });
      return true;
    }
    
    return false;
  }

  clearAutoSaves(projectId: string): number {
    const projectCheckpoints = this.checkpoints.get(projectId) || [];
    const manualOnly = projectCheckpoints.filter(c => !c.isAutoSave);
    const deletedCount = projectCheckpoints.length - manualOnly.length;
    
    this.checkpoints.set(projectId, manualOnly);
    
    logger.info("Auto-save checkpoints cleared", { projectId, deletedCount });
    return deletedCount;
  }

  getCheckpointStats(projectId: string): {
    totalCheckpoints: number;
    autoSaveCount: number;
    manualCount: number;
    totalFiles: number;
    oldestCheckpoint: number | null;
    newestCheckpoint: number | null;
  } {
    const projectCheckpoints = this.checkpoints.get(projectId) || [];
    
    return {
      totalCheckpoints: projectCheckpoints.length,
      autoSaveCount: projectCheckpoints.filter(c => c.isAutoSave).length,
      manualCount: projectCheckpoints.filter(c => !c.isAutoSave).length,
      totalFiles: projectCheckpoints.reduce((sum, c) => sum + c.files.length, 0),
      oldestCheckpoint: projectCheckpoints.length > 0 
        ? projectCheckpoints[projectCheckpoints.length - 1].createdAt 
        : null,
      newestCheckpoint: projectCheckpoints.length > 0 
        ? projectCheckpoints[0].createdAt 
        : null,
    };
  }
}

export const generationCheckpointService = GenerationCheckpointService.getInstance();
