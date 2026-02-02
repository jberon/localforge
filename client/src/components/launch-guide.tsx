import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle2,
  Circle,
  Copy,
  Check,
  Terminal,
  Database,
  Globe,
  Rocket,
  ChevronRight,
  ExternalLink,
  FileCode,
  Server,
  Package,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface LaunchGuideProps {
  projectName: string;
  isFullStack: boolean;
  entityCount: number;
}

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  required: boolean;
  link?: string;
}

const PREREQUISITES: ChecklistItem[] = [
  {
    id: "nodejs",
    label: "Node.js 18+",
    description: "JavaScript runtime for running the server",
    required: true,
    link: "https://nodejs.org/",
  },
  {
    id: "postgres",
    label: "PostgreSQL 14+",
    description: "Database for storing your application data",
    required: true,
    link: "https://www.postgresql.org/download/",
  },
  {
    id: "npm",
    label: "npm or yarn",
    description: "Package manager (comes with Node.js)",
    required: true,
  },
];

const FRONTEND_PREREQUISITES: ChecklistItem[] = [
  {
    id: "nodejs",
    label: "Node.js 18+",
    description: "JavaScript runtime for the development server",
    required: true,
    link: "https://nodejs.org/",
  },
  {
    id: "browser",
    label: "Modern Browser",
    description: "Chrome, Firefox, Safari, or Edge",
    required: true,
  },
];

interface CommandBlockProps {
  command: string;
  description?: string;
}

