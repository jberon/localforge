import { useState, useCallback, useEffect } from "react";

interface UseLLMConnectionOptions {
  endpoint: string;
  model?: string;
  pollInterval?: number;
}

interface QueueStatus {
  pending: number;
  active: number;
  maxQueueSize?: number;
  utilizationPercent?: number;
  isOverloaded?: boolean;
  isFull?: boolean;
}

interface ConnectionHealth {
  isHealthy: boolean;
  consecutiveFailures: number;
  lastError?: string;
}

interface Telemetry {
  avgTokensPerSecond: number;
  lastTokensPerSecond: number;
  warnings: string[];
}

interface UseLLMConnectionReturn {
  isConnected: boolean | null;
  loadedModel: string | null;
  availableModels: string[];
  queueStatus: QueueStatus | null;
  health: ConnectionHealth | null;
  telemetry: Telemetry | null;
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
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [health, setHealth] = useState<ConnectionHealth | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
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
        setAvailableModels(data.models);
        const activeModel = model || data.models[0];
        setLoadedModel(activeModel);
      } else {
        setAvailableModels([]);
        setLoadedModel(null);
      }
      
      if (data.queueStatus) {
        setQueueStatus(data.queueStatus);
      }
      if (data.health) {
        setHealth(data.health);
      }
      if (data.telemetry) {
        setTelemetry({
          avgTokensPerSecond: data.telemetry.avgTokensPerSecond,
          lastTokensPerSecond: data.telemetry.lastTokensPerSecond,
          warnings: data.telemetry.warnings || [],
        });
      }
    } catch {
      setIsConnected(false);
      setAvailableModels([]);
      setLoadedModel(null);
      setQueueStatus(null);
      setHealth(null);
      setTelemetry(null);
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
    availableModels,
    queueStatus,
    health,
    telemetry,
    isChecking,
    checkConnection,
  };
}
