import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/error-boundary";
import { ThemeProvider } from "@/hooks/use-theme";
import { lazy, Suspense, useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

const Home = lazy(() => import("@/pages/home"));
const AnalyticsPage = lazy(() => import("@/pages/analytics"));
const Preview = lazy(() => import("@/pages/preview"));
const NotFound = lazy(() => import("@/pages/not-found"));

import type { LLMSettings } from "@shared/schema";

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-screen" data-testid="loader-page">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function AnalyticsWrapper() {
  const [settings, setSettings] = useState<LLMSettings>({
    endpoint: "http://localhost:1234/v1",
    model: "",
    temperature: 0.7,
    useDualModels: true,
    plannerModel: "",
    plannerTemperature: 0.3,
    builderModel: "",
    builderTemperature: 0.7,
    webSearchEnabled: false,
    serperApiKey: "",
    productionMode: true,
  });

  useEffect(() => {
    const saved = localStorage.getItem("llm-settings");
    if (saved) {
      try {
        setSettings(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load saved settings");
      }
    }
  }, []);

  return <AnalyticsPage settings={settings} />;
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/analytics" component={AnalyticsWrapper} />
        <Route path="/preview/:id" component={Preview} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <ErrorBoundary>
            <Toaster />
            <Router />
          </ErrorBoundary>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
