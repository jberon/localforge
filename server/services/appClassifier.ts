/**
 * App Type Classifier and Template System
 * Ensures generated apps match user requests
 */

export type AppType = 
  | "calculator"
  | "todo"
  | "dashboard"
  | "form"
  | "ecommerce"
  | "blog"
  | "chat"
  | "portfolio"
  | "landing"
  | "game"
  | "utility"
  | "data_display"
  | "generic";

export interface AppTemplate {
  type: AppType;
  name: string;
  description: string;
  suggestedFiles: Array<{
    path: string;
    purpose: string;
    type: "component" | "hook" | "service" | "test" | "config" | "style";
    dependencies: string[];
  }>;
  keyFeatures: string[];
  stateManagement: string;
  uiPatterns: string[];
}

// Keywords that indicate specific app types
const APP_TYPE_PATTERNS: Record<AppType, RegExp[]> = {
  calculator: [
    /\bcalculator\b/i,
    /\bcalculate\b.*\bnumber/i,
    /\bmath\b.*\bapp/i,
    /\barithmetic\b/i,
    /\badd\b.*\bmultiply\b/i,
  ],
  todo: [
    /\btodo\b/i,
    /\btask\b.*\b(list|manager)\b/i,
    /\b(task|item)\b.*\b(add|check|complete)\b/i,
    /\bchecklist\b/i,
    /\breminder\b/i,
  ],
  dashboard: [
    /\bdashboard\b/i,
    /\banalytics\b/i,
    /\bmetrics\b.*\bdisplay\b/i,
    /\bcharts?\b.*\bdata\b/i,
    /\bkpi\b/i,
    /\breporting\b/i,
  ],
  form: [
    /\bform\b/i,
    /\bsign\s*up\b/i,
    /\bregistration\b/i,
    /\bcontact\b.*\bform\b/i,
    /\bsurvey\b/i,
    /\bquestionnaire\b/i,
  ],
  ecommerce: [
    /\becommerce\b/i,
    /\be-commerce\b/i,
    /\bshopping\b.*\bcart\b/i,
    /\bproduct\b.*\b(catalog|listing)\b/i,
    /\bstore\b/i,
    /\bcheckout\b/i,
  ],
  blog: [
    /\bblog\b/i,
    /\barticle\b.*\b(list|display)\b/i,
    /\bpost\b.*\b(create|publish)\b/i,
    /\bcontent\b.*\bmanagement\b/i,
  ],
  chat: [
    /\bchat\b/i,
    /\bmessaging\b/i,
    /\bconversation\b/i,
    /\breal-?time\b.*\b(message|communication)\b/i,
  ],
  portfolio: [
    /\bportfolio\b/i,
    /\bpersonal\b.*\bsite\b/i,
    /\bshowcase\b.*\bwork\b/i,
    /\bresume\b.*\bwebsite\b/i,
  ],
  landing: [
    /\blanding\b.*\bpage\b/i,
    /\bmarketing\b.*\bpage\b/i,
    /\bproduct\b.*\bpage\b/i,
    /\bhero\b.*\bsection\b/i,
  ],
  game: [
    /\bgame\b/i,
    /\bpuzzle\b/i,
    /\bquiz\b/i,
    /\btic\s*tac\s*toe\b/i,
    /\bmemory\b.*\bgame\b/i,
    /\bscore\b.*\b(track|point)\b/i,
  ],
  utility: [
    /\bconverter\b/i,
    /\bgenerator\b/i,
    /\btracker\b/i,
    /\btimer\b/i,
    /\bcountdown\b/i,
    /\bstopwatch\b/i,
    /\bpassword\b.*\bgenerator\b/i,
  ],
  data_display: [
    /\btable\b.*\bdata\b/i,
    /\blist\b.*\b(items|users|products)\b/i,
    /\bdisplay\b.*\bapi\b/i,
    /\bfetch\b.*\bshow\b/i,
  ],
  generic: [],
};

