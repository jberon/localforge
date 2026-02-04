import logger from "../lib/logger";

export type AutonomyLevel = "low" | "medium" | "high" | "max";

interface AutonomyConfig {
  level: AutonomyLevel;
  confirmBeforeEdit: boolean;
  confirmBeforeDelete: boolean;
  confirmBeforeInstall: boolean;
  autoRunTests: boolean;
  autoFixErrors: boolean;
  autoRetryOnFailure: boolean;
  maxAutoRetries: number;
  selfTestingLoop: boolean;
  extendedSessions: boolean;
  maxSessionMinutes: number;
  requireApprovalFor: string[];
  description: string;
}

interface AutonomyBehavior {
  pausePoints: string[];
  autoActions: string[];
  blockedActions: string[];
}

const AUTONOMY_CONFIGS: Record<AutonomyLevel, AutonomyConfig> = {
  low: {
    level: "low",
    confirmBeforeEdit: true,
    confirmBeforeDelete: true,
    confirmBeforeInstall: true,
    autoRunTests: false,
    autoFixErrors: false,
    autoRetryOnFailure: false,
    maxAutoRetries: 0,
    selfTestingLoop: false,
    extendedSessions: false,
    maxSessionMinutes: 5,
    requireApprovalFor: [
      "file-edit",
      "file-create",
      "file-delete",
      "package-install",
      "database-change",
      "api-call"
    ],
    description: "Confirms every step. Maximum user control."
  },
  medium: {
    level: "medium",
    confirmBeforeEdit: false,
    confirmBeforeDelete: true,
    confirmBeforeInstall: true,
    autoRunTests: true,
    autoFixErrors: false,
    autoRetryOnFailure: true,
    maxAutoRetries: 2,
    selfTestingLoop: false,
    extendedSessions: false,
    maxSessionMinutes: 15,
    requireApprovalFor: [
      "file-delete",
      "package-install",
      "database-change"
    ],
    description: "Balanced mode. Confirms destructive actions only."
  },
  high: {
    level: "high",
    confirmBeforeEdit: false,
    confirmBeforeDelete: false,
    confirmBeforeInstall: false,
    autoRunTests: true,
    autoFixErrors: true,
    autoRetryOnFailure: true,
    maxAutoRetries: 5,
    selfTestingLoop: true,
    extendedSessions: true,
    maxSessionMinutes: 60,
    requireApprovalFor: [
      "database-schema-change",
      "production-deploy"
    ],
    description: "High autonomy. Self-testing and auto-fixing enabled."
  },
  max: {
    level: "max",
    confirmBeforeEdit: false,
    confirmBeforeDelete: false,
    confirmBeforeInstall: false,
    autoRunTests: true,
    autoFixErrors: true,
    autoRetryOnFailure: true,
    maxAutoRetries: 10,
    selfTestingLoop: true,
    extendedSessions: true,
    maxSessionMinutes: 200,
    requireApprovalFor: [],
    description: "Maximum autonomy. Extended sessions with full self-supervision."
  }
};

class AutonomyLevelService {
  private static instance: AutonomyLevelService;
  private globalLevel: AutonomyLevel = "medium";
  private projectLevels: Map<string, AutonomyLevel> = new Map();
  private sessionStartTimes: Map<string, Date> = new Map();
  private actionLog: Array<{
    projectId: string;
    action: string;
    approved: boolean;
    automatic: boolean;
    timestamp: Date;
  }> = [];
  private customConfigs: Map<string, Partial<AutonomyConfig>> = new Map();

  private constructor() {
    logger.info("AutonomyLevelService initialized", { defaultLevel: this.globalLevel });
  }

  static getInstance(): AutonomyLevelService {
    if (!AutonomyLevelService.instance) {
      AutonomyLevelService.instance = new AutonomyLevelService();
    }
    return AutonomyLevelService.instance;
  }

  setLevel(level: AutonomyLevel, projectId?: string): void {
    if (projectId) {
      this.projectLevels.set(projectId, level);
      logger.info("Project autonomy level set", { projectId, level });
    } else {
      this.globalLevel = level;
      logger.info("Global autonomy level set", { level });
    }
  }

  getLevel(projectId?: string): AutonomyLevel {
    if (projectId && this.projectLevels.has(projectId)) {
      return this.projectLevels.get(projectId)!;
    }
    return this.globalLevel;
  }

  getConfig(projectId?: string): AutonomyConfig {
    const level = this.getLevel(projectId);
    const baseConfig = { ...AUTONOMY_CONFIGS[level] };

    if (projectId && this.customConfigs.has(projectId)) {
      return { ...baseConfig, ...this.customConfigs.get(projectId) };
    }

    return baseConfig;
  }

