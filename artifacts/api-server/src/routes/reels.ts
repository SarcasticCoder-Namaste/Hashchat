import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

type YtItem = {
  id: { videoId?: string };
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails: { high?: { url: string }; medium?: { url: string } };
    publishedAt: string;
  };
};

router.get("/reels/youtube", requireAuth, async (req, res): Promise<void> => {
  const apiKey = process.env["YOUTUBE_API_KEY"];
  if (!apiKey) {
    res.status(503).json({
      error: "youtube_not_configured",
      message: "YouTube API key not configured. Set YOUTUBE_API_KEY to enable Shorts.",
    });
    return;
  }
  const q = String(req.query.q ?? "").trim() || "shorts";
  const max = Math.min(Math.max(parseInt(String(req.query.max ?? "20"), 10) || 20, 1), 50);
  const pageToken = String(req.query.pageToken ?? "").trim();
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("videoDuration", "short");
  url.searchParams.set("maxResults", String(max));
  url.searchParams.set("q", `${q} #shorts`);
  url.searchParams.set("key", apiKey);
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  try {
    const r = await fetch(url.toString());
    if (!r.ok) {
      const body = await r.text();
      res.status(502).json({ error: "youtube_error", message: body.slice(0, 500) });
      return;
    }
    const data = (await r.json()) as {
      items?: YtItem[];
      nextPageToken?: string;
    };
    const items = (data.items ?? [])
      .filter((it) => it.id.videoId)
      .map((it) => ({
        id: it.id.videoId!,
        title: it.snippet.title,
        channel: it.snippet.channelTitle,
        thumbnail:
          it.snippet.thumbnails.high?.url ?? it.snippet.thumbnails.medium?.url ?? "",
        publishedAt: it.snippet.publishedAt,
      }));
    res.json({ items, nextPageToken: data.nextPageToken ?? null });
  } catch (err) {
    req.log.warn({ err }, "YouTube fetch failed");
    res.status(502).json({ error: "youtube_fetch_failed" });
  }
});

export default router;