// Templates for each app type
export const APP_TEMPLATES: Record<AppType, AppTemplate> = {
  calculator: {
    type: "calculator",
    name: "Calculator App",
    description: "A functional calculator with arithmetic operations",
    suggestedFiles: [
      { path: "src/App.tsx", purpose: "Main calculator app with display and buttons", type: "component", dependencies: [] },
      { path: "src/components/Calculator.tsx", purpose: "Calculator component with buttons and display", type: "component", dependencies: [] },
      { path: "src/hooks/useCalculator.ts", purpose: "Calculator state and logic hook", type: "hook", dependencies: [] },
      { path: "src/__tests__/Calculator.test.tsx", purpose: "Calculator functionality tests", type: "test", dependencies: ["Calculator.tsx"] },
    ],
    keyFeatures: ["digit input (0-9)", "operators (+, -, *, /)", "equals button", "clear button", "display showing current value"],
    stateManagement: "useState for display value, previous value, operator, and waiting for operand state",
    uiPatterns: ["grid layout for buttons", "large display at top", "operator buttons highlighted", "clear/reset button"],
  },

  todo: {
    type: "todo",
    name: "Todo List App",
    description: "A task management app with add, complete, and delete functionality",
    suggestedFiles: [
      { path: "src/App.tsx", purpose: "Main todo app container", type: "component", dependencies: [] },
      { path: "src/components/TodoList.tsx", purpose: "Todo list with add/remove/toggle functionality", type: "component", dependencies: [] },
      { path: "src/components/TodoItem.tsx", purpose: "Individual todo item component", type: "component", dependencies: [] },
      { path: "src/hooks/useTodos.ts", purpose: "Todo state management hook", type: "hook", dependencies: [] },
      { path: "src/__tests__/TodoList.test.tsx", purpose: "Todo functionality tests", type: "test", dependencies: ["TodoList.tsx"] },
    ],
    keyFeatures: ["add new todo", "mark as complete", "delete todo", "filter by status", "persist to localStorage"],
    stateManagement: "useState with array of todo objects { id, text, completed }",
    uiPatterns: ["input field with add button", "list of todo items", "checkbox for completion", "delete button per item"],
  },

  dashboard: {
    type: "dashboard",
    name: "Dashboard App",
    description: "A data dashboard with charts and metrics",
    suggestedFiles: [
      { path: "src/App.tsx", purpose: "Main dashboard layout", type: "component", dependencies: [] },
      { path: "src/components/Dashboard.tsx", purpose: "Dashboard with cards and charts", type: "component", dependencies: [] },
      { path: "src/components/MetricCard.tsx", purpose: "Individual metric display card", type: "component", dependencies: [] },
      { path: "src/components/Chart.tsx", purpose: "Chart component for data visualization", type: "component", dependencies: [] },
      { path: "src/hooks/useDashboardData.ts", purpose: "Dashboard data fetching hook", type: "hook", dependencies: [] },
      { path: "src/__tests__/Dashboard.test.tsx", purpose: "Dashboard tests", type: "test", dependencies: ["Dashboard.tsx"] },
    ],
    keyFeatures: ["metric cards", "charts/graphs", "data grid", "refresh capability", "responsive layout"],
    stateManagement: "useState for data, loading, and filter states",
    uiPatterns: ["card grid layout", "sidebar navigation", "header with actions", "chart containers"],
  },

  form: {
    type: "form",
    name: "Form App",
    description: "A form with validation and submission",
    suggestedFiles: [
      { path: "src/App.tsx", purpose: "Main form app container", type: "component", dependencies: [] },
      { path: "src/components/Form.tsx", purpose: "Form component with fields and validation", type: "component", dependencies: [] },
      { path: "src/hooks/useForm.ts", purpose: "Form state and validation hook", type: "hook", dependencies: [] },
      { path: "src/__tests__/Form.test.tsx", purpose: "Form validation tests", type: "test", dependencies: ["Form.tsx"] },
    ],
    keyFeatures: ["input fields", "validation", "error messages", "submit button", "success feedback"],
    stateManagement: "useState for form values and errors",
    uiPatterns: ["labeled inputs", "inline validation errors", "submit button", "success message"],
  },

  ecommerce: {
    type: "ecommerce",
    name: "E-commerce App",
    description: "A product catalog with shopping cart",
    suggestedFiles: [
      { path: "src/App.tsx", purpose: "Main e-commerce app", type: "component", dependencies: [] },
      { path: "src/components/ProductList.tsx", purpose: "Product grid/list display", type: "component", dependencies: [] },
      { path: "src/components/ProductCard.tsx", purpose: "Individual product card", type: "component", dependencies: [] },
      { path: "src/components/Cart.tsx", purpose: "Shopping cart component", type: "component", dependencies: [] },
      { path: "src/hooks/useCart.ts", purpose: "Shopping cart state hook", type: "hook", dependencies: [] },
      { path: "src/__tests__/Cart.test.tsx", purpose: "Cart functionality tests", type: "test", dependencies: ["Cart.tsx"] },
    ],
    keyFeatures: ["product listing", "add to cart", "cart management", "quantity adjustment", "total calculation"],
    stateManagement: "useState for cart items with quantity",
    uiPatterns: ["product grid", "cart sidebar/modal", "add to cart button", "quantity controls"],
  },

  blog: {
    type: "blog",
    name: "Blog App",
    description: "A blog with posts and content display",
    suggestedFiles: [
      { path: "src/App.tsx", purpose: "Main blog app", type: "component", dependencies: [] },
      { path: "src/components/BlogList.tsx", purpose: "Blog post list", type: "component", dependencies: [] },
      { path: "src/components/BlogPost.tsx", purpose: "Individual blog post display", type: "component", dependencies: [] },
      { path: "src/hooks/usePosts.ts", purpose: "Posts data hook", type: "hook", dependencies: [] },
      { path: "src/__tests__/BlogList.test.tsx", purpose: "Blog list tests", type: "test", dependencies: ["BlogList.tsx"] },
    ],
    keyFeatures: ["post list", "post detail view", "categories/tags", "search", "pagination"],
    stateManagement: "useState for posts and selected post",
    uiPatterns: ["post cards", "detail view", "category filters", "search bar"],
  },

  chat: {
    type: "chat",
    name: "Chat App",
    description: "A messaging interface",
    suggestedFiles: [
      { path: "src/App.tsx", purpose: "Main chat app", type: "component", dependencies: [] },
      { path: "src/components/ChatWindow.tsx", purpose: "Chat message display", type: "component", dependencies: [] },
      { path: "src/components/MessageInput.tsx", purpose: "Message input component", type: "component", dependencies: [] },
      { path: "src/components/Message.tsx", purpose: "Individual message bubble", type: "component", dependencies: [] },
      { path: "src/hooks/useChat.ts", purpose: "Chat state hook", type: "hook", dependencies: [] },
      { path: "src/__tests__/ChatWindow.test.tsx", purpose: "Chat tests", type: "test", dependencies: ["ChatWindow.tsx"] },
    ],
    keyFeatures: ["message list", "send message", "message bubbles", "timestamps", "user avatars"],
    stateManagement: "useState for messages array",
    uiPatterns: ["message list scrollable", "input at bottom", "message bubbles left/right", "send button"],
  },

  portfolio: {
    type: "portfolio",
    name: "Portfolio App",
    description: "A personal portfolio showcase",
    suggestedFiles: [
      { path: "src/App.tsx", purpose: "Main portfolio app", type: "component", dependencies: [] },
      { path: "src/components/Hero.tsx", purpose: "Hero section with intro", type: "component", dependencies: [] },
      { path: "src/components/Projects.tsx", purpose: "Projects showcase grid", type: "component", dependencies: [] },
      { path: "src/components/Contact.tsx", purpose: "Contact section", type: "component", dependencies: [] },
      { path: "src/__tests__/App.test.tsx", purpose: "Portfolio tests", type: "test", dependencies: ["App.tsx"] },
    ],
    keyFeatures: ["hero section", "projects grid", "skills section", "contact form", "smooth scrolling"],
    stateManagement: "Minimal state, mostly static content",
    uiPatterns: ["full-width sections", "project cards", "skill badges", "contact form"],
  },

  landing: {
    type: "landing",
    name: "Landing Page",
    description: "A marketing landing page",
    suggestedFiles: [
      { path: "src/App.tsx", purpose: "Main landing page", type: "component", dependencies: [] },
      { path: "src/components/Hero.tsx", purpose: "Hero section with CTA", type: "component", dependencies: [] },
      { path: "src/components/Features.tsx", purpose: "Features section", type: "component", dependencies: [] },
      { path: "src/components/CTA.tsx", purpose: "Call to action section", type: "component", dependencies: [] },
      { path: "src/__tests__/App.test.tsx", purpose: "Landing page tests", type: "test", dependencies: ["App.tsx"] },
    ],
    keyFeatures: ["hero with CTA", "features grid", "testimonials", "pricing", "footer"],
    stateManagement: "Minimal state",
    uiPatterns: ["hero section", "feature cards", "testimonial carousel", "CTA buttons"],
  },

  game: {
    type: "game",
    name: "Game App",
    description: "An interactive game",
    suggestedFiles: [
      { path: "src/App.tsx", purpose: "Main game app", type: "component", dependencies: [] },
      { path: "src/components/GameBoard.tsx", purpose: "Game board/canvas", type: "component", dependencies: [] },
      { path: "src/components/GameControls.tsx", purpose: "Game controls and status", type: "component", dependencies: [] },
      { path: "src/hooks/useGame.ts", purpose: "Game logic and state hook", type: "hook", dependencies: [] },
      { path: "src/__tests__/GameBoard.test.tsx", purpose: "Game logic tests", type: "test", dependencies: ["GameBoard.tsx"] },
    ],
    keyFeatures: ["game board", "game state", "score tracking", "win/lose conditions", "reset game"],
    stateManagement: "useState for game state, score, and current turn",
    uiPatterns: ["centered game board", "score display", "reset button", "status message"],
  },

  utility: {
    type: "utility",
    name: "Utility App",
    description: "A utility/tool app",
    suggestedFiles: [
      { path: "src/App.tsx", purpose: "Main utility app", type: "component", dependencies: [] },
      { path: "src/components/Tool.tsx", purpose: "Main tool component", type: "component", dependencies: [] },
      { path: "src/hooks/useTool.ts", purpose: "Tool logic hook", type: "hook", dependencies: [] },
      { path: "src/__tests__/Tool.test.tsx", purpose: "Tool functionality tests", type: "test", dependencies: ["Tool.tsx"] },
    ],
    keyFeatures: ["input controls", "output display", "conversion/generation logic", "copy to clipboard"],
    stateManagement: "useState for input and output values",
    uiPatterns: ["input fields", "action buttons", "output display", "copy button"],
  },

  data_display: {
    type: "data_display",
    name: "Data Display App",
    description: "An app to fetch and display data",
    suggestedFiles: [
      { path: "src/App.tsx", purpose: "Main data display app", type: "component", dependencies: [] },
      { path: "src/components/DataTable.tsx", purpose: "Data table component", type: "component", dependencies: [] },
      { path: "src/hooks/useData.ts", purpose: "Data fetching hook", type: "hook", dependencies: [] },
      { path: "src/services/api.ts", purpose: "API service layer", type: "service", dependencies: [] },
      { path: "src/__tests__/DataTable.test.tsx", purpose: "Data display tests", type: "test", dependencies: ["DataTable.tsx"] },
    ],
    keyFeatures: ["data fetching", "loading state", "error handling", "data table", "pagination"],
    stateManagement: "useState for data, loading, and error states",
    uiPatterns: ["loading spinner", "data table", "error message", "refresh button"],
  },

  generic: {
    type: "generic",
    name: "React App",
    description: "A custom React application",
    suggestedFiles: [
      { path: "src/App.tsx", purpose: "Main application component", type: "component", dependencies: [] },
      { path: "src/components/Main.tsx", purpose: "Primary content component", type: "component", dependencies: [] },
      { path: "src/hooks/useAppState.ts", purpose: "Application state hook", type: "hook", dependencies: [] },
      { path: "src/__tests__/App.test.tsx", purpose: "App component tests", type: "test", dependencies: ["App.tsx"] },
    ],
    keyFeatures: ["custom features based on request"],
    stateManagement: "useState for application state",
    uiPatterns: ["responsive layout", "clean design"],
  },
};

