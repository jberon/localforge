import { useEffect } from "react";

interface ShortcutAction {
  key: string;
  cmdOrCtrl?: boolean;
  shiftKey?: boolean;
  action: () => void;
  description: string;
}

export function useKeyboardShortcuts(shortcuts: ShortcutAction[]) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      for (const shortcut of shortcuts) {
        const isCmdOrCtrlPressed = event.metaKey || event.ctrlKey;
        
        if (
          event.key.toLowerCase() === shortcut.key.toLowerCase() &&
          (shortcut.cmdOrCtrl ? isCmdOrCtrlPressed : true) &&
          (shortcut.shiftKey ? event.shiftKey : !event.shiftKey)
        ) {
          const target = event.target as HTMLElement;
          const isInputField = 
            target.tagName === "INPUT" || 
            target.tagName === "TEXTAREA" || 
            target.isContentEditable;

          if (isInputField && !shortcut.cmdOrCtrl) {
            continue;
          }

          event.preventDefault();
          shortcut.action();
          break;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcuts]);
}
