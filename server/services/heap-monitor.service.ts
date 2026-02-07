import { BaseService } from "../lib/base-service";

interface HeapSnapshot {
  timestamp: number;
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  externalMB: number;
  arrayBuffersMB: number;
  heapUsedPercent: number;
}

interface HeapStats {
  current: HeapSnapshot;
  peak: HeapSnapshot;
  history: HeapSnapshot[];
  uptimeMinutes: number;
  trend: "stable" | "growing" | "shrinking";
  warnings: string[];
}

const MB = 1024 * 1024;
const HISTORY_MAX = 120;
const DEFAULT_INTERVAL_MS = 30_000;
const WARN_HEAP_PERCENT = 85;
const CRITICAL_HEAP_PERCENT = 95;

class HeapMonitorService extends BaseService {
  private static instance: HeapMonitorService;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private history: HeapSnapshot[] = [];
  private peak: HeapSnapshot | null = null;
  private startTime: number = Date.now();

  private constructor() {
    super("HeapMonitorService");
  }

  static getInstance(): HeapMonitorService {
    if (!HeapMonitorService.instance) {
      HeapMonitorService.instance = new HeapMonitorService();
    }
    return HeapMonitorService.instance;
  }

  start(intervalMs: number = DEFAULT_INTERVAL_MS): void {
    if (this.intervalHandle) {
      this.log("Already running, stopping previous interval");
      this.stop();
    }
    this.startTime = Date.now();
    this.intervalHandle = setInterval(() => this.collectSnapshot(), intervalMs);
    this.collectSnapshot();
    this.log("Heap monitoring started", { intervalMs });
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      this.log("Heap monitoring stopped");
    }
  }

  destroy(): void {
    this.stop();
    this.history = [];
    this.peak = null;
    this.log("HeapMonitorService destroyed");
  }

  private collectSnapshot(): void {
    const mem = process.memoryUsage();
    const snapshot: HeapSnapshot = {
      timestamp: Date.now(),
      heapUsedMB: Math.round((mem.heapUsed / MB) * 10) / 10,
      heapTotalMB: Math.round((mem.heapTotal / MB) * 10) / 10,
      rssMB: Math.round((mem.rss / MB) * 10) / 10,
      externalMB: Math.round((mem.external / MB) * 10) / 10,
      arrayBuffersMB: Math.round((mem.arrayBuffers / MB) * 10) / 10,
      heapUsedPercent: Math.round((mem.heapUsed / mem.heapTotal) * 1000) / 10,
    };

    this.history.push(snapshot);
    if (this.history.length > HISTORY_MAX) {
      this.history = this.history.slice(-HISTORY_MAX);
    }

    if (!this.peak || snapshot.heapUsedMB > this.peak.heapUsedMB) {
      this.peak = snapshot;
    }

    if (snapshot.heapUsedPercent >= CRITICAL_HEAP_PERCENT) {
      this.logError("CRITICAL: Heap usage exceeds 95%", {
        heapUsedMB: snapshot.heapUsedMB,
        heapTotalMB: snapshot.heapTotalMB,
        percent: snapshot.heapUsedPercent,
      });
    } else if (snapshot.heapUsedPercent >= WARN_HEAP_PERCENT) {
      this.logWarn("High heap usage detected", {
        heapUsedMB: snapshot.heapUsedMB,
        heapTotalMB: snapshot.heapTotalMB,
        percent: snapshot.heapUsedPercent,
      });
    }
  }

  getCurrentSnapshot(): HeapSnapshot {
    const mem = process.memoryUsage();
    return {
      timestamp: Date.now(),
      heapUsedMB: Math.round((mem.heapUsed / MB) * 10) / 10,
      heapTotalMB: Math.round((mem.heapTotal / MB) * 10) / 10,
      rssMB: Math.round((mem.rss / MB) * 10) / 10,
      externalMB: Math.round((mem.external / MB) * 10) / 10,
      arrayBuffersMB: Math.round((mem.arrayBuffers / MB) * 10) / 10,
      heapUsedPercent: Math.round((mem.heapUsed / mem.heapTotal) * 1000) / 10,
    };
  }

  private computeTrend(): "stable" | "growing" | "shrinking" {
    if (this.history.length < 5) return "stable";
    const recent = this.history.slice(-5);
    const first = recent[0].heapUsedMB;
    const last = recent[recent.length - 1].heapUsedMB;
    const delta = last - first;
    const threshold = first * 0.1;
    if (delta > threshold) return "growing";
    if (delta < -threshold) return "shrinking";
    return "stable";
  }

  getStats(): HeapStats {
    const current = this.getCurrentSnapshot();
    const warnings: string[] = [];

    if (current.heapUsedPercent >= CRITICAL_HEAP_PERCENT) {
      warnings.push(`Critical: Heap at ${current.heapUsedPercent}% (${current.heapUsedMB}MB / ${current.heapTotalMB}MB)`);
    } else if (current.heapUsedPercent >= WARN_HEAP_PERCENT) {
      warnings.push(`Warning: Heap at ${current.heapUsedPercent}% (${current.heapUsedMB}MB / ${current.heapTotalMB}MB)`);
    }

    const trend = this.computeTrend();
    if (trend === "growing") {
      warnings.push("Heap usage is trending upward — possible memory leak");
    }

    return {
      current,
      peak: this.peak || current,
      history: this.history.slice(-30),
      uptimeMinutes: Math.round((Date.now() - this.startTime) / 60_000 * 10) / 10,
      trend,
      warnings,
    };
  }
}

export const heapMonitorService = HeapMonitorService.getInstance();
