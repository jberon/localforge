import { useRef, useCallback, useState } from "react";

interface SSEStreamOptions {
  onEvent: (event: { type: string; [key: string]: any }) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
}

interface SSEStreamReturn {
  startStream: (url: string, options?: RequestInit) => Promise<void>;
  cancelStream: () => void;
  isStreaming: boolean;
  reconnectCount: number;
}

export function useSSEStream({
  onEvent,
  onError,
  onComplete,
  maxReconnectAttempts = 3,
  reconnectDelay = 1000,
}: SSEStreamOptions): SSEStreamReturn {
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);
  const reconnectAttemptsRef = useRef(0);

  const cancelStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    reconnectAttemptsRef.current = 0;
    setReconnectCount(0);
  }, []);

  const startStream = useCallback(
    async (url: string, options?: RequestInit) => {
      cancelStream();

      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsStreaming(true);
      reconnectAttemptsRef.current = 0;
      setReconnectCount(0);

      const attemptConnection = async (): Promise<void> => {
        try {
          const response = await fetch(url, {
            ...options,
            signal: controller.signal,
          });

          if (!response.ok) {
            const contentType = response.headers.get("content-type") || "";
            if (!contentType.includes("text/event-stream")) {
              // Safely handle non-JSON error responses
              let errorMessage = `Server error: ${response.status}`;
              try {
                if (contentType.includes("application/json")) {
                  const errorData = await response.json();
                  errorMessage = errorData.error || errorData.message || errorMessage;
                } else {
                  const text = await response.text();
                  // Don't expose HTML content, just use status
                  if (!text.startsWith("<!DOCTYPE") && !text.startsWith("<html")) {
                    errorMessage = text.slice(0, 200) || errorMessage;
                  }
                }
              } catch {
                // Use default error message if parsing fails
              }
              throw new Error(errorMessage);
            }
          }

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();

          if (!reader) {
            throw new Error("No response body");
          }

          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              reconnectAttemptsRef.current = 0;
              setReconnectCount(0);
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split("\n\n");
            buffer = events.pop() || "";

            for (const event of events) {
              const lines = event.split("\n");
              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  try {
                    const rawData = line.slice(6);
                    // Skip empty or whitespace-only data
                    if (!rawData.trim()) continue;
                    
                    const data = JSON.parse(rawData);
                    onEvent(data);

                    if (data.type === "done" || data.type === "complete") {
                      onComplete?.();
                    } else if (data.type === "error") {
                      onError?.(new Error(data.error || data.message));
                    }
                  } catch (parseError) {
                    // Log parse errors in development for debugging
                    if (process.env.NODE_ENV === "development") {
                      console.warn("[SSE] JSON parse error:", parseError, "Raw:", line.slice(6, 100));
                    }
                  }
                }
              }
            }
          }

          onComplete?.();
        } catch (error: any) {
          if (error.name === "AbortError") {
            return;
          }

          if (
            reconnectAttemptsRef.current < maxReconnectAttempts &&
            (error.message?.includes("network") ||
              error.message?.includes("connection") ||
              error.message?.includes("timeout"))
          ) {
            reconnectAttemptsRef.current++;
            setReconnectCount(reconnectAttemptsRef.current);

            const delay = reconnectDelay * Math.pow(2, reconnectAttemptsRef.current - 1);
            await new Promise((resolve) => setTimeout(resolve, delay));

            if (!controller.signal.aborted) {
              return attemptConnection();
            }
          }

          onError?.(error);
        } finally {
          if (abortControllerRef.current === controller) {
            setIsStreaming(false);
          }
        }
      };

      await attemptConnection();
    },
    [onEvent, onError, onComplete, maxReconnectAttempts, reconnectDelay, cancelStream]
  );

  return {
    startStream,
    cancelStream,
    isStreaming,
    reconnectCount,
  };
}
