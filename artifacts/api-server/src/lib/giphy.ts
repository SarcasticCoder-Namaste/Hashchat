/**
 * Thin wrapper around the Giphy v1 API. The API key is read at call time
 * from process.env.GIPHY_API_KEY so the server picks up secret rotations
 * without restart.
 */

export type GifResult = {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
};

export type GifSearchPage = {
  items: GifResult[];
  nextOffset: number | null;
  provider: "giphy";
};

type GiphyImage = {
  url: string;
  width?: string;
  height?: string;
};

type GiphyItem = {
  id: string;
  title?: string;
  images: {
    fixed_width?: GiphyImage;
    fixed_width_small?: GiphyImage;
    fixed_height_small?: GiphyImage;
    downsized_medium?: GiphyImage;
    downsized?: GiphyImage;
    original?: GiphyImage;
  };
};

type GiphyResponse = {
  data?: GiphyItem[];
  pagination?: { total_count?: number; count?: number; offset?: number };
};

const PROVIDER = "giphy" as const;

export function isGiphyConfigured(): boolean {
  return !!process.env["GIPHY_API_KEY"];
}

function pickPreview(item: GiphyItem): GiphyImage | undefined {
  return (
    item.images.fixed_width ??
    item.images.fixed_height_small ??
    item.images.fixed_width_small ??
    item.images.downsized ??
    item.images.original
  );
}

function pickFull(item: GiphyItem): GiphyImage | undefined {
  return (
    item.images.downsized_medium ??
    item.images.downsized ??
    item.images.original ??
    pickPreview(item)
  );
}

function toResult(item: GiphyItem): GifResult | null {
  const full = pickFull(item);
  const preview = pickPreview(item) ?? full;
  if (!full || !preview) return null;
  return {
    id: item.id,
    title: item.title?.trim() || "GIF",
    url: full.url,
    previewUrl: preview.url,
    width: parseInt(full.width ?? "0", 10) || 0,
    height: parseInt(full.height ?? "0", 10) || 0,
  };
}

/**
 * Search GIFs (or fetch trending when no query is provided). Throws on
 * upstream failure so the caller can map to an HTTP status.
 */
export async function searchGiphy(
  query: string,
  limit: number,
  offset: number,
): Promise<GifSearchPage> {
  const apiKey = process.env["GIPHY_API_KEY"];
  if (!apiKey) throw new Error("GIPHY_API_KEY not set");

  const trimmed = query.trim();
  const path = trimmed ? "/search" : "/trending";
  const url = new URL(`https://api.giphy.com/v1/gifs${path}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("rating", "pg-13");
  url.searchParams.set("bundle", "messaging_non_clips");
  if (trimmed) url.searchParams.set("q", trimmed);

  const r = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`Giphy ${r.status}: ${body.slice(0, 200)}`);
  }
  const data = (await r.json()) as GiphyResponse;
  const items = (data.data ?? [])
    .map(toResult)
    .filter((v): v is GifResult => v !== null);
  const total = data.pagination?.total_count ?? null;
  const consumed = offset + items.length;
  const nextOffset =
    items.length === limit && (total === null || consumed < total)
      ? consumed
      : null;
  return { items, nextOffset, provider: PROVIDER };
}

/**
 * Validate that a URL is one of our GIF provider's CDN URLs so we don't
 * let the chat endpoint mirror arbitrary external URLs into messages.
 */
export function isAllowedGifUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  return (
    host === "media.giphy.com" ||
    host.endsWith(".media.giphy.com") ||
    /^media\d*\.giphy\.com$/.test(host) ||
    host === "i.giphy.com" ||
    host === "giphy.com"
  );
}
