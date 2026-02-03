import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

interface EmptyStateProps {
  onCreateProject: () => void;
}

export function EmptyState({ onCreateProject }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center fade-in">
      <div className="max-w-lg space-y-8">
        <div className="space-y-4">
          <h1 className="text-5xl font-bold tracking-tight">
            Think it. Build it.
          </h1>
          <p className="text-xl text-muted-foreground">
            Describe any app. Watch it come to life.
          </p>
        </div>

        <Button 
          size="lg" 
          onClick={onCreateProject}
          className="gap-2"
          data-testid="button-create-first-project"
        >
          <Sparkles className="w-5 h-5" />
          Start Creating
        </Button>
      </div>
    </div>
  );
}
