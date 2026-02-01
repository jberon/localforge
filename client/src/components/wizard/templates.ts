import {
  LayoutDashboard,
  ListTodo,
  BarChart3,
  Globe,
  Calculator,
  Palette,
  Rocket,
  ShoppingCart,
  Shield,
  Server,
  Store,
  FileText,
} from "lucide-react";
import type { TemplateConfig, TemplateType, ProductionTemplateConfig, ProductionTemplateType } from "./types";
import type { DataEntity, ProductionModules } from "@shared/schema";

export const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Yes/No" },
  { value: "date", label: "Date" },
  { value: "email", label: "Email" },
  { value: "url", label: "URL" },
  { value: "textarea", label: "Long Text" },
];

export const DEFAULT_DATA_MODELS: Record<TemplateType, DataEntity[]> = {
  dashboard: [],
  todo: [
    {
      id: "task",
      name: "Task",
      fields: [
        { id: "title", name: "Title", type: "text", required: true },
        { id: "description", name: "Description", type: "textarea", required: false },
        { id: "completed", name: "Completed", type: "boolean", required: false },
        { id: "priority", name: "Priority", type: "text", required: false },
        { id: "dueDate", name: "Due Date", type: "date", required: false },
      ],
    },
  ],
  "data-tool": [
    {
      id: "record",
      name: "Record",
      fields: [
        { id: "name", name: "Name", type: "text", required: true },
        { id: "value", name: "Value", type: "number", required: true },
        { id: "category", name: "Category", type: "text", required: false },
        { id: "date", name: "Date", type: "date", required: false },
      ],
    },
  ],
  landing: [],
  calculator: [],
  creative: [],
};

