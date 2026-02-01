import { Button } from "@/components/ui/button";
import { Sparkles, Zap, Code2, Rocket } from "lucide-react";

interface EmptyStateProps {
  onCreateProject: () => void;
}

export function EmptyState({ onCreateProject }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center fade-in">
      <div className="relative mb-8">
        <div className="absolute inset-0 blur-3xl opacity-20 bg-primary rounded-full" />
        <div className="relative flex items-center justify-center w-24 h-24 rounded-2xl bg-primary/10 border border-primary/20">
          <Sparkles className="w-12 h-12 text-primary" />
        </div>
      </div>

      <h1 className="text-3xl font-bold mb-3">
        Build something amazing
      </h1>
      
      <p className="text-muted-foreground max-w-md mb-8 text-lg">
        Describe your app idea and watch it come to life. No coding required.
      </p>

      <Button 
        size="lg" 
        onClick={onCreateProject}
        className="gap-2"
        data-testid="button-create-first-project"
      >
        <Zap className="w-5 h-5" />
        Create Your First App
      </Button>

      <div className="mt-16 grid grid-cols-3 gap-8 max-w-lg opacity-60">
        <Feature icon={Code2} label="Full-Stack Code" />
        <Feature icon={Rocket} label="Ready to Deploy" />
        <Feature icon={Sparkles} label="AI-Powered" />
      </div>
    </div>
  );
}

function Feature({ icon: Icon, label }: { icon: typeof Code2; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="p-3 rounded-lg bg-muted">
        <Icon className="w-5 h-5" />
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
