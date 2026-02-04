import { logger } from "../lib/logger";

export type DeploymentPlatform = "vercel" | "netlify" | "railway" | "render" | "replit";

export type DeploymentStatus = "pending" | "building" | "deploying" | "success" | "failed";

export interface PlatformConfig {
  id: DeploymentPlatform;
  name: string;
  description: string;
  icon: string;
  supportsDocker: boolean;
  supportsStatic: boolean;
  supportsNode: boolean;
  configFile: string;
  envFormat: "dotenv" | "json" | "yaml";
  defaultBuildCommand: string;
  defaultOutputDir: string;
  docsUrl: string;
}

export interface DeploymentPackage {
  id: string;
  projectId: number;
  platform: DeploymentPlatform;
  configFiles: Record<string, string>;
  envTemplate: string;
  dockerfile?: string;
  readme: string;
  createdAt: Date;
}

export interface Deployment {
  id: string;
  projectId: number;
  platform: DeploymentPlatform;
  status: DeploymentStatus;
  url?: string;
  buildLogs: string[];
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface ProjectDeploymentInfo {
  name: string;
  framework: "react" | "next" | "vite" | "express" | "static";
  hasBackend: boolean;
  hasDatabase: boolean;
  entryPoint: string;
  buildCommand: string;
  outputDir: string;
  envVars: string[];
}

const PLATFORM_CONFIGS: Record<DeploymentPlatform, PlatformConfig> = {
  vercel: {
    id: "vercel",
    name: "Vercel",
    description: "Best for React, Next.js, and static sites. Zero-config deployments.",
    icon: "triangle",
    supportsDocker: false,
    supportsStatic: true,
    supportsNode: true,
    configFile: "vercel.json",
    envFormat: "dotenv",
    defaultBuildCommand: "npm run build",
    defaultOutputDir: "dist",
    docsUrl: "https://vercel.com/docs"
  },
  netlify: {
    id: "netlify",
    name: "Netlify",
    description: "Great for static sites and serverless functions. Easy CI/CD.",
    icon: "globe",
    supportsDocker: false,
    supportsStatic: true,
    supportsNode: true,
    configFile: "netlify.toml",
    envFormat: "dotenv",
    defaultBuildCommand: "npm run build",
    defaultOutputDir: "dist",
    docsUrl: "https://docs.netlify.com"
  },
  railway: {
    id: "railway",
    name: "Railway",
    description: "Full-stack apps with databases. Great for backends.",
    icon: "train",
    supportsDocker: true,
    supportsStatic: false,
    supportsNode: true,
    configFile: "railway.json",
    envFormat: "json",
    defaultBuildCommand: "npm run build",
    defaultOutputDir: "dist",
    docsUrl: "https://docs.railway.app"
  },
  render: {
    id: "render",
    name: "Render",
    description: "Simple cloud hosting for web apps and APIs.",
    icon: "cloud",
    supportsDocker: true,
    supportsStatic: true,
    supportsNode: true,
    configFile: "render.yaml",
    envFormat: "yaml",
    defaultBuildCommand: "npm run build",
    defaultOutputDir: "dist",
    docsUrl: "https://render.com/docs"
  },
  replit: {
    id: "replit",
    name: "Replit",
    description: "Deploy directly on Replit with one click.",
    icon: "code",
    supportsDocker: false,
    supportsStatic: true,
    supportsNode: true,
    configFile: ".replit",
    envFormat: "dotenv",
    defaultBuildCommand: "npm run build",
    defaultOutputDir: "dist",
    docsUrl: "https://docs.replit.com/hosting/deployments"
  }
};

class DeploymentService {
  private static instance: DeploymentService;
  private deployments: Map<string, Deployment> = new Map();
  private packages: Map<string, DeploymentPackage> = new Map();

  private constructor() {
    logger.info("DeploymentService initialized");
  }

  static getInstance(): DeploymentService {
    if (!DeploymentService.instance) {
      DeploymentService.instance = new DeploymentService();
    }
    return DeploymentService.instance;
  }

  getPlatforms(): PlatformConfig[] {
    return Object.values(PLATFORM_CONFIGS);
  }

