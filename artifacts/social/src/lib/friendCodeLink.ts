const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function normalizeFriendCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/^#/, "")
    .replace(/[^A-Z0-9]/g, "");
}

export function buildFriendCodeLink(code: string): string {
  const normalized = normalizeFriendCode(code);
  if (typeof window === "undefined") {
    return `${basePath}/app/discover?friendCode=${normalized}`;
  }
  return `${window.location.origin}${basePath}/app/discover?friendCode=${normalized}`;
}

export function extractFriendCodeFromText(text: string): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  try {
    const url = new URL(trimmed);
    const param =
      url.searchParams.get("friendCode") ?? url.searchParams.get("code");
    if (param) {
      const norm = normalizeFriendCode(param);
      return norm || null;
    }
  } catch {
    /* not a URL */
  }
  const norm = normalizeFriendCode(trimmed);
  return norm || null;
}
