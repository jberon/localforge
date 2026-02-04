import { EventEmitter } from "events";
import logger from "../lib/logger";
import { modelProviderService } from "./model-provider.service";
import { resilienceService } from "./resilience.service";

export type AlertSeverity = "info" | "warning" | "critical";
export type AlertType = 
  | "circuit_breaker_open"
  | "circuit_breaker_closed"
  | "high_memory_pressure"
  | "memory_pressure_normal"
  | "queue_backlog"
  | "queue_cleared"
  | "model_hot_swap"
  | "generation_error"
  | "validation_failure"
  | "cache_cleared"
  | "system_health";

export interface HealthAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  details?: Record<string, any>;
  timestamp: number;
  acknowledged: boolean;
}

export interface HealthStatus {
  overall: "healthy" | "degraded" | "critical";
  components: {
    llm: "healthy" | "degraded" | "critical";
    memory: "healthy" | "degraded" | "critical";
    queue: "healthy" | "degraded" | "critical";
    cache: "healthy" | "degraded" | "critical";
  };
  alerts: HealthAlert[];
  lastUpdated: number;
}

export class HealthAlertsService extends EventEmitter {
  private static instance: HealthAlertsService;
  
  private alerts: HealthAlert[] = [];
  private maxAlerts = 100;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lastStatus: HealthStatus | null = null;
  
  // Thresholds
  private memoryWarningThreshold = 0.7;
  private memoryCriticalThreshold = 0.9;
  private queueWarningThreshold = 5;
  private queueCriticalThreshold = 10;

  private constructor() {
    super();
    this.startMonitoring();
  }

  static getInstance(): HealthAlertsService {
    if (!HealthAlertsService.instance) {
      HealthAlertsService.instance = new HealthAlertsService();
    }
    return HealthAlertsService.instance;
  }

  private startMonitoring(): void {
    // Monitor every 5 seconds
    this.monitoringInterval = setInterval(() => {
      this.checkHealth();
    }, 5000);
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  private checkHealth(): void {
    const resourceStatus = modelProviderService.getResourceStatus();
    const resilienceStats = resilienceService.getStats();
    const memoryPressure = modelProviderService.getMemoryPressure();

    // Check memory pressure
    if (memoryPressure.usage >= this.memoryCriticalThreshold) {
      this.createAlert("high_memory_pressure", "critical", 
        `Critical memory pressure: ${(memoryPressure.usage * 100).toFixed(1)}% used`,
        { usage: memoryPressure.usage, threshold: this.memoryCriticalThreshold }
      );
    } else if (memoryPressure.usage >= this.memoryWarningThreshold) {
      this.createAlert("high_memory_pressure", "warning",
        `High memory pressure: ${(memoryPressure.usage * 100).toFixed(1)}% used`,
        { usage: memoryPressure.usage, threshold: this.memoryWarningThreshold }
      );
    } else if (this.hasRecentAlert("high_memory_pressure")) {
      this.createAlert("memory_pressure_normal", "info",
        `Memory pressure normalized: ${(memoryPressure.usage * 100).toFixed(1)}% used`,
        { usage: memoryPressure.usage }
      );
    }

    // Check queue backlog
    if (resourceStatus.queuedRequests >= this.queueCriticalThreshold) {
      this.createAlert("queue_backlog", "critical",
        `Critical queue backlog: ${resourceStatus.queuedRequests} requests waiting`,
        { queueSize: resourceStatus.queuedRequests, estimatedWait: resourceStatus.estimatedWaitMs }
      );
    } else if (resourceStatus.queuedRequests >= this.queueWarningThreshold) {
      this.createAlert("queue_backlog", "warning",
        `Queue backlog: ${resourceStatus.queuedRequests} requests waiting`,
        { queueSize: resourceStatus.queuedRequests, estimatedWait: resourceStatus.estimatedWaitMs }
      );
    } else if (this.hasRecentAlert("queue_backlog") && resourceStatus.queuedRequests === 0) {
      this.createAlert("queue_cleared", "info",
        "Request queue cleared",
        { queueSize: 0 }
      );
    }

    // Check circuit breakers
    const circuits = resilienceStats.circuitBreakers;
    for (const [key, state] of Object.entries(circuits)) {
      if (state.state === "open") {
        this.createAlert("circuit_breaker_open", "critical",
          `Circuit breaker open: ${key}`,
          { circuitKey: key, failures: state.failures, lastFailure: state.lastFailure }
        );
      }
    }

    // Update overall status
    this.lastStatus = this.calculateHealthStatus();
    this.emit("health_update", this.lastStatus);
  }

  private hasRecentAlert(type: AlertType): boolean {
    const recentThreshold = 60000; // 1 minute
    return this.alerts.some(a => 
      a.type === type && 
      Date.now() - a.timestamp < recentThreshold
    );
  }

  createAlert(
    type: AlertType,
    severity: AlertSeverity,
    message: string,
    details?: Record<string, any>
  ): HealthAlert {
    // Deduplicate recent identical alerts
    const recentIdentical = this.alerts.find(a => 
      a.type === type && 
      a.severity === severity &&
      Date.now() - a.timestamp < 30000 // Within 30 seconds
    );
    
    if (recentIdentical) {
      return recentIdentical;
    }

    const alert: HealthAlert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      severity,
      message,
      details,
      timestamp: Date.now(),
      acknowledged: false,
    };

    this.alerts.unshift(alert);
    
    // Trim old alerts
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(0, this.maxAlerts);
    }

