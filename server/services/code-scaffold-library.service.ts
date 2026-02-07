import { BaseService } from "../lib/base-service";

type AppCategory =
  | "dashboard"
  | "ecommerce"
  | "social"
  | "crud"
  | "landing"
  | "blog"
  | "chat"
  | "portfolio"
  | "saas"
  | "admin"
  | "form"
  | "api"
  | "game"
  | "utility"
  | "general";

interface Scaffold {
  id: string;
  name: string;
  description: string;
  category: AppCategory;
  tags: string[];
  code: string;
  dependencies: string[];
  successRate: number;
  usageCount: number;
}

interface ScaffoldMatch {
  scaffold: Scaffold;
  relevance: number;
  reason: string;
}

const CATEGORY_KEYWORDS: Record<AppCategory, string[]> = {
  dashboard: ["dashboard", "analytics", "metrics", "chart", "graph", "stats", "kpi", "monitor", "report"],
  ecommerce: ["shop", "store", "cart", "product", "checkout", "payment", "ecommerce", "e-commerce", "buy", "sell", "order", "catalog"],
  social: ["social", "feed", "post", "comment", "like", "follow", "profile", "timeline", "share", "community"],
  crud: ["crud", "create", "read", "update", "delete", "manage", "list", "table", "record", "entry"],
  landing: ["landing", "hero", "cta", "call to action", "marketing", "homepage", "launch"],
  blog: ["blog", "article", "post", "publish", "content", "markdown", "editor", "cms"],
  chat: ["chat", "message", "messaging", "conversation", "real-time", "realtime", "websocket", "inbox"],
  portfolio: ["portfolio", "showcase", "gallery", "project", "resume", "cv", "personal"],
  saas: ["saas", "subscription", "billing", "tenant", "multi-tenant", "pricing", "plan"],
  admin: ["admin", "panel", "management", "users", "roles", "permissions", "settings", "config"],
  form: ["form", "survey", "questionnaire", "input", "wizard", "multi-step", "validation"],
  api: ["api", "rest", "endpoint", "route", "backend", "server", "express"],
  game: ["game", "play", "score", "level", "puzzle", "quiz", "trivia"],
  utility: ["tool", "utility", "calculator", "converter", "generator", "tracker", "timer", "todo", "task"],
  general: [],
};

class CodeScaffoldLibraryService extends BaseService {
  private static instance: CodeScaffoldLibraryService;
  private scaffolds: Map<string, Scaffold> = new Map();

  private constructor() {
    super("CodeScaffoldLibraryService");
    this.initializeScaffolds();
  }

  static getInstance(): CodeScaffoldLibraryService {
    if (!CodeScaffoldLibraryService.instance) {
      CodeScaffoldLibraryService.instance = new CodeScaffoldLibraryService();
    }
    return CodeScaffoldLibraryService.instance;
  }

