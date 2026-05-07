import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [] as unknown[],
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: async () => undefined,
      }),
    }),
  },
  linkPreviewsTable: {
    url: "url",
  },
}));

vi.mock("./logger", () => ({
  logger: {
    warn: () => {},
    info: () => {},
    error: () => {},
    debug: () => {},
  },
}));

const dnsLookupMock = vi.fn();
vi.mock("node:dns/promises", () => ({
  lookup: (...args: unknown[]) => dnsLookupMock(...args),
}));

import {
  clearLinkPreviewCache,
  extractFirstUrl,
  fetchLinkPreview,
} from "./linkPreview";

type FetchHandler = (
  input: string,
  init?: RequestInit,
) => Response | Promise<Response>;

let fetchHandler: FetchHandler;
const fetchSpy = vi.fn(
  async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    return fetchHandler(url, init);
  },
);

function htmlResponse(
  body: string,
  opts: { url?: string; status?: number; contentType?: string } = {},
): Response {
  return new Response(body, {
    status: opts.status ?? 200,
    headers: { "content-type": opts.contentType ?? "text/html; charset=utf-8" },
  });
}

function streamResponse(
  totalBytes: number,
  opts: { url?: string } = {},
): Response {
  const chunkSize = 16 * 1024;
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= totalBytes) {
        controller.close();
        return;
      }
      const remaining = totalBytes - sent;
      const size = Math.min(chunkSize, remaining);
      const buf = new Uint8Array(size);
      buf.fill(0x20); // ASCII space
      controller.enqueue(buf);
      sent += size;
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

beforeEach(() => {
  clearLinkPreviewCache();
  dnsLookupMock.mockReset();
  fetchSpy.mockClear();
  // Default: every host resolves to a public IP.
  dnsLookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  fetchHandler = () => htmlResponse("<html></html>");
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("extractFirstUrl", () => {
  it("finds the first http(s) URL in text", () => {
    expect(extractFirstUrl("hi http://a.com x")).toBe("http://a.com");
    expect(extractFirstUrl("see https://b.com/path?q=1")).toBe(
      "https://b.com/path?q=1",
    );
    expect(extractFirstUrl("no url here")).toBeNull();
  });
});

describe("SSRF defenses", () => {
  it("rejects localhost hostnames without resolving", async () => {
    const result = await fetchLinkPreview("http://localhost/foo");
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(dnsLookupMock).not.toHaveBeenCalled();
  });

  it("rejects .internal / .local suffixes", async () => {
    expect(await fetchLinkPreview("http://api.internal/x")).toBeNull();
    expect(await fetchLinkPreview("http://thing.local/x")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects literal private IPs", async () => {
    expect(await fetchLinkPreview("http://127.0.0.1/")).toBeNull();
    expect(await fetchLinkPreview("http://10.0.0.5/")).toBeNull();
    expect(await fetchLinkPreview("http://192.168.1.1/")).toBeNull();
    expect(await fetchLinkPreview("http://169.254.169.254/")).toBeNull();
    expect(await fetchLinkPreview("http://[::1]/")).toBeNull();
    expect(await fetchLinkPreview("http://[fc00::1]/")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects non-http(s) schemes", async () => {
    expect(await fetchLinkPreview("file:///etc/passwd")).toBeNull();
    expect(await fetchLinkPreview("ftp://example.com/")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects when DNS resolves to a private address", async () => {
    dnsLookupMock.mockResolvedValueOnce([
      { address: "10.0.0.5", family: 4 },
    ]);
    const result = await fetchLinkPreview("http://evil.example.com/");
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects when ANY resolved address is private", async () => {
    dnsLookupMock.mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ]);
    const result = await fetchLinkPreview("http://mixed.example.com/");
    expect(result).toBeNull();
  });
});

describe("redirect handling", () => {
  it("follows 301 redirects and re-validates each hop", async () => {
    const calls: string[] = [];
    fetchHandler = (url) => {
      calls.push(url);
      if (url === "http://a.example.com/") {
        return new Response(null, {
          status: 301,
          headers: {
            location: "http://b.example.com/final",
            "content-type": "text/plain",
          },
        });
      }
      return htmlResponse(
        '<html><head><meta property="og:title" content="Final"></head></html>',
      );
    };
    const result = await fetchLinkPreview("http://a.example.com/");
    expect(result).not.toBeNull();
    expect(result?.title).toBe("Final");
    expect(calls).toEqual([
      "http://a.example.com/",
      "http://b.example.com/final",
    ]);
    expect(dnsLookupMock).toHaveBeenCalledTimes(2);
  });

  it("aborts when a redirect target resolves to a private IP", async () => {
    fetchHandler = () =>
      new Response(null, {
        status: 302,
        headers: { location: "http://internal.example.com/x" },
      });
    dnsLookupMock
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }]);
    const result = await fetchLinkPreview("http://outer.example.com/");
    expect(result).toBeNull();
  });

  it("stops after MAX_REDIRECTS and returns null", async () => {
    let n = 0;
    fetchHandler = () => {
      n++;
      return new Response(null, {
        status: 302,
        headers: { location: `http://hop${n}.example.com/` },
      });
    };
    const result = await fetchLinkPreview("http://start.example.com/");
    expect(result).toBeNull();
    // initial + MAX_REDIRECTS(4) = 5 hops attempted
    expect(fetchSpy).toHaveBeenCalledTimes(5);
  });
});