    logger.info("Health alert created", { type, severity, message });
    this.emit("alert", alert);
    
    return alert;
  }

  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      this.emit("alert_acknowledged", alert);
      return true;
    }
    return false;
  }

  acknowledgeAllAlerts(): void {
    for (const alert of this.alerts) {
      alert.acknowledged = true;
    }
    this.emit("all_alerts_acknowledged");
  }

  getAlerts(options?: { 
    severity?: AlertSeverity; 
    acknowledged?: boolean; 
    limit?: number;
  }): HealthAlert[] {
    let filtered = [...this.alerts];
    
    if (options?.severity) {
      filtered = filtered.filter(a => a.severity === options.severity);
    }
    
    if (options?.acknowledged !== undefined) {
      filtered = filtered.filter(a => a.acknowledged === options.acknowledged);
    }
    
    if (options?.limit) {
      filtered = filtered.slice(0, options.limit);
    }
    
    return filtered;
  }

  getUnacknowledgedCount(): number {
    return this.alerts.filter(a => !a.acknowledged).length;
  }

  private calculateHealthStatus(): HealthStatus {
    const resourceStatus = modelProviderService.getResourceStatus();
    const resilienceStats = resilienceService.getStats();
    const memoryPressure = modelProviderService.getMemoryPressure();
    const cacheStats = modelProviderService.getCacheStats();

    // Calculate component health
    const memoryHealth = memoryPressure.usage >= this.memoryCriticalThreshold ? "critical" :
                         memoryPressure.usage >= this.memoryWarningThreshold ? "degraded" : "healthy";

    const queueHealth = resourceStatus.queuedRequests >= this.queueCriticalThreshold ? "critical" :
                        resourceStatus.queuedRequests >= this.queueWarningThreshold ? "degraded" : "healthy";

    const openCircuits = Object.values(resilienceStats.circuitBreakers)
      .filter(c => c.state === "open").length;
    const llmHealth = openCircuits > 0 ? "critical" : "healthy";

    const cacheHealth = "healthy"; // Cache is always healthy for now

    // Calculate overall health
    const componentHealths = [memoryHealth, queueHealth, llmHealth, cacheHealth];
    const overallHealth = componentHealths.includes("critical") ? "critical" :
                          componentHealths.includes("degraded") ? "degraded" : "healthy";

    return {
      overall: overallHealth,
      components: {
        llm: llmHealth,
        memory: memoryHealth,
        queue: queueHealth,
        cache: cacheHealth,
      },
      alerts: this.getAlerts({ acknowledged: false, limit: 10 }),
      lastUpdated: Date.now(),
    };
  }

  getHealthStatus(): HealthStatus {
    if (!this.lastStatus) {
      this.lastStatus = this.calculateHealthStatus();
    }
    return this.lastStatus;
  }

  // Notify about model hot-swap
  notifyHotSwap(from: string, to: string, reason: string): void {
    this.createAlert("model_hot_swap", "info",
      `Model switched from ${from} to ${to}`,
      { from, to, reason }
    );
  }

  // Notify about generation errors
  notifyGenerationError(error: string, context?: Record<string, any>): void {
    this.createAlert("generation_error", "warning",
      `Generation error: ${error}`,
      context
    );
  }

  // Notify about validation failures
  notifyValidationFailure(errors: number, warnings: number): void {
    this.createAlert("validation_failure", errors > 0 ? "warning" : "info",
      `Validation completed: ${errors} errors, ${warnings} warnings`,
      { errors, warnings }
    );
  }
}

export const healthAlertsService = HealthAlertsService.getInstance();
