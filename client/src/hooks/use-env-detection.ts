import { useState, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";

interface DetectedEnvVar {
  name: string;
  category: "api_key" | "database" | "auth" | "service_url" | "config" | "secret";
  description: string;
  required: boolean;
  example: string;
  setupUrl?: string;
}

interface EnvDetectionResult {
  variables: DetectedEnvVar[];
  hasSecrets: boolean;
  setupInstructions: string;
}

export function useEnvDetection(projectId: string | number | null) {
  const [result, setResult] = useState<EnvDetectionResult | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const detect = useCallback(async (code: string) => {
    if (!projectId || !code || code.length < 50) return;

    setIsDetecting(true);
    try {
      const response = await apiRequest("POST", `/api/runtime/detect-env/${projectId}`, { code });
      const data: EnvDetectionResult = await response.json();

      if (data.variables.length > 0) {
        setResult(data);
        setDismissed(false);
      } else {
        setResult(null);
      }
    } catch (err) {
      console.error("[env-detection] Failed:", err);
    } finally {
      setIsDetecting(false);
    }
  }, [projectId]);

  const dismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  return {
    result: dismissed ? null : result,
    isDetecting,
    detect,
    dismiss,
    hasEnvVars: result !== null && result.variables.length > 0 && !dismissed,
  };
}
