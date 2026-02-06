import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface GenerationState {
  isGenerating: boolean;
  generationPhase: string | null;
  streamingCode: string;
  showCelebration: boolean;
  lastError: { message: string; prompt?: string } | null;
}

interface GenerationContextValue extends GenerationState {
  setIsGenerating: (v: boolean) => void;
  setGenerationPhase: (v: string | null) => void;
  setStreamingCode: (v: string) => void;
  setShowCelebration: (v: boolean) => void;
  setLastError: (v: { message: string; prompt?: string } | null) => void;
}

const GenerationContext = createContext<GenerationContextValue | null>(null);

export function GenerationProvider({ children }: { children: ReactNode }) {
  const [isGenerating, setIsGeneratingRaw] = useState(false);
  const [generationPhase, setGenerationPhaseRaw] = useState<string | null>(null);
  const [streamingCode, setStreamingCodeRaw] = useState("");
  const [showCelebration, setShowCelebrationRaw] = useState(false);
  const [lastError, setLastErrorRaw] = useState<{ message: string; prompt?: string } | null>(null);

  const setIsGenerating = useCallback((v: boolean) => setIsGeneratingRaw(v), []);
  const setGenerationPhase = useCallback((v: string | null) => setGenerationPhaseRaw(v), []);
  const setStreamingCode = useCallback((v: string) => setStreamingCodeRaw(v), []);
  const setShowCelebration = useCallback((v: boolean) => setShowCelebrationRaw(v), []);
  const setLastError = useCallback((v: { message: string; prompt?: string } | null) => setLastErrorRaw(v), []);

  const value: GenerationContextValue = {
    isGenerating,
    generationPhase,
    streamingCode,
    showCelebration,
    lastError,
    setIsGenerating,
    setGenerationPhase,
    setStreamingCode,
    setShowCelebration,
    setLastError,
  };

  return (
    <GenerationContext.Provider value={value}>
      {children}
    </GenerationContext.Provider>
  );
}

export function useGeneration(): GenerationContextValue {
  const context = useContext(GenerationContext);
  if (!context) {
    throw new Error("useGeneration must be used within a GenerationProvider");
  }
  return context;
}
