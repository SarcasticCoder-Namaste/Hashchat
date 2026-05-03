import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { moveFeedFocus, openFeedFocused } from "@/lib/feedFocus";

export type Shortcut = {
  keys: string;
  description: string;
  group: string;
};

export const SHORTCUTS: Shortcut[] = [
  { keys: "j", description: "Next item in feed", group: "Feed" },
  { keys: "k", description: "Previous item in feed", group: "Feed" },
  { keys: "r", description: "Open thread / reply", group: "Feed" },
  { keys: "/", description: "Focus search", group: "Navigation" },
  { keys: "g h", description: "Go to Home", group: "Navigation" },
  { keys: "g m", description: "Go to Messages", group: "Navigation" },
  { keys: "g d", description: "Go to Discover", group: "Navigation" },
  { keys: "g r", description: "Go to Rooms", group: "Navigation" },
  { keys: "?", description: "Show this cheat sheet", group: "General" },
  { keys: "Esc", description: "Close dialog / dropdown", group: "General" },
];

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

function focusSearch(): void {
  const el = document.querySelector<HTMLInputElement>(
    '[data-testid="input-global-search"]',
  );
  el?.focus();
}

type Opts = {
  onShowCheatSheet: () => void;
};

export function useKeyboardShortcuts({ onShowCheatSheet }: Opts): void {
  const [, setLocation] = useLocation();
  const pendingGRef = useRef<number | null>(null);

  useEffect(() => {
    function clearPendingG() {
      if (pendingGRef.current) {
        window.clearTimeout(pendingGRef.current);
        pendingGRef.current = null;
      }
    }

    function handler(e: KeyboardEvent) {
      // Ignore when modifier keys are involved (let browser/OS shortcuts pass).
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (isTypingTarget(e.target)) return;

      const key = e.key;

      // "g x" sequences
      if (pendingGRef.current) {
        clearPendingG();
        const lower = key.toLowerCase();
        if (lower === "h") {
          e.preventDefault();
          setLocation("/app/home");
          return;
        }
        if (lower === "m") {
          e.preventDefault();
          setLocation("/app/messages");
          return;
        }
        if (lower === "d") {
          e.preventDefault();
          setLocation("/app/discover");
          return;
        }
        if (lower === "r") {
          e.preventDefault();
          setLocation("/app/rooms");
          return;
        }
        return;
      }

      if (key === "g" || key === "G") {
        pendingGRef.current = window.setTimeout(clearPendingG, 1200);
        return;
      }

      if (key === "j") {
        e.preventDefault();
        moveFeedFocus(1);
        return;
      }
      if (key === "k") {
        e.preventDefault();
        moveFeedFocus(-1);
        return;
      }
      if (key === "r") {
        e.preventDefault();
        openFeedFocused((p) => setLocation(p));
        return;
      }
      if (key === "/") {
        e.preventDefault();
        focusSearch();
        return;
      }
      if (key === "?") {
        e.preventDefault();
        onShowCheatSheet();
        return;
      }
    }

    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      clearPendingG();
    };
  }, [onShowCheatSheet, setLocation]);
}