  private initializeScaffolds(): void {
    const scaffolds: Omit<Scaffold, "id" | "usageCount">[] = [
      {
        name: "React Data Table with Sorting & Filtering",
        description: "Production-ready sortable, filterable data table component",
        category: "crud",
        tags: ["table", "sort", "filter", "pagination", "data"],
        dependencies: [],
        successRate: 0.95,
        code: `interface Column<T> {
  key: keyof T;
  label: string;
  sortable?: boolean;
  render?: (value: T[keyof T], row: T) => React.ReactNode;
}

interface DataTableProps<T extends { id: string | number }> {
  data: T[];
  columns: Column<T>[];
  searchKey?: keyof T;
  pageSize?: number;
}

function DataTable<T extends { id: string | number }>({ data, columns, searchKey, pageSize = 10 }: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<keyof T | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let result = [...data];
    if (search && searchKey) {
      result = result.filter(row => String(row[searchKey]).toLowerCase().includes(search.toLowerCase()));
    }
    if (sortKey) {
      result.sort((a, b) => {
        const aVal = a[sortKey], bVal = b[sortKey];
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [data, search, searchKey, sortKey, sortDir]);

  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize);

  const toggleSort = (key: keyof T) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  return (
    <div className="space-y-4">
      {searchKey && (
        <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map(col => (
              <TableHead key={String(col.key)} onClick={() => col.sortable && toggleSort(col.key)}
                className={col.sortable ? "cursor-pointer select-none" : ""}>
                {col.label} {sortKey === col.key && (sortDir === "asc" ? "↑" : "↓")}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paged.map(row => (
            <TableRow key={row.id}>
              {columns.map(col => (
                <TableCell key={String(col.key)}>
                  {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? "")}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{filtered.length} results</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span className="text-sm py-1">Page {page + 1} of {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}`
      },
      {
        name: "Auth Context & Protected Route",
        description: "Authentication context provider with protected route wrapper",
        category: "saas",
        tags: ["auth", "login", "protected", "context", "session"],
        dependencies: [],
        successRate: 0.93,
        code: `interface User { id: string; email: string; name: string; role: string; }
interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.ok ? r.json() : null)
      .then(u => setUser(u)).finally(() => setIsLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error("Login failed");
    setUser(await res.json());
  };

  const logout = () => { fetch("/api/auth/logout", { method: "POST" }); setUser(null); };

  return <AuthContext.Provider value={{ user, login, logout, isLoading }}>{children}</AuthContext.Provider>;
}

function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="flex items-center justify-center h-screen"><Loader2 className="animate-spin" /></div>;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
}`
      },
      {
        name: "Shopping Cart with Context",
        description: "Full shopping cart state management with add/remove/quantity",
        category: "ecommerce",
        tags: ["cart", "shopping", "quantity", "total", "checkout"],
        dependencies: [],
        successRate: 0.92,
        code: `interface CartItem { id: string; name: string; price: number; quantity: number; image?: string; }
interface CartContextType {
  items: CartItem[];
  addItem: (product: Omit<CartItem, "quantity">) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, qty: number) => void;
  clearCart: () => void;
  total: number;
  itemCount: number;
}

const CartContext = createContext<CartContextType | null>(null);

function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem("cart");
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => { localStorage.setItem("cart", JSON.stringify(items)); }, [items]);

  const addItem = (product: Omit<CartItem, "quantity">) => {
    setItems(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) return prev.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));
  const updateQuantity = (id: string, qty: number) => {
    if (qty <= 0) return removeItem(id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, quantity: qty } : i));
  };
  const clearCart = () => setItems([]);
  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return <CartContext.Provider value={{ items, addItem, removeItem, updateQuantity, clearCart, total, itemCount }}>{children}</CartContext.Provider>;
}

function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be inside CartProvider");
  return ctx;
}`
      },
      {
        name: "Dashboard Stats Cards",
        description: "Responsive stat cards grid with trend indicators",
        category: "dashboard",
        tags: ["stats", "metrics", "cards", "kpi", "trend"],
        dependencies: [],
        successRate: 0.96,
        code: `interface StatCard {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ReactNode;
  description?: string;
}

function StatsGrid({ stats }: { stats: StatCard[] }) {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
            <div className="text-muted-foreground">{stat.icon}</div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            {stat.change !== undefined && (
              <p className={\`text-xs \${stat.change >= 0 ? "text-green-600" : "text-red-600"}\`}>
                {stat.change >= 0 ? "+" : ""}{stat.change}% from last period
              </p>
            )}
            {stat.description && <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}`
      },
      {
        name: "CRUD API Routes (Express)",
        description: "Complete RESTful CRUD routes with validation and error handling",
        category: "api",
        tags: ["rest", "crud", "express", "routes", "validation"],
        dependencies: ["express", "zod"],
        successRate: 0.94,
        code: `// Pattern: RESTful CRUD route handler
import { Router, Request, Response } from "express";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
});

const updateSchema = createSchema.partial();

export function createCrudRoutes(resourceName: string, storage: any) {
  const router = Router();

  router.get("/", async (_req: Request, res: Response) => {
    try {
      const items = await storage.getAll();
      res.json(items);
    } catch (err) {
      res.status(500).json({ error: \`Failed to fetch \${resourceName}s\` });
    }
  });

  router.get("/:id", async (req: Request, res: Response) => {
    try {
      const item = await storage.getById(parseInt(req.params.id));
      if (!item) return res.status(404).json({ error: \`\${resourceName} not found\` });
      res.json(item);
    } catch (err) {
      res.status(500).json({ error: \`Failed to fetch \${resourceName}\` });
    }
  });

  router.post("/", async (req: Request, res: Response) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const item = await storage.create(parsed.data);
      res.status(201).json(item);
    } catch (err) {
      res.status(500).json({ error: \`Failed to create \${resourceName}\` });
    }
  });

  router.patch("/:id", async (req: Request, res: Response) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const item = await storage.update(parseInt(req.params.id), parsed.data);
      if (!item) return res.status(404).json({ error: \`\${resourceName} not found\` });
      res.json(item);
    } catch (err) {
      res.status(500).json({ error: \`Failed to update \${resourceName}\` });
    }
  });

  router.delete("/:id", async (req: Request, res: Response) => {
    try {
      const success = await storage.delete(parseInt(req.params.id));
      if (!success) return res.status(404).json({ error: \`\${resourceName} not found\` });
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: \`Failed to delete \${resourceName}\` });
    }
  });

  return router;
}`
      },
      {
        name: "Responsive Nav with Mobile Menu",
        description: "Responsive navigation bar with hamburger menu for mobile",
        category: "landing",
        tags: ["nav", "navigation", "header", "mobile", "responsive", "menu"],
        dependencies: [],
        successRate: 0.94,
        code: `interface NavLink { label: string; href: string; }

function Navbar({ links, logo }: { links: NavLink[]; logo: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
      <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-2 font-bold text-lg">{logo}</div>
        <div className="hidden md:flex items-center gap-1">
          {links.map(link => (
            <a key={link.href} href={link.href}
              className="px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover-elevate">
              {link.label}
            </a>
          ))}
        </div>
        <Button size="icon" variant="ghost" className="md:hidden" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>
      {isOpen && (
        <div className="md:hidden border-t px-4 pb-3 space-y-1">
          {links.map(link => (
            <a key={link.href} href={link.href} onClick={() => setIsOpen(false)}
              className="block px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover-elevate">
              {link.label}
            </a>
          ))}
        </div>
      )}
    </nav>
  );
}`
      },
      {
        name: "Hero Section with CTA",
        description: "Landing page hero section with headline, subtitle, and CTA buttons",
        category: "landing",
        tags: ["hero", "landing", "cta", "headline"],
        dependencies: [],
        successRate: 0.97,
        code: `function HeroSection({ title, subtitle, primaryCta, secondaryCta }: {
  title: string;
  subtitle: string;
  primaryCta: { label: string; onClick: () => void };
  secondaryCta?: { label: string; onClick: () => void };
}) {
  return (
    <section className="relative overflow-hidden py-24 lg:py-32">
      <div className="container mx-auto px-4 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">{title}</h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">{subtitle}</p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Button size="lg" onClick={primaryCta.onClick}>{primaryCta.label}</Button>
          {secondaryCta && (
            <Button size="lg" variant="outline" onClick={secondaryCta.onClick}>{secondaryCta.label}</Button>
          )}
        </div>
      </div>
    </section>
  );
}`
      },
      {
        name: "Chat Message List",
        description: "Real-time chat UI with message bubbles, timestamps, and auto-scroll",
        category: "chat",
        tags: ["chat", "message", "bubble", "realtime", "conversation"],
        dependencies: [],
        successRate: 0.91,
        code: `interface ChatMessage {
  id: string;
  content: string;
  sender: { id: string; name: string; avatar?: string };
  timestamp: Date;
  isMine: boolean;
}

function ChatMessageList({ messages, currentUserId }: { messages: ChatMessage[]; currentUserId: string }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map(msg => (
        <div key={msg.id} className={\`flex \${msg.isMine ? "justify-end" : "justify-start"}\`}>
          <div className={\`max-w-[70%] rounded-lg px-4 py-2 \${msg.isMine ? "bg-primary text-primary-foreground" : "bg-muted"}\`}>
            {!msg.isMine && <p className="text-xs font-medium mb-1">{msg.sender.name}</p>}
            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
            <p className={\`text-xs mt-1 opacity-70\`}>
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function ChatInput({ onSend }: { onSend: (content: string) => void }) {
  const [message, setMessage] = useState("");

  const handleSend = () => {
    if (!message.trim()) return;
    onSend(message.trim());
    setMessage("");
  };

  return (
    <div className="border-t p-4 flex gap-2">
      <Input value={message} onChange={e => setMessage(e.target.value)}
        onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
        placeholder="Type a message..." className="flex-1" />
      <Button onClick={handleSend} disabled={!message.trim()}>
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}`
      },
      {
        name: "Product Card Grid",
        description: "Responsive product card grid with image, price, and actions",
        category: "ecommerce",
        tags: ["product", "card", "grid", "price", "image", "shop"],
        dependencies: [],
        successRate: 0.95,
        code: `interface Product {
  id: string;
  name: string;
  price: number;
  image: string;
  description: string;
  category?: string;
  inStock?: boolean;
}

function ProductGrid({ products, onAddToCart }: { products: Product[]; onAddToCart: (product: Product) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {products.map(product => (
        <Card key={product.id} className="overflow-hidden hover-elevate">
          <div className="aspect-square overflow-hidden">
            <img src={product.image} alt={product.name} className="w-full h-full object-cover transition-transform hover:scale-105" />
          </div>
          <CardContent className="p-4">
            {product.category && <Badge variant="secondary" className="mb-2">{product.category}</Badge>}
            <h3 className="font-semibold truncate">{product.name}</h3>
            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{product.description}</p>
            <div className="flex items-center justify-between gap-2 mt-4">
              <span className="text-lg font-bold">\${product.price.toFixed(2)}</span>
              <Button size="sm" onClick={() => onAddToCart(product)} disabled={product.inStock === false}>
                {product.inStock === false ? "Out of Stock" : "Add to Cart"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}`
      },
      {
        name: "Multi-Step Form Wizard",
        description: "Step-by-step form with progress indicator and validation per step",
        category: "form",
        tags: ["wizard", "multi-step", "stepper", "form", "progress"],
        dependencies: [],
        successRate: 0.90,
        code: `interface WizardStep {
  title: string;
  description?: string;
  content: React.ReactNode;
  validate?: () => boolean;
}

function FormWizard({ steps, onComplete }: { steps: WizardStep[]; onComplete: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);

  const canNext = () => {
    const step = steps[currentStep];
    return step.validate ? step.validate() : true;
  };

  const next = () => {
    if (canNext() && currentStep < steps.length - 1) setCurrentStep(s => s + 1);
  };

  const prev = () => { if (currentStep > 0) setCurrentStep(s => s - 1); };

  const handleFinish = () => { if (canNext()) onComplete(); };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-center gap-2">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2 flex-1">
            <div className={\`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium border-2 \${
              i < currentStep ? "bg-primary text-primary-foreground border-primary"
              : i === currentStep ? "border-primary text-primary"
              : "border-muted text-muted-foreground"
            }\`}>
              {i < currentStep ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            {i < steps.length - 1 && (
              <div className={\`flex-1 h-0.5 \${i < currentStep ? "bg-primary" : "bg-muted"}\`} />
            )}
          </div>
        ))}
      </div>
      <div>
        <h2 className="text-xl font-semibold">{steps[currentStep].title}</h2>
        {steps[currentStep].description && (
          <p className="text-muted-foreground mt-1">{steps[currentStep].description}</p>
        )}
      </div>
      <div className="min-h-[200px]">{steps[currentStep].content}</div>
      <div className="flex justify-between gap-4">
        <Button variant="outline" onClick={prev} disabled={currentStep === 0}>Back</Button>
        {currentStep < steps.length - 1 ? (
          <Button onClick={next}>Continue</Button>
        ) : (
          <Button onClick={handleFinish}>Complete</Button>
        )}
      </div>
    </div>
  );
}`
      },
      {
        name: "Drizzle Schema with Relations",
        description: "PostgreSQL schema with Drizzle ORM including relations and insert schemas",
        category: "crud",
        tags: ["drizzle", "schema", "database", "postgresql", "orm", "relations"],
        dependencies: ["drizzle-orm", "drizzle-zod"],
        successRate: 0.93,
        code: `// Pattern: Drizzle schema with insert schemas
import { pgTable, serial, text, integer, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("user"),
});

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  published: boolean("published").notNull().default(false),
  authorId: integer("author_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
}));

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertPostSchema = createInsertSchema(posts).omit({ id: true, createdAt: true });

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Post = typeof posts.$inferSelect;
export type InsertPost = z.infer<typeof insertPostSchema>;`
      },
      {
        name: "useQuery Data Fetching Pattern",
        description: "TanStack Query patterns for fetching, mutating, and cache invalidation",
        category: "general",
        tags: ["query", "tanstack", "fetch", "mutation", "cache"],
        dependencies: ["@tanstack/react-query"],
        successRate: 0.95,
        code: `// Pattern: TanStack Query with mutations and cache invalidation
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";

function useItems() {
  return useQuery<Item[]>({ queryKey: ["/api/items"] });
}

function useItem(id: number) {
  return useQuery<Item>({ queryKey: ["/api/items", id], enabled: !!id });
}

function useCreateItem() {
  return useMutation({
    mutationFn: (data: InsertItem) => apiRequest("POST", "/api/items", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
    },
  });
}

function useUpdateItem() {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InsertItem> }) =>
      apiRequest("PATCH", \`/api/items/\${id}\`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items", variables.id] });
    },
  });
}

function useDeleteItem() {
  return useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", \`/api/items/\${id}\`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
    },
  });
}`
      },
      {
        name: "Blog Post Layout",
        description: "Blog post page with header, content, author, and related posts",
        category: "blog",
        tags: ["blog", "article", "post", "content", "author"],
        dependencies: [],
        successRate: 0.93,
        code: `interface BlogPost {
  id: string;
  title: string;
  content: string;
  excerpt: string;
  author: { name: string; avatar?: string };
  publishedAt: Date;
  tags: string[];
  readingTime: number;
}

function BlogPostPage({ post, relatedPosts }: { post: BlogPost; relatedPosts: BlogPost[] }) {
  return (
    <article className="max-w-3xl mx-auto px-4 py-12">
      <header className="space-y-4 mb-8">
        <div className="flex flex-wrap gap-2">
          {post.tags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}
        </div>
        <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">{post.title}</h1>
        <div className="flex items-center gap-3 text-muted-foreground">
          <Avatar className="h-8 w-8">
            {post.author.avatar && <AvatarImage src={post.author.avatar} />}
            <AvatarFallback>{post.author.name[0]}</AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium">{post.author.name}</span>
          <span className="text-sm">{new Date(post.publishedAt).toLocaleDateString()}</span>
          <span className="text-sm">{post.readingTime} min read</span>
        </div>
      </header>
      <div className="prose prose-neutral dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: post.content }} />
      {relatedPosts.length > 0 && (
        <section className="mt-16 border-t pt-8">
          <h2 className="text-xl font-semibold mb-6">Related Posts</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {relatedPosts.map(rp => (
              <Card key={rp.id} className="hover-elevate">
                <CardContent className="p-4">
                  <h3 className="font-medium">{rp.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{rp.excerpt}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}`
      },
      {
        name: "Pricing Cards",
        description: "SaaS pricing tier cards with feature comparison",
        category: "saas",
        tags: ["pricing", "plans", "subscription", "tier", "saas"],
        dependencies: [],
        successRate: 0.96,
        code: `interface PricingTier {
  name: string;
  price: number;
  period: string;
  description: string;
  features: string[];
  highlighted?: boolean;
  cta: string;
}

function PricingCards({ tiers, onSelect }: { tiers: PricingTier[]; onSelect: (tier: PricingTier) => void }) {
  return (
    <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
      {tiers.map(tier => (
        <Card key={tier.name} className={\`relative \${tier.highlighted ? "border-primary shadow-lg scale-105" : ""}\`}>
          {tier.highlighted && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge>Most Popular</Badge>
            </div>
          )}
          <CardHeader className="text-center">
            <CardTitle>{tier.name}</CardTitle>
            <CardDescription>{tier.description}</CardDescription>
            <div className="mt-4">
              <span className="text-4xl font-bold">\${tier.price}</span>
              <span className="text-muted-foreground">/{tier.period}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-3">
              {tier.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>
            <Button className="w-full" variant={tier.highlighted ? "default" : "outline"} onClick={() => onSelect(tier)}>
              {tier.cta}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}`
      },
      {
        name: "Todo List with Completion",
        description: "Interactive todo list with add, complete, delete, and filter",
        category: "utility",
        tags: ["todo", "task", "checklist", "list", "complete"],
        dependencies: [],
        successRate: 0.97,
        code: `interface Todo { id: string; text: string; completed: boolean; createdAt: Date; }

function TodoList() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [input, setInput] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");

  const addTodo = () => {
    if (!input.trim()) return;
    setTodos(prev => [...prev, { id: crypto.randomUUID(), text: input.trim(), completed: false, createdAt: new Date() }]);
    setInput("");
  };

  const toggleTodo = (id: string) => setTodos(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  const deleteTodo = (id: string) => setTodos(prev => prev.filter(t => t.id !== id));

  const filtered = todos.filter(t => filter === "all" ? true : filter === "active" ? !t.completed : t.completed);
  const remaining = todos.filter(t => !t.completed).length;

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex gap-2">
        <Input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addTodo()} placeholder="What needs to be done?" />
        <Button onClick={addTodo}><Plus className="h-4 w-4" /></Button>
      </div>
      <div className="space-y-2">
        {filtered.map(todo => (
          <div key={todo.id} className="flex items-center gap-3 p-3 rounded-md border">
            <Checkbox checked={todo.completed} onCheckedChange={() => toggleTodo(todo.id)} />
            <span className={\`flex-1 \${todo.completed ? "line-through text-muted-foreground" : ""}\`}>{todo.text}</span>
            <Button size="icon" variant="ghost" onClick={() => deleteTodo(todo.id)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{remaining} item{remaining !== 1 ? "s" : ""} left</span>
        <div className="flex gap-1">
          {(["all", "active", "completed"] as const).map(f => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "ghost"} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}`
      },
      {
        name: "User Profile Card",
        description: "User profile display with avatar, stats, and edit capabilities",
        category: "social",
        tags: ["profile", "user", "avatar", "stats", "social"],
        dependencies: [],
        successRate: 0.94,
        code: `interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  bio?: string;
  stats: { label: string; value: number }[];
  joinedAt: Date;
}

function ProfileCard({ user, isOwn, onEdit }: { user: UserProfile; isOwn?: boolean; onEdit?: () => void }) {
  return (
    <Card className="max-w-md mx-auto">
      <CardContent className="pt-6 text-center">
        <Avatar className="h-24 w-24 mx-auto">
          {user.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
          <AvatarFallback className="text-2xl">{user.name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <h2 className="mt-4 text-xl font-semibold">{user.name}</h2>
        <p className="text-sm text-muted-foreground">{user.email}</p>
        {user.bio && <p className="mt-2 text-sm">{user.bio}</p>}
        <div className="flex justify-center gap-8 mt-6">
          {user.stats.map(stat => (
            <div key={stat.label} className="text-center">
              <div className="text-2xl font-bold">{stat.value.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
        {isOwn && onEdit && (
          <Button variant="outline" className="mt-6" onClick={onEdit}>Edit Profile</Button>
        )}
      </CardContent>
    </Card>
  );
}`
      },
      {
        name: "Social Feed Post",
        description: "Social media feed post with like, comment, and share actions",
        category: "social",
        tags: ["feed", "post", "like", "comment", "share", "social"],
        dependencies: [],
        successRate: 0.91,
        code: `interface FeedPost {
  id: string;
  author: { name: string; avatar?: string; username: string };
  content: string;
  image?: string;
  likes: number;
  comments: number;
  isLiked: boolean;
  createdAt: Date;
}

function FeedPostCard({ post, onLike, onComment }: {
  post: FeedPost;
  onLike: (id: string) => void;
  onComment: (id: string) => void;
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            {post.author.avatar && <AvatarImage src={post.author.avatar} />}
            <AvatarFallback>{post.author.name[0]}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium text-sm">{post.author.name}</p>
            <p className="text-xs text-muted-foreground">@{post.author.username} · {formatTimeAgo(post.createdAt)}</p>
          </div>
        </div>
        <p className="text-sm whitespace-pre-wrap">{post.content}</p>
        {post.image && <img src={post.image} alt="" className="rounded-lg w-full max-h-96 object-cover" />}
        <div className="flex items-center gap-6 pt-2">
          <button onClick={() => onLike(post.id)} className={\`flex items-center gap-1.5 text-sm \${post.isLiked ? "text-red-500" : "text-muted-foreground"}\`}>
            <Heart className={\`h-4 w-4 \${post.isLiked ? "fill-current" : ""}\`} /> {post.likes}
          </button>
          <button onClick={() => onComment(post.id)} className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MessageCircle className="h-4 w-4" /> {post.comments}
          </button>
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Share2 className="h-4 w-4" /> Share
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return \`\${Math.floor(seconds / 60)}m\`;
  if (seconds < 86400) return \`\${Math.floor(seconds / 3600)}h\`;
  return \`\${Math.floor(seconds / 86400)}d\`;
}`
      },
      {
        name: "Admin Users Table",
        description: "Admin panel user management table with role badges and actions",
        category: "admin",
        tags: ["admin", "users", "management", "roles", "table"],
        dependencies: [],
        successRate: 0.92,
        code: `interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "editor" | "user";
  status: "active" | "suspended" | "pending";
  lastLogin?: Date;
}

const roleColors: Record<string, string> = {
  admin: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  editor: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  user: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  suspended: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
};

function AdminUsersTable({ users, onEdit, onDelete }: {
  users: AdminUser[];
  onEdit: (user: AdminUser) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Last Login</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map(user => (
          <TableRow key={user.id}>
            <TableCell>
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>{user.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-sm">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
              </div>
            </TableCell>
            <TableCell><Badge className={roleColors[user.role]}>{user.role}</Badge></TableCell>
            <TableCell><Badge className={statusColors[user.status]}>{user.status}</Badge></TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : "Never"}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <Button size="icon" variant="ghost" onClick={() => onEdit(user)}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => onDelete(user.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}`
      },
      {
        name: "Portfolio Project Grid",
        description: "Portfolio project showcase with filter tags and modal details",
        category: "portfolio",
        tags: ["portfolio", "project", "gallery", "showcase", "filter"],
        dependencies: [],
        successRate: 0.93,
        code: `interface PortfolioProject {
  id: string;
  title: string;
  description: string;
  image: string;
  tags: string[];
  liveUrl?: string;
  sourceUrl?: string;
}

function PortfolioGrid({ projects }: { projects: PortfolioProject[] }) {
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const allTags = useMemo(() => Array.from(new Set(projects.flatMap(p => p.tags))), [projects]);
  const filtered = activeTag ? projects.filter(p => p.tags.includes(activeTag)) : projects;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={activeTag === null ? "default" : "outline"} onClick={() => setActiveTag(null)}>All</Button>
        {allTags.map(tag => (
          <Button key={tag} size="sm" variant={activeTag === tag ? "default" : "outline"} onClick={() => setActiveTag(tag)}>
            {tag}
          </Button>
        ))}
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map(project => (
          <Card key={project.id} className="overflow-hidden hover-elevate group">
            <div className="aspect-video overflow-hidden">
              <img src={project.image} alt={project.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
            </div>
            <CardContent className="p-4 space-y-2">
              <h3 className="font-semibold">{project.title}</h3>
              <p className="text-sm text-muted-foreground line-clamp-2">{project.description}</p>
              <div className="flex flex-wrap gap-1">
                {project.tags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}
              </div>
              <div className="flex gap-2 pt-2">
                {project.liveUrl && (
                  <Button size="sm" variant="outline" asChild><a href={project.liveUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3 mr-1" /> Live</a></Button>
                )}
                {project.sourceUrl && (
                  <Button size="sm" variant="outline" asChild><a href={project.sourceUrl} target="_blank" rel="noreferrer"><Github className="h-3 w-3 mr-1" /> Code</a></Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}`
      },
      {
        name: "Search with Debounce and Results",
        description: "Debounced search bar with dropdown results and keyboard navigation",
        category: "general",
        tags: ["search", "debounce", "autocomplete", "dropdown", "keyboard"],
        dependencies: [],
        successRate: 0.92,
        code: `function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

interface SearchResult { id: string; title: string; description?: string; }

function SearchBar({ onSearch, placeholder }: { onSearch: (query: string) => Promise<SearchResult[]>; placeholder?: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (debouncedQuery.length < 2) { setResults([]); return; }
    onSearch(debouncedQuery).then(setResults);
  }, [debouncedQuery, onSearch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, -1)); }
    else if (e.key === "Escape") { setIsOpen(false); }
  };

  return (
    <div className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={query} onChange={e => { setQuery(e.target.value); setIsOpen(true); setSelectedIndex(-1); }}
          onFocus={() => setIsOpen(true)} onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          onKeyDown={handleKeyDown} placeholder={placeholder || "Search..."} className="pl-10" />
      </div>
      {isOpen && results.length > 0 && (
        <Card className="absolute top-full left-0 right-0 mt-1 z-50 max-h-64 overflow-y-auto">
          {results.map((result, i) => (
            <div key={result.id} className={\`px-4 py-2 cursor-pointer hover-elevate \${i === selectedIndex ? "bg-accent" : ""}\`}>
              <p className="font-medium text-sm">{result.title}</p>
              {result.description && <p className="text-xs text-muted-foreground">{result.description}</p>}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}`
      },
      {
        name: "Modal/Dialog with Form",
        description: "Reusable dialog component with form inside for create/edit operations",
        category: "general",
        tags: ["modal", "dialog", "form", "create", "edit"],
        dependencies: [],
        successRate: 0.94,
        code: `function FormDialog<T extends Record<string, any>>({ title, description, fields, defaultValues, onSubmit, trigger, isLoading }: {
  title: string;
  description?: string;
  fields: { name: keyof T & string; label: string; type?: string; placeholder?: string; required?: boolean }[];
  defaultValues?: Partial<T>;
  onSubmit: (data: T) => Promise<void>;
  trigger: React.ReactNode;
  isLoading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open && defaultValues) {
      const initial: Record<string, string> = {};
      fields.forEach(f => { initial[f.name] = String(defaultValues[f.name] ?? ""); });
      setValues(initial);
    } else if (open) {
      setValues({});
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(values as unknown as T);
    setOpen(false);
    setValues({});
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map(field => (
            <div key={field.name} className="space-y-2">
              <Label htmlFor={field.name}>{field.label}</Label>
              <Input id={field.name} type={field.type || "text"} placeholder={field.placeholder}
                value={values[field.name] || ""} onChange={e => setValues(v => ({ ...v, [field.name]: e.target.value }))}
                required={field.required} />
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isLoading}>{isLoading ? "Saving..." : "Save"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}`
      },
      {
        name: "Notification Toast System",
        description: "Toast notification hook with success/error/info variants",
        category: "general",
        tags: ["toast", "notification", "alert", "feedback"],
        dependencies: [],
        successRate: 0.96,
        code: `// Use the existing useToast hook from shadcn/ui:
import { useToast } from "@/hooks/use-toast";

// Usage pattern for showing notifications:
function useNotifications() {
  const { toast } = useToast();

  return {
    success: (title: string, description?: string) =>
      toast({ title, description, variant: "default" }),
    error: (title: string, description?: string) =>
      toast({ title, description, variant: "destructive" }),
    info: (title: string, description?: string) =>
      toast({ title, description }),
  };
}

// Example usage in a component:
function ExampleComponent() {
  const notify = useNotifications();

  const handleSave = async () => {
    try {
      await saveData();
      notify.success("Saved", "Your changes have been saved successfully.");
    } catch (err) {
      notify.error("Error", "Failed to save changes. Please try again.");
    }
  };

  return <Button onClick={handleSave}>Save</Button>;
}`
      },
      {
        name: "File Upload with Preview",
        description: "Drag-and-drop file upload with image preview and progress",
        category: "form",
        tags: ["upload", "file", "drag-drop", "image", "preview"],
        dependencies: [],
        successRate: 0.89,
        code: `function FileUpload({ onUpload, accept, maxSizeMB }: {
  onUpload: (file: File) => Promise<void>;
  accept?: string;
  maxSizeMB?: number;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);
    if (maxSizeMB && file.size > maxSizeMB * 1024 * 1024) {
      setError(\`File must be under \${maxSizeMB}MB\`);
      return;
    }
    if (file.type.startsWith("image/")) {
      setPreview(URL.createObjectURL(file));
    }
    setIsUploading(true);
    try {
      await onUpload(file);
    } catch (err) {
      setError("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={\`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors \${
          isDragging ? "border-primary bg-primary/5" : "border-muted hover:border-primary/50"
        }\`}
      >
        {preview ? (
          <img src={preview} alt="Preview" className="max-h-32 mx-auto rounded" />
        ) : (
          <div className="space-y-2">
            <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Drag & drop or click to upload</p>
            {maxSizeMB && <p className="text-xs text-muted-foreground">Max {maxSizeMB}MB</p>}
          </div>
        )}
        {isUploading && <div className="mt-2"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>}
      </div>
      {error && <p className="text-sm text-destructive mt-2">{error}</p>}
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
    </div>
  );
}`
      },
      {
        name: "Game Score Board",
        description: "Game leaderboard with rank, score, and player info",
        category: "game",
        tags: ["game", "score", "leaderboard", "rank", "player"],
        dependencies: [],
        successRate: 0.93,
        code: `interface PlayerScore {
  id: string;
  name: string;
  avatar?: string;
  score: number;
  level: number;
  gamesPlayed: number;
}

function Leaderboard({ players, currentPlayerId }: { players: PlayerScore[]; currentPlayerId?: string }) {
  const sorted = useMemo(() => [...players].sort((a, b) => b.score - a.score), [players]);

  const rankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="h-5 w-5 text-yellow-500" />;
    if (rank === 2) return <Medal className="h-5 w-5 text-gray-400" />;
    if (rank === 3) return <Medal className="h-5 w-5 text-amber-700" />;
    return <span className="text-sm font-mono w-5 text-center">{rank}</span>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5" /> Leaderboard</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {sorted.map((player, i) => (
            <div key={player.id} className={\`flex items-center gap-3 p-3 rounded-md \${
              player.id === currentPlayerId ? "bg-primary/10 border border-primary/20" : "hover-elevate"
            }\`}>
              <div className="w-8 flex justify-center">{rankIcon(i + 1)}</div>
              <Avatar className="h-8 w-8">
                {player.avatar && <AvatarImage src={player.avatar} />}
                <AvatarFallback>{player.name[0]}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{player.name}</p>
                <p className="text-xs text-muted-foreground">Level {player.level}</p>
              </div>
              <div className="text-right">
                <p className="font-bold">{player.score.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{player.gamesPlayed} games</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}`
      },
      {
        name: "Settings Panel",
        description: "Settings page with toggle switches, select dropdowns, and save",
        category: "admin",
        tags: ["settings", "config", "preferences", "toggle", "options"],
        dependencies: [],
        successRate: 0.94,
        code: `interface SettingsSection {
  title: string;
  description?: string;
  items: SettingsItem[];
}

type SettingsItem =
  | { type: "toggle"; key: string; label: string; description?: string; value: boolean }
  | { type: "select"; key: string; label: string; description?: string; value: string; options: { value: string; label: string }[] }
  | { type: "input"; key: string; label: string; description?: string; value: string; placeholder?: string };

function SettingsPanel({ sections, onChange, onSave, isSaving }: {
  sections: SettingsSection[];
  onChange: (key: string, value: any) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {sections.map(section => (
        <div key={section.title} className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">{section.title}</h3>
            {section.description && <p className="text-sm text-muted-foreground">{section.description}</p>}
          </div>
          <Card>
            <CardContent className="divide-y p-0">
              {section.items.map(item => (
                <div key={item.key} className="flex items-center justify-between gap-4 p-4">
                  <div className="space-y-0.5">
                    <Label>{item.label}</Label>
                    {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                  </div>
                  {item.type === "toggle" && (
                    <Switch checked={item.value} onCheckedChange={v => onChange(item.key, v)} />
                  )}
                  {item.type === "select" && (
                    <Select value={item.value} onValueChange={v => onChange(item.key, v)}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {item.options.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  {item.type === "input" && (
                    <Input value={item.value} onChange={e => onChange(item.key, e.target.value)}
                      placeholder={item.placeholder} className="w-40" />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ))}
      <div className="flex justify-end">
        <Button onClick={onSave} disabled={isSaving}>{isSaving ? "Saving..." : "Save Changes"}</Button>
      </div>
    </div>
  );
}`
      },
    ];

    for (const scaffold of scaffolds) {
      const id = `scaffold_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      this.scaffolds.set(id, { ...scaffold, id, usageCount: 0 });
    }

    this.log("Scaffolds initialized", { count: this.scaffolds.size });
  }

  classifyPrompt(prompt: string): AppCategory[] {
    const lower = prompt.toLowerCase();
    const scores: [AppCategory, number][] = [];

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [AppCategory, string[]][]) {
      if (category === "general") continue;
      let score = 0;
      for (const kw of keywords) {
        if (lower.includes(kw)) score += 1;
      }
      if (score > 0) scores.push([category, score]);
    }

    scores.sort((a, b) => b[1] - a[1]);

    if (scores.length === 0) return ["general"];
    return scores.slice(0, 3).map(s => s[0]);
  }

  findRelevantScaffolds(prompt: string, maxResults: number = 5): ScaffoldMatch[] {
    const categories = this.classifyPrompt(prompt);
    const lower = prompt.toLowerCase();
    const matches: ScaffoldMatch[] = [];

    for (const scaffold of Array.from(this.scaffolds.values())) {
      let relevance = 0;
      let reason = "";

      const categoryIdx = categories.indexOf(scaffold.category);
      if (categoryIdx !== -1) {
        relevance += (3 - categoryIdx) * 0.3;
        reason = `Category match: ${scaffold.category}`;
      }

      let tagMatches = 0;
      for (const tag of scaffold.tags) {
        if (lower.includes(tag)) {
          tagMatches++;
          relevance += 0.15;
        }
      }
      if (tagMatches > 0) reason += (reason ? "; " : "") + `${tagMatches} tag matches`;

      if (lower.includes(scaffold.name.toLowerCase())) {
        relevance += 0.5;
        reason += (reason ? "; " : "") + "Name match";
      }

      relevance *= scaffold.successRate;

      if (relevance > 0.1) {
        matches.push({ scaffold, relevance, reason });
      }
    }

    matches.sort((a, b) => b.relevance - a.relevance);
    return matches.slice(0, maxResults);
  }

  buildScaffoldPromptInjection(prompt: string, maxTokenBudget: number = 3000): string {
    const matches = this.findRelevantScaffolds(prompt, 4);
    if (matches.length === 0) return "";

    const parts: string[] = [
      "\n\n## Reference Code Scaffolds",
      "Use these validated patterns as starting points. Adapt and customize them to fit the specific requirements:",
    ];

    let tokenEstimate = 50;

    for (const match of matches) {
      const scaffoldText = `\n### ${match.scaffold.name}\n${match.scaffold.description}\n\`\`\`tsx\n${match.scaffold.code}\n\`\`\``;
      const scaffoldTokens = Math.ceil(scaffoldText.length / 4);

      if (tokenEstimate + scaffoldTokens > maxTokenBudget) break;

      parts.push(scaffoldText);
      tokenEstimate += scaffoldTokens;
      match.scaffold.usageCount++;
    }

    if (parts.length <= 2) return "";
    return parts.join("\n");
  }