/**
 * Classify the app type based on user request
 */
export function classifyAppType(request: string): AppType {
  const normalizedRequest = request.toLowerCase();

  for (const [appType, patterns] of Object.entries(APP_TYPE_PATTERNS)) {
    if (appType === "generic") continue;
    
    for (const pattern of patterns) {
      if (pattern.test(normalizedRequest)) {
        return appType as AppType;
      }
    }
  }

  return "generic";
}

/**
 * Get template for an app type
 */
export function getAppTemplate(type: AppType): AppTemplate {
  return APP_TEMPLATES[type];
}

/**
 * Get classification context for LLM prompts
 */
export function getClassificationContext(request: string): {
  appType: AppType;
  template: AppTemplate;
  guidancePrompt: string;
} {
  const appType = classifyAppType(request);
  const template = getAppTemplate(appType);

  const guidancePrompt = `
APP TYPE DETECTED: ${template.name}
DESCRIPTION: ${template.description}

KEY FEATURES TO IMPLEMENT:
${template.keyFeatures.map(f => `- ${f}`).join("\n")}

STATE MANAGEMENT APPROACH:
${template.stateManagement}

UI PATTERNS TO USE:
${template.uiPatterns.map(p => `- ${p}`).join("\n")}

IMPORTANT: Generate code that specifically implements a ${template.name.toLowerCase()}, NOT a generic data-fetching template.
The generated code MUST include the key features listed above.`;

  return { appType, template, guidancePrompt };
}

