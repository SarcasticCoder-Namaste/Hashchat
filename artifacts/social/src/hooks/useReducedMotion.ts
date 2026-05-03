import { useEffect, useState } from "react";

const PREF_KEY = "hashchat:pref:reducedMotion";
const PREF_EVENT = "hashchat:pref-change";

type ReducedMotionPref = "system" | "always";

function readPref(): ReducedMotionPref {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(PREF_KEY);
    if (raw === '"always"' || raw === "always") return "always";
  } catch {
    /* ignore */
  }
  return "system";
}

function applyDocumentAttr(value: ReducedMotionPref): void {
  if (typeof document === "undefined") return;
  if (value === "always") {
    document.documentElement.setAttribute("data-reduced-motion", "always");
  } else {
    document.documentElement.removeAttribute("data-reduced-motion");
  }
}

export function setReducedMotionPref(next: ReducedMotionPref): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREF_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  applyDocumentAttr(next);
  window.dispatchEvent(
    new CustomEvent(PREF_EVENT, {
      detail: { key: "reducedMotion", value: next },
    }),
  );
}

if (typeof window !== "undefined") {
  applyDocumentAttr(readPref());
}

export function getReducedMotionPref(): ReducedMotionPref {
  return readPref();
}

/**
 * Returns true if motion should be reduced — either because the user opted in
 * via settings or because the OS exposes `prefers-reduced-motion: reduce`.
 */
export function useReducedMotion(): boolean {
  const [value, setValue] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    if (readPref() === "always") return true;
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const recompute = () => {
      setValue(readPref() === "always" || mq.matches);
    };
    mq.addEventListener?.("change", recompute);
    const onPref = (e: Event) => {
      const detail = (e as CustomEvent<{ key: string }>).detail;
      if (detail?.key === "reducedMotion") recompute();
    };
    window.addEventListener(PREF_EVENT, onPref);
    return () => {
      mq.removeEventListener?.("change", recompute);
      window.removeEventListener(PREF_EVENT, onPref);
    };
  }, []);

  return value;
}
