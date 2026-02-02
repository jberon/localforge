import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Package,
  Download,
  FileArchive,
  Server,
  Globe,
  Rocket,
  CheckCircle2,
  Circle,
  Copy,
  Check,
  Terminal,
  Database,
  ExternalLink,
  FileCode,
  Loader2,
  FolderOpen,
  Settings,
  Zap,
  Container,
  Cloud,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface GeneratedFile {
  path: string;
  content: string;
  language?: string;
}

interface PublishingPanelProps {
  projectId: number;
  projectName: string;
  generatedFiles: GeneratedFile[];
  isFullStack: boolean;
}

type BuildTarget = "standalone" | "docker" | "serverless";
type PackageFormat = "zip" | "tar";

interface BuildConfig {
  target: BuildTarget;
  includeDocker: boolean;
  includeCICD: boolean;
  includeTests: boolean;
  includeEnvTemplate: boolean;
}

function CommandBlock({ command, description }: { command: string; description?: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    toast({ title: "Copied!", description: "Command copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative">
      {description && (
        <p className="text-sm text-muted-foreground mb-1">{description}</p>
      )}
      <div className="flex items-center gap-2 bg-muted/50 rounded-md p-3 font-mono text-sm">
        <Terminal className="h-4 w-4 text-muted-foreground shrink-0" />
        <code className="flex-1 overflow-x-auto">{command}</code>
        <Button
          size="icon"
          variant="ghost"
          onClick={handleCopy}
          data-testid={`button-copy-command`}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}

function FilePreviewCard({ title, content, onCopy }: { title: string; content: string; onCopy: () => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium flex items-center gap-2">
          <FileCode className="h-4 w-4" />
          {title}
        </p>
        <Button size="sm" variant="outline" onClick={onCopy} data-testid={`button-copy-${title.replace(/\./g, "-")}`}>
          <Copy className="h-3.5 w-3.5 mr-1" />
          Copy
        </Button>
      </div>
      <ScrollArea className="h-40 rounded-md border bg-muted/30">
        <pre className="p-3 text-xs font-mono">{content}</pre>
      </ScrollArea>
    </div>
  );
}

export function PublishingPanel({ projectId, projectName, generatedFiles, isFullStack }: PublishingPanelProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"package" | "docker" | "deploy">("package");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [buildConfig, setBuildConfig] = useState<BuildConfig>({
    target: "standalone",
    includeDocker: true,
    includeCICD: false,
    includeTests: false,
    includeEnvTemplate: true,
  });

  const safeName = projectName.toLowerCase().replace(/[^a-z0-9]/g, "_");
  const fileCount = generatedFiles.length;
  const totalSize = generatedFiles.reduce((acc, f) => acc + f.content.length, 0);
  const sizeKB = Math.round(totalSize / 1024);

  const handleDownloadPackage = useCallback(async () => {
    if (generatedFiles.length === 0) {
      toast({ title: "No files", description: "Generate some code first", variant: "destructive" });
      return;
    }

    setIsDownloading(true);
    setDownloadProgress(10);

    try {
      const response = await apiRequest("POST", `/api/projects/${projectId}/package`, {
        format: "zip",
        includeDocker: buildConfig.includeDocker,
        includeCICD: buildConfig.includeCICD,
        includeEnvTemplate: buildConfig.includeEnvTemplate,
      });

      setDownloadProgress(50);
      
      const blob = await response.blob();
      setDownloadProgress(80);
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeName}-project.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      setDownloadProgress(100);
      toast({ title: "Downloaded!", description: `${safeName}-project.zip saved successfully` });
    } catch (error: any) {
      toast({ title: "Download failed", description: error.message || "Failed to create package", variant: "destructive" });
    } finally {
      setIsDownloading(false);
      setTimeout(() => setDownloadProgress(0), 1000);
    }
  }, [projectId, generatedFiles, buildConfig, safeName, toast]);

  const handleCopyToClipboard = useCallback(async (content: string, name: string) => {
    await navigator.clipboard.writeText(content);
    toast({ title: "Copied!", description: `${name} copied to clipboard` });
  }, [toast]);

  const dockerfileContent = `FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source files
COPY . .

# Build the application
RUN npm run build

# Production image
FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 3000

CMD ["node", "dist/index.js"]`;

  const dockerComposeContent = `version: '3.8'

services:
  app:
    build: .
    container_name: ${safeName}
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/${safeName}
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:15-alpine
    container_name: ${safeName}_db
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=${safeName}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  postgres_data:`;

  const envTemplateContent = `# ${projectName} Environment Configuration

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/${safeName}

# Server
PORT=3000
NODE_ENV=development

# Add your API keys below
# OPENAI_API_KEY=your-key-here
# STRIPE_SECRET_KEY=your-key-here
`;

  const makefileContent = `# ${projectName} Makefile

.PHONY: install dev build start docker-build docker-up docker-down clean

# Development
install:
\tnpm install

dev:
\tnpm run dev

build:
\tnpm run build

start:
\tnpm start

# Docker
docker-build:
\tdocker-compose build

docker-up:
\tdocker-compose up -d

docker-down:
\tdocker-compose down

docker-logs:
\tdocker-compose logs -f

# Database
db-push:
\tnpm run db:push

db-migrate:
\tnpm run db:migrate

# Clean
clean:
\trm -rf node_modules dist .next
`;

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/10">
            <Rocket className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold">Publish & Package</h3>
            <p className="text-sm text-muted-foreground">
              Download, deploy, or containerize your project
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              <FolderOpen className="h-3 w-3 mr-1" />
              {fileCount} files
            </Badge>
            <Badge variant="secondary">
              ~{sizeKB} KB
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="h-full flex flex-col">
          <div className="px-4 pt-2">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="package" data-testid="tab-package">
                <Package className="h-4 w-4 mr-2" />
                Package
              </TabsTrigger>
              <TabsTrigger value="docker" data-testid="tab-docker">
                <Container className="h-4 w-4 mr-2" />
                Docker
              </TabsTrigger>
              <TabsTrigger value="deploy" data-testid="tab-deploy">
                <Cloud className="h-4 w-4 mr-2" />
                Deploy
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              <TabsContent value="package" className="m-0 space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileArchive className="h-4 w-4" />
                      Download Project Package
                    </CardTitle>
                    <CardDescription>
                      Get a ready-to-run ZIP file with all your generated code
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <label className="flex items-center gap-2 p-3 rounded-md border hover-elevate cursor-pointer">
                        <input
                          type="checkbox"
                          checked={buildConfig.includeDocker}
                          onChange={(e) => setBuildConfig(c => ({ ...c, includeDocker: e.target.checked }))}
                          className="rounded"
                          data-testid="checkbox-include-docker"
                        />
                        <div>
                          <p className="text-sm font-medium">Include Docker</p>
                          <p className="text-xs text-muted-foreground">Dockerfile & compose</p>
                        </div>
                      </label>
                      <label className="flex items-center gap-2 p-3 rounded-md border hover-elevate cursor-pointer">
                        <input
                          type="checkbox"
                          checked={buildConfig.includeEnvTemplate}
                          onChange={(e) => setBuildConfig(c => ({ ...c, includeEnvTemplate: e.target.checked }))}
                          className="rounded"
                          data-testid="checkbox-include-env"
                        />
                        <div>
                          <p className="text-sm font-medium">Include .env Template</p>
                          <p className="text-xs text-muted-foreground">Environment config</p>
                        </div>
                      </label>
                      <label className="flex items-center gap-2 p-3 rounded-md border hover-elevate cursor-pointer">
                        <input
                          type="checkbox"
                          checked={buildConfig.includeCICD}
                          onChange={(e) => setBuildConfig(c => ({ ...c, includeCICD: e.target.checked }))}
                          className="rounded"
                          data-testid="checkbox-include-cicd"
                        />
                        <div>
                          <p className="text-sm font-medium">Include CI/CD</p>
                          <p className="text-xs text-muted-foreground">GitHub Actions</p>
                        </div>
                      </label>
                      <label className="flex items-center gap-2 p-3 rounded-md border hover-elevate cursor-pointer">
                        <input
                          type="checkbox"
                          checked={buildConfig.includeTests}
                          onChange={(e) => setBuildConfig(c => ({ ...c, includeTests: e.target.checked }))}
                          className="rounded"
                          data-testid="checkbox-include-tests"
                        />
                        <div>
                          <p className="text-sm font-medium">Include Tests</p>
                          <p className="text-xs text-muted-foreground">Test setup</p>
                        </div>
                      </label>
                    </div>

                    {downloadProgress > 0 && (
                      <Progress value={downloadProgress} className="h-2" />
                    )}

                    <Button
                      onClick={handleDownloadPackage}
                      disabled={isDownloading || fileCount === 0}
                      className="w-full"
                      size="lg"
                      data-testid="button-download-package"
                    >
                      {isDownloading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Packaging...
                        </>
                      ) : (
                        <>
                          <Download className="h-4 w-4 mr-2" />
                          Download {safeName}-project.zip
                        </>
                      )}
                    </Button>

                    <p className="text-xs text-muted-foreground text-center">
                      Contains {fileCount} files (~{sizeKB} KB)
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Terminal className="h-4 w-4" />
                      Quick Start Commands
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <CommandBlock
                      command={`unzip ${safeName}-project.zip && cd ${safeName}`}
                      description="1. Extract and enter project"
                    />
                    <CommandBlock
                      command="npm install"
                      description="2. Install dependencies"
                    />
                    {isFullStack && (
                      <CommandBlock
                        command="npm run db:push"
                        description="3. Setup database"
                      />
                    )}
                    <CommandBlock
                      command="npm run dev"
                      description={isFullStack ? "4. Start development server" : "3. Start development server"}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="docker" className="m-0 space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Container className="h-4 w-4" />
                      Docker Configuration
                    </CardTitle>
                    <CardDescription>
                      Container-ready configuration for consistent deployments
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FilePreviewCard
                      title="Dockerfile"
                      content={dockerfileContent}
                      onCopy={() => handleCopyToClipboard(dockerfileContent, "Dockerfile")}
                    />

                    {isFullStack && (
                      <FilePreviewCard
                        title="docker-compose.yml"
                        content={dockerComposeContent}
                        onCopy={() => handleCopyToClipboard(dockerComposeContent, "docker-compose.yml")}
                      />
                    )}

                    <Separator />

                    <div className="space-y-3">
                      <h4 className="text-sm font-medium">Build & Run Commands</h4>
                      {isFullStack ? (
                        <>
                          <CommandBlock
                            command="docker-compose build"
                            description="Build containers"
                          />
                          <CommandBlock
                            command="docker-compose up -d"
                            description="Start services"
                          />
                          <CommandBlock
                            command="docker-compose logs -f"
                            description="View logs"
                          />
                        </>
                      ) : (
                        <>
                          <CommandBlock
                            command={`docker build -t ${safeName} .`}
                            description="Build image"
                          />
                          <CommandBlock
                            command={`docker run -p 3000:3000 ${safeName}`}
                            description="Run container"
                          />
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      Additional Files
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FilePreviewCard
                      title=".env.example"
                      content={envTemplateContent}
                      onCopy={() => handleCopyToClipboard(envTemplateContent, ".env.example")}
                    />
                    <FilePreviewCard
                      title="Makefile"
                      content={makefileContent}
                      onCopy={() => handleCopyToClipboard(makefileContent, "Makefile")}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="deploy" className="m-0 space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Cloud className="h-4 w-4" />
                      Deployment Options
                    </CardTitle>
                    <CardDescription>
                      Choose where to deploy your application
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3">
                      <div className="p-4 rounded-md border hover-elevate">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="p-2 rounded bg-blue-500/10">
                            <Server className="h-4 w-4 text-blue-500" />
                          </div>
                          <div>
                            <h4 className="font-medium">Self-Hosted (Recommended)</h4>
                            <p className="text-sm text-muted-foreground">Run on your own server with Docker</p>
                          </div>
                        </div>
                        <div className="mt-3 space-y-2">
                          <CommandBlock command="scp -r ./project user@your-server:~/" />
                          <CommandBlock command="ssh user@your-server 'cd project && docker-compose up -d'" />
                        </div>
                      </div>

                      <div className="p-4 rounded-md border hover-elevate">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="p-2 rounded bg-purple-500/10">
                            <Zap className="h-4 w-4 text-purple-500" />
                          </div>
                          <div>
                            <h4 className="font-medium">Cloud Platforms</h4>
                            <p className="text-sm text-muted-foreground">One-click deploy to popular services</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-3">
                          <Button variant="outline" size="sm" asChild data-testid="link-railway">
                            <a href="https://railway.app" target="_blank" rel="noopener noreferrer">
                              Railway
                              <ExternalLink className="h-3 w-3 ml-1" />
                            </a>
                          </Button>
                          <Button variant="outline" size="sm" asChild data-testid="link-render">
                            <a href="https://render.com" target="_blank" rel="noopener noreferrer">
                              Render
                              <ExternalLink className="h-3 w-3 ml-1" />
                            </a>
                          </Button>
                          <Button variant="outline" size="sm" asChild data-testid="link-flyio">
                            <a href="https://fly.io" target="_blank" rel="noopener noreferrer">
                              Fly.io
                              <ExternalLink className="h-3 w-3 ml-1" />
                            </a>
                          </Button>
                          <Button variant="outline" size="sm" asChild data-testid="link-digitalocean">
                            <a href="https://www.digitalocean.com/products/app-platform" target="_blank" rel="noopener noreferrer">
                              DigitalOcean
                              <ExternalLink className="h-3 w-3 ml-1" />
                            </a>
                          </Button>
                        </div>
                      </div>

                      <div className="p-4 rounded-md border hover-elevate">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="p-2 rounded bg-green-500/10">
                            <Globe className="h-4 w-4 text-green-500" />
                          </div>
                          <div>
                            <h4 className="font-medium">Static Hosting (Frontend Only)</h4>
                            <p className="text-sm text-muted-foreground">For frontend-only projects</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-3">
                          <Button variant="outline" size="sm" asChild data-testid="link-vercel">
                            <a href="https://vercel.com" target="_blank" rel="noopener noreferrer">
                              Vercel
                              <ExternalLink className="h-3 w-3 ml-1" />
                            </a>
                          </Button>
                          <Button variant="outline" size="sm" asChild data-testid="link-netlify">
                            <a href="https://netlify.com" target="_blank" rel="noopener noreferrer">
                              Netlify
                              <ExternalLink className="h-3 w-3 ml-1" />
                            </a>
                          </Button>
                          <Button variant="outline" size="sm" asChild data-testid="link-cloudflare">
                            <a href="https://pages.cloudflare.com" target="_blank" rel="noopener noreferrer">
                              Cloudflare Pages
                              <ExternalLink className="h-3 w-3 ml-1" />
                            </a>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      Deployment Checklist
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {[
                        { label: "Environment variables configured", desc: "Set all required secrets" },
                        { label: "Database provisioned", desc: "PostgreSQL instance ready" },
                        { label: "Domain configured", desc: "Point your domain to the server" },
                        { label: "SSL/TLS enabled", desc: "HTTPS for secure connections" },
                      ].map((item, i) => (
                        <label key={i} className="flex items-start gap-3 p-2 rounded hover-elevate cursor-pointer">
                          <input type="checkbox" className="rounded mt-0.5" data-testid={`checkbox-deploy-${i}`} />
                          <div>
                            <p className="text-sm font-medium">{item.label}</p>
                            <p className="text-xs text-muted-foreground">{item.desc}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      </div>
    </div>
  );
}
