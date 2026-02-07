import { BaseService } from "../lib/base-service";
import { llmConnectionPool } from "../lib/llm-connection-pool";
import OpenAI from "openai";

export interface ModelSlot {
  id: string;
  model: string;
  endpoint: string;
  role: "planner" | "builder" | "reviewer" | "any";
  busy: boolean;
  currentTask: string | null;
  taskStartedAt: number | null;
  completedTasks: number;
  totalTokensUsed: number;
  avgLatencyMs: number;
  lastUsedAt: number;
}

export interface DiscoveredModel {
  id: string;
  object: string;
  owned_by: string;
}

export interface PoolConfig {
  endpoints: string[];
  maxSlotsPerModel: number;
  slotTimeoutMs: number;
  discoveryIntervalMs: number;
  roleAssignments: Record<string, "planner" | "builder" | "reviewer" | "any">;
}

export interface SlotCheckout {
  slotId: string;
  client: OpenAI;
  model: string;
  endpoint: string;
  release: () => void;
}

export interface PoolStats {
  totalSlots: number;
  busySlots: number;
  availableSlots: number;
  models: Array<{
    model: string;
    endpoint: string;
    totalSlots: number;
    busySlots: number;
    avgLatencyMs: number;
    completedTasks: number;
  }>;
  throughput: {
    tasksPerMinute: number;
    tokensPerMinute: number;
  };
}

const DEFAULT_CONFIG: PoolConfig = {
  endpoints: ["http://localhost:1234/v1"],
  maxSlotsPerModel: 3,
  slotTimeoutMs: 600000,
  discoveryIntervalMs: 30000,
  roleAssignments: {},
};

class ModelPoolManagerService extends BaseService {
  private static instance: ModelPoolManagerService;
  private slots: Map<string, ModelSlot> = new Map();
  private config: PoolConfig = { ...DEFAULT_CONFIG };
  private discoveryTimer: ReturnType<typeof setInterval> | null = null;
  private discoveredModels: Map<string, DiscoveredModel[]> = new Map();
  private waitQueue: Array<{
    resolve: (checkout: SlotCheckout) => void;
    role: "planner" | "builder" | "reviewer" | "any";
    preferredModel?: string;
    timestamp: number;
  }> = [];
  private completionTimestamps: number[] = [];

  private constructor() {
    super("ModelPoolManager");
  }

  static getInstance(): ModelPoolManagerService {
    if (!ModelPoolManagerService.instance) {
      ModelPoolManagerService.instance = new ModelPoolManagerService();
    }
    return ModelPoolManagerService.instance;
  }

  configure(config: Partial<PoolConfig>): void {
    this.config = { ...this.config, ...config };
    this.log("Pool configured", { config: this.config });
  }

  async discoverModels(): Promise<Map<string, DiscoveredModel[]>> {
    const results = new Map<string, DiscoveredModel[]>();

    for (const endpoint of this.config.endpoints) {
      try {
        const client = llmConnectionPool.get(endpoint);
        const response = await client.models.list();
        const models: DiscoveredModel[] = [];

        for await (const model of response) {
          models.push({
            id: model.id,
            object: model.object,
            owned_by: model.owned_by || "unknown",
          });
        }

        results.set(endpoint, models);
        llmConnectionPool.markHealthy(endpoint);
        this.log("Discovered models", { endpoint, count: models.length, models: models.map(m => m.id) });
      } catch (error) {
        llmConnectionPool.markUnhealthy(endpoint);
        this.logWarn("Model discovery failed", {
          endpoint,
          error: error instanceof Error ? error.message : String(error),
        });
        results.set(endpoint, []);
      }
    }

    this.discoveredModels = results;
    await this.syncSlots();
    return results;
  }

  private async syncSlots(): Promise<void> {
    const activeSlotKeys = new Set<string>();

    for (const [endpoint, models] of Array.from(this.discoveredModels.entries())) {
      for (const model of models) {
        for (let i = 0; i < this.config.maxSlotsPerModel; i++) {
          const slotId = `${endpoint}::${model.id}::${i}`;
          activeSlotKeys.add(slotId);

          if (!this.slots.has(slotId)) {
            const role = this.config.roleAssignments[model.id] || "any";
            this.slots.set(slotId, {
              id: slotId,
              model: model.id,
              endpoint,
              role,
              busy: false,
              currentTask: null,
              taskStartedAt: null,
              completedTasks: 0,
              totalTokensUsed: 0,
              avgLatencyMs: 0,
              lastUsedAt: 0,
            });
          }
        }
      }
    }

    for (const [slotId, slot] of Array.from(this.slots.entries())) {
      if (!activeSlotKeys.has(slotId) && !slot.busy) {
        this.slots.delete(slotId);
      }
    }

    this.log("Slots synced", {
      total: this.slots.size,
      busy: Array.from(this.slots.values()).filter(s => s.busy).length,
    });
  }

