import { MessageSquare, Eye, Wrench, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export type MobileTab = "chat" | "preview" | "tools" | "team";

interface MobileTabBarProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  hasCode: boolean;
  isGenerating: boolean;
  hasActiveDiscussion?: boolean;
}

export function MobileTabBar({ activeTab, onTabChange, hasCode, isGenerating, hasActiveDiscussion }: MobileTabBarProps) {
  const tabs: { id: MobileTab; label: string; icon: typeof MessageSquare }[] = [
    { id: "chat", label: "Chat", icon: MessageSquare },
    { id: "preview", label: "Preview", icon: Eye },
    { id: "team", label: "Team", icon: Users },
    { id: "tools", label: "Tools", icon: Wrench },
  ];

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur-sm"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      data-testid="mobile-tab-bar"
    >
      <div className="flex items-stretch h-14">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors relative",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
              data-testid={`mobile-tab-${tab.id}`}
            >
              {isActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary" />
              )}
              <div className="relative">
                <Icon className="h-5 w-5" />
                {tab.id === "preview" && hasCode && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500" />
                )}
                {tab.id === "chat" && isGenerating && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                )}
                {tab.id === "team" && hasActiveDiscussion && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                )}
              </div>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
