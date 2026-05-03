import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeId =
  | "light"
  | "dark"
  | "midnight"
  | "ocean"
  | "forest"
  | "sunset"
  | "rose"
  | "mocha"
  | "lavender"
  | "emerald"
  | "cyberpunk"
  | "sakura"
  | "nord"
  | "dracula"
  | "solarized"
  | "coffee"
  | "sapphire"
  | "crimson"
  | "mint"
  | "gold"
  | "neon"
  | "peach"
  | "galaxy"
  | "lemon"
  | "ruby"
  | "arctic"
  | "moss"
  | "bubblegum"
  | "carbon"
  | "tangerine";

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  description: string;
  isDark: boolean;
  swatch: { bg: string; primary: string; accent: string };
}

export const THEMES: ThemeMeta[] = [
  {
    id: "light",
    label: "Light",
    description: "Clean white with violet accents",
    isDark: false,
    swatch: { bg: "#ffffff", primary: "#7c3aed", accent: "#ede9fe" },
  },
  {
    id: "dark",
    label: "Dark",
    description: "Deep midnight with rich violet",
    isDark: true,
    swatch: { bg: "#0b0b14", primary: "#a78bfa", accent: "#2a1d52" },
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "True black with electric cyan",
    isDark: true,
    swatch: { bg: "#000000", primary: "#22d3ee", accent: "#083a44" },
  },
  {
    id: "ocean",
    label: "Ocean",
    description: "Crisp aqua with deep sky",
    isDark: false,
    swatch: { bg: "#f0f9ff", primary: "#0284c7", accent: "#bae6fd" },
  },
  {
    id: "forest",
    label: "Forest",
    description: "Soft cream with deep emerald",
    isDark: false,
    swatch: { bg: "#f6faf2", primary: "#16a34a", accent: "#bbf7d0" },
  },
  {
    id: "sunset",
    label: "Sunset",
    description: "Warm peach with coral",
    isDark: false,
    swatch: { bg: "#fff7ed", primary: "#ea580c", accent: "#fed7aa" },
  },
  {
    id: "rose",
    label: "Rose",
    description: "Soft pink with rose accents",
    isDark: false,
    swatch: { bg: "#fff1f5", primary: "#e11d74", accent: "#fbcfe1" },
  },
  {
    id: "mocha",
    label: "Mocha",
    description: "Warm dark brown with amber",
    isDark: true,
    swatch: { bg: "#1a1410", primary: "#f59e0b", accent: "#3a2a1a" },
  },
  {
    id: "lavender",
    label: "Lavender",
    description: "Soft lilac with plum",
    isDark: false,
    swatch: { bg: "#faf5ff", primary: "#a21caf", accent: "#f3e8ff" },
  },
  {
    id: "emerald",
    label: "Emerald Night",
    description: "Deep forest with bright emerald",
    isDark: true,
    swatch: { bg: "#06140e", primary: "#34d399", accent: "#0e3a2a" },
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    description: "Neon magenta on jet black",
    isDark: true,
    swatch: { bg: "#0a0014", primary: "#ff2bd6", accent: "#1a0833" },
  },
  {
    id: "sakura",
    label: "Sakura",
    description: "Cherry blossom pink and cream",
    isDark: false,
    swatch: { bg: "#fff5f7", primary: "#db2777", accent: "#fce7f3" },
  },
  {
    id: "nord",
    label: "Nord",
    description: "Cool frost blues and slate",
    isDark: false,
    swatch: { bg: "#eceff4", primary: "#5e81ac", accent: "#d8dee9" },
  },
  {
    id: "dracula",
    label: "Dracula",
    description: "Cult classic purple and pink",
    isDark: true,
    swatch: { bg: "#282a36", primary: "#bd93f9", accent: "#44475a" },
  },
  {
    id: "solarized",
    label: "Solarized",
    description: "Warm cream with teal",
    isDark: false,
    swatch: { bg: "#fdf6e3", primary: "#268bd2", accent: "#eee8d5" },
  },
  {
    id: "coffee",
    label: "Coffee",
    description: "Cream and espresso brown",
    isDark: false,
    swatch: { bg: "#faf3e7", primary: "#7b3f00", accent: "#e8d8c2" },
  },
  {
    id: "sapphire",
    label: "Sapphire",
    description: "Deep blue with bright sky",
    isDark: true,
    swatch: { bg: "#060a1f", primary: "#3b82f6", accent: "#10204a" },
  },
  {
    id: "crimson",
    label: "Crimson",
    description: "Black with bold crimson",
    isDark: true,
    swatch: { bg: "#120606", primary: "#ef4444", accent: "#3a0e0e" },
  },
  {
    id: "mint",
    label: "Mint",
    description: "Crisp mint and white",
    isDark: false,
    swatch: { bg: "#f0fdf4", primary: "#10b981", accent: "#a7f3d0" },
  },
  {
    id: "gold",
    label: "Gold",
    description: "Black tie with rich gold",
    isDark: true,
    swatch: { bg: "#0d0a05", primary: "#eab308", accent: "#3a2a06" },
  },
  {
    id: "neon",
    label: "Neon",
    description: "Electric lime on jet black",
    isDark: true,
    swatch: { bg: "#050a05", primary: "#84ff00", accent: "#0d2a0d" },
  },
  {
    id: "peach",
    label: "Peach",
    description: "Soft peach pastel and coral",
    isDark: false,
    swatch: { bg: "#fff4ec", primary: "#fb7185", accent: "#ffe1d2" },
  },
  {
    id: "galaxy",
    label: "Galaxy",
    description: "Cosmic purple with starlight",
    isDark: true,
    swatch: { bg: "#0a0420", primary: "#a855f7", accent: "#1f0f4a" },
  },
  {
    id: "lemon",
    label: "Lemon",
    description: "Bright zesty yellow and white",
    isDark: false,
    swatch: { bg: "#fefce8", primary: "#ca8a04", accent: "#fef08a" },
  },
  {
    id: "ruby",
    label: "Ruby",
    description: "Rich wine red on charcoal",
    isDark: true,
    swatch: { bg: "#1a0810", primary: "#e11d48", accent: "#3a0e1f" },
  },
  {
    id: "arctic",
    label: "Arctic",
    description: "Icy blue with crisp white",
    isDark: false,
    swatch: { bg: "#f0f9ff", primary: "#0ea5e9", accent: "#e0f2fe" },
  },
  {
    id: "moss",
    label: "Moss",
    description: "Earthy moss with deep olive",
    isDark: true,
    swatch: { bg: "#0f140a", primary: "#84cc16", accent: "#243011" },
  },
  {
    id: "bubblegum",
    label: "Bubblegum",
    description: "Playful pink and lilac",
    isDark: false,
    swatch: { bg: "#fff0f7", primary: "#ec4899", accent: "#fbcfe8" },
  },
  {
    id: "carbon",
    label: "Carbon",
    description: "Monochrome charcoal and silver",
    isDark: true,
    swatch: { bg: "#0a0a0a", primary: "#a3a3a3", accent: "#1f1f1f" },
  },
  {
    id: "tangerine",
    label: "Tangerine",
    description: "Vibrant orange with cream",
    isDark: false,
    swatch: { bg: "#fff7ed", primary: "#f97316", accent: "#ffedd5" },
  },
];

