export type GradientPreset = {
  id: string;
  name: string;
  from: string;
  to: string;
};

export const BANNER_PRESETS: GradientPreset[] = [
  { id: "violet-pink",   name: "Violet Sunset", from: "#8b5cf6", to: "#ec4899" },
  { id: "cyan-blue",     name: "Ocean",         from: "#22d3ee", to: "#3b82f6" },
  { id: "emerald-teal",  name: "Forest",        from: "#10b981", to: "#0d9488" },
  { id: "amber-rose",    name: "Sunrise",       from: "#fbbf24", to: "#f43f5e" },
  { id: "indigo-purple", name: "Midnight",      from: "#4338ca", to: "#7c3aed" },
  { id: "lime-emerald",  name: "Spring",        from: "#a3e635", to: "#10b981" },
  { id: "rose-fuchsia",  name: "Bloom",         from: "#fb7185", to: "#d946ef" },
  { id: "slate-zinc",    name: "Graphite",      from: "#475569", to: "#27272a" },
];

export const AVATAR_EMOJIS = [
  "😎", "🦊", "🐱", "🐼", "🦄", "🐙", "🦋", "🐯",
  "🌸", "🌈", "🍕", "🎮", "🎧", "🚀", "⚡", "🔥",
];

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function bannerPresetToUrl(p: GradientPreset): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="240" viewBox="0 0 800 240"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${p.from}"/><stop offset="100%" stop-color="${p.to}"/></linearGradient></defs><rect width="800" height="240" fill="url(#g)"/></svg>`;
  return svgToDataUrl(svg);
}

export function avatarPresetToUrl(emoji: string, p: GradientPreset): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${p.from}"/><stop offset="100%" stop-color="${p.to}"/></linearGradient></defs><rect width="240" height="240" fill="url(#g)"/><text x="50%" y="50%" font-size="140" text-anchor="middle" dominant-baseline="central" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">${emoji}</text></svg>`;
  return svgToDataUrl(svg);
}