export const TEMPLATES: TemplateConfig[] = [
  {
    id: "dashboard",
    name: "Dashboard",
    description: "Stats, charts, and data visualization",
    icon: LayoutDashboard,
    fields: [
      { id: "title", label: "Dashboard Title", type: "text", placeholder: "Sales Dashboard", required: true },
      { id: "metrics", label: "Key Metrics (comma-separated)", type: "text", placeholder: "Revenue, Users, Orders, Growth" },
      { id: "chartType", label: "Primary Chart Type", type: "select", placeholder: "Select chart type", options: [
        { value: "bar", label: "Bar Chart" },
        { value: "line", label: "Line Chart" },
        { value: "pie", label: "Pie Chart" },
        { value: "area", label: "Area Chart" },
      ]},
      { id: "style", label: "Visual Style", type: "select", placeholder: "Select style", options: [
        { value: "modern", label: "Modern & Minimal" },
        { value: "corporate", label: "Corporate & Professional" },
        { value: "colorful", label: "Colorful & Vibrant" },
        { value: "dark", label: "Dark Theme" },
      ]},
    ],
    promptBuilder: (v) => `Create a ${v.style || "modern"} dashboard called "${v.title}". Include these key metrics displayed as stat cards: ${v.metrics || "Revenue, Users, Orders"}. Add a ${v.chartType || "bar"} chart showing sample data trends. Make it visually polished with proper spacing and a cohesive color scheme.`,
    temperature: 0.4, // Lower for structured data visualization
  },
  {
    id: "todo",
    name: "Task Manager",
    description: "Todo lists, kanban, productivity tools",
    icon: ListTodo,
    fields: [
      { id: "title", label: "App Name", type: "text", placeholder: "My Tasks", required: true },
      { id: "features", label: "Features", type: "select", placeholder: "Select features", options: [
        { value: "basic", label: "Basic (add, complete, delete)" },
        { value: "categories", label: "With Categories/Tags" },
        { value: "priority", label: "With Priority Levels" },
        { value: "full", label: "Full Featured (all of the above)" },
      ]},
      { id: "persistence", label: "Save Tasks?", type: "select", placeholder: "Select option", options: [
        { value: "session", label: "Session only (reset on refresh)" },
        { value: "local", label: "Save to browser (localStorage)" },
      ]},
    ],
    promptBuilder: (v) => `Create a task management app called "${v.title}". Features: ${v.features === "basic" ? "add new tasks, mark as complete, delete tasks" : v.features === "categories" ? "add tasks with categories/tags, filter by category, complete and delete" : v.features === "priority" ? "add tasks with priority levels (high/medium/low), sort by priority, complete and delete" : "add tasks with categories AND priority levels, filter and sort, complete and delete"}. ${v.persistence === "local" ? "Save tasks to localStorage so they persist across page refreshes." : ""} Include a progress indicator showing completion percentage.`,
    temperature: 0.3, // Lower for reliable utility functionality
  },
  {
    id: "data-tool",
    name: "Data Analyzer",
    description: "CSV/data input with statistics",
    icon: BarChart3,
    fields: [
      { id: "title", label: "Tool Name", type: "text", placeholder: "CSV Analyzer", required: true },
      { id: "inputType", label: "Data Input Method", type: "select", placeholder: "Select input type", options: [
        { value: "paste", label: "Paste CSV/Text Data" },
        { value: "manual", label: "Manual Data Entry" },
        { value: "both", label: "Both Options" },
      ]},
      { id: "stats", label: "Statistics to Show", type: "text", placeholder: "sum, average, min, max, count" },
      { id: "visualization", label: "Include Charts?", type: "select", placeholder: "Select option", options: [
        { value: "table", label: "Table Only" },
        { value: "simple", label: "Table + Simple Chart" },
        { value: "full", label: "Table + Multiple Charts" },
      ]},
    ],
    promptBuilder: (v) => `Create a data analysis tool called "${v.title}". Allow users to ${v.inputType === "paste" ? "paste CSV or tabular data" : v.inputType === "manual" ? "manually enter data in rows" : "either paste CSV data or manually enter rows"}. Display the data in a clean table format. Calculate and display these statistics for numeric columns: ${v.stats || "sum, average, min, max, count"}. ${v.visualization === "simple" ? "Add a bar chart visualization." : v.visualization === "full" ? "Add both bar and pie chart visualizations." : ""} Make parsing robust and handle common CSV edge cases.`,
    temperature: 0.2, // Very low for precise data handling
  },
  {
    id: "landing",
    name: "Landing Page",
    description: "Marketing pages and portfolios",
    icon: Globe,
    fields: [
      { id: "title", label: "Page Title/Brand", type: "text", placeholder: "Acme Inc", required: true },
      { id: "tagline", label: "Tagline/Headline", type: "text", placeholder: "Build faster with AI" },
      { id: "sections", label: "Sections to Include", type: "select", placeholder: "Select sections", options: [
        { value: "minimal", label: "Hero + CTA only" },
        { value: "standard", label: "Hero + Features + CTA" },
        { value: "full", label: "Hero + Features + Testimonials + CTA" },
      ]},
      { id: "style", label: "Design Style", type: "select", placeholder: "Select style", options: [
        { value: "modern", label: "Modern SaaS" },
        { value: "minimal", label: "Minimalist" },
        { value: "bold", label: "Bold & Colorful" },
        { value: "elegant", label: "Elegant & Professional" },
      ]},
    ],
    promptBuilder: (v) => `Create a ${v.style || "modern"} landing page for "${v.title}". Headline: "${v.tagline || "Welcome to " + v.title}". ${v.sections === "minimal" ? "Include a hero section with headline, subtext, and a call-to-action button." : v.sections === "standard" ? "Include a hero section, a features grid with 3-4 features (use icons), and a call-to-action section." : "Include a hero section, features grid, testimonials section with 2-3 quotes, and a final CTA section."} Make it fully responsive and visually polished.`,
    temperature: 0.6, // Medium for creative marketing copy
  },
  {
    id: "calculator",
    name: "Calculator/Tool",
    description: "Calculators and utility tools",
    icon: Calculator,
    fields: [
      { id: "type", label: "Calculator Type", type: "select", placeholder: "Select type", required: true, options: [
        { value: "basic", label: "Basic Math Calculator" },
        { value: "tip", label: "Tip Calculator" },
        { value: "bmi", label: "BMI Calculator" },
        { value: "mortgage", label: "Mortgage Calculator" },
        { value: "unit", label: "Unit Converter" },
        { value: "custom", label: "Custom (describe below)" },
      ]},
      { id: "customDesc", label: "Custom Description (if applicable)", type: "textarea", placeholder: "Describe your custom calculator..." },
      { id: "style", label: "Visual Style", type: "select", placeholder: "Select style", options: [
        { value: "clean", label: "Clean & Modern" },
        { value: "colorful", label: "Colorful" },
        { value: "dark", label: "Dark Mode" },
      ]},
    ],
    promptBuilder: (v) => {
      if (v.type === "custom" && v.customDesc) {
        return `Create a ${v.style || "clean"} calculator/tool: ${v.customDesc}. Make it user-friendly with clear inputs and outputs.`;
      }
      const types: Record<string, string> = {
        basic: "basic math calculator with large buttons for digits and operations (+, -, ×, ÷). Include clear and equals buttons. Display the current calculation.",
        tip: "tip calculator. Input: bill amount and tip percentage (with preset buttons for 15%, 18%, 20%). Show tip amount and total. Option to split between people.",
        bmi: "BMI (Body Mass Index) calculator. Input height and weight (support both metric and imperial). Display BMI value and category (underweight, normal, overweight, obese).",
        mortgage: "mortgage calculator. Inputs: loan amount, interest rate, loan term in years. Calculate and display monthly payment, total payment, and total interest.",
        unit: "unit converter. Support length (m/ft/in), weight (kg/lb), and temperature (C/F). Clean interface to select category, input value, and see converted result.",
      };
      return `Create a ${v.style || "clean"} ${types[v.type] || types.basic}`;
    },
    temperature: 0.3, // Lower for precise calculations
  },
  {
    id: "creative",
    name: "Creative App",
    description: "Games, generators, fun tools",
    icon: Palette,
    fields: [
      { id: "type", label: "App Type", type: "select", placeholder: "Select type", required: true, options: [
        { value: "quote", label: "Quote Generator" },
        { value: "color", label: "Color Palette Generator" },
        { value: "timer", label: "Pomodoro Timer" },
        { value: "password", label: "Password Generator" },
        { value: "custom", label: "Custom (describe below)" },
      ]},
      { id: "customDesc", label: "Custom Description (if applicable)", type: "textarea", placeholder: "Describe your creative app idea..." },
    ],
    promptBuilder: (v) => {
      if (v.type === "custom" && v.customDesc) {
        return `Create this creative app: ${v.customDesc}. Make it fun, interactive, and visually appealing.`;
      }
      const types: Record<string, string> = {
        quote: "inspirational quote generator. Display a random quote with author in a beautiful card design. Button to get new quote. Include copy-to-clipboard functionality. Use a nice gradient or image background.",
        color: "color palette generator. Generate 5 harmonious colors. Display each with its hex code. Allow clicking to copy hex. Add lock icons to keep certain colors while regenerating others. Show color names if possible.",
        timer: "Pomodoro timer with 25-minute work sessions and 5-minute breaks. Large countdown display. Start, pause, and reset buttons. Visual or sound notification when timer completes. Track completed sessions.",
        password: "secure password generator. Options for length (8-32), include uppercase, lowercase, numbers, symbols. Generate button creates random password. Copy button to clipboard. Password strength indicator.",
      };
      return `Create a ${types[v.type] || types.quote}`;
    },
    temperature: 0.8, // Higher for creative and fun outputs
  },
];