  reclaimStaleSlots(): number {
    const now = Date.now();
    let reclaimed = 0;
    for (const slot of Array.from(this.slots.values())) {
      if (slot.busy && slot.taskStartedAt && (now - slot.taskStartedAt) > this.config.slotTimeoutMs) {
        this.logWarn("Reclaiming stale slot", {
          slotId: slot.id,
          model: slot.model,
          task: slot.currentTask,
          staleDurationMs: now - slot.taskStartedAt,
        });
        slot.busy = false;
        slot.currentTask = null;
        slot.taskStartedAt = null;
        reclaimed++;
      }
    }
    if (reclaimed > 0) {
      this.processWaitQueue();
    }
    return reclaimed;
  }

  startDiscovery(intervalMs?: number): void {
    this.stopDiscovery();
    const interval = intervalMs || this.config.discoveryIntervalMs;
    this.discoverModels();
    this.discoveryTimer = setInterval(() => {
      this.discoverModels();
      this.reclaimStaleSlots();
    }, interval);
    this.log("Discovery started", { intervalMs: interval });
  }

  stopDiscovery(): void {
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = null;
    }
  }

  async checkout(
    role: "planner" | "builder" | "reviewer" | "any" = "any",
    preferredModel?: string,
    timeoutMs: number = 30000
  ): Promise<SlotCheckout | null> {
    const slot = this.findAvailableSlot(role, preferredModel);
    if (slot) {
      return this.createCheckout(slot);
    }

    return new Promise<SlotCheckout | null>((resolve) => {
      const timer = setTimeout(() => {
        this.waitQueue = this.waitQueue.filter(w => w.resolve !== resolve);
        resolve(null);
      }, timeoutMs);

      this.waitQueue.push({
        resolve: (checkout) => {
          clearTimeout(timer);
          resolve(checkout);
        },
        role,
        preferredModel,
        timestamp: Date.now(),
      });
    });
  }

  checkoutImmediate(
    role: "planner" | "builder" | "reviewer" | "any" = "any",
    preferredModel?: string
  ): SlotCheckout | null {
    const slot = this.findAvailableSlot(role, preferredModel);
    if (!slot) return null;
    return this.createCheckout(slot);
  }

  private findAvailableSlot(
    role: "planner" | "builder" | "reviewer" | "any",
    preferredModel?: string
  ): ModelSlot | null {
    const candidates = Array.from(this.slots.values())
      .filter(s => !s.busy)
      .filter(s => role === "any" || s.role === "any" || s.role === role);

    if (candidates.length === 0) return null;

    if (preferredModel) {
      const preferred = candidates.find(s => s.model === preferredModel);
      if (preferred) return preferred;
    }

    candidates.sort((a, b) => {
      if (a.avgLatencyMs !== b.avgLatencyMs) return a.avgLatencyMs - b.avgLatencyMs;
      return a.completedTasks - b.completedTasks;
    });

    return candidates[0];
  }

  private createCheckout(slot: ModelSlot): SlotCheckout {
    slot.busy = true;
    slot.taskStartedAt = Date.now();
    slot.currentTask = "pending";

    const client = llmConnectionPool.get(slot.endpoint);

    return {
      slotId: slot.id,
      client,
      model: slot.model,
      endpoint: slot.endpoint,
      release: () => this.releaseSlot(slot.id),
    };
  }

  releaseSlot(slotId: string, tokensUsed: number = 0, taskName?: string): void {
    const slot = this.slots.get(slotId);
    if (!slot) return;

    const latency = slot.taskStartedAt ? Date.now() - slot.taskStartedAt : 0;

    slot.busy = false;
    slot.currentTask = null;
    slot.completedTasks++;
    slot.totalTokensUsed += tokensUsed;
    slot.lastUsedAt = Date.now();
    slot.taskStartedAt = null;

    const totalLatency = slot.avgLatencyMs * (slot.completedTasks - 1) + latency;
    slot.avgLatencyMs = Math.round(totalLatency / slot.completedTasks);

    this.completionTimestamps.push(Date.now());
    const oneMinuteAgo = Date.now() - 60000;
    this.completionTimestamps = this.completionTimestamps.filter(t => t > oneMinuteAgo);

    this.log("Slot released", {
      slotId,
      model: slot.model,
      latencyMs: latency,
      tokensUsed,
      task: taskName,
    });

    this.processWaitQueue();
  }

  private processWaitQueue(): void {
    if (this.waitQueue.length === 0) return;

    const now = Date.now();
    this.waitQueue = this.waitQueue.filter(w => now - w.timestamp < this.config.slotTimeoutMs);

    for (let i = 0; i < this.waitQueue.length; i++) {
      const waiter = this.waitQueue[i];
      const slot = this.findAvailableSlot(waiter.role, waiter.preferredModel);
      if (slot) {
        this.waitQueue.splice(i, 1);
        const checkout = this.createCheckout(slot);
        waiter.resolve(checkout);
        return;
      }
    }
  }

  markSlotTask(slotId: string, taskName: string): void {
    const slot = this.slots.get(slotId);
    if (slot) {
      slot.currentTask = taskName;
    }
  }

  getStats(): PoolStats {
    const allSlots = Array.from(this.slots.values());
    const busySlots = allSlots.filter(s => s.busy);

    const modelMap = new Map<string, {
      model: string;
      endpoint: string;
      totalSlots: number;
      busySlots: number;
      totalLatency: number;
      completedTasks: number;
    }>();

    for (const slot of allSlots) {
      const key = `${slot.endpoint}::${slot.model}`;
      const existing = modelMap.get(key);
      if (existing) {
        existing.totalSlots++;
        if (slot.busy) existing.busySlots++;
        existing.totalLatency += slot.avgLatencyMs;
        existing.completedTasks += slot.completedTasks;
      } else {
        modelMap.set(key, {
          model: slot.model,
          endpoint: slot.endpoint,
          totalSlots: 1,
          busySlots: slot.busy ? 1 : 0,
          totalLatency: slot.avgLatencyMs,
          completedTasks: slot.completedTasks,
        });
      }
    }

    const models = Array.from(modelMap.values()).map(m => ({
      model: m.model,
      endpoint: m.endpoint,
      totalSlots: m.totalSlots,
      busySlots: m.busySlots,
      avgLatencyMs: m.totalSlots > 0 ? Math.round(m.totalLatency / m.totalSlots) : 0,
      completedTasks: m.completedTasks,
    }));

    const oneMinuteAgo = Date.now() - 60000;
    const recentCompletions = this.completionTimestamps.filter(t => t > oneMinuteAgo);

    const totalTokensRecent = allSlots.reduce((sum, s) => sum + s.totalTokensUsed, 0);

    return {
      totalSlots: allSlots.length,
      busySlots: busySlots.length,
      availableSlots: allSlots.length - busySlots.length,
      models,
      throughput: {
        tasksPerMinute: recentCompletions.length,
        tokensPerMinute: totalTokensRecent,
      },
    };
  }

  getSlots(): ModelSlot[] {
    return Array.from(this.slots.values());
  }

  getDiscoveredModels(): Map<string, DiscoveredModel[]> {
    return this.discoveredModels;
  }

  getAvailableSlotCount(role?: "planner" | "builder" | "reviewer" | "any"): number {
    return Array.from(this.slots.values())
      .filter(s => !s.busy)
      .filter(s => !role || role === "any" || s.role === "any" || s.role === role)
      .length;
  }

  hasAvailableSlot(role?: "planner" | "builder" | "reviewer" | "any"): boolean {
    return this.getAvailableSlotCount(role) > 0;
  }

  setRoleAssignment(model: string, role: "planner" | "builder" | "reviewer" | "any"): void {
    this.config.roleAssignments[model] = role;
    for (const slot of Array.from(this.slots.values())) {
      if (slot.model === model && !slot.busy) {
        slot.role = role;
      }
    }
    this.log("Role assignment updated", { model, role });
  }

  setMaxSlotsPerModel(max: number): void {
    this.config.maxSlotsPerModel = Math.max(1, Math.min(max, 10));
    this.syncSlots();
  }

  destroy(): void {
    this.stopDiscovery();
    this.waitQueue.forEach(w => w.resolve(null as unknown as SlotCheckout));
    this.waitQueue = [];
    this.slots.clear();
    this.discoveredModels.clear();
    this.completionTimestamps = [];
    this.log("ModelPoolManager destroyed");
  }
}

export const modelPoolManager = ModelPoolManagerService.getInstance();
