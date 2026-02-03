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
            if (!response.headers.get("content-type")?.includes("text/event-stream")) {
              const errorData = await response.json();
              throw new Error(errorData.error || `Server error: ${response.status}`);
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
                    const data = JSON.parse(line.slice(6));
                    onEvent(data);

                    if (data.type === "done" || data.type === "complete") {
                      onComplete?.();
                    } else if (data.type === "error") {
                      onError?.(new Error(data.error || data.message));
                    }
                  } catch {
                    // Ignore parse errors for incomplete JSON
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
