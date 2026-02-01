import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { ProductionModules } from "@shared/schema";
import {
  Shield,
  Users,
  TestTube,
  GitBranch,
  Container,
  Database,
  FileText,
  AlertTriangle,
  BookOpen,
  Settings,
  Gauge,
  Zap,
  Activity,
  CreditCard,
} from "lucide-react";

interface ModuleSelectorProps {
  modules: ProductionModules;
  onChange: (modules: ProductionModules) => void;
  disabled?: boolean;
}

interface ModuleConfig {
  key: keyof ProductionModules;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: "security" | "quality" | "infrastructure" | "operations" | "monetization";
}

const MODULE_CONFIGS: ModuleConfig[] = [
  {
    key: "authentication",
    name: "Authentication",
    description: "User login, signup, and session management",
    icon: <Shield className="h-4 w-4" />,
    category: "security",
  },
  {
    key: "authorization",
    name: "Authorization (RBAC)",
    description: "Role-based access control and permissions",
    icon: <Users className="h-4 w-4" />,
    category: "security",
  },
  {
    key: "testing",
    name: "Testing Suite",
    description: "Unit tests, integration tests, and test utilities",
    icon: <TestTube className="h-4 w-4" />,
    category: "quality",
  },
  {
    key: "cicd",
    name: "CI/CD Pipeline",
    description: "GitHub Actions workflow for testing and deployment",
    icon: <GitBranch className="h-4 w-4" />,
    category: "quality",
  },
  {
    key: "docker",
    name: "Docker Support",
    description: "Dockerfile and docker-compose for containerization",
    icon: <Container className="h-4 w-4" />,
    category: "infrastructure",
  },
  {
    key: "migrations",
    name: "Database Migrations",
    description: "Drizzle migration scripts and version control",
    icon: <Database className="h-4 w-4" />,
    category: "infrastructure",
  },
  {
    key: "logging",
    name: "Structured Logging",
    description: "Request logging, log levels, and audit trails",
    icon: <FileText className="h-4 w-4" />,
    category: "operations",
  },
  {
    key: "errorHandling",
    name: "Error Handling",
    description: "Global error handling and error boundaries",
    icon: <AlertTriangle className="h-4 w-4" />,
    category: "operations",
  },
  {
    key: "apiDocs",
    name: "API Documentation",
    description: "OpenAPI/Swagger auto-generated documentation",
    icon: <BookOpen className="h-4 w-4" />,
    category: "quality",
  },
  {
    key: "envConfig",
    name: "Environment Config",
    description: ".env templates and config validation",
    icon: <Settings className="h-4 w-4" />,
    category: "infrastructure",
  },
  {
    key: "rateLimiting",
    name: "Rate Limiting",
    description: "API rate limiting to prevent abuse",
    icon: <Gauge className="h-4 w-4" />,
    category: "security",
  },
  {
    key: "caching",
    name: "Caching",
    description: "Response caching for performance",
    icon: <Zap className="h-4 w-4" />,
    category: "operations",
  },
  {
    key: "monitoring",
    name: "Monitoring",
    description: "Health checks and performance metrics",
    icon: <Activity className="h-4 w-4" />,
    category: "operations",
  },
  {
    key: "billing",
    name: "Billing (Stripe)",
    description: "Subscription billing and payment processing",
    icon: <CreditCard className="h-4 w-4" />,
    category: "monetization",
  },
];

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  security: { label: "Security", color: "text-red-500" },
  quality: { label: "Quality", color: "text-blue-500" },
  infrastructure: { label: "Infrastructure", color: "text-purple-500" },
  operations: { label: "Operations", color: "text-green-500" },
  monetization: { label: "Monetization", color: "text-yellow-500" },
};

export function ModuleSelector({ modules, onChange, disabled }: ModuleSelectorProps) {
  const handleToggle = (key: keyof ProductionModules) => {
    onChange({
      ...modules,
      [key]: !modules[key],
    });
  };

  const enabledCount = Object.values(modules).filter(Boolean).length;

  const groupedModules = MODULE_CONFIGS.reduce((acc, config) => {
    if (!acc[config.category]) {
      acc[config.category] = [];
    }
    acc[config.category].push(config);
    return acc;
  }, {} as Record<string, ModuleConfig[]>);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Production Modules</CardTitle>
            <CardDescription>
              Select the production features to include in your application
            </CardDescription>
          </div>
          <Badge variant="secondary" data-testid="badge-enabled-modules">
            {enabledCount} enabled
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(groupedModules).map(([category, configs]) => (
          <div key={category} className="space-y-2">
            <div className={`text-xs font-medium uppercase tracking-wide ${CATEGORY_LABELS[category].color}`}>
              {CATEGORY_LABELS[category].label}
            </div>
            <div className="grid grid-cols-1 gap-2">
              {configs.map((config) => (
                <div
                  key={config.key}
                  className="flex items-center justify-between p-2 rounded-md bg-muted/30 hover-elevate"
                  data-testid={`module-${config.key}`}
                >
                  <div className="flex items-center gap-2">
                    <div className="text-muted-foreground">{config.icon}</div>
                    <div>
                      <Label
                        htmlFor={`module-${config.key}`}
                        className="text-sm font-medium cursor-pointer"
                      >
                        {config.name}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {config.description}
                      </p>
                    </div>
                  </div>
                  <Switch
                    id={`module-${config.key}`}
                    checked={modules[config.key]}
                    onCheckedChange={() => handleToggle(config.key)}
                    disabled={disabled}
                    data-testid={`switch-module-${config.key}`}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
