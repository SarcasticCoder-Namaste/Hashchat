import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

type YtSearchItem = {
  id: { videoId?: string };
  snippet: {
    title: string;
    channelTitle: string;
    channelId: string;
    thumbnails: { high?: { url: string }; medium?: { url: string } };
    publishedAt: string;
    description?: string;
  };
};

type YtVideoItem = {
  id: string;
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  snippet?: { description?: string };
};

type YtChannelItem = {
  id: string;
  snippet?: { thumbnails?: { default?: { url: string }; medium?: { url: string } } };
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
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("videoDuration", "short");
  searchUrl.searchParams.set("maxResults", String(max));
  searchUrl.searchParams.set("q", `${q} #shorts`);
  searchUrl.searchParams.set("key", apiKey);
  if (pageToken) searchUrl.searchParams.set("pageToken", pageToken);

  try {
    const r = await fetch(searchUrl.toString());
    if (!r.ok) {
      const body = await r.text();
      res.status(502).json({ error: "youtube_error", message: body.slice(0, 500) });
      return;
    }
    const data = (await r.json()) as {
      items?: YtSearchItem[];
      nextPageToken?: string;
    };
    const baseItems = (data.items ?? []).filter((it) => it.id.videoId);
    if (baseItems.length === 0) {
      res.json({ items: [], nextPageToken: data.nextPageToken ?? null });
      return;
    }

    const videoIds = baseItems.map((it) => it.id.videoId!).join(",");
    const channelIds = Array.from(
      new Set(baseItems.map((it) => it.snippet.channelId).filter(Boolean)),
    ).join(",");

    // Parallel enrichment: video stats + channel avatars (cheap quota: 1 unit each).
    const [videosResp, channelsResp] = await Promise.all([
      fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${encodeURIComponent(videoIds)}&key=${apiKey}`,
      ).then((r) => (r.ok ? (r.json() as Promise<{ items?: YtVideoItem[] }>) : { items: [] }))
        .catch(() => ({ items: [] as YtVideoItem[] })),
      fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${encodeURIComponent(channelIds)}&key=${apiKey}`,
      ).then((r) => (r.ok ? (r.json() as Promise<{ items?: YtChannelItem[] }>) : { items: [] }))
        .catch(() => ({ items: [] as YtChannelItem[] })),
    ]);

    const statsById = new Map<string, YtVideoItem>();
    for (const v of videosResp.items ?? []) statsById.set(v.id, v);
    const channelById = new Map<string, YtChannelItem>();
    for (const c of channelsResp.items ?? []) channelById.set(c.id, c);

    const items = baseItems.map((it) => {
      const stats = statsById.get(it.id.videoId!);
      const channel = channelById.get(it.snippet.channelId);
      return {
        id: it.id.videoId!,
        title: it.snippet.title,
        channel: it.snippet.channelTitle,
        channelId: it.snippet.channelId,
        channelAvatar:
          channel?.snippet?.thumbnails?.medium?.url ??
          channel?.snippet?.thumbnails?.default?.url ??
          null,
        thumbnail:
          it.snippet.thumbnails.high?.url ?? it.snippet.thumbnails.medium?.url ?? "",
        publishedAt: it.snippet.publishedAt,
        description: stats?.snippet?.description ?? it.snippet.description ?? "",
        viewCount: stats?.statistics?.viewCount
          ? Number(stats.statistics.viewCount)
          : null,
        likeCount: stats?.statistics?.likeCount
          ? Number(stats.statistics.likeCount)
          : null,
        commentCount: stats?.statistics?.commentCount
          ? Number(stats.statistics.commentCount)
          : null,
      };
    });
    res.json({ items, nextPageToken: data.nextPageToken ?? null });
  } catch (err) {
    req.log.warn({ err }, "YouTube fetch failed");
    res.status(502).json({ error: "youtube_fetch_failed" });
  }
});

export default router;