  recordOutcome(scaffoldId: string, success: boolean): void {
    const scaffold = this.scaffolds.get(scaffoldId);
    if (scaffold) {
      const weight = 0.05;
      scaffold.successRate = success
        ? Math.min(1, scaffold.successRate + weight)
        : Math.max(0, scaffold.successRate - weight * 2);
    }
  }

  getAll(): Scaffold[] {
    return Array.from(this.scaffolds.values());
  }

  getByCategory(category: AppCategory): Scaffold[] {
    return Array.from(this.scaffolds.values()).filter(s => s.category === category);
  }

  getStats(): { total: number; byCategory: Record<string, number>; topUsed: { name: string; count: number }[] } {
    const byCategory: Record<string, number> = {};
    const all = Array.from(this.scaffolds.values());
    for (const s of all) {
      byCategory[s.category] = (byCategory[s.category] || 0) + 1;
    }
    const topUsed = [...all].sort((a, b) => b.usageCount - a.usageCount).slice(0, 5).map(s => ({ name: s.name, count: s.usageCount }));
    return { total: all.length, byCategory, topUsed };
  }

  destroy(): void {
    this.scaffolds.clear();
    this.log("CodeScaffoldLibraryService destroyed");
  }
}

export const codeScaffoldLibraryService = CodeScaffoldLibraryService.getInstance();
