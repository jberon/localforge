import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/error-boundary";
import { ThemeProvider } from "@/hooks/use-theme";
import Home from "@/pages/home";
import AnalyticsPage from "@/pages/analytics";
import Preview from "@/pages/preview";
import NotFound from "@/pages/not-found";
import { useState, useEffect } from "react";
import type { LLMSettings } from "@shared/schema";

function AnalyticsWrapper() {
  const [settings, setSettings] = useState<LLMSettings>({
    endpoint: "http://localhost:1234/v1",
    model: "",
    temperature: 0.7,
    useDualModels: false,
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
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/analytics" component={AnalyticsWrapper} />
      <Route path="/preview/:id" component={Preview} />
      <Route component={NotFound} />
    </Switch>
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