/**
 * Validate that generated files match the expected app type
 */
export function validateGeneratedContent(
  request: string,
  files: Array<{ path: string; content: string }>
): { valid: boolean; issues: string[] } {
  const { appType, template } = getClassificationContext(request);
  const issues: string[] = [];

  // Check if key features are present in the generated code
  const allContent = files.map(f => f.content).join("\n").toLowerCase();

  if (appType === "calculator") {
    if (!allContent.includes("button") && !allContent.includes("onclick")) {
      issues.push("Calculator should have clickable buttons");
    }
    if (!(/[+\-*/=]/.test(allContent) || allContent.includes("operator"))) {
      issues.push("Calculator should have arithmetic operators");
    }
    if (!allContent.includes("display") && !allContent.includes("result")) {
      issues.push("Calculator should have a display for results");
    }
  }

  if (appType === "todo") {
    if (!allContent.includes("add") && !allContent.includes("new")) {
      issues.push("Todo app should have add functionality");
    }
    if (!allContent.includes("complete") && !allContent.includes("done") && !allContent.includes("check")) {
      issues.push("Todo app should have completion functionality");
    }
  }

  // Check for generic template patterns that shouldn't be present
  if (appType !== "data_display" && appType !== "generic") {
    if (allContent.includes("/api/items") || allContent.includes("fetchdata")) {
      if (!["dashboard", "ecommerce", "blog"].includes(appType)) {
        issues.push("Generated code uses generic data-fetching patterns instead of app-specific logic");
      }
    }
  }

  // Check for mismatched file structure
  const hasHeader = files.some(f => f.path.toLowerCase().includes("header"));
  const hasNav = allContent.includes("navigation") || allContent.includes("nav");
  
  if (appType === "calculator" && (hasHeader || hasNav)) {
    issues.push("Calculator app shouldn't have navigation header - it should be a focused calculator UI");
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