  getPlatform(id: DeploymentPlatform): PlatformConfig | null {
    return PLATFORM_CONFIGS[id] || null;
  }

  getRecommendedPlatform(projectInfo: ProjectDeploymentInfo): DeploymentPlatform {
    if (projectInfo.hasDatabase) {
      return "railway";
    }
    if (projectInfo.hasBackend) {
      return "render";
    }
    if (projectInfo.framework === "next") {
      return "vercel";
    }
    return "netlify";
  }

  generatePackage(
    projectId: number,
    platform: DeploymentPlatform,
    projectInfo: ProjectDeploymentInfo
  ): DeploymentPackage {
    const id = `pkg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const platformConfig = PLATFORM_CONFIGS[platform];

    const configFiles: Record<string, string> = {};
    
    // Generate platform-specific config
    switch (platform) {
      case "vercel":
        configFiles["vercel.json"] = this.generateVercelConfig(projectInfo);
        break;
      case "netlify":
        configFiles["netlify.toml"] = this.generateNetlifyConfig(projectInfo);
        break;
      case "railway":
        configFiles["railway.json"] = this.generateRailwayConfig(projectInfo);
        break;
      case "render":
        configFiles["render.yaml"] = this.generateRenderConfig(projectInfo);
        break;
      case "replit":
        configFiles[".replit"] = this.generateReplitConfig(projectInfo);
        break;
    }

    // Generate Dockerfile if platform supports it and project has backend
    let dockerfile: string | undefined;
    if (platformConfig.supportsDocker && projectInfo.hasBackend) {
      dockerfile = this.generateDockerfile(projectInfo);
      configFiles["Dockerfile"] = dockerfile;
    }

    // Generate env template
    const envTemplate = this.generateEnvTemplate(projectInfo, platformConfig.envFormat);

    // Generate deployment readme (pass config file names to avoid recursion)
    const readme = this.generateDeploymentReadme(platform, projectInfo, Object.keys(configFiles));

    const pkg: DeploymentPackage = {
      id,
      projectId,
      platform,
      configFiles,
      envTemplate,
      dockerfile,
      readme,
      createdAt: new Date()
    };

    this.packages.set(id, pkg);
    logger.info("Deployment package generated", { id, platform, projectId });

    return pkg;
  }

  private generateVercelConfig(projectInfo: ProjectDeploymentInfo): string {
    const config: Record<string, unknown> = {
      version: 2,
      builds: [
        {
          src: "package.json",
          use: "@vercel/node"
        }
      ],
      routes: projectInfo.hasBackend ? [
        { src: "/api/(.*)", dest: "/server/index.ts" },
        { src: "/(.*)", dest: "/dist/$1" }
      ] : undefined
    };

    if (!projectInfo.hasBackend) {
      config.builds = [
        {
          src: "package.json",
          use: "@vercel/static-build",
          config: {
            distDir: projectInfo.outputDir
          }
        }
      ];
      delete config.routes;
    }

    return JSON.stringify(config, null, 2);
  }

  private generateNetlifyConfig(projectInfo: ProjectDeploymentInfo): string {
    const lines = [
      "[build]",
      `  command = "${projectInfo.buildCommand}"`,
      `  publish = "${projectInfo.outputDir}"`,
      ""
    ];

    if (projectInfo.hasBackend) {
      lines.push(
        "[functions]",
        "  directory = \"netlify/functions\"",
        "",
        "[[redirects]]",
        "  from = \"/api/*\"",
        "  to = \"/.netlify/functions/:splat\"",
        "  status = 200",
        ""
      );
    }

    lines.push(
      "[[redirects]]",
      "  from = \"/*\"",
      "  to = \"/index.html\"",
      "  status = 200"
    );

    return lines.join("\n");
  }

  private generateRailwayConfig(projectInfo: ProjectDeploymentInfo): string {
    const config = {
      build: {
        builder: projectInfo.hasBackend ? "DOCKERFILE" : "NIXPACKS",
        buildCommand: projectInfo.buildCommand
      },
      deploy: {
        startCommand: projectInfo.hasBackend ? "npm start" : undefined,
        healthcheckPath: projectInfo.hasBackend ? "/api/health" : undefined,
        restartPolicyType: "ON_FAILURE"
      }
    };

    return JSON.stringify(config, null, 2);
  }

  private generateRenderConfig(projectInfo: ProjectDeploymentInfo): string {
    const services = [];

    if (projectInfo.hasBackend) {
      services.push({
        type: "web",
        name: projectInfo.name,
        env: "node",
        buildCommand: projectInfo.buildCommand,
        startCommand: "npm start",
        healthCheckPath: "/api/health"
      });
    } else {
      services.push({
        type: "web",
        name: projectInfo.name,
        env: "static",
        buildCommand: projectInfo.buildCommand,
        staticPublishPath: projectInfo.outputDir
      });
    }

    if (projectInfo.hasDatabase) {
      services.push({
        type: "pserv",
        name: `${projectInfo.name}-db`,
        env: "docker",
        dockerfilePath: "./Dockerfile.db",
        disk: {
          name: "data",
          mountPath: "/var/lib/postgresql/data",
          sizeGB: 1
        }
      });
    }

    return `services:\n${services.map(s => `  - ${JSON.stringify(s)}`).join("\n")}`;
  }

  private generateReplitConfig(projectInfo: ProjectDeploymentInfo): string {
    return `run = "${projectInfo.hasBackend ? "npm start" : "npx serve " + projectInfo.outputDir}"
entrypoint = "${projectInfo.entryPoint}"

[nix]
channel = "stable-24_05"

[deployment]
run = ["sh", "-c", "${projectInfo.hasBackend ? "npm start" : "npx serve " + projectInfo.outputDir}"]
deploymentTarget = "cloudrun"
`;
  }

  private generateDockerfile(projectInfo: ProjectDeploymentInfo): string {
    return `# Production Dockerfile for ${projectInfo.name}
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production=false

# Copy source and build
COPY . .
RUN ${projectInfo.buildCommand}

# Production image
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy built assets and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 5000

CMD ["npm", "start"]
`;
  }

  private generateEnvTemplate(
    projectInfo: ProjectDeploymentInfo,
    format: "dotenv" | "json" | "yaml"
  ): string {
    const envVars = [
      "NODE_ENV=production",
      "PORT=5000",
      ...projectInfo.envVars.map(v => `${v}=your_value_here`)
    ];

    if (projectInfo.hasDatabase) {
      envVars.push("DATABASE_URL=your_database_url");
    }

    switch (format) {
      case "json":
        const jsonObj: Record<string, string> = {};
        envVars.forEach(line => {
          const [key, value] = line.split("=");
          jsonObj[key] = value;
        });
        return JSON.stringify(jsonObj, null, 2);

      case "yaml":
        return envVars.map(line => {
          const [key, value] = line.split("=");
          return `${key}: "${value}"`;
        }).join("\n");

      default:
        return envVars.join("\n");
    }
  }

  private generateDeploymentReadme(
    platform: DeploymentPlatform,
    projectInfo: ProjectDeploymentInfo,
    configFileNames: string[]
  ): string {
    const platformConfig = PLATFORM_CONFIGS[platform];

    return `# Deploying ${projectInfo.name} to ${platformConfig.name}

## Quick Start

1. **Prerequisites**
   - ${platformConfig.name} account
   - Git repository with your code

2. **Setup Environment Variables**
   Copy the \`.env.example\` file and fill in your values:
   \`\`\`
   cp .env.example .env
   \`\`\`

3. **Deploy**
${this.getDeployInstructions(platform, projectInfo)}

## Configuration Files

This package includes:
${configFileNames.map(f => `- \`${f}\``).join("\n")}

## Environment Variables

${projectInfo.envVars.length > 0 ? projectInfo.envVars.map(v => `- \`${v}\`: Required`).join("\n") : "No additional environment variables required."}

${projectInfo.hasDatabase ? `
## Database

This app requires a PostgreSQL database. Set the \`DATABASE_URL\` environment variable to your database connection string.
` : ""}

## Documentation

For more details, see the [${platformConfig.name} documentation](${platformConfig.docsUrl}).
`;
  }

  private getDeployInstructions(platform: DeploymentPlatform, projectInfo: ProjectDeploymentInfo): string {
    switch (platform) {
      case "vercel":
        return `   \`\`\`bash
   npx vercel
   \`\`\`
   Or connect your GitHub repo at vercel.com`;

