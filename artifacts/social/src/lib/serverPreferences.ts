import { useEffect, useRef } from "react";
import { useUser } from "@clerk/react";
import {
  useGetMyPreferences,
  useUpdateMyPreferences,
  getGetMyPreferencesQueryKey,
  type UserPreferences,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme, type ThemeId } from "@/components/ThemeProvider";

export interface AccentMeta {
  id: string;
  label: string;
  swatch: string;
  // Each value is an HSL "h s% l%" string used to override --primary/--ring.
  primary: string | null;
  ring: string | null;
}

export const ACCENTS: AccentMeta[] = [
  { id: "default", label: "Theme default", swatch: "linear-gradient(135deg,#7c3aed,#ec4899)", primary: null, ring: null },
  { id: "violet", label: "Violet", swatch: "#7c3aed", primary: "262 83% 58%", ring: "262 83% 58%" },
  { id: "blue", label: "Blue", swatch: "#3b82f6", primary: "217 91% 60%", ring: "217 91% 60%" },
  { id: "cyan", label: "Cyan", swatch: "#06b6d4", primary: "189 94% 43%", ring: "189 94% 43%" },
  { id: "emerald", label: "Emerald", swatch: "#10b981", primary: "160 84% 39%", ring: "160 84% 39%" },
  { id: "amber", label: "Amber", swatch: "#f59e0b", primary: "38 92% 50%", ring: "38 92% 50%" },
  { id: "rose", label: "Rose", swatch: "#f43f5e", primary: "346 84% 56%", ring: "346 84% 56%" },
  { id: "pink", label: "Pink", swatch: "#ec4899", primary: "330 81% 60%", ring: "330 81% 60%" },
];

const ACCENT_KEY = "hashchat:accent";

export function applyAccentToDocument(accentId: string) {
  if (typeof document === "undefined") return;
  const accent = ACCENTS.find((a) => a.id === accentId) ?? ACCENTS[0];
  const root = document.documentElement;
  if (!accent.primary) {
    root.style.removeProperty("--primary");
    root.style.removeProperty("--ring");
  } else {
    root.style.setProperty("--primary", accent.primary);
    if (accent.ring) root.style.setProperty("--ring", accent.ring);
  }
  root.dataset.accent = accent.id;
  try {
    window.localStorage.setItem(ACCENT_KEY, accent.id);
  } catch {
    /* ignore */
  }
}

export function readStoredAccent(): string {
  if (typeof window === "undefined") return "default";
  try {
    const v = window.localStorage.getItem(ACCENT_KEY);
    if (v && ACCENTS.some((a) => a.id === v)) return v;
  } catch {
    /* ignore */
  }
  return "default";
}

export function applyStoredAccent() {
  applyAccentToDocument(readStoredAccent());
}

/**
 * Hook that reads server-stored preferences once the user is signed-in
 * and applies theme + accent locally. Also re-syncs theme/accent back
 * to the server when the user changes them locally.
 */
export function useSyncedPreferences(): {
  prefs: UserPreferences | undefined;
  isLoading: boolean;
} {
  const { user } = useUser();
  const enabled = !!user;
  const { data, isLoading } = useGetMyPreferences({
    query: {
      queryKey: getGetMyPreferencesQueryKey(),
      enabled,
      staleTime: 60_000,
    },
  });
  const { setTheme, theme } = useTheme();
  const queryClient = useQueryClient();
  const updateMut = useUpdateMyPreferences({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getGetMyPreferencesQueryKey(),
        });
      },
    },
  });

  // First sync: apply server values to local state once on load.
  const appliedRef = useRef(false);
  useEffect(() => {
    if (!data || appliedRef.current) return;
    appliedRef.current = true;
    if (data.theme && data.theme !== theme) {
      setTheme(data.theme as ThemeId);
    }
    applyAccentToDocument(data.accent ?? "default");
  }, [data, setTheme, theme]);

  // Push local theme back to the server when it changes after the first sync.
  const lastSyncedTheme = useRef<string | null>(null);
  useEffect(() => {
    if (!data || !appliedRef.current) return;
    if (lastSyncedTheme.current === null) {
      lastSyncedTheme.current = data.theme;
      return;
    }
    if (theme && theme !== lastSyncedTheme.current && theme !== data.theme) {
      lastSyncedTheme.current = theme;
      updateMut.mutate({ data: { theme } });
    }
  }, [theme, data, updateMut]);

  return { prefs: data, isLoading };
}