const STORAGE_KEY = "hashchat:theme";
const DEFAULT_THEME: ThemeId = "light";

function isThemeId(v: unknown): v is ThemeId {
  return typeof v === "string" && THEMES.some((t) => t.id === v);
}

function readStoredTheme(): ThemeId {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (isThemeId(v)) return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME;
}

export function applyThemeToDocument(themeId: ThemeId) {
  if (typeof document === "undefined") return;
  const meta = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
  const root = document.documentElement;
  root.setAttribute("data-theme", meta.id);
  if (meta.isDark) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
  themes: ThemeMeta[];
  resolvedTheme: "light" | "dark";
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => readStoredTheme());

  useEffect(() => {
    applyThemeToDocument(theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  // Cross-tab sync
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY && isThemeId(e.newValue)) {
        setThemeState(e.newValue);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setTheme = useCallback((id: ThemeId) => {
    setThemeState(isThemeId(id) ? id : DEFAULT_THEME);
  }, []);

  const resolvedTheme: "light" | "dark" = useMemo(() => {
    const meta = THEMES.find((t) => t.id === theme);
    return meta?.isDark ? "dark" : "light";
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, themes: THEMES, resolvedTheme }),
    [theme, setTheme, resolvedTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within <ThemeProvider>");
  }
  return ctx;
}
