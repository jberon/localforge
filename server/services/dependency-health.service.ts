import { logger } from "../lib/logger";

interface DependencyInfo {
  name: string;
  currentVersion: string;
  latestVersion?: string;
  isOutdated: boolean;
  hasVulnerabilities: boolean;
  vulnerabilities: Vulnerability[];
  lastUpdated?: string;
  license?: string;
  size?: number;
}

interface Vulnerability {
  id: string;
  severity: "low" | "moderate" | "high" | "critical";
  title: string;
  description: string;
  fixedIn?: string;
  url?: string;
}

interface HealthReport {
  dependencies: DependencyInfo[];
  summary: {
    total: number;
    outdated: number;
    vulnerable: number;
    healthy: number;
  };
  healthScore: number;
  recommendations: string[];
  criticalActions: string[];
}

interface KnownVulnerability {
  package: string;
  affectedVersions: string;
  severity: "low" | "moderate" | "high" | "critical";
  title: string;
  fixedIn: string;
}

class DependencyHealthService {
  private static instance: DependencyHealthService;
  private knownVulnerabilities: KnownVulnerability[] = [];
  private latestVersionCache: Map<string, { version: string; timestamp: number }> = new Map();
  private cacheExpiry: number = 24 * 60 * 60 * 1000;

  private constructor() {
    this.initializeKnownVulnerabilities();
  }

  static getInstance(): DependencyHealthService {
    if (!DependencyHealthService.instance) {
      DependencyHealthService.instance = new DependencyHealthService();
    }
    return DependencyHealthService.instance;
  }

  private initializeKnownVulnerabilities(): void {
    this.knownVulnerabilities = [
      {
        package: "lodash",
        affectedVersions: "<4.17.21",
        severity: "high",
        title: "Prototype Pollution",
        fixedIn: "4.17.21"
      },
      {
        package: "axios",
        affectedVersions: "<0.21.1",
        severity: "high",
        title: "Server-Side Request Forgery",
        fixedIn: "0.21.1"
      },
      {
        package: "minimist",
        affectedVersions: "<1.2.6",
        severity: "critical",
        title: "Prototype Pollution",
        fixedIn: "1.2.6"
      },
      {
        package: "node-fetch",
        affectedVersions: "<2.6.7",
        severity: "high",
        title: "Exposure of Sensitive Information",
        fixedIn: "2.6.7"
      },
      {
        package: "express",
        affectedVersions: "<4.17.3",
        severity: "moderate",
        title: "Open Redirect Vulnerability",
        fixedIn: "4.17.3"
      },
      {
        package: "moment",
        affectedVersions: "<2.29.4",
        severity: "moderate",
        title: "Path Traversal",
        fixedIn: "2.29.4"
      },
      {
        package: "jsonwebtoken",
        affectedVersions: "<9.0.0",
        severity: "high",
        title: "Algorithm Confusion Attack",
        fixedIn: "9.0.0"
      },
      {
        package: "shell-quote",
        affectedVersions: "<1.7.3",
        severity: "critical",
        title: "Command Injection",
        fixedIn: "1.7.3"
      },
      {
        package: "tar",
        affectedVersions: "<6.1.11",
        severity: "high",
        title: "Arbitrary File Overwrite",
        fixedIn: "6.1.11"
      },
      {
        package: "glob-parent",
        affectedVersions: "<5.1.2",
        severity: "high",
        title: "Regular Expression Denial of Service",
        fixedIn: "5.1.2"
      }
    ];
  }

  async analyzePackageJson(packageJsonContent: string): Promise<HealthReport> {
    logger.info("Analyzing package.json for dependency health");

    let packageJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    try {
      packageJson = JSON.parse(packageJsonContent);
    } catch (e) {
      return this.createEmptyReport("Invalid package.json format");
    }

    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    };

    const dependencies: DependencyInfo[] = [];

    for (const [name, versionSpec] of Object.entries(allDeps)) {
      const currentVersion = this.extractVersion(versionSpec);
      const vulnerabilities = this.checkVulnerabilities(name, currentVersion);
      const latestVersion = await this.getLatestVersion(name);
      const isOutdated = latestVersion ? this.isVersionOutdated(currentVersion, latestVersion) : false;

      dependencies.push({
        name,
        currentVersion,
        latestVersion,
        isOutdated,
        hasVulnerabilities: vulnerabilities.length > 0,
        vulnerabilities,
        size: this.estimatePackageSize(name)
      });
    }

    const summary = {
      total: dependencies.length,
      outdated: dependencies.filter(d => d.isOutdated).length,
      vulnerable: dependencies.filter(d => d.hasVulnerabilities).length,
      healthy: dependencies.filter(d => !d.isOutdated && !d.hasVulnerabilities).length
    };

    const healthScore = this.calculateHealthScore(dependencies, summary);
    const recommendations = this.generateRecommendations(dependencies);
    const criticalActions = this.getCriticalActions(dependencies);

    logger.info("Dependency health analysis complete", {
      total: summary.total,
      vulnerable: summary.vulnerable,
      healthScore
    });

