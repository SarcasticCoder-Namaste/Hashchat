import { useEffect, useState } from "react";
import en from "./messages/en.json";
import es from "./messages/es.json";

export type Locale = "en" | "es";

const CATALOGS: Record<Locale, Record<string, string>> = {
  en: en as Record<string, string>,
  es: es as Record<string, string>,
};

export const SUPPORTED_LOCALES: { code: Locale; nameKey: string }[] = [
  { code: "en", nameKey: "settings.languageEnglish" },
  { code: "es", nameKey: "settings.languageSpanish" },
];

const STORAGE_KEY = "hashchat:locale";
const CHANGE_EVENT = "hashchat:locale-change";

function detectInitial(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "es") return stored;
    const nav = window.navigator?.language?.toLowerCase() ?? "en";
    if (nav.startsWith("es")) return "es";
  } catch {
    /* ignore */
  }
  return "en";
}

let currentLocale: Locale = detectInitial();
if (typeof document !== "undefined") {
  document.documentElement.lang = currentLocale;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(next: Locale): void {
  currentLocale = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = next;
  }
}

function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const v = vars[key];
    return v === undefined || v === null ? `{${key}}` : String(v);
  });
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const catalog = CATALOGS[currentLocale] ?? CATALOGS.en;
  const template = catalog[key] ?? CATALOGS.en[key] ?? key;
  return format(template, vars);
}

export function useTranslation(): {
  t: (key: string, vars?: Record<string, string | number>) => string;
  locale: Locale;
  setLocale: (next: Locale) => void;
} {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const handler = () => setVersion((v) => v + 1);
    window.addEventListener(CHANGE_EVENT, handler);
    return () => window.removeEventListener(CHANGE_EVENT, handler);
  }, []);
  return {
    t: (key, vars) => t(key, vars),
    locale: currentLocale,
    setLocale,
  };
}