function CommandBlock({ command, description }: CommandBlockProps) {
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
          data-testid={`button-copy-${command.split(" ")[0]}`}
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

function ChecklistItemRow({ item, checked, onToggle }: { 
  item: ChecklistItem; 
  checked: boolean; 
  onToggle: () => void;
}) {
  return (
    <div 
      className="flex items-start gap-3 p-3 rounded-md hover-elevate cursor-pointer"
      onClick={onToggle}
      data-testid={`checklist-item-${item.id}`}
    >
      <button className="mt-0.5 shrink-0">
        {checked ? (
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        ) : (
          <Circle className="h-5 w-5 text-muted-foreground" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={checked ? "line-through text-muted-foreground" : "font-medium"}>
            {item.label}
          </span>
          {item.required && !checked && (
            <Badge variant="outline" className="text-xs">Required</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{item.description}</p>
      </div>
      {item.link && (
        <a
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}

export function LaunchGuide({ projectName, isFullStack, entityCount }: LaunchGuideProps) {
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"setup" | "run" | "deploy">("setup");
  
  const prerequisites = isFullStack ? PREREQUISITES : FRONTEND_PREREQUISITES;
  const allChecked = prerequisites.filter(p => p.required).every(p => checkedItems.has(p.id));
  
  const toggleItem = (id: string) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const envContent = isFullStack ? `# Database connection
DATABASE_URL=postgresql://username:password@localhost:5432/${projectName.toLowerCase().replace(/[^a-z0-9]/g, "_")}

# Server configuration
PORT=3000
NODE_ENV=development` : "";

  const dockerfileContent = `FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]`;

  const dockerComposeContent = `version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/${projectName.toLowerCase().replace(/[^a-z0-9]/g, "_")}
      - NODE_ENV=production
    depends_on:
      - db

  db:
    image: postgres:14-alpine
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=${projectName.toLowerCase().replace(/[^a-z0-9]/g, "_")}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

volumes:
  postgres_data:`;

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/10">
            <Rocket className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Launch Your Project</CardTitle>
            <CardDescription>
              Follow these steps to run {projectName} locally
            </CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <Badge variant="secondary">
            {isFullStack ? (
              <>
                <Server className="h-3 w-3 mr-1" />
                Full-Stack
              </>
            ) : (
              <>
                <Globe className="h-3 w-3 mr-1" />
                Frontend
              </>
            )}
          </Badge>
          {entityCount > 0 && (
            <Badge variant="secondary">
              <Database className="h-3 w-3 mr-1" />
              {entityCount} {entityCount === 1 ? "Entity" : "Entities"}
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="setup" data-testid="tab-setup">
              <Package className="h-4 w-4 mr-2" />
              Setup
            </TabsTrigger>
            <TabsTrigger value="run" data-testid="tab-run">
              <Terminal className="h-4 w-4 mr-2" />
              Run
            </TabsTrigger>
            <TabsTrigger value="deploy" data-testid="tab-deploy">
              <Globe className="h-4 w-4 mr-2" />
              Deploy
            </TabsTrigger>
          </TabsList>

          <TabsContent value="setup" className="space-y-4">
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Prerequisites Checklist
              </h4>
              <div className="space-y-1">
                {prerequisites.map((item) => (
                  <ChecklistItemRow
                    key={item.id}
                    item={item}
                    checked={checkedItems.has(item.id)}
                    onToggle={() => toggleItem(item.id)}
                  />
                ))}
              </div>
              {allChecked && (
                <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-md flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <span className="text-sm font-medium text-green-700 dark:text-green-400">
                    All prerequisites met! You're ready to run your project.
                  </span>
                </div>
              )}
            </div>

            {isFullStack && (
              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <FileCode className="h-4 w-4" />
                  Environment Variables (.env)
                </h4>
                <div className="relative">
                  <ScrollArea className="h-32 rounded-md border bg-muted/30">
                    <pre className="p-4 text-sm font-mono">{envContent}</pre>
                  </ScrollArea>
                  <Button
                    size="sm"
                    variant="outline"
                    className="absolute top-2 right-2"
                    onClick={async () => {
                      await navigator.clipboard.writeText(envContent);
                    }}
                    data-testid="button-copy-env"
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    Copy
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Create a <code className="bg-muted px-1 rounded">.env</code> file in your project root with these values.
                  Update the DATABASE_URL with your actual PostgreSQL credentials.
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="run" className="space-y-4">
            <div>
              <h4 className="font-medium mb-3">Step-by-Step Commands</h4>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium shrink-0">
                    1
                  </div>
                  <div className="flex-1">
                    <CommandBlock
                      command="unzip project.zip && cd project"
                      description="Extract and enter the project directory"
                    />
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium shrink-0">
                    2
                  </div>
                  <div className="flex-1">
                    <CommandBlock
                      command="npm install"
                      description="Install all dependencies"
                    />
                  </div>
                </div>

                {isFullStack && (
                  <>
                    <div className="flex items-start gap-3">
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium shrink-0">
                        3
                      </div>
                      <div className="flex-1">
                        <CommandBlock
                          command="cp .env.example .env"
                          description="Copy environment template"
                        />
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium shrink-0">
                        4
                      </div>
                      <div className="flex-1">
                        <CommandBlock
                          command="npm run db:push"
                          description="Create database tables"
                        />
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium shrink-0">
                        5
                      </div>
                      <div className="flex-1">
                        <CommandBlock
                          command="npm run dev"
                          description="Start the development server"
                        />
                      </div>
                    </div>
                  </>
                )}

                {!isFullStack && (
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium shrink-0">
                      3
                    </div>
                    <div className="flex-1">
                      <CommandBlock
                        command="npm run dev"
                        description="Start the development server"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 p-4 bg-muted/50 rounded-md">
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="h-4 w-4 text-primary" />
                  <span className="font-medium">Open in Browser</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Once the server starts, open{" "}
                  <code className="bg-background px-1.5 py-0.5 rounded text-primary">
                    http://localhost:{isFullStack ? "3000" : "5173"}
                  </code>{" "}
                  in your browser to see your app.
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="deploy" className="space-y-4">
            <div>
              <h4 className="font-medium mb-3">Deployment Options</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Choose how you want to deploy your application to the cloud.
              </p>

              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <div className="p-1.5 rounded bg-blue-500/10">
                        <Package className="h-4 w-4 text-blue-500" />
                      </div>
                      Docker (Recommended)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-3">
                      Use Docker for consistent deployments across any platform.
                    </p>
                    
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-medium mb-1">Dockerfile</p>
                        <ScrollArea className="h-40 rounded-md border bg-muted/30">
                          <pre className="p-3 text-xs font-mono">{dockerfileContent}</pre>
                        </ScrollArea>
                      </div>
                      
                      {isFullStack && (
                        <div>
                          <p className="text-sm font-medium mb-1">docker-compose.yml</p>
                          <ScrollArea className="h-48 rounded-md border bg-muted/30">
                            <pre className="p-3 text-xs font-mono">{dockerComposeContent}</pre>
                          </ScrollArea>
                        </div>
                      )}
                      
                      <CommandBlock
                        command={isFullStack ? "docker-compose up -d" : "docker build -t myapp . && docker run -p 3000:3000 myapp"}
                        description="Build and run with Docker"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <div className="p-1.5 rounded bg-purple-500/10">
                        <Rocket className="h-4 w-4 text-purple-500" />
                      </div>
                      Cloud Platforms
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-3">
                      Deploy to popular cloud platforms with one-click integrations.
                    </p>
                    <div className="flex flex-wrap gap-2">
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
                      <Button variant="outline" size="sm" asChild data-testid="link-vercel">
                        <a href="https://vercel.com" target="_blank" rel="noopener noreferrer">
                          Vercel
                          <ExternalLink className="h-3 w-3 ml-1" />
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