// Default modules for production templates
export const DEFAULT_PRODUCTION_MODULES: ProductionModules = {
  authentication: false,
  authorization: false,
  testing: false,
  cicd: false,
  docker: false,
  migrations: false,
  logging: false,
  errorHandling: false,
  apiDocs: false,
  envConfig: false,
  rateLimiting: false,
  caching: false,
  monitoring: false,
  billing: false,
};

// Production template data models
export const PRODUCTION_DATA_MODELS: Record<ProductionTemplateType, DataEntity[]> = {
  "saas-starter": [
    {
      id: "user",
      name: "User",
      fields: [
        { id: "email", name: "Email", type: "email", required: true },
        { id: "name", name: "Name", type: "text", required: true },
        { id: "role", name: "Role", type: "text", required: false, defaultValue: "user" },
        { id: "subscriptionTier", name: "Subscription Tier", type: "text", required: false },
        { id: "createdAt", name: "Created At", type: "date", required: false },
      ],
    },
    {
      id: "subscription",
      name: "Subscription",
      fields: [
        { id: "userId", name: "User ID", type: "text", required: true },
        { id: "plan", name: "Plan", type: "text", required: true },
        { id: "status", name: "Status", type: "text", required: true },
        { id: "currentPeriodEnd", name: "Current Period End", type: "date", required: false },
      ],
    },
  ],
  "marketplace": [
    {
      id: "user",
      name: "User",
      fields: [
        { id: "email", name: "Email", type: "email", required: true },
        { id: "name", name: "Name", type: "text", required: true },
        { id: "role", name: "Role", type: "text", required: false, defaultValue: "buyer" },
      ],
    },
    {
      id: "listing",
      name: "Listing",
      fields: [
        { id: "title", name: "Title", type: "text", required: true },
        { id: "description", name: "Description", type: "textarea", required: true },
        { id: "price", name: "Price", type: "number", required: true },
        { id: "category", name: "Category", type: "text", required: false },
        { id: "sellerId", name: "Seller ID", type: "text", required: true },
        { id: "status", name: "Status", type: "text", required: true },
      ],
    },
    {
      id: "order",
      name: "Order",
      fields: [
        { id: "listingId", name: "Listing ID", type: "text", required: true },
        { id: "buyerId", name: "Buyer ID", type: "text", required: true },
        { id: "status", name: "Status", type: "text", required: true },
        { id: "total", name: "Total", type: "number", required: true },
      ],
    },
  ],
  "admin-dashboard": [
    {
      id: "user",
      name: "User",
      fields: [
        { id: "email", name: "Email", type: "email", required: true },
        { id: "name", name: "Name", type: "text", required: true },
        { id: "role", name: "Role", type: "text", required: true },
        { id: "department", name: "Department", type: "text", required: false },
        { id: "lastActive", name: "Last Active", type: "date", required: false },
      ],
    },
    {
      id: "activity",
      name: "Activity Log",
      fields: [
        { id: "userId", name: "User ID", type: "text", required: true },
        { id: "action", name: "Action", type: "text", required: true },
        { id: "resource", name: "Resource", type: "text", required: false },
        { id: "timestamp", name: "Timestamp", type: "date", required: true },
      ],
    },
  ],
  "api-service": [
    {
      id: "apiKey",
      name: "API Key",
      fields: [
        { id: "key", name: "Key", type: "text", required: true },
        { id: "userId", name: "User ID", type: "text", required: true },
        { id: "name", name: "Name", type: "text", required: true },
        { id: "permissions", name: "Permissions", type: "text", required: false },
        { id: "rateLimit", name: "Rate Limit", type: "number", required: false },
        { id: "expiresAt", name: "Expires At", type: "date", required: false },
      ],
    },
    {
      id: "usage",
      name: "API Usage",
      fields: [
        { id: "apiKeyId", name: "API Key ID", type: "text", required: true },
        { id: "endpoint", name: "Endpoint", type: "text", required: true },
        { id: "method", name: "Method", type: "text", required: true },
        { id: "responseTime", name: "Response Time (ms)", type: "number", required: false },
        { id: "statusCode", name: "Status Code", type: "number", required: false },
      ],
    },
  ],
  "ecommerce": [
    {
      id: "product",
      name: "Product",
      fields: [
        { id: "name", name: "Name", type: "text", required: true },
        { id: "description", name: "Description", type: "textarea", required: true },
        { id: "price", name: "Price", type: "number", required: true },
        { id: "sku", name: "SKU", type: "text", required: true },
        { id: "inventory", name: "Inventory", type: "number", required: true },
        { id: "category", name: "Category", type: "text", required: false },
      ],
    },
    {
      id: "order",
      name: "Order",
      fields: [
        { id: "userId", name: "User ID", type: "text", required: true },
        { id: "status", name: "Status", type: "text", required: true },
        { id: "total", name: "Total", type: "number", required: true },
        { id: "shippingAddress", name: "Shipping Address", type: "textarea", required: true },
      ],
    },
    {
      id: "cartItem",
      name: "Cart Item",
      fields: [
        { id: "userId", name: "User ID", type: "text", required: true },
        { id: "productId", name: "Product ID", type: "text", required: true },
        { id: "quantity", name: "Quantity", type: "number", required: true },
      ],
    },
  ],
  "content-platform": [
    {
      id: "user",
      name: "User",
      fields: [
        { id: "email", name: "Email", type: "email", required: true },
        { id: "username", name: "Username", type: "text", required: true },
        { id: "bio", name: "Bio", type: "textarea", required: false },
        { id: "avatarUrl", name: "Avatar URL", type: "url", required: false },
      ],
    },
    {
      id: "post",
      name: "Post",
      fields: [
        { id: "title", name: "Title", type: "text", required: true },
        { id: "content", name: "Content", type: "textarea", required: true },
        { id: "authorId", name: "Author ID", type: "text", required: true },
        { id: "status", name: "Status", type: "text", required: true },
        { id: "publishedAt", name: "Published At", type: "date", required: false },
      ],
    },
    {
      id: "comment",
      name: "Comment",
      fields: [
        { id: "postId", name: "Post ID", type: "text", required: true },
        { id: "authorId", name: "Author ID", type: "text", required: true },
        { id: "content", name: "Content", type: "textarea", required: true },
      ],
    },
  ],
};

