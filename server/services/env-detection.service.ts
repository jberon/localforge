import { BaseService } from "../lib/base-service";

interface DetectedEnvVar {
  name: string;
  category: "api_key" | "database" | "auth" | "service_url" | "config" | "secret";
  description: string;
  required: boolean;
  example: string;
  setupUrl?: string;
}

interface EnvDetectionResult {
  variables: DetectedEnvVar[];
  hasSecrets: boolean;
  setupInstructions: string;
}

const ENV_PATTERNS: {
  pattern: RegExp;
  category: DetectedEnvVar["category"];
  getName: (match: RegExpMatchArray) => string;
  description: string;
  example: string;
  setupUrl?: string;
}[] = [
  {
    pattern: /process\.env\.([A-Z_][A-Z0-9_]*)/g,
    category: "config",
    getName: (m) => m[1],
    description: "Environment variable",
    example: "value",
  },
  {
    pattern: /import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g,
    category: "config",
    getName: (m) => m[1],
    description: "Vite environment variable",
    example: "value",
  },
  {
    pattern: /OPENAI_API_KEY|openai.*api.*key/gi,
    category: "api_key",
    getName: () => "OPENAI_API_KEY",
    description: "OpenAI API key for GPT/DALL-E",
    example: "sk-...",
    setupUrl: "https://platform.openai.com/api-keys",
  },
  {
    pattern: /STRIPE_SECRET_KEY|stripe.*secret/gi,
    category: "api_key",
    getName: () => "STRIPE_SECRET_KEY",
    description: "Stripe secret key for payments",
    example: "sk_test_...",
    setupUrl: "https://dashboard.stripe.com/apikeys",
  },
  {
    pattern: /STRIPE_PUBLISHABLE_KEY|stripe.*publishable/gi,
    category: "api_key",
    getName: () => "STRIPE_PUBLISHABLE_KEY",
    description: "Stripe publishable key for frontend",
    example: "pk_test_...",
    setupUrl: "https://dashboard.stripe.com/apikeys",
  },
  {
    pattern: /GOOGLE_API_KEY|google.*api.*key/gi,
    category: "api_key",
    getName: () => "GOOGLE_API_KEY",
    description: "Google API key",
    example: "AIza...",
    setupUrl: "https://console.cloud.google.com/apis/credentials",
  },
  {
    pattern: /FIREBASE_API_KEY|firebase.*config/gi,
    category: "api_key",
    getName: () => "FIREBASE_API_KEY",
    description: "Firebase API key",
    example: "AIza...",
    setupUrl: "https://console.firebase.google.com",
  },
  {
    pattern: /SUPABASE_URL|supabase.*url/gi,
    category: "service_url",
    getName: () => "SUPABASE_URL",
    description: "Supabase project URL",
    example: "https://xxx.supabase.co",
    setupUrl: "https://supabase.com/dashboard",
  },
  {
    pattern: /SUPABASE_ANON_KEY|supabase.*anon/gi,
    category: "api_key",
    getName: () => "SUPABASE_ANON_KEY",
    description: "Supabase anonymous key",
    example: "eyJ...",
    setupUrl: "https://supabase.com/dashboard",
  },
  {
    pattern: /DATABASE_URL|postgres.*url|mysql.*url|mongodb.*url/gi,
    category: "database",
    getName: () => "DATABASE_URL",
    description: "Database connection URL",
    example: "postgresql://user:pass@host:5432/db",
  },
  {
    pattern: /REDIS_URL|redis.*url/gi,
    category: "service_url",
    getName: () => "REDIS_URL",
    description: "Redis connection URL",
    example: "redis://localhost:6379",
  },
  {
    pattern: /JWT_SECRET|jwt.*secret/gi,
    category: "secret",
    getName: () => "JWT_SECRET",
    description: "JWT signing secret",
    example: "your-secret-key-here",
  },
  {
    pattern: /SESSION_SECRET|session.*secret/gi,
    category: "secret",
    getName: () => "SESSION_SECRET",
    description: "Session signing secret",
    example: "your-session-secret",
  },
  {
    pattern: /SENDGRID_API_KEY|sendgrid/gi,
    category: "api_key",
    getName: () => "SENDGRID_API_KEY",
    description: "SendGrid email API key",
    example: "SG...",
    setupUrl: "https://app.sendgrid.com/settings/api_keys",
  },
  {
    pattern: /TWILIO_ACCOUNT_SID|twilio.*sid/gi,
    category: "api_key",
    getName: () => "TWILIO_ACCOUNT_SID",
    description: "Twilio account SID",
    example: "AC...",
    setupUrl: "https://console.twilio.com",
  },
  {
    pattern: /TWILIO_AUTH_TOKEN|twilio.*token/gi,
    category: "secret",
    getName: () => "TWILIO_AUTH_TOKEN",
    description: "Twilio auth token",
    example: "your-auth-token",
    setupUrl: "https://console.twilio.com",
  },
  {
    pattern: /GITHUB_TOKEN|github.*token/gi,
    category: "api_key",
    getName: () => "GITHUB_TOKEN",
    description: "GitHub personal access token",
    example: "ghp_...",
    setupUrl: "https://github.com/settings/tokens",
  },
  {
    pattern: /AWS_ACCESS_KEY_ID|aws.*access/gi,
    category: "api_key",
    getName: () => "AWS_ACCESS_KEY_ID",
    description: "AWS access key ID",
    example: "AKIA...",
    setupUrl: "https://console.aws.amazon.com/iam",
  },
  {
    pattern: /AWS_SECRET_ACCESS_KEY|aws.*secret.*key/gi,
    category: "secret",
    getName: () => "AWS_SECRET_ACCESS_KEY",
    description: "AWS secret access key",
    example: "your-secret-key",
    setupUrl: "https://console.aws.amazon.com/iam",
  },
  {
    pattern: /ANTHROPIC_API_KEY|claude.*api.*key/gi,
    category: "api_key",
    getName: () => "ANTHROPIC_API_KEY",
    description: "Anthropic API key for Claude",
    example: "sk-ant-...",
    setupUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    pattern: /REPLICATE_API_TOKEN|replicate/gi,
    category: "api_key",
    getName: () => "REPLICATE_API_TOKEN",
    description: "Replicate API token",
    example: "r8_...",
    setupUrl: "https://replicate.com/account/api-tokens",
  },
];

