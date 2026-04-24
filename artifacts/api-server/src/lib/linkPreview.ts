/**
 * Lightweight server-side Open Graph / HTML metadata extractor.
 * No external deps — fetches the URL and parses <meta> and <title> tags.
 *
 * SSRF defenses:
 *  - Only http(s) allowed
 *  - DNS-resolved IP must be globally routable (no private, loopback,
 *    link-local, multicast, broadcast, ULA, etc.)
 *  - Redirects are followed manually so each hop is re-validated
 *  - Strict size + timeout limits
 */

import { lookup } from "node:dns/promises";
import net from "node:net";

const URL_REGEX = /(https?:\/\/[^\s<>"']+)/gi;
const MAX_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 4;

export interface LinkPreviewData {
  url: string;
  title: string | null;
  description: string | null;
  thumbnailUrl: string | null;
}

export function extractFirstUrl(text: string): string | null {
  const match = text.match(URL_REGEX);
  return match ? match[0] : null;
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0.0/24
  if (a === 192 && b === 0 && parts[2] === 2) return true; // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && parts[2] === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && parts[2] === 113) return true; // TEST-NET-3
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fe80::")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA fc00::/7
  if (lower.startsWith("ff")) return true; // multicast
  // IPv4-mapped IPv6 (::ffff:a.b.c.d)
  const v4Mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Mapped) return isPrivateIPv4(v4Mapped[1]);
  // IPv4-compatible IPv6 (deprecated)
  const v4Compat = lower.match(/^::(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Compat) return isPrivateIPv4(v4Compat[1]);
  return false;
}

async function isHostSafe(hostname: string): Promise<boolean> {
  if (!hostname) return false;
  const lower = hostname.toLowerCase();
  if (
    lower === "localhost" ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal") ||
    lower.endsWith(".localhost")
  ) {
    return false;
  }
  // If it's already a literal IP, validate directly
  if (net.isIP(lower)) {
    return net.isIPv6(lower) ? !isPrivateIPv6(lower) : !isPrivateIPv4(lower);
  }
  try {
    const results = await lookup(lower, { all: true });
    if (results.length === 0) return false;
    for (const { address, family } of results) {
      const isPriv =
        family === 6 ? isPrivateIPv6(address) : isPrivateIPv4(address);
      if (isPriv) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function extractMeta(html: string, names: string[]): string | null {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)\\s*=\\s*["']${name}["'][^>]*content\\s*=\\s*["']([^"']+)["'][^>]*>`,
      "i",
    );
    const m = html.match(re);
    if (m) return m[1];
    const reAlt = new RegExp(
      `<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]+(?:property|name)\\s*=\\s*["']${name}["'][^>]*>`,
      "i",
    );
    const m2 = html.match(reAlt);
    if (m2) return m2[1];
  }
  return null;
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim() : null;
}

function decodeEntities(s: string | null): string | null {
  if (!s) return s;
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function resolveUrl(base: string, maybeRelative: string | null): string | null {
  if (!maybeRelative) return null;
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return null;
  }
}

async function safeFetch(initialUrl: string): Promise<Response | null> {
  let current = initialUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return null;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    const safe = await isHostSafe(parsed.hostname);
    if (!safe) return null;

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await fetch(parsed.toString(), {
        signal: ctrl.signal,
        headers: {
          "User-Agent": "HashChatLinkPreview/1.0",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "manual",
      });
    } catch {
      clearTimeout(timeout);
      return null;
    }
    clearTimeout(timeout);

    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get("location");
      if (!loc) return null;
      try {
        current = new URL(loc, parsed.toString()).toString();
      } catch {
        return null;
      }
      continue;
    }
    if (!resp.ok) return null;
    return resp;
  }
  return null;
}

export async function fetchLinkPreview(
  url: string,
): Promise<LinkPreviewData | null> {
  const resp = await safeFetch(url);
  if (!resp) return null;
  const ct = resp.headers.get("content-type") || "";
  if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
    return null;
  }
  const finalUrl = resp.url || url;

  try {
    const reader = resp.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    try {
      reader.cancel();
    } catch {
      // ignore
    }
    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      buf.set(c, off);
      off += c.length;
    }
    const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);

    const title =
      decodeEntities(
        extractMeta(html, ["og:title", "twitter:title"]) ?? extractTitle(html),
      ) ?? null;
    const description = decodeEntities(
      extractMeta(html, [
        "og:description",
        "twitter:description",
        "description",
      ]),
    );
    const rawImage = extractMeta(html, ["og:image", "twitter:image"]);
    const thumbnailUrl = resolveUrl(finalUrl, rawImage);

    if (!title && !description && !thumbnailUrl) return null;
    return {
      url: finalUrl,
      title,
      description,
      thumbnailUrl,
    };
  } catch {
    return null;
  }
}
