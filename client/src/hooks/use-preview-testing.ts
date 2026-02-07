import { useState, useRef, useCallback, useEffect } from "react";

interface TestStep {
  action: string;
  target: string;
  value?: string;
  assertion?: string;
}

interface TestScenario {
  id: string;
  name: string;
  type: string;
  steps: TestStep[];
  status: "pending" | "running" | "passed" | "failed" | "skipped";
}

interface TestResult {
  scenarioId: string;
  scenarioName: string;
  passed: boolean;
  duration: number;
  errors: string[];
  details: string[];
}

interface TestSuiteResult {
  suiteId: string;
  results: TestResult[];
  totalPassed: number;
  totalFailed: number;
  totalSkipped: number;
  duration: number;
  completedAt: number;
}

interface UsePreviewTestingOptions {
  projectId?: string;
  onTestComplete?: (result: TestSuiteResult) => void;
}

export function usePreviewTesting({ projectId, onTestComplete }: UsePreviewTestingOptions) {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, scenarioName: "" });
  const [lastResult, setLastResult] = useState<TestSuiteResult | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const resolverRef = useRef<((result: any) => void) | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "test-result" && resolverRef.current) {
        resolverRef.current(event.data);
        resolverRef.current = null;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const sendTestToIframe = useCallback((scenario: TestScenario): Promise<any> => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        resolverRef.current = null;
        resolve({ passed: false, errors: ["Test timed out after 10s"], details: [] });
      }, 10000);

      const testScript = buildTestScript(scenario);

      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({
          type: "run-test",
          script: testScript,
          scenarioId: scenario.id,
        }, "*");
      } else {
        resolverRef.current = null;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        resolve({ passed: false, errors: ["Preview iframe not available"], details: [] });
      }
    });
  }, []);

  const runTests = useCallback(async (scenarios: TestScenario[], iframe: HTMLIFrameElement | null) => {
    if (!iframe || isRunning) return null;

    iframeRef.current = iframe;
    setIsRunning(true);
    const startTime = Date.now();
    const results: TestResult[] = [];

    setProgress({ current: 0, total: scenarios.length, scenarioName: "" });

    for (let i = 0; i < scenarios.length; i++) {
      const scenario = scenarios[i];
      setProgress({ current: i + 1, total: scenarios.length, scenarioName: scenario.name });

      const scenarioStart = Date.now();
      const result = await sendTestToIframe(scenario);

      results.push({
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        passed: result.passed ?? false,
        duration: Date.now() - scenarioStart,
        errors: result.errors || [],
        details: result.details || [],
      });
    }

    const suiteResult: TestSuiteResult = {
      suiteId: `run_${Date.now()}`,
      results,
      totalPassed: results.filter(r => r.passed).length,
      totalFailed: results.filter(r => !r.passed).length,
      totalSkipped: 0,
      duration: Date.now() - startTime,
      completedAt: Date.now(),
    };

    setLastResult(suiteResult);
    setIsRunning(false);
    setProgress({ current: 0, total: 0, scenarioName: "" });
    onTestComplete?.(suiteResult);

    return suiteResult;
  }, [isRunning, sendTestToIframe, onTestComplete]);

  const generateAndRun = useCallback(async (code: string, iframe: HTMLIFrameElement | null) => {
    if (!projectId) return null;

    try {
      const res = await fetch(`/api/runtime/test-suite/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      if (!res.ok) throw new Error("Failed to generate test suite");
      const suite = await res.json();

      if (suite.scenarios && suite.scenarios.length > 0) {
        return runTests(suite.scenarios, iframe);
      }
      return null;
    } catch (err: any) {
      console.error("Test generation failed:", err);
      return null;
    }
  }, [projectId, runTests]);

  return {
    isRunning,
    progress,
    lastResult,
    runTests,
    generateAndRun,
  };
}

function buildTestScript(scenario: TestScenario): string {
  const assertions: string[] = [];

  for (const step of scenario.steps) {
    switch (step.action) {
      case "check_exists":
      case "verify":
        assertions.push(`
          (function() {
            try {
              var targets = document.querySelectorAll('${escapeSelector(step.target)}');
              if (targets.length === 0) {
                targets = findByText('${escapeStr(step.target)}');
              }
              if (targets.length > 0) {
                details.push('Found: ${escapeStr(step.target)}');
              } else {
                errors.push('Not found: ${escapeStr(step.target)}');
                passed = false;
              }
            } catch(e) {
              errors.push('Check failed for ${escapeStr(step.target)}: ' + e.message);
              passed = false;
            }
          })();
        `);
        break;

      case "check_text":
        assertions.push(`
          (function() {
            try {
              var found = document.body.innerText.includes('${escapeStr(step.value || step.target)}');
              if (found) {
                details.push('Text found: ${escapeStr(step.value || step.target)}');
              } else {
                errors.push('Text not found: ${escapeStr(step.value || step.target)}');
                passed = false;
              }
            } catch(e) {
              errors.push('Text check failed: ' + e.message);
              passed = false;
            }
          })();
        `);
        break;

      case "click":
        assertions.push(`
          (function() {
            try {
              var el = document.querySelector('${escapeSelector(step.target)}');
              if (!el) {
                var found = findByText('${escapeStr(step.target)}');
                el = found.length > 0 ? found[0] : null;
              }
              if (el) {
                el.click();
                details.push('Clicked: ${escapeStr(step.target)}');
              } else {
                errors.push('Click target not found: ${escapeStr(step.target)}');
                passed = false;
              }
            } catch(e) {
              errors.push('Click failed: ' + e.message);
              passed = false;
            }
          })();
        `);
        break;

      case "check_count":
        assertions.push(`
          (function() {
            try {
              var elements = document.querySelectorAll('${escapeSelector(step.target)}');
              var expected = ${parseInt(step.value || "1")};
              if (elements.length >= expected) {
                details.push('Found ' + elements.length + ' elements matching ${escapeStr(step.target)}');
              } else {
                errors.push('Expected at least ' + expected + ' elements for ${escapeStr(step.target)}, found ' + elements.length);
                passed = false;
              }
            } catch(e) {
              errors.push('Count check failed: ' + e.message);
              passed = false;
            }
          })();
        `);
        break;

      case "check_visible":
        assertions.push(`
          (function() {
            try {
              var el = document.querySelector('${escapeSelector(step.target)}');
              if (!el) {
                var found = findByText('${escapeStr(step.target)}');
                el = found.length > 0 ? found[0] : null;
              }
              if (el) {
                var rect = el.getBoundingClientRect();
                var visible = rect.width > 0 && rect.height > 0 && getComputedStyle(el).display !== 'none';
                if (visible) {
                  details.push('Visible: ${escapeStr(step.target)}');
                } else {
                  errors.push('Element exists but not visible: ${escapeStr(step.target)}');
                  passed = false;
                }
              } else {
                errors.push('Element not found: ${escapeStr(step.target)}');
                passed = false;
              }
            } catch(e) {
              errors.push('Visibility check failed: ' + e.message);
              passed = false;
            }
          })();
        `);
        break;

      case "check_no_errors":
        assertions.push(`
          (function() {
            if (window.__testErrors && window.__testErrors.length > 0) {
              errors.push('Console errors detected: ' + window.__testErrors.join('; '));
              passed = false;
            } else {
              details.push('No console errors detected');
            }
          })();
        `);
        break;

      case "check_accessible":
        assertions.push(`
          (function() {
            try {
              var images = document.querySelectorAll('img');
              var missingAlt = 0;
              images.forEach(function(img) { if (!img.alt) missingAlt++; });
              if (missingAlt > 0) {
                errors.push(missingAlt + ' image(s) missing alt text');
                passed = false;
              } else {
                details.push('All images have alt text');
              }
              var buttons = document.querySelectorAll('button');
              var emptyButtons = 0;
              buttons.forEach(function(btn) {
                if (!btn.textContent?.trim() && !btn.getAttribute('aria-label')) emptyButtons++;
              });
              if (emptyButtons > 0) {
                errors.push(emptyButtons + ' button(s) have no accessible label');
                passed = false;
              } else {
                details.push('All buttons have accessible labels');
              }
            } catch(e) {
              errors.push('Accessibility check failed: ' + e.message);
              passed = false;
            }
          })();
        `);
        break;

      default:
        if (step.assertion) {
          assertions.push(`
            (function() {
              try {
                var result = ${step.assertion};
                if (result) {
                  details.push('Assertion passed: ${escapeStr(step.assertion)}');
                } else {
                  errors.push('Assertion failed: ${escapeStr(step.assertion)}');
                  passed = false;
                }
              } catch(e) {
                errors.push('Assertion error: ' + e.message);
                passed = false;
              }
            })();
          `);
        }
        break;
    }
  }

  return `
    (function() {
      var passed = true;
      var errors = [];
      var details = [];

      function findByText(text) {
        var all = document.querySelectorAll('*');
        var matches = [];
        for (var i = 0; i < all.length; i++) {
          if (all[i].children.length === 0 && all[i].textContent && all[i].textContent.trim().toLowerCase().includes(text.toLowerCase())) {
            matches.push(all[i]);
          }
        }
        return matches;
      }

      try {
        ${assertions.join("\n")}
      } catch(e) {
        errors.push('Test runner error: ' + e.message);
        passed = false;
      }

      window.parent.postMessage({
        type: 'test-result',
        scenarioId: '${scenario.id}',
        passed: passed,
        errors: errors,
        details: details
      }, '*');
    })();
  `;
}

function escapeStr(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
}

function escapeSelector(s: string): string {
  if (/^[a-zA-Z#.\[\]_\-=~^$*|: "'>+,]/.test(s)) {
    return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