// Helper to generate module-specific prompt additions
function buildModulePrompt(modules: ProductionModules): string {
  const parts: string[] = [];
  
  if (modules.authentication) {
    parts.push("Include user authentication with secure login/signup, session management, and protected routes.");
  }
  if (modules.authorization) {
    parts.push("Implement role-based access control (RBAC) with admin, user, and guest roles. Protect resources based on user roles.");
  }
  if (modules.testing) {
    parts.push("Generate unit tests for API routes and integration tests for key workflows. Include test utilities and mocks.");
  }
  if (modules.cicd) {
    parts.push("Include GitHub Actions CI/CD workflow for testing, linting, and deployment. Add build scripts.");
  }
  if (modules.docker) {
    parts.push("Include Dockerfile and docker-compose.yml for containerized deployment. Add multi-stage builds for production.");
  }
  if (modules.migrations) {
    parts.push("Set up database migrations with Drizzle. Include migration scripts and rollback support.");
  }
  if (modules.logging) {
    parts.push("Add structured logging with different log levels. Include request logging middleware.");
  }
  if (modules.errorHandling) {
    parts.push("Implement global error handling with custom error classes, error boundaries, and user-friendly error pages.");
  }
  if (modules.apiDocs) {
    parts.push("Generate OpenAPI/Swagger documentation for all API endpoints. Include request/response schemas.");
  }
  if (modules.envConfig) {
    parts.push("Include environment configuration with .env.example, config validation, and separate dev/staging/prod configs.");
  }
  if (modules.rateLimiting) {
    parts.push("Add rate limiting to API endpoints to prevent abuse. Include configurable limits per endpoint.");
  }
  if (modules.caching) {
    parts.push("Implement caching strategy for frequently accessed data. Include cache invalidation logic.");
  }
  if (modules.monitoring) {
    parts.push("Add health check endpoints and performance monitoring. Include metrics collection setup.");
  }
  if (modules.billing) {
    parts.push("Include Stripe integration stubs for subscription billing. Add payment webhooks and subscription management.");
  }
  
  return parts.length > 0 ? "\n\nProduction Features:\n" + parts.join("\n") : "";
}

