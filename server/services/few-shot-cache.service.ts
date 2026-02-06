import { BaseService, ManagedMap } from "../lib/base-service";
import { ModelFamily } from "./local-model-optimizer.service";

export interface FewShotExample {
  id: string;
  category: ExampleCategory;
  input: string;
  output: string;
  modelFamily?: ModelFamily;
  complexity: "simple" | "moderate" | "complex";
  tokensInput: number;
  tokensOutput: number;
  successRate: number;
  usageCount: number;
  lastUsed: number;
  tags: string[];
}

export type ExampleCategory =
  | "component_creation"
  | "api_route"
  | "database_query"
  | "form_handling"
  | "state_management"
  | "styling"
  | "error_handling"
  | "testing"
  | "refactoring"
  | "bug_fix"
  | "documentation";

interface CachedExamples {
  examples: FewShotExample[];
  lastUpdated: number;
  modelFamily: ModelFamily;
}

class FewShotCacheService extends BaseService {
  private static instance: FewShotCacheService;
  private cache: ManagedMap<string, CachedExamples>;
  private globalExamples: FewShotExample[] = [];
  private maxExamplesPerCategory = 10;
  private maxGlobalExamples = 50;

  private constructor() {
    super("FewShotCacheService");
    this.cache = this.createManagedMap<string, CachedExamples>({ maxSize: 1000, strategy: "lru" });
    this.initializeBuiltInExamples();
  }

  static getInstance(): FewShotCacheService {
    if (!FewShotCacheService.instance) {
      FewShotCacheService.instance = new FewShotCacheService();
    }
    return FewShotCacheService.instance;
  }

  private initializeBuiltInExamples(): void {
    this.globalExamples = [
      {
        id: "react_component_1",
        category: "component_creation",
        input: "Create a reusable Button component with variants",
        output: `export function Button({ 
  children, 
  variant = "primary", 
  size = "md",
  onClick,
  disabled = false 
}: ButtonProps) {
  const baseClasses = "rounded font-medium transition-colors";
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "bg-gray-200 text-gray-800 hover:bg-gray-300",
    outline: "border border-gray-300 hover:bg-gray-50"
  };
  const sizes = { sm: "px-3 py-1 text-sm", md: "px-4 py-2", lg: "px-6 py-3 text-lg" };
  
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={\`\${baseClasses} \${variants[variant]} \${sizes[size]} \${disabled ? "opacity-50 cursor-not-allowed" : ""}\`}
    >
      {children}
    </button>
  );
}`,
        complexity: "simple",
        tokensInput: 50,
        tokensOutput: 200,
        successRate: 0.95,
        usageCount: 0,
        lastUsed: 0,
        tags: ["react", "component", "button", "tailwind"]
      },
      {
        id: "api_route_1",
        category: "api_route",
        input: "Create an API route for fetching items with pagination",
        output: `app.get("/api/items", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;
    
    const items = await db.select().from(itemsTable).limit(limit).offset(offset);
    const total = await db.select({ count: count() }).from(itemsTable);
    
    res.json({
      items,
      pagination: {
        page,
        limit,
        total: total[0].count,
        totalPages: Math.ceil(total[0].count / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch items" });
  }
});`,
        complexity: "moderate",
        tokensInput: 60,
        tokensOutput: 250,
        successRate: 0.90,
        usageCount: 0,
        lastUsed: 0,
        tags: ["api", "express", "pagination", "database"]
      },
      {
        id: "form_handling_1",
        category: "form_handling",
        input: "Create a form with validation using react-hook-form",
        output: `import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters")
});

type FormData = z.infer<typeof schema>;

export function LoginForm({ onSubmit }: { onSubmit: (data: FormData) => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <input {...register("email")} placeholder="Email" className="w-full p-2 border rounded" />
        {errors.email && <p className="text-red-500 text-sm">{errors.email.message}</p>}
      </div>
      <div>
        <input {...register("password")} type="password" placeholder="Password" className="w-full p-2 border rounded" />
        {errors.password && <p className="text-red-500 text-sm">{errors.password.message}</p>}
      </div>
      <button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 text-white p-2 rounded">
        {isSubmitting ? "Loading..." : "Login"}
      </button>
    </form>
  );
}`,
        complexity: "moderate",
        tokensInput: 50,
        tokensOutput: 350,
        successRate: 0.92,
        usageCount: 0,
        lastUsed: 0,
        tags: ["form", "validation", "react-hook-form", "zod"]
      },
      {
        id: "error_handling_1",
        category: "error_handling",
        input: "Add error boundary for React components",
        output: `import { Component, ErrorInfo, ReactNode } from "react";

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; error?: Error; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-4 bg-red-50 border border-red-200 rounded">
          <h2 className="text-red-800 font-semibold">Something went wrong</h2>
          <p className="text-red-600 text-sm">{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false })} className="mt-2 text-blue-600">
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}`,
        complexity: "moderate",
        tokensInput: 40,
        tokensOutput: 280,
        successRate: 0.88,
        usageCount: 0,
        lastUsed: 0,
        tags: ["error-boundary", "react", "error-handling"]
      },
      {
        id: "database_query_1",
        category: "database_query",
        input: "Create CRUD operations for users with Drizzle ORM",
        output: `import { db } from "../db";
import { users, InsertUser } from "@shared/schema";
import { eq } from "drizzle-orm";

export const userService = {
  async getAll() {
    return db.select().from(users);
  },
  
  async getById(id: number) {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0] || null;
  },
  
  async create(data: InsertUser) {
    const result = await db.insert(users).values(data).returning();
    return result[0];
  },
  
  async update(id: number, data: Partial<InsertUser>) {
    const result = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return result[0];
  },
  
  async delete(id: number) {
    await db.delete(users).where(eq(users.id, id));
  }
};`,
        complexity: "moderate",
        tokensInput: 50,
        tokensOutput: 250,
        successRate: 0.93,
        usageCount: 0,
        lastUsed: 0,
        tags: ["database", "drizzle", "crud", "service"]
      }
    ];
  }

