import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Shield,
  CreditCard,
  Mail,
  Upload,
  BarChart3,
  Database,
  Moon,
  Search,
  Bell,
  Smartphone,
  ClipboardCheck,
  Download,
  ChevronDown,
  ChevronUp,
  Puzzle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface IntegrationConfig {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  popular: boolean;
  promptAddition: string;
}

export const INTEGRATIONS: IntegrationConfig[] = [
  {
    id: "authentication",
    name: "Authentication",
    description: "Add login/signup with email & password, protected routes, and session management",
    icon: Shield,
    popular: true,
    promptAddition: "Include a complete authentication system with: email/password login and signup forms using react-hook-form with validation, a useAuth context provider that manages user state and JWT tokens stored in localStorage, protected route wrapper components that redirect unauthenticated users to login, logout functionality, and a user profile dropdown in the header showing the current user's email.",
  },
  {
    id: "payments",
    name: "Payments",
    description: "Add Stripe checkout, payment forms, and subscription management",
    icon: CreditCard,
    popular: false,
    promptAddition: "Include a payments integration with: a pricing page showing subscription tiers in a responsive card grid, a checkout form component with card number, expiry, and CVC fields, a payment confirmation/success page, subscription status display in the user dashboard, and helper functions for formatting currency amounts. Use a mock payment processing flow that simulates Stripe-like behavior.",
  },
  {
    id: "email",
    name: "Email",
    description: "Add email sending capability with templates for notifications and alerts",
    icon: Mail,
    popular: false,
    promptAddition: "Include email functionality with: a composable email template system with HTML templates for welcome emails, password resets, and notifications, an email preview component that renders templates with sample data, a contact form that captures user messages, and toast notifications confirming when emails are queued for sending.",
  },
  {
    id: "file-uploads",
    name: "File Uploads",
    description: "Add file/image upload with drag-and-drop, preview, and storage",
    icon: Upload,
    popular: false,
    promptAddition: "Include file upload functionality with: a drag-and-drop upload zone component with visual feedback on hover, file type and size validation with user-friendly error messages, image preview thumbnails for uploaded images, a progress indicator during upload, a file list component showing uploaded files with name, size, and delete option, and support for multiple file selection.",
  },
  {
    id: "charts",
    name: "Charts & Analytics",
    description: "Add interactive charts, graphs, and data visualization with Recharts",
    icon: BarChart3,
    popular: true,
    promptAddition: "Include data visualization with Recharts: create a dashboard section with at least a line chart showing trends over time, a bar chart for category comparisons, and a pie/donut chart for distribution data. Use the ResponsiveContainer wrapper for all charts, include proper axis labels, tooltips on hover, and a legend. Use theme-aware colors from CSS variables for chart fills and strokes. Include sample data arrays that demonstrate realistic data patterns.",
  },
  {
    id: "database",
    name: "Database & CRUD",
    description: "Add data persistence with localStorage, full CRUD operations, and data tables",
    icon: Database,
    popular: true,
    promptAddition: "Include a complete CRUD data management system with: a useLocalStorage custom hook for persistent data storage, a data table component with columns for each field plus edit and delete action buttons, an add/edit form modal using react-hook-form with field validation, confirmation dialog before deleting items, empty state component when no data exists, and TypeScript interfaces for all data models. Use optimistic updates for a responsive UI experience.",
  },
  {
    id: "dark-mode",
    name: "Dark Mode",
    description: "Add theme toggle with dark/light mode support and system preference detection",
    icon: Moon,
    popular: true,
    promptAddition: "Include a dark mode theme system with: a ThemeProvider context that manages 'light', 'dark', and 'system' modes, automatic detection of the user's OS color scheme preference using matchMedia, persistence of theme choice in localStorage, a theme toggle button component using Sun/Moon icons with smooth transition, and proper CSS custom properties in :root and .dark scopes. Apply the 'dark' class to document.documentElement for Tailwind dark mode support.",
  },
  {
    id: "search",
    name: "Search & Filter",
    description: "Add search functionality with filtering, sorting, and pagination",
    icon: Search,
    popular: false,
    promptAddition: "Include search and filtering functionality with: a search input with debounced filtering (300ms delay), dropdown or toggle filters for categories/status/type, sortable column headers that toggle between ascending and descending, pagination controls with page numbers and items-per-page selector, a results count display showing 'Showing X-Y of Z results', and an empty state when no results match the current filters.",
  },
  {
    id: "notifications",
    name: "Notifications",
    description: "Add toast notifications, alerts, and real-time status updates",
    icon: Bell,
    popular: false,
    promptAddition: "Include a notification system with: toast notifications for success, error, warning, and info states using the existing useToast hook, a notification center dropdown in the header showing recent notifications with timestamps, unread notification count badge, mark-as-read and dismiss actions, and notification categories (system, user action, alert). Include sample notifications to demonstrate the system.",
  },
  {
    id: "responsive",
    name: "Responsive Design",
    description: "Add mobile-first responsive layout with breakpoints and touch support",
    icon: Smartphone,
    popular: false,
    promptAddition: "Ensure fully responsive design with: mobile-first CSS using Tailwind breakpoints (sm, md, lg, xl), a responsive navigation that collapses to a hamburger menu on mobile, touch-friendly tap targets (minimum 44px), responsive grid layouts that adjust columns based on viewport width (1 column on mobile, 2 on tablet, 3-4 on desktop), proper spacing adjustments between breakpoints, and a useMediaQuery or useIsMobile hook for conditional rendering.",
  },
  {
    id: "forms",
    name: "Forms & Validation",
    description: "Add form handling with validation, error messages, and submit logic",
    icon: ClipboardCheck,
    popular: false,
    promptAddition: "Include comprehensive form handling with: react-hook-form integration with zodResolver for schema-based validation, reusable form field components with labels, inputs, and inline error messages, support for text, email, password, number, select, checkbox, and textarea field types, real-time validation feedback as users type, a form submission handler with loading state and success/error toasts, and disabled submit button when form is invalid.",
  },
  {
    id: "export",
    name: "Export & Download",
    description: "Add data export to CSV/PDF and file download functionality",
    icon: Download,
    popular: false,
    promptAddition: "Include data export functionality with: a CSV export function that converts data arrays to downloadable CSV files with proper headers, a JSON export option for raw data, export buttons with dropdown for format selection, filename generation with timestamps, and a helper utility function that triggers browser file downloads using Blob and URL.createObjectURL.",
  },
];

