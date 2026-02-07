import { useState, useRef, useCallback, useEffect } from "react";

interface RuntimeError {
  message: string;
  stack?: string;
  line?: number;
  type?: string;
}

interface AutoHealState {
  isHealing: boolean;
  healCount: number;
  lastHealedAt: number | null;
  lastErrors: RuntimeError[];
  status: string;
  qualityScore: number | null;
}

interface UseAutoHealOptions {
  projectId?: string;
  code: string;
  enabled: boolean;
  maxAutoHeals?: number;
  cooldownMs?: number;
  settings?: {
    endpoint?: string;
    model?: string;
    temperature?: number;
    provider?: string;
    apiKey?: string;
  };
  onCodeFixed?: (fixedCode: string) => void;
  isGenerating?: boolean;
}

export function useAutoHeal({
  projectId,
  code,
  enabled,
  maxAutoHeals = 5,
  cooldownMs = 5000,
  settings,
  onCodeFixed,
  isGenerating,
}: UseAutoHealOptions) {
  const [state, setState] = useState<AutoHealState>({
    isHealing: false,
    healCount: 0,
    lastHealedAt: null,
    lastErrors: [],
    status: "",
    qualityScore: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const errorQueueRef = useRef<RuntimeError[]>([]);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const healCountRef = useRef(0);
  const lastCodeRef = useRef(code);
  const isHealingRef = useRef(false);
  const lastHealedAtRef = useRef<number | null>(null);
  const prevCodeLengthRef = useRef(0);

  useEffect(() => {
    lastCodeRef.current = code;
  }, [code]);

  useEffect(() => {
    healCountRef.current = 0;
    setState(prev => ({ ...prev, healCount: 0, status: "", qualityScore: null }));
  }, [projectId]);

  useEffect(() => {
    const codeLenDiff = Math.abs(code.length - prevCodeLengthRef.current);
    if (codeLenDiff > 200 && healCountRef.current > 0) {
      healCountRef.current = 0;
      setState(prev => ({ ...prev, healCount: 0, status: "" }));
    }
    prevCodeLengthRef.current = code.length;
  }, [code]);

  useEffect(() => {
    if (isGenerating) {
      healCountRef.current = 0;
      errorQueueRef.current = [];
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      setState(prev => ({ ...prev, healCount: 0, status: "", isHealing: false }));
    }
  }, [isGenerating]);

  const processSSEBuffer = useCallback((rawBuffer: string): { events: Array<{ type: string; [key: string]: any }>; remaining: string } => {
    const events: Array<{ type: string; [key: string]: any }> = [];
    const blocks = rawBuffer.split("\n\n");
    const remaining = blocks.pop() || "";

    for (const block of blocks) {
      const lines = block.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            events.push(JSON.parse(line.slice(6)));
          } catch {
            // skip malformed JSON
          }
        }
      }
    }
    return { events, remaining };
  }, []);

  const triggerHeal = useCallback(async (errors: RuntimeError[]) => {
    if (!projectId || !enabled || isHealingRef.current) return;
    if (healCountRef.current >= maxAutoHeals) return;

    const now = Date.now();
    if (lastHealedAtRef.current && now - lastHealedAtRef.current < cooldownMs) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    healCountRef.current += 1;
    isHealingRef.current = true;
    setState(prev => ({
      ...prev,
      isHealing: true,
      lastErrors: errors,
      status: `Auto-healing ${errors.length} error(s)...`,
      healCount: healCountRef.current,
    }));

    try {
      const response = await fetch(`/api/runtime/auto-heal/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: lastCodeRef.current,
          errors,
          settings,
        }),
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Auto-heal request failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const { events, remaining } = processSSEBuffer(buffer);
        buffer = remaining;

        for (const event of events) {
          switch (event.type) {
            case "status":
              setState(prev => ({ ...prev, status: event.message }));
              break;
            case "fixed_code":
              if (event.code) {
                lastHealedAtRef.current = Date.now();
                setState(prev => ({
                  ...prev,
                  status: `Fixed ${event.errorsFixed} error(s)`,
                  qualityScore: event.qualityScore || null,
                  lastHealedAt: Date.now(),
                }));
                onCodeFixed?.(event.code);
              }
              break;
            case "done":
              receivedDone = true;
              isHealingRef.current = false;
              setState(prev => ({
                ...prev,
                isHealing: false,
                status: event.success ? "Healed successfully" : (event.message || "Fix failed"),
              }));
              break;
            case "error":
              receivedDone = true;
              isHealingRef.current = false;
              setState(prev => ({
                ...prev,
                isHealing: false,
                status: `Error: ${event.message}`,
              }));
              break;
          }
        }
      }

      if (!receivedDone) {
        isHealingRef.current = false;
        setState(prev => ({
          ...prev,
          isHealing: false,
          status: prev.status || "Stream ended",
        }));
      }
    } catch (err: any) {
      isHealingRef.current = false;
      if (err.name !== "AbortError") {
        setState(prev => ({
          ...prev,
          isHealing: false,
          status: `Auto-heal failed: ${err.message}`,
        }));
      } else {
        setState(prev => ({ ...prev, isHealing: false }));
      }
    }
  }, [projectId, enabled, maxAutoHeals, cooldownMs, settings, onCodeFixed, processSSEBuffer]);

  const reportError = useCallback((error: RuntimeError) => {
    if (!enabled || healCountRef.current >= maxAutoHeals || isHealingRef.current) return;

    errorQueueRef.current.push(error);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      const queued = [...errorQueueRef.current];
      errorQueueRef.current = [];
      if (queued.length > 0) {
        triggerHeal(queued);
      }
    }, 2000);
  }, [enabled, maxAutoHeals, triggerHeal]);

  const resetHealCount = useCallback(() => {
    healCountRef.current = 0;
    isHealingRef.current = false;
    lastHealedAtRef.current = null;
    errorQueueRef.current = [];
    setState({
      isHealing: false,
      healCount: 0,
      lastHealedAt: null,
      lastErrors: [],
      status: "",
      qualityScore: null,
    });
  }, []);

  const cancelHeal = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    errorQueueRef.current = [];
    isHealingRef.current = false;
    setState(prev => ({
      ...prev,
      isHealing: false,
      status: "Cancelled",
    }));
  }, []);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  return {
    ...state,
    reportError,
    resetHealCount,
    cancelHeal,
    canHeal: enabled && healCountRef.current < maxAutoHeals && !isHealingRef.current,
  };
}
