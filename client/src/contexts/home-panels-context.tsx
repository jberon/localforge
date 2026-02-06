import { createContext, useContext, useReducer, useCallback, useMemo, type ReactNode } from "react";

interface HomePanelsState {
  showFileExplorer: boolean;
  showDatabasePanel: boolean;
  showAIInsights: boolean;
  showSelfTesting: boolean;
  showSmartModel: boolean;
  showImageImport: boolean;
  showHomeSettings: boolean;
  showQuickUndo: boolean;
}

interface HomePanelsContextValue extends HomePanelsState {
  togglePanel: (panel: keyof HomePanelsState) => void;
  setPanel: (panel: keyof HomePanelsState, value: boolean) => void;
  closeAllPanels: () => void;
}

type HomePanelsAction =
  | { type: "TOGGLE_PANEL"; panel: keyof HomePanelsState }
  | { type: "SET_PANEL"; panel: keyof HomePanelsState; value: boolean }
  | { type: "CLOSE_ALL" };

const initialState: HomePanelsState = {
  showFileExplorer: false,
  showDatabasePanel: false,
  showAIInsights: false,
  showSelfTesting: false,
  showSmartModel: false,
  showImageImport: false,
  showHomeSettings: false,
  showQuickUndo: false,
};

function homePanelsReducer(state: HomePanelsState, action: HomePanelsAction): HomePanelsState {
  switch (action.type) {
    case "TOGGLE_PANEL":
      return { ...state, [action.panel]: !state[action.panel] };
    case "SET_PANEL":
      if (state[action.panel] === action.value) return state;
      return { ...state, [action.panel]: action.value };
    case "CLOSE_ALL":
      return { ...initialState };
    default:
      return state;
  }
}

const HomePanelsContext = createContext<HomePanelsContextValue | null>(null);

export function HomePanelsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(homePanelsReducer, initialState);

  const togglePanel = useCallback((panel: keyof HomePanelsState) => {
    dispatch({ type: "TOGGLE_PANEL", panel });
  }, []);

  const setPanel = useCallback((panel: keyof HomePanelsState, value: boolean) => {
    dispatch({ type: "SET_PANEL", panel, value });
  }, []);

  const closeAllPanels = useCallback(() => {
    dispatch({ type: "CLOSE_ALL" });
  }, []);

  const value = useMemo<HomePanelsContextValue>(() => ({
    ...state,
    togglePanel,
    setPanel,
    closeAllPanels,
  }), [state, togglePanel, setPanel, closeAllPanels]);

  return (
    <HomePanelsContext.Provider value={value}>
      {children}
    </HomePanelsContext.Provider>
  );
}

export function useHomePanels(): HomePanelsContextValue {
  const context = useContext(HomePanelsContext);
  if (!context) {
    throw new Error("useHomePanels must be used within a HomePanelsProvider");
  }
  return context;
}
