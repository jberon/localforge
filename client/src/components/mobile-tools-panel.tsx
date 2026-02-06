import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  FolderTree, Database, Brain, TestTube, Router, ImageIcon,
  Settings, Wifi, WifiOff, Hammer, BarChart3,
} from "lucide-react";

interface MobileToolsPanelProps {
  llmConnected: boolean;
  testModeConnected: boolean;
  isGenerating: boolean;
  isPlanning: boolean;
  onOpenFiles: () => void;
  onOpenDatabase: () => void;
  onOpenAIInsights: () => void;
  onOpenSelfTesting: () => void;
  onOpenSmartModel: () => void;
  onOpenImageImport: () => void;
  onOpenSettings: () => void;
  onCheckConnection: () => void;
  onNavigateHome: () => void;
  onNavigateAnalytics: () => void;
}

export function MobileToolsPanel({
  llmConnected,
  testModeConnected,
  isGenerating,
  isPlanning,
  onOpenFiles,
  onOpenDatabase,
  onOpenAIInsights,
  onOpenSelfTesting,
  onOpenSmartModel,
  onOpenImageImport,
  onOpenSettings,
  onCheckConnection,
  onNavigateHome,
  onNavigateAnalytics,
}: MobileToolsPanelProps) {
  const isConnected = llmConnected || testModeConnected;

  const tools = [
    { label: "Files", icon: FolderTree, onClick: onOpenFiles, testId: "mobile-tool-files" },
    { label: "Database", icon: Database, onClick: onOpenDatabase, testId: "mobile-tool-database" },
    { label: "AI Insights", icon: Brain, onClick: onOpenAIInsights, active: isGenerating || isPlanning, testId: "mobile-tool-insights" },
    { label: "Testing", icon: TestTube, onClick: onOpenSelfTesting, testId: "mobile-tool-testing" },
    { label: "Model Router", icon: Router, onClick: onOpenSmartModel, testId: "mobile-tool-model" },
    { label: "Import Design", icon: ImageIcon, onClick: onOpenImageImport, testId: "mobile-tool-import" },
    { label: "Analytics", icon: BarChart3, onClick: onNavigateAnalytics, testId: "mobile-tool-analytics" },
    { label: "Settings", icon: Settings, onClick: onOpenSettings, testId: "mobile-tool-settings" },
  ];

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 pb-20 space-y-4" data-testid="mobile-tools-panel">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Tools</h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            {isConnected ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Connected</span>
              </div>
            ) : (
              <Button variant="ghost" size="sm" onClick={onCheckConnection} data-testid="mobile-tool-reconnect">
                <WifiOff className="h-3.5 w-3.5 text-yellow-500 mr-1.5" />
                <span className="text-xs">Reconnect</span>
              </Button>
            )}
          </div>
          <ThemeToggle />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Button
              key={tool.label}
              variant="outline"
              className="h-auto justify-start gap-3 p-3"
              onClick={tool.onClick}
              data-testid={tool.testId}
            >
              <div className="flex items-center justify-center w-9 h-9 rounded-md bg-muted/50 shrink-0">
                <Icon className={`h-4 w-4 ${tool.active ? "text-purple-500 animate-pulse" : "text-muted-foreground"}`} />
              </div>
              <span className="text-sm font-medium truncate">{tool.label}</span>
            </Button>
          );
        })}
      </div>

      <Button
        variant="outline"
        className="h-auto justify-start gap-3 p-3 w-full"
        onClick={onNavigateHome}
        data-testid="mobile-tool-home"
      >
        <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
          <Hammer className="h-4 w-4 text-primary" />
        </div>
        <div className="text-left">
          <span className="text-sm font-medium">LocalForge Home</span>
          <p className="text-xs text-muted-foreground">Back to project list</p>
        </div>
      </Button>
    </div>
  );
}
