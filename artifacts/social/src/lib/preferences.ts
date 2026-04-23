import { useCallback, useEffect, useState } from "react";

const PREFIX = "hashchat:pref:";

export const PREF_KEYS = {
  notifSound: "notifSound",
  notifMentions: "notifMentions",
  notifFriendRequests: "notifFriendRequests",
  notifMarketing: "notifMarketing",
  privShowOnline: "privShowOnline",
  privDmsFromStrangers: "privDmsFromStrangers",
  privReadReceipts: "privReadReceipts",
  privProfileSearchable: "privProfileSearchable",
  chatCompact: "chatCompact",
  chatEnterToSend: "chatEnterToSend",
  chatShowSeconds: "chatShowSeconds",
  chatAutoplayMedia: "chatAutoplayMedia",
} as const;

export type PrefKey = (typeof PREF_KEYS)[keyof typeof PREF_KEYS];

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    window.dispatchEvent(
      new CustomEvent("hashchat:pref-change", { detail: { key, value } }),
    );
  } catch {
    /* ignore quota errors */
  }
}

export function usePref<T>(key: PrefKey, fallback: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => read<T>(key, fallback));
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ key: string; value: unknown }>).detail;
      if (detail?.key === key) setValue(detail.value as T);
    };
    window.addEventListener("hashchat:pref-change", handler);
    return () => window.removeEventListener("hashchat:pref-change", handler);
  }, [key]);
  const setter = useCallback(
    (next: T) => {
      setValue(next);
      write(key, next);
    },
    [key],
  );
  return [value, setter];
}

export function getPref<T>(key: PrefKey, fallback: T): T {
  return read<T>(key, fallback);
}

declare global {
  interface Window {
    __hashchatRootPrefsBound?: boolean;
  }
}

/** Apply preferences that affect the document root (idempotent — safe under HMR). */
export function applyRootPreferences(): void {
  if (typeof document === "undefined") return;
  const compact = read<boolean>(PREF_KEYS.chatCompact, false);
  document.documentElement.dataset.density = compact ? "compact" : "cozy";
  if (window.__hashchatRootPrefsBound) return;
  window.__hashchatRootPrefsBound = true;
  window.addEventListener("hashchat:pref-change", (e) => {
    const detail = (e as CustomEvent<{ key: string; value: unknown }>).detail;
    if (detail?.key === PREF_KEYS.chatCompact) {
      document.documentElement.dataset.density = detail.value
        ? "compact"
        : "cozy";
    }
  });
}