const PROMPT_ADDITIONS: Record<string, string> = INTEGRATIONS.reduce(
  (acc, integration) => {
    acc[integration.id] = integration.promptAddition;
    return acc;
  },
  {} as Record<string, string>
);

export function buildIntegrationPromptEnhancement(enabledIntegrations: string[]): string {
  if (enabledIntegrations.length === 0) return "";

  const additions = enabledIntegrations
    .map((id) => PROMPT_ADDITIONS[id])
    .filter(Boolean);

  if (additions.length === 0) return "";

  return `\n\nAdditional integration requirements:\n${additions.map((a, i) => `${i + 1}. ${a}`).join("\n")}`;
}

export function getEnabledIntegrationPrompt(ids: string[]): string {
  return buildIntegrationPromptEnhancement(ids);
}

interface IntegrationsPanelProps {
  enabledIntegrations: string[];
  onToggle: (integrationId: string) => void;
  compact?: boolean;
}

export function IntegrationsPanel({
  enabledIntegrations,
  onToggle,
  compact = false,
}: IntegrationsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const enabledCount = enabledIntegrations.length;

  return (
    <Card className="border-border/50" data-testid="integrations-panel">
      <CardHeader
        className="flex flex-row items-center justify-between gap-2 space-y-0 p-3 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
        data-testid="button-toggle-integrations"
      >
        <div className="flex items-center gap-2">
          <Puzzle className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Integrations</CardTitle>
          {enabledCount > 0 && (
            <Badge variant="secondary" data-testid="badge-enabled-integrations">
              {enabledCount} active
            </Badge>
          )}
        </div>
        <Button size="icon" variant="ghost" data-testid="button-expand-integrations">
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
      </CardHeader>

      {isExpanded && (
        <CardContent className="p-3 pt-0" data-testid="integrations-list">
          <div className={`grid gap-2 ${compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
            {INTEGRATIONS.map((integration) => {
              const Icon = integration.icon;
              const isEnabled = enabledIntegrations.includes(integration.id);

              return (
                <div
                  key={integration.id}
                  className={`flex items-center justify-between gap-2 p-2 rounded-md transition-colors ${
                    isEnabled ? "bg-primary/5 border border-primary/20" : "bg-muted/30"
                  }`}
                  data-testid={`integration-${integration.id}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`flex-shrink-0 ${isEnabled ? "text-primary" : "text-muted-foreground"}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Label
                          htmlFor={`integration-${integration.id}`}
                          className="text-sm font-medium cursor-pointer"
                        >
                          {integration.name}
                        </Label>
                        {integration.popular && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 no-default-active-elevate" data-testid={`badge-popular-${integration.id}`}>
                            Popular
                          </Badge>
                        )}
                      </div>
                      {!compact && (
                        <p className="text-xs text-muted-foreground truncate" title={integration.description}>
                          {integration.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <Switch
                    id={`integration-${integration.id}`}
                    checked={isEnabled}
                    onCheckedChange={() => onToggle(integration.id)}
                    data-testid={`switch-integration-${integration.id}`}
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