  setCustomConfig(projectId: string, config: Partial<AutonomyConfig>): void {
    this.customConfigs.set(projectId, config);
    logger.info("Custom autonomy config set", { projectId, config });
  }

  canPerformAction(action: string, projectId?: string): {
    allowed: boolean;
    requiresApproval: boolean;
    reason?: string;
  } {
    const config = this.getConfig(projectId);

    if (config.requireApprovalFor.includes(action)) {
      return {
        allowed: true,
        requiresApproval: true,
        reason: `Action "${action}" requires user approval at ${config.level} autonomy level`
      };
    }

    if (action === "file-edit" && config.confirmBeforeEdit) {
      return { allowed: true, requiresApproval: true, reason: "Edit requires confirmation" };
    }

    if (action === "file-delete" && config.confirmBeforeDelete) {
      return { allowed: true, requiresApproval: true, reason: "Delete requires confirmation" };
    }

    if (action === "package-install" && config.confirmBeforeInstall) {
      return { allowed: true, requiresApproval: true, reason: "Install requires confirmation" };
    }

    return { allowed: true, requiresApproval: false };
  }

  logAction(
    projectId: string,
    action: string,
    approved: boolean,
    automatic: boolean
  ): void {
    this.actionLog.push({
      projectId,
      action,
      approved,
      automatic,
      timestamp: new Date()
    });

    if (this.actionLog.length > 1000) {
      this.actionLog = this.actionLog.slice(-500);
    }
  }

  startSession(projectId: string): void {
    this.sessionStartTimes.set(projectId, new Date());
    logger.info("Autonomy session started", { projectId });
  }

  isSessionActive(projectId: string): boolean {
    const startTime = this.sessionStartTimes.get(projectId);
    if (!startTime) return false;

    const config = this.getConfig(projectId);
    const elapsed = (Date.now() - startTime.getTime()) / 1000 / 60;

    return elapsed < config.maxSessionMinutes;
  }

  getSessionTimeRemaining(projectId: string): number {
    const startTime = this.sessionStartTimes.get(projectId);
    if (!startTime) return 0;

    const config = this.getConfig(projectId);
    const elapsed = (Date.now() - startTime.getTime()) / 1000 / 60;

    return Math.max(0, config.maxSessionMinutes - elapsed);
  }

  endSession(projectId: string): void {
    this.sessionStartTimes.delete(projectId);
    logger.info("Autonomy session ended", { projectId });
  }

  getBehavior(projectId?: string): AutonomyBehavior {
    const config = this.getConfig(projectId);

    const pausePoints: string[] = [...config.requireApprovalFor];
    const autoActions: string[] = [];
    const blockedActions: string[] = [];

    if (config.autoRunTests) autoActions.push("run-tests");
    if (config.autoFixErrors) autoActions.push("auto-fix-errors");
    if (config.autoRetryOnFailure) autoActions.push("retry-on-failure");
    if (config.selfTestingLoop) autoActions.push("self-testing-loop");

    if (config.level === "low") {
      blockedActions.push("batch-operations", "recursive-edits");
    }

    return { pausePoints, autoActions, blockedActions };
  }

  shouldAutoFix(projectId?: string): boolean {
    return this.getConfig(projectId).autoFixErrors;
  }

  shouldAutoTest(projectId?: string): boolean {
    return this.getConfig(projectId).autoRunTests;
  }

  shouldSelfTest(projectId?: string): boolean {
    return this.getConfig(projectId).selfTestingLoop;
  }

  getMaxRetries(projectId?: string): number {
    return this.getConfig(projectId).maxAutoRetries;
  }

  getActionLog(projectId?: string, limit: number = 50): typeof this.actionLog {
    let log = this.actionLog;
    if (projectId) {
      log = log.filter(l => l.projectId === projectId);
    }
    return log.slice(-limit);
  }

  getStats(): {
    globalLevel: AutonomyLevel;
    projectCount: number;
    activeSessions: number;
    totalActions: number;
    autoApprovedActions: number;
  } {
    const autoApproved = this.actionLog.filter(l => l.automatic && l.approved).length;

    return {
      globalLevel: this.globalLevel,
      projectCount: this.projectLevels.size,
      activeSessions: this.sessionStartTimes.size,
      totalActions: this.actionLog.length,
      autoApprovedActions: autoApproved
    };
  }

  getAllLevels(): Array<{ level: AutonomyLevel; config: AutonomyConfig }> {
    return Object.entries(AUTONOMY_CONFIGS).map(([level, config]) => ({
      level: level as AutonomyLevel,
      config
    }));
  }
}

export const autonomyLevelService = AutonomyLevelService.getInstance();