// Production-grade templates
export const PRODUCTION_TEMPLATES: ProductionTemplateConfig[] = [
  {
    id: "saas-starter",
    name: "SaaS Starter",
    description: "Complete SaaS foundation with auth, billing, and user management",
    icon: Rocket,
    category: "saas",
    fields: [
      { id: "name", label: "Product Name", type: "text", placeholder: "Acme SaaS", required: true },
      { id: "tagline", label: "Tagline", type: "text", placeholder: "Build faster, ship sooner" },
      { id: "features", label: "Core Features (comma-separated)", type: "text", placeholder: "Team workspaces, API access, Analytics" },
      { id: "plans", label: "Pricing Tiers", type: "select", placeholder: "Select pricing model", options: [
        { value: "free-pro", label: "Free + Pro" },
        { value: "starter-pro-enterprise", label: "Starter + Pro + Enterprise" },
        { value: "usage", label: "Usage-based" },
      ]},
    ],
    defaultModules: {
      ...DEFAULT_PRODUCTION_MODULES,
      authentication: true,
      authorization: true,
      envConfig: true,
      errorHandling: true,
      logging: true,
    },
    suggestedStack: {
      frontend: "React + TypeScript + Tailwind",
      backend: "Express + Node.js",
      database: "PostgreSQL",
    },
    promptBuilder: (v, modules) => {
      const base = `Build a production-ready SaaS application called "${v.name}". Tagline: "${v.tagline || "Build something amazing"}".

Core Features: ${v.features || "Team workspaces, API access, Analytics dashboard"}

Pricing Model: ${v.plans === "free-pro" ? "Free tier with limited features, Pro tier with full access" : v.plans === "starter-pro-enterprise" ? "Starter ($9/mo), Pro ($29/mo), Enterprise (custom)" : "Pay-as-you-go usage-based pricing"}

Build a complete full-stack application with:
- Landing page with hero, features, pricing, and CTA
- User dashboard with settings and usage stats
- Admin panel for user management
- Clean, professional UI following SaaS best practices`;
      
      return base + buildModulePrompt(modules);
    },
    temperature: 0.35,
  },
  {
    id: "marketplace",
    name: "Marketplace",
    description: "Two-sided marketplace with listings, search, and transactions",
    icon: Store,
    category: "marketplace",
    fields: [
      { id: "name", label: "Marketplace Name", type: "text", placeholder: "TalentHub", required: true },
      { id: "itemType", label: "What's being sold?", type: "text", placeholder: "Services, Products, Rentals", required: true },
      { id: "sellerType", label: "Seller Type", type: "text", placeholder: "Freelancers, Businesses, Individuals" },
      { id: "features", label: "Key Features", type: "select", placeholder: "Select features", options: [
        { value: "basic", label: "Listings + Search + Contact" },
        { value: "transactions", label: "Basic + In-app Transactions" },
        { value: "full", label: "Full: Reviews, Messaging, Disputes" },
      ]},
    ],
    defaultModules: {
      ...DEFAULT_PRODUCTION_MODULES,
      authentication: true,
      authorization: true,
      errorHandling: true,
      envConfig: true,
    },
    suggestedStack: {
      frontend: "React + TypeScript + Tailwind",
      backend: "Express + Node.js",
      database: "PostgreSQL",
    },
    promptBuilder: (v, modules) => {
      const base = `Build a production-ready marketplace called "${v.name}" for ${v.itemType}.

Sellers: ${v.sellerType || "Businesses and individuals"}

Features: ${v.features === "basic" ? "Listing creation, search/browse, seller profiles, contact forms" : v.features === "transactions" ? "All basic features plus in-app checkout, order management, payment processing" : "Complete marketplace with listings, transactions, reviews/ratings, in-app messaging, dispute resolution, and seller analytics"}

Build a complete two-sided marketplace with:
- Buyer-focused homepage with search and categories
- Seller dashboard for managing listings and orders
- Listing detail pages with images and descriptions
- User profiles for both buyers and sellers
- Clean, trustworthy UI that builds confidence`;

      return base + buildModulePrompt(modules);
    },
    temperature: 0.35,
  },
  {
    id: "admin-dashboard",
    name: "Admin Dashboard",
    description: "Internal tools with analytics, user management, and CRUD operations",
    icon: Shield,
    category: "internal",
    fields: [
      { id: "name", label: "Dashboard Name", type: "text", placeholder: "Operations Hub", required: true },
      { id: "domain", label: "Business Domain", type: "text", placeholder: "E-commerce, Healthcare, Finance" },
      { id: "entities", label: "Main Entities to Manage", type: "text", placeholder: "Users, Orders, Products, Reports" },
      { id: "features", label: "Dashboard Features", type: "select", placeholder: "Select features", options: [
        { value: "crud", label: "CRUD Operations Only" },
        { value: "analytics", label: "CRUD + Analytics Charts" },
        { value: "full", label: "Full: CRUD + Analytics + Exports + Audit" },
      ]},
    ],
    defaultModules: {
      ...DEFAULT_PRODUCTION_MODULES,
      authentication: true,
      authorization: true,
      logging: true,
      errorHandling: true,
    },
    suggestedStack: {
      frontend: "React + TypeScript + Tailwind",
      backend: "Express + Node.js",
      database: "PostgreSQL",
    },
    promptBuilder: (v, modules) => {
      const base = `Build a production-ready admin dashboard called "${v.name}" for ${v.domain || "business operations"}.

Entities to Manage: ${v.entities || "Users, Orders, Products"}

Features: ${v.features === "crud" ? "Full CRUD operations with search, filter, and pagination" : v.features === "analytics" ? "CRUD operations plus analytics dashboards with charts and KPIs" : "Complete admin suite with CRUD, analytics, data exports (CSV/Excel), audit logs, and bulk operations"}

Build a comprehensive internal tool with:
- Sidebar navigation between entities
- Data tables with sorting, filtering, and pagination
- Create/edit forms with validation
- Dashboard overview with key metrics
- Clean, efficient UI optimized for productivity`;

      return base + buildModulePrompt(modules);
    },
    temperature: 0.3,
  },
  {
    id: "api-service",
    name: "API Service",
    description: "RESTful API with authentication, rate limiting, and documentation",
    icon: Server,
    category: "api",
    fields: [
      { id: "name", label: "API Name", type: "text", placeholder: "DataSync API", required: true },
      { id: "purpose", label: "API Purpose", type: "textarea", placeholder: "Describe what your API does..." },
      { id: "authType", label: "Authentication Type", type: "select", placeholder: "Select auth type", options: [
        { value: "apikey", label: "API Key" },
        { value: "jwt", label: "JWT Tokens" },
        { value: "oauth", label: "OAuth 2.0" },
      ]},
      { id: "features", label: "API Features", type: "select", placeholder: "Select features", options: [
        { value: "basic", label: "Basic REST endpoints" },
        { value: "documented", label: "REST + OpenAPI docs" },
        { value: "full", label: "Full: REST + Docs + Webhooks + SDK" },
      ]},
    ],
    defaultModules: {
      ...DEFAULT_PRODUCTION_MODULES,
      authentication: true,
      apiDocs: true,
      rateLimiting: true,
      errorHandling: true,
      envConfig: true,
      logging: true,
    },
    suggestedStack: {
      frontend: "API Portal (React)",
      backend: "Express + Node.js",
      database: "PostgreSQL",
    },
    promptBuilder: (v, modules) => {
      const base = `Build a production-ready API service called "${v.name}".

Purpose: ${v.purpose || "RESTful API for data management"}

Authentication: ${v.authType === "apikey" ? "API key-based authentication with key management" : v.authType === "jwt" ? "JWT token authentication with refresh tokens" : "OAuth 2.0 with authorization code flow"}

Features: ${v.features === "basic" ? "RESTful endpoints with proper HTTP methods and status codes" : v.features === "documented" ? "REST endpoints with auto-generated OpenAPI/Swagger documentation" : "Complete API platform with REST endpoints, OpenAPI docs, webhook delivery, and SDK generation support"}

Build a complete API service with:
- Well-structured RESTful endpoints
- API key/token management
- Developer portal with documentation
- Usage analytics and monitoring
- Proper error responses and status codes`;

      return base + buildModulePrompt(modules);
    },
    temperature: 0.3,
  },
  {
    id: "ecommerce",
    name: "E-commerce Store",
    description: "Complete online store with products, cart, checkout, and orders",
    icon: ShoppingCart,
    category: "ecommerce",
    fields: [
      { id: "name", label: "Store Name", type: "text", placeholder: "Urban Goods", required: true },
      { id: "productType", label: "Product Type", type: "text", placeholder: "Clothing, Electronics, Food" },
      { id: "features", label: "Store Features", type: "select", placeholder: "Select features", options: [
        { value: "basic", label: "Catalog + Cart + Checkout" },
        { value: "accounts", label: "Basic + User Accounts + Order History" },
        { value: "full", label: "Full: Accounts + Reviews + Wishlist + Inventory" },
      ]},
      { id: "style", label: "Store Style", type: "select", placeholder: "Select style", options: [
        { value: "modern", label: "Modern & Minimal" },
        { value: "luxury", label: "Luxury & Elegant" },
        { value: "playful", label: "Playful & Colorful" },
      ]},
    ],
    defaultModules: {
      ...DEFAULT_PRODUCTION_MODULES,
      authentication: true,
      errorHandling: true,
      envConfig: true,
    },
    suggestedStack: {
      frontend: "React + TypeScript + Tailwind",
      backend: "Express + Node.js",
      database: "PostgreSQL",
    },
    promptBuilder: (v, modules) => {
      const base = `Build a production-ready e-commerce store called "${v.name}" selling ${v.productType || "products"}.

Style: ${v.style === "luxury" ? "Luxury and elegant with premium feel" : v.style === "playful" ? "Playful and colorful with engaging animations" : "Modern and minimal with clean aesthetics"}

Features: ${v.features === "basic" ? "Product catalog, shopping cart, and checkout flow" : v.features === "accounts" ? "Catalog, cart, checkout, user accounts, and order history" : "Complete store with catalog, cart, checkout, user accounts, product reviews, wishlists, and inventory management"}

Build a complete e-commerce application with:
- Homepage with featured products and categories
- Product listing with filters and search
- Product detail pages with images and variants
- Shopping cart with quantity management
- Checkout flow with shipping and payment
- Order confirmation and tracking`;

      return base + buildModulePrompt(modules);
    },
    temperature: 0.35,
  },
  {
    id: "content-platform",
    name: "Content Platform",
    description: "Blog, CMS, or publishing platform with rich content management",
    icon: FileText,
    category: "content",
    fields: [
      { id: "name", label: "Platform Name", type: "text", placeholder: "TechBlog", required: true },
      { id: "contentType", label: "Content Type", type: "select", placeholder: "Select content type", options: [
        { value: "blog", label: "Blog Posts" },
        { value: "articles", label: "Articles & News" },
        { value: "courses", label: "Courses & Tutorials" },
        { value: "mixed", label: "Mixed Content Types" },
      ]},
      { id: "features", label: "Platform Features", type: "select", placeholder: "Select features", options: [
        { value: "basic", label: "Read-only Publishing" },
        { value: "interactive", label: "Basic + Comments + Likes" },
        { value: "full", label: "Full: Comments + Authors + Categories + Search" },
      ]},
      { id: "monetization", label: "Monetization", type: "select", placeholder: "Select option", options: [
        { value: "none", label: "Free Content" },
        { value: "premium", label: "Premium/Paid Content" },
        { value: "subscription", label: "Subscription Access" },
      ]},
    ],
    defaultModules: {
      ...DEFAULT_PRODUCTION_MODULES,
      authentication: true,
      errorHandling: true,
      envConfig: true,
    },
    suggestedStack: {
      frontend: "React + TypeScript + Tailwind",
      backend: "Express + Node.js",
      database: "PostgreSQL",
    },
    promptBuilder: (v, modules) => {
      const base = `Build a production-ready content platform called "${v.name}".

Content Type: ${v.contentType === "blog" ? "Blog posts with rich text" : v.contentType === "articles" ? "Articles and news with categories" : v.contentType === "courses" ? "Educational courses and tutorials" : "Mixed content types including posts, videos, and resources"}

Features: ${v.features === "basic" ? "Content publishing with categories and tags" : v.features === "interactive" ? "Publishing plus comments, likes, and social sharing" : "Complete platform with comments, multiple authors, categories, tags, full-text search, and content analytics"}

Monetization: ${v.monetization === "premium" ? "Some content behind paywall" : v.monetization === "subscription" ? "Subscription-based access tiers" : "All content freely accessible"}

Build a complete content platform with:
- Homepage with featured and recent content
- Content listing with categories and filters
- Individual content pages with rich formatting
- Author profiles and bios
- Admin interface for content management
- SEO-optimized pages and metadata`;

      return base + buildModulePrompt(modules);
    },
    temperature: 0.4,
  },
];
