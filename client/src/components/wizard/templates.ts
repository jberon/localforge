import {
  LayoutDashboard,
  ListTodo,
  BarChart3,
  Globe,
  Calculator,
  Palette,
} from "lucide-react";
import type { TemplateConfig, TemplateType } from "./types";
import type { DataEntity } from "@shared/schema";

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
