import { logger } from "../lib/logger";

interface CodePattern {
  id: string;
  name: string;
  category: PatternCategory;
  description: string;
  code: string;
  usage: string;
  tags: string[];
  projectId?: string;
  successScore: number;
  usageCount: number;
  createdAt: number;
  updatedAt: number;
}

type PatternCategory = 
  | "component"
  | "hook"
  | "utility"
  | "api"
  | "form"
  | "layout"
  | "state"
  | "auth"
  | "data-fetching"
  | "error-handling";

interface PatternMatch {
  pattern: CodePattern;
  relevanceScore: number;
  matchReason: string;
}

interface PatternSuggestion {
  pattern: CodePattern;
  context: string;
  insertionPoint: { line: number; column: number };
  adaptedCode: string;
}

class PatternLibraryService {
  private static instance: PatternLibraryService;
  private patterns: Map<string, CodePattern> = new Map();
  private categoryIndex: Map<PatternCategory, Set<string>> = new Map();
  private readonly MAX_PATTERNS = 1000;

  private constructor() {
    this.initializeBuiltInPatterns();
  }

  static getInstance(): PatternLibraryService {
    if (!PatternLibraryService.instance) {
      PatternLibraryService.instance = new PatternLibraryService();
    }
    return PatternLibraryService.instance;
  }

  private initializeBuiltInPatterns(): void {
    const builtInPatterns: Omit<CodePattern, "id" | "createdAt" | "updatedAt">[] = [
      {
        name: "useAsync Hook",
        category: "hook",
        description: "Generic async data fetching hook with loading and error states",
        code: `export function useAsync<T>(asyncFn: () => Promise<T>, deps: any[] = []) {
  const [state, setState] = useState<{
    data: T | null;
    loading: boolean;
    error: Error | null;
  }>({ data: null, loading: true, error: null });

  useEffect(() => {
    let mounted = true;
    setState(s => ({ ...s, loading: true }));
    
    asyncFn()
      .then(data => mounted && setState({ data, loading: false, error: null }))
      .catch(error => mounted && setState({ data: null, loading: false, error }));
    
    return () => { mounted = false; };
  }, deps);

  return state;
}`,
        usage: "const { data, loading, error } = useAsync(() => fetchUsers(), []);",
        tags: ["async", "fetch", "loading", "error-handling"],
        successScore: 0.9,
        usageCount: 0
      },
      {
        name: "useLocalStorage Hook",
        category: "hook",
        description: "Persist state to localStorage with automatic sync",
        code: `export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(error);
    }
  };

  return [storedValue, setValue] as const;
}`,
        usage: "const [theme, setTheme] = useLocalStorage('theme', 'light');",
        tags: ["storage", "persistence", "state"],
        successScore: 0.85,
        usageCount: 0
      },
      {
        name: "API Error Handler",
        category: "error-handling",
        description: "Centralized API error handling with retry logic",
        code: `export async function apiRequest<T>(
  url: string,
  options?: RequestInit,
  retries = 3
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers
        }
      });
      
      if (!response.ok) {
        throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
      }
      
      return await response.json();
    } catch (error) {
      lastError = error as Error;
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }
  
  throw lastError;
}`,
        usage: "const data = await apiRequest<User[]>('/api/users');",
        tags: ["api", "fetch", "retry", "error-handling"],
        successScore: 0.88,
        usageCount: 0
      },
      {
        name: "Form with Validation",
        category: "form",
        description: "React Hook Form with Zod validation pattern",
        code: `const formSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters")
});

type FormData = z.infer<typeof formSchema>;

export function LoginForm() {
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "" }
  });

  const onSubmit = async (data: FormData) => {
    try {
      await login(data);
    } catch (error) {
      form.setError("root", { message: "Login failed" });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  );
}`,
        usage: "Standard form pattern with validation",
        tags: ["form", "validation", "zod", "react-hook-form"],
        successScore: 0.92,
        usageCount: 0
      },
      {
        name: "Loading Skeleton",
        category: "component",
        description: "Reusable loading skeleton component",
        code: `export function Skeleton({ 
  className,
  ...props 
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted",
        className
      )}
      {...props}
    />
  );
}

export function CardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-[250px]" />
        <Skeleton className="h-4 w-[200px]" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[125px] w-full" />
      </CardContent>
    </Card>
  );
}`,
        usage: "{isLoading ? <CardSkeleton /> : <ActualCard />}",
        tags: ["loading", "skeleton", "ui", "animation"],
        successScore: 0.87,
        usageCount: 0
      },
      {
        name: "Debounced Search",
        category: "hook",
        description: "Debounced search input hook for API calls",
        code: `export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// Usage in component:
function SearchComponent() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  
  const { data } = useQuery({
    queryKey: ['search', debouncedSearch],
    queryFn: () => searchApi(debouncedSearch),
    enabled: debouncedSearch.length > 2
  });
  
  return <Input value={search} onChange={e => setSearch(e.target.value)} />;
}`,
        usage: "const debouncedValue = useDebounce(searchTerm, 300);",
        tags: ["debounce", "search", "performance", "input"],
        successScore: 0.91,
        usageCount: 0
      },
      {
        name: "Protected Route",
        category: "auth",
        description: "Route wrapper for authenticated-only pages",
        code: `export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/login');
    }
  }, [user, isLoading, navigate]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}`,
        usage: "<ProtectedRoute><DashboardPage /></ProtectedRoute>",
        tags: ["auth", "routing", "protected", "guard"],
        successScore: 0.89,
        usageCount: 0
      },
      {
        name: "Infinite Scroll",
        category: "data-fetching",
        description: "Infinite scroll with intersection observer",
        code: `export function useInfiniteScroll(
  loadMore: () => void,
  hasMore: boolean
) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [loadMoreRef, setLoadMoreRef] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        loadMore();
      }
    });

    if (loadMoreRef) {
      observerRef.current.observe(loadMoreRef);
    }

    return () => observerRef.current?.disconnect();
  }, [loadMore, hasMore, loadMoreRef]);

  return setLoadMoreRef;
}`,
        usage: "const ref = useInfiniteScroll(fetchNextPage, hasNextPage);",
        tags: ["infinite-scroll", "pagination", "performance"],
        successScore: 0.86,
        usageCount: 0
      }
    ];

    for (const pattern of builtInPatterns) {
      this.addPattern(pattern);
    }
  }