  getExamplesForTask(
    taskDescription: string,
    options: {
      category?: ExampleCategory;
      modelFamily?: ModelFamily;
      maxTokens?: number;
      maxExamples?: number;
    } = {}
  ): FewShotExample[] {
    const { category, modelFamily, maxTokens = 2000, maxExamples = 3 } = options;
    
    let candidates = [...this.globalExamples];
    
    if (category) {
      candidates = candidates.filter(e => e.category === category);
    }
    
    if (modelFamily) {
      candidates = candidates.filter(e => !e.modelFamily || e.modelFamily === modelFamily);
    }

    const scored = candidates.map(example => ({
      example,
      score: this.scoreRelevance(example, taskDescription)
    }));

    scored.sort((a, b) => b.score - a.score);

    const selected: FewShotExample[] = [];
    let usedTokens = 0;

    for (const { example } of scored) {
      const exampleTokens = example.tokensInput + example.tokensOutput;
      if (usedTokens + exampleTokens > maxTokens) continue;
      if (selected.length >= maxExamples) break;
      
      selected.push(example);
      usedTokens += exampleTokens;
    }

    for (const example of selected) {
      example.usageCount++;
      example.lastUsed = Date.now();
    }

    return selected;
  }

  private scoreRelevance(example: FewShotExample, taskDescription: string): number {
    const taskLower = taskDescription.toLowerCase();
    const inputLower = example.input.toLowerCase();
    
    let score = 0;

    const taskWords = taskLower.split(/\s+/).filter(w => w.length > 2);
    const inputWords = inputLower.split(/\s+/).filter(w => w.length > 2);
    
    for (const word of taskWords) {
      if (inputWords.includes(word)) score += 10;
    }

    for (const tag of example.tags) {
      if (taskLower.includes(tag)) score += 15;
    }

    score += example.successRate * 20;
    score += Math.min(example.usageCount, 10);

    const daysSinceUse = example.lastUsed ? (Date.now() - example.lastUsed) / (1000 * 60 * 60 * 24) : 30;
    score += Math.max(0, 10 - daysSinceUse);

    return score;
  }

