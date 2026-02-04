import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Sparkles,
  Server,
  Wand2,
  Download,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";

const ONBOARDING_KEY = "localforge-onboarding-completed";

interface OnboardingStep {
  title: string;
  description: string;
  icon: typeof Sparkles;
  details?: string[];
}

const STEPS: OnboardingStep[] = [
  {
    title: "Welcome to LocalForge",
    description: "Build apps with AI running on your Mac. No cloud required - your data stays local.",
    icon: Sparkles,
    details: [
      "Uses your local LLM via LM Studio",
      "Generates complete React applications",
      "Preview and download instantly",
    ],
  },
  {
    title: "Connect LM Studio",
    description: "LocalForge needs LM Studio running on your Mac to generate code.",
    icon: Server,
    details: [
      "Download LM Studio from lmstudio.ai",
      "Load any coding model (CodeLlama, Qwen, etc.)",
      "Start the local server (default port 1234)",
    ],
  },
  {
    title: "Choose a Template",
    description: "Start with a template or describe your own app idea.",
    icon: Wand2,
    details: [
      "Dashboard, Task Manager, Calculator & more",
      "Or type a freeform description",
      "AI generates complete, working code",
    ],
  },
  {
    title: "Preview & Download",
    description: "See your app live, then download it to run anywhere.",
    icon: Download,
    details: [
      "Live preview shows your app instantly",
      "Download as standalone HTML or full project",
      "Works offline - no server needed",
    ],
  },
];

export function OnboardingModal() {
  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const completed = localStorage.getItem(ONBOARDING_KEY);
    if (!completed) {
      setOpen(true);
    }
  }, []);

  const handleComplete = () => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    setOpen(false);
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const step = STEPS[currentStep];
  const isLastStep = currentStep === STEPS.length - 1;
  const Icon = step.icon;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="text-center pb-4">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Icon className="h-8 w-8 text-primary" />
          </div>
          <DialogTitle className="text-2xl">{step.title}</DialogTitle>
          <DialogDescription className="text-base">
            {step.description}
          </DialogDescription>
        </DialogHeader>

        {step.details && (
          <div className="space-y-3 py-4">
            {step.details.map((detail, i) => (
              <div key={i} className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <span className="text-sm">{detail}</span>
              </div>
            ))}
          </div>
        )}

        {currentStep === 1 && (
          <Card className="p-4 bg-muted/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Need LM Studio?</p>
                <p className="text-xs text-muted-foreground">Free download for Mac, Windows, Linux</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => window.open("https://lmstudio.ai", "_blank")}
                data-testid="button-lmstudio-download"
              >
                Get It
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          </Card>
        )}

        <div className="flex items-center justify-between pt-4">
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === currentStep ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleSkip} data-testid="button-skip-onboarding">
              Skip
            </Button>
            <Button onClick={handleNext} className="gap-1" data-testid="button-next-onboarding">
              {isLastStep ? "Get Started" : "Next"}
              {!isLastStep && <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function resetOnboarding() {
  localStorage.removeItem(ONBOARDING_KEY);
}
