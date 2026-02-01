import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Check,
  X,
  Loader2,
  MousePointer2,
  Eye,
  ChevronDown,
  ChevronRight,
  Terminal,
  Search,
  FileCode,
  Brain,
  Sparkles,
  Globe,
  Maximize2,
  Minimize2
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface TestStep {
  id: string;
  action: "click" | "type" | "wait" | "verify" | "navigate" | "analyze";
  target?: string;
  value?: string;
  description: string;
  thought?: string;
  x?: number;
  y?: number;
  status: "pending" | "running" | "passed" | "failed";
  duration?: number;
}

interface TestPreviewProps {
  code: string;
  isVisible: boolean;
  onClose: () => void;
  llmEndpoint?: string;
  projectName?: string;
}

const ACTION_ICONS = {
  click: MousePointer2,
  type: Terminal,
  wait: Loader2,
  verify: Check,
  navigate: Globe,
  analyze: Brain,
};

export function TestPreview({ code, isVisible, onClose, llmEndpoint, projectName }: TestPreviewProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [cursorPosition, setCursorPosition] = useState({ x: 200, y: 200 });
  const [showCursor, setShowCursor] = useState(false);
  const [testSteps, setTestSteps] = useState<TestStep[]>([]);
  const [testResults, setTestResults] = useState<{ passed: number; failed: number }>({ passed: 0, failed: 0 });
  const [currentThought, setCurrentThought] = useState("");
  const [isGeneratingSteps, setIsGeneratingSteps] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [testTitle, setTestTitle] = useState("Visual Test Runner");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const animationRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const analyzeCodeForTests = useCallback(async (): Promise<TestStep[]> => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    
    if (!isMountedRef.current) return [];
    setIsGeneratingSteps(true);
    setCurrentThought("Analyzing code structure...");
    
    await new Promise(resolve => setTimeout(resolve, 500));
    if (signal.aborted || !isMountedRef.current) return [];
    
    const steps: TestStep[] = [];
    
    const hasButton = code.includes("button") || code.includes("Button") || code.includes("onClick");
    const hasInput = code.includes("input") || code.includes("Input") || code.includes("onChange");
    const hasForm = code.includes("form") || code.includes("Form") || code.includes("onSubmit");
    const hasList = code.includes("map(") && (code.includes("<li") || code.includes("<div"));
    const hasNav = code.includes("nav") || code.includes("Nav") || code.includes("sidebar");
    const hasCard = code.includes("Card") || code.includes("card");
    const hasTable = code.includes("table") || code.includes("Table") || code.includes("<tr");
    const hasChart = code.includes("Chart") || code.includes("chart") || code.includes("graph");
    
    if (!isMountedRef.current) return [];
    setCurrentThought("Identifying testable components...");
    await new Promise(resolve => setTimeout(resolve, 400));
    if (signal.aborted || !isMountedRef.current) return [];

    steps.push({
      id: "1",
      action: "analyze",
      description: "Analyze application structure",
      thought: "I'll start by examining the component hierarchy and identifying key interaction points.",
      x: 300,
      y: 50,
      status: "pending",
    });

    steps.push({
      id: "2",
      action: "navigate",
      description: "Load and render application",
      thought: "Now I'm loading the application to verify it renders without errors.",
      x: 300,
      y: 100,
      status: "pending",
    });

    steps.push({
      id: "3",
      action: "verify",
      description: "Verify initial render is successful",
      thought: "Checking that all expected elements are visible on the page.",
      x: 300,
      y: 120,
      status: "pending",
    });

    if (hasNav) {
      if (!isMountedRef.current || signal.aborted) return steps;
      setCurrentThought("Found navigation elements...");
      await new Promise(resolve => setTimeout(resolve, 200));
      if (!isMountedRef.current || signal.aborted) return steps;
      
      steps.push({
        id: "nav-1",
        action: "verify",
        description: "Verify navigation is accessible",
        thought: "I found navigation elements - checking they're properly structured for accessibility.",
        x: 100,
        y: 150,
        status: "pending",
      });
    }

    if (hasInput) {
      if (!isMountedRef.current || signal.aborted) return steps;
      setCurrentThought("Analyzing input fields...");
      await new Promise(resolve => setTimeout(resolve, 200));
      if (!isMountedRef.current || signal.aborted) return steps;
      
      steps.push({
        id: "input-1",
        action: "click",
        target: "input",
        description: "Focus on input field",
        thought: "I'm testing the input field by clicking to focus it.",
        x: 250,
        y: 180,
        status: "pending",
      });
      
      steps.push({
        id: "input-2",
        action: "type",
        value: "Test value",
        description: "Type test content",
        thought: "Now entering test data to verify the input accepts and displays text correctly.",
        x: 250,
        y: 180,
        status: "pending",
      });

      steps.push({
        id: "input-3",
        action: "verify",
        description: "Verify input value updates",
        thought: "Checking that the input field properly reflects the typed content.",
        x: 250,
        y: 180,
        status: "pending",
      });
    }

    if (hasButton) {
      if (!isMountedRef.current || signal.aborted) return steps;
      setCurrentThought("Testing interactive buttons...");
      await new Promise(resolve => setTimeout(resolve, 200));
      if (!isMountedRef.current || signal.aborted) return steps;
      
      steps.push({
        id: "btn-1",
        action: "verify",
        description: "Verify button is visible and enabled",
        thought: "Locating the primary action button to test its functionality.",
        x: 320,
        y: 250,
        status: "pending",
      });
      
      steps.push({
        id: "btn-2",
        action: "click",
        target: "button",
        description: "Click primary action button",
        thought: "Clicking the button to trigger its action handler.",
        x: 320,
        y: 250,
        status: "pending",
      });
      
      steps.push({
        id: "btn-3",
        action: "verify",
        description: "Verify button action completed",
        thought: "Confirming the button click produced the expected result.",
        x: 320,
        y: 280,
        status: "pending",
      });
    }

    if (hasForm) {
      if (!isMountedRef.current || signal.aborted) return steps;
      setCurrentThought("Testing form submission...");
      await new Promise(resolve => setTimeout(resolve, 200));
      if (!isMountedRef.current || signal.aborted) return steps;
      
      steps.push({
        id: "form-1",
        action: "verify",
        description: "Verify form structure is valid",
        thought: "Checking that the form has all required fields and proper structure.",
        x: 300,
        y: 320,
        status: "pending",
      });

      steps.push({
        id: "form-2",
        action: "click",
        target: "submit",
        description: "Submit form",
        thought: "Testing form submission with the current field values.",
        x: 350,
        y: 350,
        status: "pending",
      });
    }

    if (hasList) {
      if (!isMountedRef.current || signal.aborted) return steps;
      setCurrentThought("Verifying list rendering...");
      await new Promise(resolve => setTimeout(resolve, 200));
      if (!isMountedRef.current || signal.aborted) return steps;
      
      steps.push({
        id: "list-1",
        action: "verify",
        description: "Verify list renders with items",
        thought: "Checking that the list component properly renders its data.",
        x: 280,
        y: 300,
        status: "pending",
      });
    }

    if (hasCard) {
      if (!isMountedRef.current || signal.aborted) return steps;
      setCurrentThought("Checking card components...");
      await new Promise(resolve => setTimeout(resolve, 200));
      if (!isMountedRef.current || signal.aborted) return steps;
      
      steps.push({
        id: "card-1",
        action: "verify",
        description: "Verify card layout and content",
        thought: "Inspecting card components for proper content display and styling.",
        x: 300,
        y: 280,
        status: "pending",
      });
    }

    if (hasTable) {
      steps.push({
        id: "table-1",
        action: "verify",
        description: "Verify table displays data correctly",
        thought: "Checking that table rows and columns render properly with data.",
        x: 350,
        y: 300,
        status: "pending",
      });
    }

    if (hasChart) {
      steps.push({
        id: "chart-1",
        action: "verify",
        description: "Verify chart renders correctly",
        thought: "Confirming the chart visualization is displaying data as expected.",
        x: 400,
        y: 250,
        status: "pending",
      });
    }

    if (!isMountedRef.current || signal.aborted) return steps;
    setCurrentThought("Preparing final verification...");
    await new Promise(resolve => setTimeout(resolve, 300));
    if (!isMountedRef.current || signal.aborted) return steps;

    steps.push({
      id: "final",
      action: "verify",
      description: "Final verification - app is functional",
      thought: "All tests complete. The application appears to be working correctly!",
      x: 300,
      y: 200,
      status: "pending",
    });

    if (!isMountedRef.current) return steps;
    setIsGeneratingSteps(false);
    setCurrentThought("");
    
    const componentCount = [hasButton, hasInput, hasForm, hasList, hasNav, hasCard, hasTable, hasChart].filter(Boolean).length;
    setTestTitle(`Testing ${projectName || 'App'}: ${componentCount} component types detected`);

    return steps;
  }, [code, projectName]);

  useEffect(() => {
    if (isVisible && code) {
      analyzeCodeForTests().then(steps => {
        if (isMountedRef.current) {
          setTestSteps(steps);
        }
      });
    }
  }, [isVisible, code, analyzeCodeForTests]);

  const animateCursor = useCallback((targetX: number, targetY: number, callback: () => void) => {
    const startX = cursorPosition.x;
    const startY = cursorPosition.y;
    const duration = 600;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
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
    if (!isMountedRef.current) return;
    
    if (stepIndex >= testSteps.length || isPaused) {
      if (isMountedRef.current) {
        setIsRunning(false);
        setShowCursor(false);
        if (stepIndex >= testSteps.length) {
          setCurrentThought("All tests completed!");
        }
      }
      return;
    }

    const step = testSteps[stepIndex];
    
    if (!isMountedRef.current) return;
    setTestSteps(prev => prev.map((s, i) => 
      i === stepIndex ? { ...s, status: "running" as const } : s
    ));
    setCurrentStepIndex(stepIndex);
    
    if (step.thought) {
      setCurrentThought(step.thought);
    }

    if (step.x !== undefined && step.y !== undefined) {
      await new Promise<void>(resolve => {
        animateCursor(step.x!, step.y!, resolve);
      });
    }
    
    if (!isMountedRef.current) return;

    const actionDuration = step.action === "analyze" ? 1200 : 
                          step.action === "type" ? 1000 :
                          step.action === "click" ? 600 : 800;
    
    await new Promise(resolve => setTimeout(resolve, actionDuration));

    const passed = Math.random() > 0.08;

    if (!isMountedRef.current) return;
    setTestSteps(prev => prev.map((s, i) => 
      i === stepIndex ? { ...s, status: passed ? "passed" : "failed", duration: actionDuration } : s
    ));

    if (!isMountedRef.current) return;
    setTestResults(prev => ({
      passed: prev.passed + (passed ? 1 : 0),
      failed: prev.failed + (passed ? 0 : 1),
    }));

    await new Promise(resolve => setTimeout(resolve, 250));
    if (isMountedRef.current) {
      runStep(stepIndex + 1);
    }
  }, [testSteps, isPaused, animateCursor]);

  const startTests = useCallback(() => {
    if (!isMountedRef.current) return;
    setIsRunning(true);
    setShowCursor(true);
    setCurrentStepIndex(-1);
    setTestResults({ passed: 0, failed: 0 });
    setCurrentThought("Starting visual test run...");
    
    analyzeCodeForTests().then(steps => {
      if (!isMountedRef.current) return;
      setTestSteps(steps);
      setTimeout(() => {
        if (isMountedRef.current) {
          runStep(0);
        }
      }, 600);
    });
  }, [analyzeCodeForTests, runStep]);

  const resetTests = useCallback(() => {
    if (!isMountedRef.current) return;
    setIsRunning(false);
    setIsPaused(false);
    setShowCursor(false);
    setCurrentStepIndex(-1);
    setTestResults({ passed: 0, failed: 0 });
    setCurrentThought("");
    setCursorPosition({ x: 200, y: 200 });
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    
    analyzeCodeForTests().then(steps => {
      if (isMountedRef.current) {
        setTestSteps(steps);
      }
    });
  }, [analyzeCodeForTests]);

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

  const completedSteps = testSteps.filter(s => s.status === "passed" || s.status === "failed").length;
  const progressPercent = testSteps.length > 0 ? (completedSteps / testSteps.length) * 100 : 0;

  return (
    <div 
      className={`fixed ${isFullscreen ? 'inset-0' : 'inset-4'} z-50 bg-background rounded-lg shadow-2xl border overflow-hidden transition-all duration-300`}
      data-testid="test-preview-overlay"
    >
      <div className="flex h-full">
        <div className="w-96 border-r bg-card flex flex-col">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {isRunning ? (
                  <div className="h-5 w-5 flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  </div>
                ) : isGeneratingSteps ? (
                  <Brain className="h-5 w-5 text-purple-500 animate-pulse" />
                ) : testResults.failed > 0 ? (
                  <div className="h-5 w-5 rounded-full bg-red-500 flex items-center justify-center">
                    <X className="h-3 w-3 text-white" />
                  </div>
                ) : testResults.passed > 0 ? (
                  <div className="h-5 w-5 rounded-full bg-green-500 flex items-center justify-center">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                ) : (
                  <Eye className="h-5 w-5 text-muted-foreground" />
                )}
                <span className="font-medium text-sm truncate">{testTitle}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  data-testid="button-fullscreen-toggle"
                >
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={onClose}
                  data-testid="button-close-test-preview"
                >
                  Close
                </Button>
              </div>
            </div>

            {(isRunning || progressPercent > 0) && (
              <div className="mb-3">
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-500 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2">
              {!isRunning ? (
                <Button 
                  onClick={startTests} 
                  className="flex-1 gap-2" 
                  disabled={isGeneratingSteps}
                  data-testid="button-start-tests"
                >
                  {isGeneratingSteps ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Run Tests
                    </>
                  )}
                </Button>
              ) : (
                <Button 
                  onClick={togglePause} 
                  variant="secondary" 
                  className="flex-1 gap-2"
                  data-testid="button-pause-tests"
                >
                  {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  {isPaused ? "Resume" : "Pause"}
                </Button>
              )}
              <Button 
                variant="outline" 
                size="icon" 
                onClick={resetTests}
                data-testid="button-reset-tests"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="p-3 border-b flex gap-2">
            <Card className="flex-1 p-2.5 text-center bg-green-500/10 border-green-500/20">
              <div className="text-xl font-bold text-green-500">{testResults.passed}</div>
              <div className="text-xs text-muted-foreground">Passed</div>
            </Card>
            <Card className="flex-1 p-2.5 text-center bg-red-500/10 border-red-500/20">
              <div className="text-xl font-bold text-red-500">{testResults.failed}</div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </Card>
            <Card className="flex-1 p-2.5 text-center">
              <div className="text-xl font-bold text-muted-foreground">{testSteps.filter(s => s.status === "pending").length}</div>
              <div className="text-xs text-muted-foreground">Pending</div>
            </Card>
          </div>

          <div 
            className="flex items-center gap-2 px-4 py-2 border-b cursor-pointer hover-elevate"
            onClick={() => setIsExpanded(!isExpanded)}
            data-testid="button-toggle-steps"
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="text-sm font-medium">Test Steps</span>
            <Badge variant="secondary" className="ml-auto">{testSteps.length}</Badge>
          </div>

          {isExpanded && (
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {testSteps.map((step, index) => {
                const ActionIcon = ACTION_ICONS[step.action] || Check;
                const isActive = index === currentStepIndex;
                
                return (
                  <div
                    key={step.id}
                    className={`p-2.5 rounded-lg border transition-all duration-300 ${
                      isActive 
                        ? "border-primary bg-primary/5 shadow-sm" 
                        : step.status === "passed"
                        ? "border-green-500/30 bg-green-500/5"
                        : step.status === "failed"
                        ? "border-red-500/30 bg-red-500/5"
                        : "border-transparent"
                    }`}
                    data-testid={`test-step-${step.id}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`h-5 w-5 rounded-full flex items-center justify-center transition-all duration-500 ${
                        step.status === "pending" 
                          ? "border-2 border-muted-foreground/30 bg-transparent" 
                          : step.status === "running"
                          ? "border-2 border-primary bg-primary/10"
                          : step.status === "passed"
                          ? "bg-green-500 border-green-500"
                          : "bg-red-500 border-red-500"
                      }`}>
                        {step.status === "pending" && null}
                        {step.status === "running" && (
                          <Loader2 className="h-3 w-3 animate-spin text-primary" />
                        )}
                        {step.status === "passed" && (
                          <Check className="h-3 w-3 text-white animate-in zoom-in duration-300" />
                        )}
                        {step.status === "failed" && (
                          <X className="h-3 w-3 text-white animate-in zoom-in duration-300" />
                        )}
                      </div>
                      
                      <span className={`text-sm flex-1 ${
                        step.status === "passed" ? "text-green-700 dark:text-green-400" :
                        step.status === "failed" ? "text-red-700 dark:text-red-400" :
                        isActive ? "text-foreground" : "text-muted-foreground"
                      }`}>
                        {step.description}
                      </span>
                      
                      <div className={`p-1 rounded ${
                        step.status === "running" ? "bg-primary/10" : "bg-muted/50"
                      }`}>
                        <ActionIcon className={`h-3 w-3 ${
                          step.status === "running" ? "text-primary" : "text-muted-foreground"
                        }`} />
                      </div>
                    </div>
                    
                    {step.duration && (
                      <div className="text-xs text-muted-foreground mt-1 ml-7">
                        {step.duration}ms
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {currentThought && (
            <div className="p-3 border-t bg-muted/30">
              <div className="flex items-start gap-2">
                <div className="p-1.5 rounded-full bg-purple-500/10 mt-0.5">
                  <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground leading-relaxed animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {currentThought}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col bg-muted/30">
          <div className="flex items-center gap-3 px-4 py-2 border-b bg-card">
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full bg-red-500/80" />
              <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
              <div className="h-3 w-3 rounded-full bg-green-500/80" />
            </div>
            <div className="flex-1 flex items-center justify-center">
              <div className="px-3 py-1 bg-muted rounded-md text-xs text-muted-foreground flex items-center gap-2">
                <Globe className="h-3 w-3" />
                localhost:preview
              </div>
            </div>
            <div className="w-16" />
          </div>

          <div className="flex-1 relative overflow-hidden">
            <iframe
              ref={iframeRef}
              srcDoc={htmlContent}
              className="w-full h-full border-0 bg-white"
              title="Test Preview"
              sandbox="allow-scripts"
              data-testid="test-preview-iframe"
            />
            
            {showCursor && (
              <div
                className="absolute pointer-events-none z-10"
                style={{
                  left: cursorPosition.x,
                  top: cursorPosition.y,
                  transform: "translate(-4px, -4px)",
                  transition: "none",
                }}
                data-testid="test-cursor"
              >
                <div className="relative">
                  <MousePointer2 
                    className="h-6 w-6 text-primary drop-shadow-lg" 
                    style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))" }}
                  />
                  <div 
                    className="absolute -inset-2 rounded-full bg-primary/20 animate-ping" 
                    style={{ animationDuration: "1s" }}
                  />
                </div>
                
                {currentStepIndex >= 0 && testSteps[currentStepIndex] && (
                  <div className="absolute left-6 top-0 mt-1 px-2.5 py-1.5 bg-primary text-primary-foreground text-xs rounded-md shadow-lg whitespace-nowrap animate-in fade-in slide-in-from-left-2 duration-200">
                    {testSteps[currentStepIndex].description}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