  addExample(example: Omit<FewShotExample, "id" | "usageCount" | "lastUsed">): FewShotExample {
    const newExample: FewShotExample = {
      ...example,
      id: `example_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      usageCount: 0,
      lastUsed: 0
    };

    this.globalExamples.push(newExample);

    if (this.globalExamples.length > this.maxGlobalExamples) {
      this.globalExamples.sort((a, b) => {
        const scoreA = a.successRate * 10 + a.usageCount;
        const scoreB = b.successRate * 10 + b.usageCount;
        return scoreB - scoreA;
      });
      this.globalExamples = this.globalExamples.slice(0, this.maxGlobalExamples);
    }

    this.log("New few-shot example added", { id: newExample.id, category: newExample.category });
    return newExample;
  }

  recordExampleOutcome(exampleId: string, success: boolean): void {
    const example = this.globalExamples.find(e => e.id === exampleId);
    if (!example) return;

    const totalUses = example.usageCount;
    const successfulUses = example.successRate * (totalUses - 1);
    example.successRate = (successfulUses + (success ? 1 : 0)) / totalUses;
    
    this.log("Example outcome recorded", { exampleId, success, newSuccessRate: example.successRate });
  }

  formatExamplesForPrompt(examples: FewShotExample[]): string {
    if (examples.length === 0) return "";

    const formatted = examples.map((ex, i) => 
      `### Example ${i + 1}\n**Task:** ${ex.input}\n\n**Solution:**\n\`\`\`\n${ex.output}\n\`\`\``
    );

    return `## Reference Examples\nHere are some examples of similar tasks:\n\n${formatted.join("\n\n")}`;
  }

  formatExamplesForModelFamily(examples: FewShotExample[], modelFamily: ModelFamily): string {
    const base = this.formatExamplesForPrompt(examples);
    
    switch (modelFamily) {
      case "qwen":
        return `${base}\n\nNote: Follow the patterns above. Output clean code without excessive comments.`;
      case "ministral":
      case "mistral":
        return `${base}\n\nNote: Study these examples to understand the expected output structure.`;
      case "llama":
      case "codellama":
        return `${base}\n\nNote: Use these as reference. Keep your response focused and code-centric.`;
      default:
        return base;
    }
  }

  getExamplesByCategory(category: ExampleCategory): FewShotExample[] {
    return this.globalExamples.filter(e => e.category === category);
  }

  getStats(): {
    totalExamples: number;
    byCategory: Record<ExampleCategory, number>;
    avgSuccessRate: number;
    topExamples: { id: string; usageCount: number; successRate: number }[];
  } {
    const byCategory: Partial<Record<ExampleCategory, number>> = {};
    let totalSuccessRate = 0;

    for (const example of this.globalExamples) {
      byCategory[example.category] = (byCategory[example.category] || 0) + 1;
      totalSuccessRate += example.successRate;
    }

    const topExamples = [...this.globalExamples]
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 5)
      .map(e => ({ id: e.id, usageCount: e.usageCount, successRate: e.successRate }));

    return {
      totalExamples: this.globalExamples.length,
      byCategory: byCategory as Record<ExampleCategory, number>,
      avgSuccessRate: this.globalExamples.length > 0 ? totalSuccessRate / this.globalExamples.length : 0,
      topExamples
    };
  }

  clearCache(): void {
    this.cache.clear();
    this.log("Few-shot cache cleared");
  }

  destroy(): void {
    this.cache.clear();
    this.globalExamples = [];
    this.log("FewShotCacheService shut down");
  }
}

export const fewShotCacheService = FewShotCacheService.getInstance();
