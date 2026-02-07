import { BaseService } from "../lib/base-service";

interface Template {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  tags: string[];
  promptStarter: string;
  complexity: "simple" | "medium" | "complex";
  estimatedBuildTime: string;
  features: string[];
}

const templates: Template[] = [
  {
    id: "task-manager",
    name: "Task Manager",
    category: "productivity",
    description: "Kanban board with drag-and-drop, categories, due dates",
    icon: "CheckSquare",
    tags: ["kanban", "tasks", "productivity", "drag-and-drop", "project management"],
    promptStarter: "Build a task management app with a Kanban board layout. Use 3 columns: 'To Do', 'In Progress', and 'Done'. Each task card should show a title, description, priority badge (low/medium/high with color coding), and due date. Include a header with an 'Add Task' button that opens a modal form. Use Tailwind CSS with a clean dark theme. Add drag indicator icons on each card. Show task counts in each column header.",
    complexity: "medium",
    estimatedBuildTime: "2 minutes",
    features: ["Kanban board with 3 columns", "Drag-and-drop task cards", "Priority badges with color coding", "Due date display", "Add task modal form", "Task count per column"],
  },
  {
    id: "crm-dashboard",
    name: "CRM Dashboard",
    category: "business",
    description: "Customer management with pipeline view, contact details, activity log",
    icon: "Users",
    tags: ["crm", "customers", "sales", "pipeline", "business"],
    promptStarter: "Build a CRM dashboard with a sales pipeline view. Create 4 pipeline stages: 'Lead', 'Contacted', 'Proposal', and 'Closed'. Display customer cards in each stage showing name, company, deal value, and last contact date. Include a sidebar with detailed contact information, email, phone, and notes. Add an activity log section at the bottom showing recent interactions. Use Tailwind CSS with a professional blue-gray color scheme. Include a top bar with search input and 'Add Contact' button.",
    complexity: "complex",
    estimatedBuildTime: "3 minutes",
    features: ["Sales pipeline with 4 stages", "Customer cards with deal values", "Contact detail sidebar", "Activity log timeline", "Search and filter contacts", "Add contact form"],
  },
  {
    id: "ecommerce-store",
    name: "E-Commerce Store",
    category: "business",
    description: "Product grid, shopping cart, checkout flow",
    icon: "ShoppingCart",
    tags: ["ecommerce", "shop", "cart", "products", "checkout"],
    promptStarter: "Build an e-commerce store with a product grid layout showing 3 columns. Each product card should display an image placeholder, product name, price, star rating, and an 'Add to Cart' button. Include a sticky header with a logo, search bar, and cart icon showing item count. Add a slide-out cart drawer from the right showing cart items, quantities with plus/minus buttons, item totals, and a checkout button. Use Tailwind CSS with a clean white theme and green accent buttons. Include category filter tabs above the product grid.",
    complexity: "complex",
    estimatedBuildTime: "3 minutes",
    features: ["Product grid with 3 columns", "Shopping cart drawer", "Quantity controls", "Category filter tabs", "Star ratings display", "Cart item count badge"],
  },
  {
    id: "blog-platform",
    name: "Blog Platform",
    category: "content",
    description: "Article list, rich text display, categories, search",
    icon: "FileText",
    tags: ["blog", "articles", "content", "writing", "cms"],
    promptStarter: "Build a blog platform with a two-column layout. The main column shows article cards with a featured image placeholder, title, excerpt (2 lines), author name with avatar circle, publish date, and category badge. The right sidebar shows category links with post counts, a search input, and a 'Popular Posts' list. Add a header with the blog name and navigation links. Use Tailwind CSS with a clean serif font for article titles and sans-serif for body text. Include a single article view with full content, reading time estimate, and related posts section at the bottom.",
    complexity: "medium",
    estimatedBuildTime: "2 minutes",
    features: ["Article card list", "Category sidebar with counts", "Search functionality", "Single article view", "Reading time estimate", "Related posts section"],
  },
  {
    id: "portfolio-site",
    name: "Portfolio Site",
    category: "personal",
    description: "Project showcase, about section, contact form, skills display",
    icon: "Briefcase",
    tags: ["portfolio", "personal", "showcase", "resume", "projects"],
    promptStarter: "Build a personal portfolio website with a single-page layout. Start with a hero section showing a name, title, and short bio with a gradient background. Add a skills section with icon badges for technologies like React, TypeScript, Node.js, and Python. Create a projects grid with 2 columns showing project cards with image placeholders, project name, description, tech stack tags, and 'View Project' links. Include an about section with a longer bio paragraph. End with a contact form having name, email, and message fields with a 'Send Message' button. Use Tailwind CSS with a dark theme and purple accent colors.",
    complexity: "simple",
    estimatedBuildTime: "1 minute",
    features: ["Hero section with gradient", "Skills badges grid", "Project showcase cards", "About section", "Contact form", "Responsive single-page layout"],
  },
  {
    id: "weather-app",
    name: "Weather App",
    category: "utility",
    description: "Current weather, forecast, location search, animated icons",
    icon: "CloudSun",
    tags: ["weather", "forecast", "temperature", "utility", "location"],
    promptStarter: "Build a weather dashboard app with a centered card layout. Show a search bar at the top for city names. Display the current weather in a large card showing city name, temperature in large text, weather condition with an icon (use Lucide icons like Sun, Cloud, CloudRain, Snowflake), humidity percentage, and wind speed. Below, add a 5-day forecast row with smaller cards each showing the day name, weather icon, and high/low temperatures. Include a details section with UV index, visibility, and pressure. Use Tailwind CSS with a blue gradient background and white cards. Use sample data for New York City as the default view.",
    complexity: "simple",
    estimatedBuildTime: "1 minute",
    features: ["City search input", "Current weather display", "5-day forecast cards", "Weather detail metrics", "Lucide weather icons", "Blue gradient theme"],
  },
  {
    id: "recipe-manager",
    name: "Recipe Manager",
    category: "lifestyle",
    description: "Recipe cards, ingredients, steps, categories, favorites",
    icon: "ChefHat",
    tags: ["recipes", "cooking", "food", "ingredients", "meal planning"],
    promptStarter: "Build a recipe manager app with a grid layout showing recipe cards in 3 columns. Each recipe card should have an image placeholder with a heart icon overlay for favorites, recipe name, cooking time, difficulty badge (Easy/Medium/Hard), and serving count. Include a header with category filter buttons: All, Breakfast, Lunch, Dinner, Dessert. Add a recipe detail view showing the full recipe with an ingredients checklist on the left and numbered cooking steps on the right. Include a search bar in the header. Use Tailwind CSS with a warm color scheme using orange accents. Add 6 sample recipes with realistic names and details.",
    complexity: "medium",
    estimatedBuildTime: "2 minutes",
    features: ["Recipe card grid", "Favorites with heart toggle", "Category filter buttons", "Recipe detail view", "Ingredients checklist", "Numbered cooking steps"],
  },
  {
    id: "fitness-tracker",
    name: "Fitness Tracker",
    category: "health",
    description: "Workout log, progress charts, exercise library, stats dashboard",
    icon: "Dumbbell",
    tags: ["fitness", "workout", "health", "exercise", "tracking"],
    promptStarter: "Build a fitness tracker dashboard with a stats overview at the top showing 4 metric cards: Total Workouts, Calories Burned, Active Minutes, and Current Streak, each with an icon and value. Below, add a workout log section with a table showing date, exercise name, sets, reps, weight, and duration columns. Include an 'Add Workout' button that opens a form modal. On the right side, show an exercise library panel with categorized exercises (Chest, Back, Legs, Arms) as clickable list items. Use Tailwind CSS with a dark theme and green accent colors for progress indicators. Add sample workout data for the past week.",
    complexity: "complex",
    estimatedBuildTime: "3 minutes",
    features: ["Stats overview cards", "Workout log table", "Add workout modal form", "Exercise library panel", "Category-based exercises", "Sample workout data"],
  },
  {
    id: "chat-application",
    name: "Chat Application",
    category: "social",
    description: "Message threads, user list, real-time feel, typing indicators",
    icon: "MessageCircle",
    tags: ["chat", "messaging", "social", "real-time", "conversations"],
    promptStarter: "Build a chat application with a two-panel layout. The left panel (280px wide) shows a conversation list with user avatars (colored circles with initials), user names, last message preview, timestamp, and unread message count badges. The right panel shows the active chat with a header displaying the contact name and online status dot, a scrollable message area with sent messages aligned right (blue bubbles) and received messages aligned left (gray bubbles) with timestamps, and a message input bar at the bottom with a text field, emoji button, attachment button, and send button. Use Tailwind CSS with a clean light theme. Add 4 sample conversations with 3-5 messages each. Show a typing indicator with animated dots.",
    complexity: "medium",
    estimatedBuildTime: "2 minutes",
    features: ["Conversation list sidebar", "Message bubbles with alignment", "Online status indicators", "Unread message badges", "Message input with actions", "Typing indicator animation"],
  },
  {
    id: "invoice-generator",
    name: "Invoice Generator",
    category: "business",
    description: "Create/edit invoices, line items, PDF-style preview, totals",
    icon: "Receipt",
    tags: ["invoice", "billing", "finance", "business", "pdf"],
    promptStarter: "Build an invoice generator with a split layout. The left side shows an editable invoice form with company name, client name, invoice number, and date fields at the top. Below, add a line items table with columns: Description, Quantity, Unit Price, and Total, with an 'Add Line Item' button. Show subtotal, tax rate input (percentage), tax amount, and grand total at the bottom. The right side shows a live PDF-style preview of the invoice on a white paper-like card with shadow, formatted professionally with all the entered data. Include a header with 'New Invoice' title and 'Download PDF' button. Use Tailwind CSS with a professional gray and navy color scheme. Pre-fill with sample invoice data.",
    complexity: "complex",
    estimatedBuildTime: "3 minutes",
    features: ["Editable invoice form", "Dynamic line items table", "Auto-calculated totals", "Tax rate configuration", "Live PDF-style preview", "Professional invoice layout"],
  },
  {
    id: "learning-platform",
    name: "Learning Platform",
    category: "education",
    description: "Course cards, lesson viewer, progress tracking, quizzes",
    icon: "GraduationCap",
    tags: ["education", "courses", "learning", "lessons", "quiz"],
    promptStarter: "Build a learning platform with a course catalog page showing course cards in a 3-column grid. Each course card displays a colored header bar, course title, instructor name, lesson count, duration, difficulty badge, and a progress bar showing completion percentage. Add a course detail view with a lesson sidebar on the left listing numbered lessons with checkmark icons for completed ones, and a main content area on the right showing the current lesson title, text content, and a 'Mark Complete' button. Include a quiz section at the end of each lesson with multiple-choice questions and a score display. Use Tailwind CSS with an indigo and white color scheme. Add 4 sample courses with 3 lessons each.",
    complexity: "complex",
    estimatedBuildTime: "3 minutes",
    features: ["Course catalog grid", "Progress bar tracking", "Lesson sidebar navigation", "Lesson content viewer", "Multiple-choice quizzes", "Completion checkmarks"],
  },
  {
    id: "social-media-feed",
    name: "Social Media Feed",
    category: "social",
    description: "Post cards, likes, comments, profile sidebar, infinite scroll",
    icon: "Share2",
    tags: ["social", "feed", "posts", "likes", "comments"],
    promptStarter: "Build a social media feed with a three-column layout. The left column (200px) shows navigation links with icons: Home, Explore, Notifications, Messages, and Profile. The center column shows a 'Create Post' input at the top with an avatar and placeholder text, followed by post cards each displaying a user avatar, username, timestamp, post text content, an image placeholder, and an action bar with Like (heart icon with count), Comment (message icon with count), and Share buttons. The right column (280px) shows a 'Who to Follow' section with user suggestions and 'Follow' buttons. Use Tailwind CSS with a clean white card design on a light gray background. Add 5 sample posts with varied content. Show a comment section expandable below each post.",
    complexity: "complex",
    estimatedBuildTime: "3 minutes",
    features: ["Navigation sidebar", "Create post input", "Post cards with actions", "Like and comment counts", "Who to follow suggestions", "Expandable comments section"],
  },
  {
    id: "music-player",
    name: "Music Player",
    category: "entertainment",
    description: "Playlist, now playing, progress bar, volume control, album art",
    icon: "Music",
    tags: ["music", "player", "playlist", "audio", "entertainment"],
    promptStarter: "Build a music player app with a dark themed layout. Show a left sidebar (260px) with playlist navigation listing 3 playlists with song counts. The main area shows the current playlist as a table with columns: track number, song title, artist name, album name, and duration. Include a fixed bottom bar (80px tall) for the now-playing controls showing album art placeholder (square), song title, artist name, a progress bar with current time and total time, playback controls (previous, play/pause, next, shuffle, repeat icons), and a volume slider on the right. Highlight the currently playing track in the playlist. Use Tailwind CSS with a Spotify-inspired dark theme using dark grays and green accent color. Add 8 sample songs with realistic names.",
    complexity: "medium",
    estimatedBuildTime: "2 minutes",
    features: ["Playlist sidebar", "Track list table", "Now playing bottom bar", "Playback controls", "Progress bar with timestamps", "Volume slider control"],
  },
  {
    id: "analytics-dashboard",
    name: "Analytics Dashboard",
    category: "business",
    description: "Charts, KPIs, data tables, filters, date range picker",
    icon: "BarChart3",
    tags: ["analytics", "dashboard", "charts", "metrics", "data"],
    promptStarter: "Build an analytics dashboard with a top row of 4 KPI cards showing: Total Revenue ($124,500 with +12% badge), Active Users (8,420 with +5% badge), Conversion Rate (3.2% with -0.5% badge), and Avg Order Value ($68 with +8% badge). Each card has an icon and trend arrow. Below, add a two-column layout: the left side shows a large area chart placeholder for 'Revenue Over Time' with a date range picker dropdown (Last 7 Days, Last 30 Days, Last 90 Days), and the right side shows a donut chart placeholder for 'Traffic Sources'. At the bottom, add a data table with columns: Page, Visitors, Bounce Rate, and Avg Duration, with 8 rows of sample data. Use Tailwind CSS with a clean white dashboard theme and blue accent colors. Include a header with dashboard title and export button.",
    complexity: "complex",
    estimatedBuildTime: "3 minutes",
    features: ["KPI metric cards with trends", "Revenue area chart", "Traffic sources donut chart", "Date range picker", "Data table with sorting", "Export functionality"],
  },
  {
    id: "real-estate-listings",
    name: "Real Estate Listings",
    category: "business",
    description: "Property cards, search/filter, detail view, image gallery, map placeholder",
    icon: "Home",
    tags: ["real estate", "property", "listings", "housing", "search"],
    promptStarter: "Build a real estate listings page with a search bar at the top containing location input, price range dropdown (Under $200k, $200k-$500k, $500k-$1M, $1M+), property type dropdown (House, Apartment, Condo, Townhouse), and a 'Search' button. Below, show property cards in a 2-column grid. Each property card displays an image placeholder with a 'For Sale' badge overlay, price in large text, address, bed count, bath count, and square footage with icons. Include a property detail view with a large image gallery placeholder, property description, features list in two columns, agent contact card with phone and email, and a map placeholder div with gray background. Use Tailwind CSS with a professional white and dark blue color scheme. Add 6 sample property listings with realistic addresses and prices.",
    complexity: "complex",
    estimatedBuildTime: "3 minutes",
    features: ["Property search filters", "Property card grid", "Price and detail display", "Property detail view", "Agent contact card", "Image gallery and map placeholder"],
  },
];

class TemplateGalleryService extends BaseService {
  private static instance: TemplateGalleryService | null = null;
  private templates: Template[];

  private constructor() {
    super("TemplateGalleryService");
    this.templates = templates;
  }

  static getInstance(): TemplateGalleryService {
    if (!TemplateGalleryService.instance) {
      TemplateGalleryService.instance = new TemplateGalleryService();
    }
    return TemplateGalleryService.instance;
  }

  getTemplates(): Template[] {
    return this.templates;
  }

  getTemplatesByCategory(category: string): Template[] {
    return this.templates.filter(
      (t) => t.category.toLowerCase() === category.toLowerCase()
    );
  }

  getTemplate(id: string): Template | undefined {
    return this.templates.find((t) => t.id === id);
  }

  getCategories(): string[] {
    return [...new Set(this.templates.map((t) => t.category))];
  }

  searchTemplates(query: string): Template[] {
    if (!query.trim()) return this.templates;
    const q = query.toLowerCase();
    return this.templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)) ||
        t.category.toLowerCase().includes(q)
    );
  }

  destroy(): void {
    TemplateGalleryService.instance = null;
    this.log("TemplateGalleryService destroyed");
  }
}

export const templateGalleryService = TemplateGalleryService.getInstance();
