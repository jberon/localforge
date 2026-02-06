import logger from "../lib/logger";
import { EventEmitter } from "events";

interface PerformanceMetric {
  id: string;
  name: string;
  category: MetricCategory;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, unknown>;
  success: boolean;
  error?: string;
}

type MetricCategory =
  | "llm_generation"
  | "file_operation"
  | "database_query"
  | "api_request"
  | "validation"
  | "bundling"
  | "parsing";

interface ProfilerStats {
  totalOperations: number;
  totalDuration: number;
  averageDuration: number;
  successRate: number;
  byCategory: CategoryStats[];
  slowestOperations: PerformanceMetric[];
  recentOperations: PerformanceMetric[];
  trends: TrendData;
}

interface CategoryStats {
  category: MetricCategory;
  count: number;
  totalDuration: number;
  averageDuration: number;
  successRate: number;
  p50: number;
  p95: number;
  p99: number;
}

interface TrendData {
  timeWindow: number;
  operationsPerMinute: number;
  averageDurationTrend: "improving" | "stable" | "degrading";
  errorRateTrend: "improving" | "stable" | "degrading";
}

interface ActiveOperation {
  metric: PerformanceMetric;
  timeout?: NodeJS.Timeout;
}

class PerformanceProfilerService extends EventEmitter {
  private static instance: PerformanceProfilerService;
  private metrics: PerformanceMetric[] = [];
  private activeOperations = new Map<string, ActiveOperation>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private maxMetrics = 1000;
  private operationTimeout = 300000;

  private constructor() {
    super();
    this.startCleanupInterval();
  }

  static getInstance(): PerformanceProfilerService {
    if (!PerformanceProfilerService.instance) {
      PerformanceProfilerService.instance = new PerformanceProfilerService();
    }
    return PerformanceProfilerService.instance;
  }