const CATEGORY_PRIORITY: Record<DetectedEnvVar["category"], number> = {
  api_key: 1,
  secret: 2,
  database: 3,
  auth: 4,
  service_url: 5,
  config: 6,
};

class EnvDetectionService extends BaseService {
  private static instance: EnvDetectionService;

  private constructor() {
    super("EnvDetectionService");
  }

  static getInstance(): EnvDetectionService {
    if (!EnvDetectionService.instance) {
      EnvDetectionService.instance = new EnvDetectionService();
    }
    return EnvDetectionService.instance;
  }

  detectEnvVars(code: string): EnvDetectionResult {
    const detected = new Map<string, DetectedEnvVar>();

    for (const envPattern of ENV_PATTERNS) {
      const regex = new RegExp(envPattern.pattern.source, envPattern.pattern.flags);
      let match;
      while ((match = regex.exec(code)) !== null) {
        const name = envPattern.getName(match);
        if (!name || name === "NODE_ENV" || name === "VITE_" || detected.has(name)) continue;

        const category = this.categorizeVar(name, envPattern.category);

        detected.set(name, {
          name,
          category,
          description: envPattern.description,
          required: category !== "config",
          example: envPattern.example,
          setupUrl: envPattern.setupUrl,
        });
      }
    }

    const variables = Array.from(detected.values()).sort(
      (a, b) => CATEGORY_PRIORITY[a.category] - CATEGORY_PRIORITY[b.category]
    );

    const hasSecrets = variables.some(
      v => v.category === "api_key" || v.category === "secret" || v.category === "database"
    );

    const setupInstructions = this.buildSetupInstructions(variables);

    this.log("Environment detection complete", {
      totalDetected: variables.length,
      hasSecrets,
      categories: Array.from(new Set(variables.map(v => v.category))),
    });

    return { variables, hasSecrets, setupInstructions };
  }

  private categorizeVar(name: string, defaultCategory: DetectedEnvVar["category"]): DetectedEnvVar["category"] {
    const upper = name.toUpperCase();
    if (upper.includes("API_KEY") || upper.includes("TOKEN")) return "api_key";
    if (upper.includes("SECRET") || upper.includes("PASSWORD")) return "secret";
    if (upper.includes("DATABASE") || upper.includes("DB_")) return "database";
    if (upper.includes("AUTH") || upper.includes("OAUTH")) return "auth";
    if (upper.includes("URL") || upper.includes("ENDPOINT") || upper.includes("HOST")) return "service_url";
    return defaultCategory;
  }

  private buildSetupInstructions(variables: DetectedEnvVar[]): string {
    if (variables.length === 0) return "";

    const lines: string[] = ["## Environment Setup Required\n"];
    lines.push("This application requires the following environment variables to be configured:\n");

    const grouped = new Map<string, DetectedEnvVar[]>();
    for (const v of variables) {
      const cat = v.category;
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(v);
    }

    const categoryLabels: Record<string, string> = {
      api_key: "API Keys",
      secret: "Secrets",
      database: "Database",
      auth: "Authentication",
      service_url: "Service URLs",
      config: "Configuration",
    };

    Array.from(grouped.entries()).forEach(([cat, vars]) => {
      lines.push(`### ${categoryLabels[cat] || cat}\n`);
      vars.forEach(v => {
        lines.push(`- **${v.name}**: ${v.description}`);
        lines.push(`  Example: \`${v.example}\``);
        if (v.setupUrl) {
          lines.push(`  Get it here: ${v.setupUrl}`);
        }
        lines.push("");
      });
    });

    return lines.join("\n");
  }

  buildEnvTemplate(variables: DetectedEnvVar[]): string {
    if (variables.length === 0) return "";

    const lines: string[] = ["# Environment Variables"];
    const grouped = new Map<string, DetectedEnvVar[]>();

    for (const v of variables) {
      if (!grouped.has(v.category)) grouped.set(v.category, []);
      grouped.get(v.category)!.push(v);
    }

    Array.from(grouped.entries()).forEach(([cat, vars]) => {
      lines.push("");
      lines.push(`# ${cat.toUpperCase()}`);
      vars.forEach(v => {
        lines.push(`${v.name}=${v.example}`);
      });
    });

    return lines.join("\n");
  }

  destroy(): void {
    this.log("EnvDetectionService destroyed");
  }
}

export const envDetectionService = EnvDetectionService.getInstance();
