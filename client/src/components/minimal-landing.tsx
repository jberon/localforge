import { MinimalPromptInput } from "./minimal-prompt-input";
import { MinimalHeader } from "./minimal-header";
import { useTheme } from "@/hooks/use-theme";
import type { Attachment } from "@/hooks/use-file-attachments";

interface MinimalLandingProps {
  onGenerate: (prompt: string, mode: "app" | "design") => void;
  isGenerating: boolean;
  isConnected: boolean;
  testModeActive?: boolean;
  testModeConnected?: boolean;
  userName?: string;
  buildMode?: "fast" | "full";
  onBuildModeChange?: (mode: "fast" | "full") => void;
  autonomyLevel?: "low" | "medium" | "high" | "max";
  onAutonomyChange?: (level: "low" | "medium" | "high" | "max") => void;
  onAttach?: () => void;
  attachments?: Attachment[];
  onOpenSettings?: () => void;
}

export function MinimalLanding({
  onGenerate,
  isGenerating,
  isConnected,
  testModeActive = false,
  testModeConnected = false,
  userName,
  buildMode = "fast",
  onBuildModeChange,
  autonomyLevel = "medium",
  onAutonomyChange,
  onAttach,
  attachments = [],
  onOpenSettings,
}: MinimalLandingProps) {
  const { isDarkMode, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-background">
      <MinimalHeader
        isDarkMode={isDarkMode}
        onToggleTheme={toggleTheme}
        onOpenSettings={onOpenSettings}
        testModeActive={testModeActive}
        testModeConnected={testModeConnected}
        isConnected={isConnected}
      />

      <main className="pt-16">
        <MinimalPromptInput
          onGenerate={onGenerate}
          isGenerating={isGenerating}
          isConnected={isConnected}
          onAttach={onAttach}
          attachments={attachments}
          onOpenSettings={onOpenSettings}
          userName={userName}
          buildMode={buildMode}
          onBuildModeChange={onBuildModeChange}
          autonomyLevel={autonomyLevel}
          onAutonomyChange={onAutonomyChange}
        />
      </main>
    </div>
  );
}