    return {
      dependencies,
      summary,
      healthScore,
      recommendations,
      criticalActions
    };
  }

  private extractVersion(versionSpec: string): string {
    return versionSpec.replace(/^[\^~>=<]+/, "");
  }

  private checkVulnerabilities(packageName: string, version: string): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];
    const relevant = this.knownVulnerabilities.filter(v => v.package === packageName);

    for (const vuln of relevant) {
      if (this.isVersionAffected(version, vuln.affectedVersions)) {
        vulnerabilities.push({
          id: `VULN-${packageName}-${vuln.severity}`,
          severity: vuln.severity,
          title: vuln.title,
          description: `Affects versions ${vuln.affectedVersions}`,
          fixedIn: vuln.fixedIn
        });
      }
    }

    return vulnerabilities;
  }

  private isVersionAffected(version: string, affectedSpec: string): boolean {
    const match = affectedSpec.match(/^<(.+)$/);
    if (match) {
      return this.compareVersions(version, match[1]) < 0;
    }
    return false;
  }

  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split(".").map(p => parseInt(p) || 0);
    const parts2 = v2.split(".").map(p => parseInt(p) || 0);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 < p2) return -1;
      if (p1 > p2) return 1;
    }
    return 0;
  }

  private async getLatestVersion(packageName: string): Promise<string | undefined> {
    const cached = this.latestVersionCache.get(packageName);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.version;
    }

    const mockLatest: Record<string, string> = {
      "react": "18.2.0",
      "react-dom": "18.2.0",
      "typescript": "5.3.3",
      "vite": "5.0.12",
      "express": "4.18.2",
      "lodash": "4.17.21",
      "axios": "1.6.7",
      "@tanstack/react-query": "5.18.1",
      "tailwindcss": "3.4.1",
      "zod": "3.22.4",
      "drizzle-orm": "0.29.3"
    };

    const latest = mockLatest[packageName];
    if (latest) {
      this.latestVersionCache.set(packageName, { version: latest, timestamp: Date.now() });
    }
    return latest;
  }

  private isVersionOutdated(current: string, latest: string): boolean {
    return this.compareVersions(current, latest) < 0;
  }

  private estimatePackageSize(packageName: string): number {
    const sizes: Record<string, number> = {
      "lodash": 72000,
      "moment": 290000,
      "axios": 13000,
      "react": 6500,
      "react-dom": 130000,
      "express": 55000,
      "@tanstack/react-query": 45000
    };
    return sizes[packageName] || 10000;
  }

  private calculateHealthScore(dependencies: DependencyInfo[], summary: { total: number; vulnerable: number; outdated: number }): number {
    let score = 100;

    for (const dep of dependencies) {
      for (const vuln of dep.vulnerabilities) {
        switch (vuln.severity) {
          case "critical": score -= 20; break;
          case "high": score -= 10; break;
          case "moderate": score -= 5; break;
          case "low": score -= 2; break;
        }
      }
    }

    score -= summary.outdated * 2;

    return Math.max(0, Math.min(100, score));
  }

  private generateRecommendations(dependencies: DependencyInfo[]): string[] {
    const recommendations: string[] = [];

    const criticalVulns = dependencies.filter(d => 
      d.vulnerabilities.some(v => v.severity === "critical")
    );
    if (criticalVulns.length > 0) {
      recommendations.push(`URGENT: Update ${criticalVulns.map(d => d.name).join(", ")} to fix critical vulnerabilities`);
    }

    const outdated = dependencies.filter(d => d.isOutdated);
    if (outdated.length > 5) {
      recommendations.push(`Consider running 'npm update' to update ${outdated.length} outdated packages`);
    }

    const moment = dependencies.find(d => d.name === "moment");
    if (moment) {
      recommendations.push("Consider replacing 'moment' with 'date-fns' or 'dayjs' for smaller bundle size");
    }

    const lodash = dependencies.find(d => d.name === "lodash" && !d.name.startsWith("lodash-es"));
    if (lodash) {
      recommendations.push("Consider using 'lodash-es' for better tree-shaking");
    }

    return recommendations;
  }

  private getCriticalActions(dependencies: DependencyInfo[]): string[] {
    const actions: string[] = [];

    for (const dep of dependencies) {
      const critical = dep.vulnerabilities.filter(v => 
        v.severity === "critical" || v.severity === "high"
      );
      for (const vuln of critical) {
        actions.push(
          `npm install ${dep.name}@${vuln.fixedIn || "latest"} # Fix: ${vuln.title}`
        );
      }
    }

    return actions;
  }

  private createEmptyReport(error: string): HealthReport {
    return {
      dependencies: [],
      summary: { total: 0, outdated: 0, vulnerable: 0, healthy: 0 },
      healthScore: 0,
      recommendations: [error],
      criticalActions: []
    };
  }

  addKnownVulnerability(vuln: KnownVulnerability): void {
    this.knownVulnerabilities.push(vuln);
    logger.info("Added known vulnerability", { package: vuln.package });
  }

  clearCache(): void {
    this.latestVersionCache.clear();
    logger.info("Version cache cleared");
  }
}

export const dependencyHealthService = DependencyHealthService.getInstance();