  private startCleanupInterval(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldMetrics();
      this.checkStaleOperations();
    }, 60000);
  }

  private cleanupOldMetrics(): void {
    if (this.metrics.length > this.maxMetrics) {
      const toRemove = this.metrics.length - this.maxMetrics;
      this.metrics.splice(0, toRemove);
    }
  }

  private checkStaleOperations(): void {
    const now = Date.now();
    for (const [id, op] of Array.from(this.activeOperations.entries())) {
      if (now - op.metric.startTime > this.operationTimeout) {
        this.endOperation(id, false, "Operation timed out");
      }
    }
  }

  startOperation(
    name: string,
    category: MetricCategory,
    metadata?: Record<string, unknown>
  ): string {
    const id = `${category}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    
    const metric: PerformanceMetric = {
      id,
      name,
      category,
      startTime: Date.now(),
      metadata,
      success: true,
    };

    const timeout = setTimeout(() => {
      this.endOperation(id, false, "Operation timed out");
    }, this.operationTimeout);

    this.activeOperations.set(id, { metric, timeout });

    logger.debug("Performance operation started", { id, name, category });
    this.emit("operationStarted", metric);

    return id;
  }

  endOperation(id: string, success: boolean = true, error?: string): PerformanceMetric | null {
    const operation = this.activeOperations.get(id);
    if (!operation) {
      logger.warn("Attempted to end unknown operation", { id });
      return null;
    }

    if (operation.timeout) {
      clearTimeout(operation.timeout);
    }

    const metric = operation.metric;
    metric.endTime = Date.now();
    metric.duration = metric.endTime - metric.startTime;
    metric.success = success;
    metric.error = error;

    this.metrics.push(metric);
    this.activeOperations.delete(id);

    logger.debug("Performance operation ended", {
      id,
      name: metric.name,
      duration: metric.duration,
      success,
    });

    this.emit("operationEnded", metric);

    if (metric.duration > 5000) {
      this.emit("slowOperation", metric);
    }

    return metric;
  }

  async trackOperation<T>(
    name: string,
    category: MetricCategory,
    operation: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    const id = this.startOperation(name, category, metadata);
    
    try {
      const result = await operation();
      this.endOperation(id, true);
      return result;
    } catch (error) {
      this.endOperation(id, false, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  trackSync<T>(
    name: string,
    category: MetricCategory,
    operation: () => T,
    metadata?: Record<string, unknown>
  ): T {
    const id = this.startOperation(name, category, metadata);
    
    try {
      const result = operation();
      this.endOperation(id, true);
      return result;
    } catch (error) {
      this.endOperation(id, false, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  getStats(timeWindowMs: number = 3600000): ProfilerStats {
    const cutoff = Date.now() - timeWindowMs;
    const recentMetrics = this.metrics.filter(m => m.startTime >= cutoff);

    if (recentMetrics.length === 0) {
      return this.getEmptyStats(timeWindowMs);
    }

    const totalDuration = recentMetrics.reduce((sum, m) => sum + (m.duration || 0), 0);
    const successCount = recentMetrics.filter(m => m.success).length;

    const byCategory = this.calculateCategoryStats(recentMetrics);
    const slowestOperations = [...recentMetrics]
      .filter(m => m.duration !== undefined)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, 10);

    const recentOperations = [...recentMetrics]
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, 20);

    const trends = this.calculateTrends(recentMetrics, timeWindowMs);

    return {
      totalOperations: recentMetrics.length,
      totalDuration,
      averageDuration: Math.round(totalDuration / recentMetrics.length),
      successRate: Math.round((successCount / recentMetrics.length) * 100),
      byCategory,
      slowestOperations,
      recentOperations,
      trends,
    };
  }

  private getEmptyStats(timeWindowMs: number): ProfilerStats {
    return {
      totalOperations: 0,
      totalDuration: 0,
      averageDuration: 0,
      successRate: 100,
      byCategory: [],
      slowestOperations: [],
      recentOperations: [],
      trends: {
        timeWindow: timeWindowMs,
        operationsPerMinute: 0,
        averageDurationTrend: "stable",
        errorRateTrend: "stable",
      },
    };
  }

  private calculateCategoryStats(metrics: PerformanceMetric[]): CategoryStats[] {
    const categories = new Map<MetricCategory, PerformanceMetric[]>();

    for (const metric of metrics) {
      const existing = categories.get(metric.category) || [];
      existing.push(metric);
      categories.set(metric.category, existing);
    }

    const stats: CategoryStats[] = [];

    for (const [category, categoryMetrics] of Array.from(categories.entries())) {
      const durations = categoryMetrics
        .filter((m: PerformanceMetric) => m.duration !== undefined)
        .map((m: PerformanceMetric) => m.duration!)
        .sort((a: number, b: number) => a - b);

      const totalDuration = durations.reduce((sum: number, d: number) => sum + d, 0);
      const successCount = categoryMetrics.filter((m: PerformanceMetric) => m.success).length;

      stats.push({
        category,
        count: categoryMetrics.length,
        totalDuration,
        averageDuration: Math.round(totalDuration / categoryMetrics.length),
        successRate: Math.round((successCount / categoryMetrics.length) * 100),
        p50: this.percentile(durations, 50),
        p95: this.percentile(durations, 95),
        p99: this.percentile(durations, 99),
      });
    }

    return stats.sort((a, b) => b.totalDuration - a.totalDuration);
  }

  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
  }

  private calculateTrends(metrics: PerformanceMetric[], timeWindowMs: number): TrendData {
    const minutes = timeWindowMs / 60000;
    const operationsPerMinute = Math.round(metrics.length / minutes * 100) / 100;

    const halfWindow = timeWindowMs / 2;
    const now = Date.now();
    
    const firstHalf = metrics.filter(m => m.startTime < now - halfWindow);
    const secondHalf = metrics.filter(m => m.startTime >= now - halfWindow);

    let averageDurationTrend: TrendData["averageDurationTrend"] = "stable";
    let errorRateTrend: TrendData["errorRateTrend"] = "stable";

    if (firstHalf.length > 0 && secondHalf.length > 0) {
      const firstAvg = firstHalf.reduce((sum, m) => sum + (m.duration || 0), 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, m) => sum + (m.duration || 0), 0) / secondHalf.length;

      const durationChange = (secondAvg - firstAvg) / firstAvg;
      if (durationChange > 0.1) averageDurationTrend = "degrading";
      else if (durationChange < -0.1) averageDurationTrend = "improving";

      const firstErrorRate = firstHalf.filter(m => !m.success).length / firstHalf.length;
      const secondErrorRate = secondHalf.filter(m => !m.success).length / secondHalf.length;

      const errorChange = secondErrorRate - firstErrorRate;
      if (errorChange > 0.05) errorRateTrend = "degrading";
      else if (errorChange < -0.05) errorRateTrend = "improving";
    }

    return {
      timeWindow: timeWindowMs,
      operationsPerMinute,
      averageDurationTrend,
      errorRateTrend,
    };
  }

  getCategoryStats(category: MetricCategory, timeWindowMs: number = 3600000): CategoryStats | null {
    const cutoff = Date.now() - timeWindowMs;
    const categoryMetrics = this.metrics.filter(
      m => m.category === category && m.startTime >= cutoff
    );

    if (categoryMetrics.length === 0) return null;

    const durations = categoryMetrics
      .filter(m => m.duration !== undefined)
      .map(m => m.duration!)
      .sort((a, b) => a - b);

    const totalDuration = durations.reduce((sum, d) => sum + d, 0);
    const successCount = categoryMetrics.filter(m => m.success).length;

    return {
      category,
      count: categoryMetrics.length,
      totalDuration,
      averageDuration: Math.round(totalDuration / categoryMetrics.length),
      successRate: Math.round((successCount / categoryMetrics.length) * 100),
      p50: this.percentile(durations, 50),
      p95: this.percentile(durations, 95),
      p99: this.percentile(durations, 99),
    };
  }

  getActiveOperations(): PerformanceMetric[] {
    return Array.from(this.activeOperations.values()).map(op => ({
      ...op.metric,
      duration: Date.now() - op.metric.startTime,
    }));
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    for (const [, op] of this.activeOperations) {
      if (op.timeout) {
        clearTimeout(op.timeout);
      }
    }
    this.activeOperations.clear();
    this.metrics = [];
    logger.info("PerformanceProfilerService destroyed");
  }

  clearMetrics(): void {
    this.metrics = [];
    logger.info("Performance metrics cleared");
  }

  exportMetrics(format: "json" | "csv" = "json"): string {
    if (format === "csv") {
      const headers = "id,name,category,startTime,endTime,duration,success,error\n";
      const rows = this.metrics.map(m => 
        `${m.id},${m.name},${m.category},${m.startTime},${m.endTime || ""},${m.duration || ""},${m.success},"${m.error || ""}"`
      ).join("\n");
      return headers + rows;
    }

    return JSON.stringify(this.metrics, null, 2);
  }
}

export const performanceProfilerService = PerformanceProfilerService.getInstance();