      case "netlify":
        return `   \`\`\`bash
   npx netlify deploy --prod
   \`\`\`
   Or drag & drop your \`${projectInfo.outputDir}\` folder at netlify.com`;

      case "railway":
        return `   \`\`\`bash
   railway up
   \`\`\`
   Or connect your GitHub repo at railway.app`;

      case "render":
        return `   Connect your GitHub repo at render.com and it will auto-deploy.`;

      case "replit":
        return `   Click the "Deploy" button in the Replit workspace.`;

      default:
        return "   Follow the platform's deployment documentation.";
    }
  }

  startDeployment(
    projectId: number,
    platform: DeploymentPlatform,
    packageId: string
  ): Deployment & { packageId: string } {
    // Validate packageId is provided and exists
    if (!packageId) {
      throw new Error("Package ID is required for deployment");
    }

    const pkg = this.packages.get(packageId);
    if (!pkg) {
      throw new Error(`Package not found: ${packageId}`);
    }

    // Validate package matches the platform
    if (pkg.platform !== platform) {
      throw new Error(`Package platform mismatch: expected ${platform}, got ${pkg.platform}`);
    }

    const id = `dep_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const deployment: Deployment & { packageId: string } = {
      id,
      projectId,
      platform,
      packageId: pkg.id,
      status: "pending",
      buildLogs: [
        `Deployment started for ${platform}`,
        `Using deployment package: ${pkg.id}`,
        `Config files: ${Object.keys(pkg.configFiles).join(", ")}`
      ],
      startedAt: new Date()
    };

    this.deployments.set(id, deployment);
    logger.info("Deployment started", { id, platform, projectId, packageId: pkg?.id });

    // Simulate deployment progress
    this.simulateDeployment(id);

    return deployment;
  }

  private async simulateDeployment(deploymentId: string): Promise<void> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) return;

    const stages = [
      { status: "building" as DeploymentStatus, message: "Installing dependencies...", delay: 1000 },
      { status: "building" as DeploymentStatus, message: "Building application...", delay: 2000 },
      { status: "deploying" as DeploymentStatus, message: "Deploying to edge network...", delay: 1500 },
      { status: "success" as DeploymentStatus, message: "Deployment complete!", delay: 500 }
    ];

    for (const stage of stages) {
      await new Promise(resolve => setTimeout(resolve, stage.delay));
      
      deployment.status = stage.status;
      deployment.buildLogs.push(stage.message);
      
      if (stage.status === "success") {
        deployment.completedAt = new Date();
        deployment.url = `https://${deployment.projectId}-demo.${deployment.platform}.app`;
      }
      
      this.deployments.set(deploymentId, deployment);
    }

    logger.info("Deployment completed", { deploymentId, url: deployment.url });
  }

  getDeployment(id: string): Deployment | null {
    return this.deployments.get(id) || null;
  }

  getProjectDeployments(projectId: number): Deployment[] {
    return Array.from(this.deployments.values())
      .filter(d => d.projectId === projectId)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }

  getPackage(id: string): DeploymentPackage | null {
    return this.packages.get(id) || null;
  }

  getProjectPackages(projectId: number): DeploymentPackage[] {
    return Array.from(this.packages.values())
      .filter(p => p.projectId === projectId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  getStats(): {
    totalDeployments: number;
    successfulDeployments: number;
    platformBreakdown: Record<DeploymentPlatform, number>;
    packagesGenerated: number;
  } {
    const deployments = Array.from(this.deployments.values());
    const packages = Array.from(this.packages.values());

    const platformBreakdown: Record<DeploymentPlatform, number> = {
      vercel: 0,
      netlify: 0,
      railway: 0,
      render: 0,
      replit: 0
    };

    deployments.forEach(d => {
      platformBreakdown[d.platform]++;
    });

    return {
      totalDeployments: deployments.length,
      successfulDeployments: deployments.filter(d => d.status === "success").length,
      platformBreakdown,
      packagesGenerated: packages.length
    };
  }
}

export const deploymentService = DeploymentService.getInstance();