  addPattern(pattern: Omit<CodePattern, "id" | "createdAt" | "updatedAt">): CodePattern {
    const id = `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    const newPattern: CodePattern = {
      ...pattern,
      id,
      createdAt: now,
      updatedAt: now
    };

    this.patterns.set(id, newPattern);

    if (this.patterns.size > this.MAX_PATTERNS) {
      const oldest = Array.from(this.patterns.entries())
        .sort((a, b) => a[1].createdAt - b[1].createdAt);
      const toRemove = oldest.slice(0, this.patterns.size - this.MAX_PATTERNS);
      for (const [removeId, removePattern] of toRemove) {
        this.patterns.delete(removeId);
        const catSet = this.categoryIndex.get(removePattern.category);
        if (catSet) catSet.delete(removeId);
      }
    }

    const categoryPatterns = this.categoryIndex.get(pattern.category) || new Set();
    categoryPatterns.add(id);
    this.categoryIndex.set(pattern.category, categoryPatterns);

    logger.info("Pattern added", { id, name: pattern.name, category: pattern.category });
    return newPattern;
  }

  findPatterns(query: string, category?: PatternCategory): PatternMatch[] {
    const queryLower = query.toLowerCase();
    const queryTokens = queryLower.split(/\W+/).filter(t => t.length > 2);
    const results: PatternMatch[] = [];

    let patternsToSearch = Array.from(this.patterns.values());
    if (category) {
      const categoryIds = this.categoryIndex.get(category);
      if (categoryIds) {
        patternsToSearch = Array.from(categoryIds)
          .map(id => this.patterns.get(id))
          .filter((p): p is CodePattern => p !== undefined);
      }
    }

    for (const pattern of patternsToSearch) {
      let score = 0;
      const reasons: string[] = [];

      if (pattern.name.toLowerCase().includes(queryLower)) {
        score += 5;
        reasons.push("Name match");
      }

      if (pattern.description.toLowerCase().includes(queryLower)) {
        score += 3;
        reasons.push("Description match");
      }

      for (const tag of pattern.tags) {
        if (queryTokens.includes(tag.toLowerCase())) {
          score += 2;
          reasons.push(`Tag: ${tag}`);
        }
      }

      for (const token of queryTokens) {
        if (pattern.code.toLowerCase().includes(token)) {
          score += 0.5;
        }
      }

      score += pattern.successScore * 2;
      score += Math.min(pattern.usageCount * 0.1, 2);

      if (score > 1) {
        results.push({
          pattern,
          relevanceScore: score,
          matchReason: reasons.join(", ") || "Token overlap"
        });
      }
    }

    results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return results.slice(0, 10);
  }

  suggestPatterns(
    code: string,
    filePath: string
  ): PatternSuggestion[] {
    const suggestions: PatternSuggestion[] = [];
    const lines = code.split("\n");

    if (code.includes("useState") && code.includes("useEffect") && code.includes("fetch")) {
      const fetchHook = this.findPatterns("async fetch loading", "hook")[0];
      if (fetchHook) {
        suggestions.push({
          pattern: fetchHook.pattern,
          context: "Detected manual async state management",
          insertionPoint: { line: 1, column: 0 },
          adaptedCode: fetchHook.pattern.code
        });
      }
    }

    if (code.includes("localStorage")) {
      const storageHook = this.findPatterns("localStorage", "hook")[0];
      if (storageHook) {
        suggestions.push({
          pattern: storageHook.pattern,
          context: "Detected localStorage usage",
          insertionPoint: { line: 1, column: 0 },
          adaptedCode: storageHook.pattern.code
        });
      }
    }

    if (code.includes("setTimeout") && code.includes("onChange")) {
      const debouncePattern = this.findPatterns("debounce search", "hook")[0];
      if (debouncePattern) {
        suggestions.push({
          pattern: debouncePattern.pattern,
          context: "Detected debounce pattern opportunity",
          insertionPoint: { line: 1, column: 0 },
          adaptedCode: debouncePattern.pattern.code
        });
      }
    }

    return suggestions;
  }

  recordUsage(patternId: string, successful: boolean): void {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return;

    pattern.usageCount++;
    pattern.updatedAt = Date.now();

    if (successful) {
      pattern.successScore = Math.min(1, pattern.successScore + 0.01);
    } else {
      pattern.successScore = Math.max(0, pattern.successScore - 0.02);
    }
  }

  getByCategory(category: PatternCategory): CodePattern[] {
    const ids = this.categoryIndex.get(category);
    if (!ids) return [];
    return Array.from(ids)
      .map(id => this.patterns.get(id))
      .filter((p): p is CodePattern => p !== undefined);
  }

  getTopPatterns(limit: number = 10): CodePattern[] {
    return Array.from(this.patterns.values())
      .sort((a, b) => {
        const scoreA = a.successScore * a.usageCount;
        const scoreB = b.successScore * b.usageCount;
        return scoreB - scoreA;
      })
      .slice(0, limit);
  }

  exportPatterns(projectId?: string): CodePattern[] {
    let patterns = Array.from(this.patterns.values());
    if (projectId) {
      patterns = patterns.filter(p => !p.projectId || p.projectId === projectId);
    }
    return patterns;
  }

  deletePattern(patternId: string): boolean {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return false;

    this.patterns.delete(patternId);
    const categoryPatterns = this.categoryIndex.get(pattern.category);
    if (categoryPatterns) {
      categoryPatterns.delete(patternId);
    }

    logger.info("Pattern deleted", { patternId });
    return true;
  }

  destroy(): void {
    this.patterns.clear();
    this.categoryIndex.clear();
  }
}

export const patternLibraryService = PatternLibraryService.getInstance();
