import { useState, useCallback, useEffect } from "react";

interface UseLLMConnectionOptions {
  endpoint: string;
  model?: string;
  pollInterval?: number;
}

interface UseLLMConnectionReturn {
  isConnected: boolean | null;
  loadedModel: string | null;
  isChecking: boolean;
  checkConnection: () => Promise<void>;
}

export function useLLMConnection({
  endpoint,
  model,
  pollInterval = 30000,
}: UseLLMConnectionOptions): UseLLMConnectionReturn {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [loadedModel, setLoadedModel] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const checkConnection = useCallback(async () => {
    setIsChecking(true);
    try {
      const response = await fetch("/api/llm/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
      const data = await response.json();
      setIsConnected(data.connected);
      if (data.connected && data.models?.length > 0) {
        const activeModel = model || data.models[0];
        setLoadedModel(activeModel);
      } else {
        setLoadedModel(null);
      }
    } catch {
      setIsConnected(false);
      setLoadedModel(null);
    } finally {
      setIsChecking(false);
    }
  }, [endpoint, model]);

  useEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, pollInterval);
    return () => clearInterval(interval);
  }, [checkConnection, pollInterval]);

  return {
    isConnected,
    loadedModel,
    isChecking,
    checkConnection,
  };
}