describe("OG / Twitter / title parsing", () => {
  it("prefers og:title over <title>", async () => {
    fetchHandler = () =>
      htmlResponse(
        `<html><head>
        <title>Plain Title</title>
        <meta property="og:title" content="OG Title">
        <meta property="og:description" content="OG Desc">
        <meta property="og:image" content="/img.png">
      </head></html>`,
      );
    const r = await fetchLinkPreview("http://example.com/page");
    expect(r?.title).toBe("OG Title");
    expect(r?.description).toBe("OG Desc");
    expect(r?.thumbnailUrl).toBe("http://example.com/img.png");
  });

  it("falls back to twitter:* and <title> when og:* missing", async () => {
    fetchHandler = () =>
      htmlResponse(
        `<html><head>
        <title>The Title</title>
        <meta name="twitter:description" content="Tw Desc">
        <meta name="twitter:image" content="https://cdn.example.com/i.jpg">
      </head></html>`,
      );
    const r = await fetchLinkPreview("http://example.com/");
    expect(r?.title).toBe("The Title");
    expect(r?.description).toBe("Tw Desc");
    expect(r?.thumbnailUrl).toBe("https://cdn.example.com/i.jpg");
  });

  it("decodes HTML entities in extracted text", async () => {
    fetchHandler = () =>
      htmlResponse(
        `<html><head>
        <meta property="og:title" content="A &amp; B">
        <meta property="og:description" content="x &lt; y">
      </head></html>`,
      );
    const r = await fetchLinkPreview("http://example.com/");
    expect(r?.title).toBe("A & B");
    expect(r?.description).toBe("x < y");
  });

  it("returns null when nothing extractable", async () => {
    fetchHandler = () => htmlResponse("<html><body>hi</body></html>");
    const r = await fetchLinkPreview("http://example.com/empty");
    expect(r).toBeNull();
  });

  it("returns null for non-HTML content type", async () => {
    fetchHandler = () =>
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const r = await fetchLinkPreview("http://example.com/api");
    expect(r).toBeNull();
  });
});

describe("byte cap", () => {
  it("stops reading after MAX_BYTES even if server sends more", async () => {
    // 1MB payload, cap is 256KB.
    fetchHandler = () => streamResponse(1024 * 1024);
    const r = await fetchLinkPreview("http://example.com/big");
    // No meta in payload, so result is null — but must not hang or throw.
    expect(r).toBeNull();
  });
});

describe("caching", () => {
  it("returns cached value on repeat call without re-fetching", async () => {
    fetchHandler = () =>
      htmlResponse(
        `<html><head><meta property="og:title" content="Cached"></head></html>`,
      );
    const first = await fetchLinkPreview("http://example.com/p");
    const second = await fetchLinkPreview("http://example.com/p");
    expect(first?.title).toBe("Cached");
    expect(second).toEqual(first);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("normalizes URL fragments to share cache entries", async () => {
    fetchHandler = () =>
      htmlResponse(
        `<html><head><meta property="og:title" content="Same"></head></html>`,
      );
    await fetchLinkPreview("http://example.com/x#one");
    await fetchLinkPreview("http://example.com/x#two");
    await fetchLinkPreview("http://example.com/x");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("re-fetches after TTL expiry", async () => {
    fetchHandler = () =>
      htmlResponse(
        `<html><head><meta property="og:title" content="t"></head></html>`,
      );
    vi.useFakeTimers({ now: new Date("2025-01-01T00:00:00Z") });
    await fetchLinkPreview("http://example.com/ttl");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // Advance past 24h success TTL.
    vi.setSystemTime(new Date("2025-01-02T00:00:01Z"));
    await fetchLinkPreview("http://example.com/ttl");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("evicts the oldest entry when capacity is exceeded (LRU)", async () => {
    fetchHandler = (url) =>
      htmlResponse(
        `<html><head><meta property="og:title" content="${url}"></head></html>`,
      );
    // Cap is 500. Fill to 500, then one more should evict the very first.
    for (let i = 0; i < 500; i++) {
      await fetchLinkPreview(`http://example.com/p${i}`);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(500);
    // Re-request the first → still cached, no new fetch.
    await fetchLinkPreview("http://example.com/p0");
    expect(fetchSpy).toHaveBeenCalledTimes(500);
    // Touch p1 to make p2 the oldest, then add new entries beyond cap.
    // Actually p0 was just touched (most recent). The oldest is now p1.
    await fetchLinkPreview("http://example.com/p500"); // adds, evicts p1
    expect(fetchSpy).toHaveBeenCalledTimes(501);
    // p1 should now be evicted → re-request triggers a fetch.
    await fetchLinkPreview("http://example.com/p1");
    expect(fetchSpy).toHaveBeenCalledTimes(502);
    // p0 (recently touched) should still be cached.
    await fetchLinkPreview("http://example.com/p0");
    expect(fetchSpy).toHaveBeenCalledTimes(502);
  });
});

describe("in-flight dedup", () => {
  it("shares a single fetch across concurrent calls for the same URL", async () => {
    let resolveFetch: ((r: Response) => void) | null = null;
    fetchHandler = () =>
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
    const p1 = fetchLinkPreview("http://example.com/dedupe");
    const p2 = fetchLinkPreview("http://example.com/dedupe");
    const p3 = fetchLinkPreview("http://example.com/dedupe");
    // Wait for dbGet (mocked async) to settle and fetch() to be invoked.
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    (resolveFetch as ((r: Response) => void) | null)?.(
      htmlResponse(
        `<html><head><meta property="og:title" content="Once"></head></html>`,
      ),
    );
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1?.title).toBe("Once");
    expect(r2).toEqual(r1);
    expect(r3).toEqual(r1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
