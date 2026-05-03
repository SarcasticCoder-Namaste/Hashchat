import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

const STORAGE_PREFIX = "feed-scroll:";
const RESTORE_TIMEOUT_MS = 4000;

function storageKey(path: string, key: string): string {
  return `${STORAGE_PREFIX}${path}::${key}`;
}

/**
 * Persists window scroll position keyed by current route + a stable key, and
 * restores it when the consumer remounts (e.g. after navigating back). The
 * restore retries until the page is tall enough to honor the saved offset, so
 * it works with infinite-scroll / virtualized content that grows over time.
 */
export function useScrollRestoration(key: string, ready: boolean): void {
  const [path] = useLocation();
  const fullKey = storageKey(path, key);
  const restoredRef = useRef(false);
  const lastSavedRef = useRef(0);

  useEffect(() => {
    restoredRef.current = false;
  }, [fullKey]);

  // Save scroll position as the user scrolls (throttled via rAF).
  useEffect(() => {
    let rafId: number | null = null;
    function onScroll() {
      if (rafId != null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        const y = window.scrollY;
        lastSavedRef.current = y;
        try {
          sessionStorage.setItem(fullKey, String(y));
        } catch {
          // sessionStorage may be unavailable (private mode, quota, etc.)
        }
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId != null) window.cancelAnimationFrame(rafId);
      try {
        sessionStorage.setItem(fullKey, String(window.scrollY));
      } catch {
        // ignore
      }
    };
  }, [fullKey]);

  // Restore scroll position when content is ready.
  useEffect(() => {
    if (!ready || restoredRef.current) return;
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(fullKey);
    } catch {
      return;
    }
    if (raw == null) {
      restoredRef.current = true;
      return;
    }
    const target = Number(raw);
    if (!Number.isFinite(target) || target <= 0) {
      restoredRef.current = true;
      return;
    }

    const start = performance.now();
    let cancelled = false;

    function attempt() {
      if (cancelled || restoredRef.current) return;
      const maxScroll =
        document.documentElement.scrollHeight - window.innerHeight;
      if (maxScroll >= target) {
        window.scrollTo({ top: target, behavior: "auto" });
        restoredRef.current = true;
        return;
      }
      if (performance.now() - start > RESTORE_TIMEOUT_MS) {
        // Give up; scroll as far as we can so the user is roughly in place.
        window.scrollTo({ top: Math.max(0, maxScroll), behavior: "auto" });
        restoredRef.current = true;
        return;
      }
      window.requestAnimationFrame(attempt);
    }

    attempt();
    return () => {
      cancelled = true;
    };
  }, [fullKey, ready]);
}
