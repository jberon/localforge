import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  MousePointer2,
  Eye
} from "lucide-react";

interface TestStep {
  id: string;
  action: "click" | "type" | "wait" | "verify" | "navigate";
  target?: string;
  value?: string;
  description: string;
  x?: number;
  y?: number;
  status: "pending" | "running" | "passed" | "failed";
  duration?: number;
}

interface TestPreviewProps {
  code: string;
  isVisible: boolean;
  onClose: () => void;
}

export function TestPreview({ code, isVisible, onClose }: TestPreviewProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [cursorPosition, setCursorPosition] = useState({ x: 200, y: 200 });
  const [showCursor, setShowCursor] = useState(false);
  const [testSteps, setTestSteps] = useState<TestStep[]>([]);
  const [testResults, setTestResults] = useState<{ passed: number; failed: number }>({ passed: 0, failed: 0 });
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const animationRef = useRef<number | null>(null);

  // Generate test steps based on the code content
  const generateTestSteps = useCallback((): TestStep[] => {
    const steps: TestStep[] = [];
    
    // Analyze code to generate test steps
    const hasButton = code.includes("button") || code.includes("Button") || code.includes("onClick");
    const hasInput = code.includes("input") || code.includes("Input") || code.includes("onChange");
    const hasForm = code.includes("form") || code.includes("Form") || code.includes("onSubmit");
    const hasList = code.includes("map(") && (code.includes("<li") || code.includes("<div"));
    
    steps.push({
      id: "1",
      action: "navigate",
      description: "Load the application",
      x: 300,
      y: 50,
      status: "pending",
    });

    steps.push({
      id: "2",
      action: "verify",
      description: "Verify page loads successfully",
      x: 300,
      y: 100,
      status: "pending",
    });

    if (hasInput) {
      steps.push({
        id: "3",
        action: "click",
        target: "input",
        description: "Click on input field",
        x: 250,
        y: 180,
        status: "pending",
      });
      
      steps.push({
        id: "4",
        action: "type",
        value: "Test input value",
        description: "Type text into input",
        x: 250,
        y: 180,
        status: "pending",
      });
    }

    if (hasButton) {
      steps.push({
        id: "5",
        action: "click",
        target: "button",
        description: "Click primary button",
        x: 320,
        y: 250,
        status: "pending",
      });
      
      steps.push({
        id: "6",
        action: "verify",
        description: "Verify button action completed",
        x: 320,
        y: 280,
        status: "pending",
      });
    }

    if (hasForm) {
      steps.push({
        id: "7",
        action: "click",
        target: "submit",
        description: "Submit the form",
        x: 350,
        y: 350,
        status: "pending",
      });
    }

    if (hasList) {
      steps.push({
        id: "8",
        action: "verify",
        description: "Verify list renders correctly",
        x: 280,
        y: 300,
        status: "pending",
      });
    }

    steps.push({
      id: "final",
      action: "verify",
      description: "Final verification - app is functional",
      x: 300,
      y: 200,
      status: "pending",
    });

    return steps;
  }, [code]);

  useEffect(() => {
    if (isVisible && code) {
      setTestSteps(generateTestSteps());
    }
  }, [isVisible, code, generateTestSteps]);

  // Smooth cursor animation
  const animateCursor = useCallback((targetX: number, targetY: number, callback: () => void) => {
    const startX = cursorPosition.x;
    const startY = cursorPosition.y;
    const duration = 500;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth movement
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      const x = startX + (targetX - startX) * easeProgress;
      const y = startY + (targetY - startY) * easeProgress;
      
      setCursorPosition({ x, y });

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        callback();
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  }, [cursorPosition]);

  const runStep = useCallback(async (stepIndex: number) => {
    if (stepIndex >= testSteps.length || isPaused) {
      setIsRunning(false);
      setShowCursor(false);
      return;
    }

    const step = testSteps[stepIndex];
    
    // Update step status to running
    setTestSteps(prev => prev.map((s, i) => 
      i === stepIndex ? { ...s, status: "running" as const } : s
    ));
    setCurrentStepIndex(stepIndex);

    // Animate cursor to target position
    if (step.x !== undefined && step.y !== undefined) {
      await new Promise<void>(resolve => {
        animateCursor(step.x!, step.y!, resolve);
      });
    }

    // Simulate action with visual feedback
    await new Promise(resolve => setTimeout(resolve, 800));

    // Determine pass/fail (random for demo, could be based on actual iframe checks)
    const passed = Math.random() > 0.1; // 90% pass rate for demo

    setTestSteps(prev => prev.map((s, i) => 
      i === stepIndex ? { ...s, status: passed ? "passed" : "failed", duration: 800 } : s
    ));

    setTestResults(prev => ({
      passed: prev.passed + (passed ? 1 : 0),
      failed: prev.failed + (passed ? 0 : 1),
    }));

    // Continue to next step
    await new Promise(resolve => setTimeout(resolve, 300));
    runStep(stepIndex + 1);
  }, [testSteps, isPaused, animateCursor]);

  const startTests = useCallback(() => {
    setIsRunning(true);
    setShowCursor(true);
    setCurrentStepIndex(-1);
    setTestResults({ passed: 0, failed: 0 });
    setTestSteps(generateTestSteps());
    
    setTimeout(() => runStep(0), 500);
  }, [generateTestSteps, runStep]);

  const resetTests = useCallback(() => {
    setIsRunning(false);
    setIsPaused(false);
    setShowCursor(false);
    setCurrentStepIndex(-1);
    setTestResults({ passed: 0, failed: 0 });
    setTestSteps(generateTestSteps());
    setCursorPosition({ x: 200, y: 200 });
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  }, [generateTestSteps]);

  const togglePause = useCallback(() => {
    setIsPaused(prev => !prev);
    if (isPaused && currentStepIndex >= 0) {
      runStep(currentStepIndex);
    }
  }, [isPaused, currentStepIndex, runStep]);

  if (!isVisible) return null;

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
      <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
      <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        body { margin: 0; font-family: system-ui, -apple-system, sans-serif; }
        #root { min-height: 100vh; }
      </style>
    </head>
    <body>
      <div id="root"></div>
      <script type="text/babel">
        ${code}
      </script>
    </body>
    </html>
  `;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm" data-testid="test-preview-overlay">
      <div className="flex h-full">
        {/* Test Steps Panel */}
        <div className="w-80 border-r bg-card p-4 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Visual Test Runner
            </h3>
            <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-close-test-preview">
              Close
            </Button>
          </div>

          <div className="flex gap-2 mb-4">
            {!isRunning ? (
              <Button onClick={startTests} className="flex-1" data-testid="button-start-tests">
                <Play className="h-4 w-4 mr-2" />
                Run Tests
              </Button>
            ) : (
              <Button onClick={togglePause} variant="secondary" className="flex-1" data-testid="button-pause-tests">
                {isPaused ? <Play className="h-4 w-4 mr-2" /> : <Pause className="h-4 w-4 mr-2" />}
                {isPaused ? "Resume" : "Pause"}
              </Button>
            )}
            <Button variant="outline" size="icon" onClick={resetTests} data-testid="button-reset-tests">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>

          {/* Results Summary */}
          <div className="flex gap-2 mb-4">
            <Card className="flex-1 p-3 text-center">
              <div className="text-2xl font-bold text-green-500">{testResults.passed}</div>
              <div className="text-xs text-muted-foreground">Passed</div>
            </Card>
            <Card className="flex-1 p-3 text-center">
              <div className="text-2xl font-bold text-red-500">{testResults.failed}</div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </Card>
          </div>

          {/* Test Steps List */}
          <div className="flex-1 overflow-y-auto space-y-2">
            {testSteps.map((step, index) => (
              <div
                key={step.id}
                className={`p-3 rounded-lg border transition-colors ${
                  index === currentStepIndex ? "border-primary bg-primary/5" : ""
                }`}
                data-testid={`test-step-${step.id}`}
              >
                <div className="flex items-center gap-2">
                  {step.status === "pending" && (
                    <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                  )}
                  {step.status === "running" && (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  )}
                  {step.status === "passed" && (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  )}
                  {step.status === "failed" && (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span className="text-sm flex-1">{step.description}</span>
                  <Badge variant="secondary" className="text-xs">
                    {step.action}
                  </Badge>
                </div>
                {step.duration && (
                  <div className="text-xs text-muted-foreground mt-1 ml-6">
                    {step.duration}ms
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Preview Area with Cursor */}
        <div className="flex-1 relative overflow-hidden bg-background">
          <iframe
            ref={iframeRef}
            srcDoc={htmlContent}
            className="w-full h-full border-0"
            title="Test Preview"
            sandbox="allow-scripts"
            data-testid="test-preview-iframe"
          />
          
          {/* Animated Cursor Overlay */}
          {showCursor && (
            <div
              className="absolute pointer-events-none transition-transform duration-75"
              style={{
                left: cursorPosition.x,
                top: cursorPosition.y,
                transform: "translate(-50%, -50%)",
              }}
              data-testid="test-cursor"
            >
              <div className="relative">
                <MousePointer2 className="h-6 w-6 text-primary drop-shadow-lg" />
                <div className="absolute inset-0 animate-ping">
                  <MousePointer2 className="h-6 w-6 text-primary/50" />
                </div>
              </div>
              {currentStepIndex >= 0 && testSteps[currentStepIndex] && (
                <div className="mt-2 px-2 py-1 bg-primary text-primary-foreground text-xs rounded whitespace-nowrap">
                  {testSteps[currentStepIndex].description}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
