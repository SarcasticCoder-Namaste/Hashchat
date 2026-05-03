import { Router, type IRouter } from "express";
import { db, messageAttachmentsTable, messagesTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import {
  getGiphyCategories,
  getGiphyTrendingSearches,
  isGiphyConfigured,
  searchGiphy,
} from "../lib/giphy";

const router: IRouter = Router();

router.get("/gifs/recent", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const rawLimit = parseInt(String(req.query.limit ?? "24"), 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), 50)
    : 24;
  // Pull more than `limit` so dedup-by-url still yields up to `limit`
  // distinct GIFs even when the user keeps sending the same one.
  const rows = await db
    .select({
      url: messageAttachmentsTable.url,
      createdAt: sql<Date>`max(${messagesTable.createdAt})`,
    })
    .from(messageAttachmentsTable)
    .innerJoin(
      messagesTable,
      eq(messagesTable.id, messageAttachmentsTable.messageId),
    )
    .where(
      and(
        eq(messageAttachmentsTable.kind, "gif"),
        eq(messagesTable.senderId, me),
        sql`${messagesTable.deletedAt} IS NULL`,
      ),
    )
    .groupBy(messageAttachmentsTable.url)
    .orderBy(desc(sql`max(${messagesTable.createdAt})`))
    .limit(limit);

  const items = rows.map((r) => ({
    id: r.url,
    title: "GIF",
    url: r.url,
    previewUrl: r.url,
    width: 0,
    height: 0,
  }));
  res.json({ items, nextOffset: null, provider: "giphy" });
});

router.get("/gifs/search", requireAuth, async (req, res): Promise<void> => {
  if (!isGiphyConfigured()) {
    res.status(503).json({
      error: "gif_provider_not_configured",
      message:
        "GIF provider not configured. Set the GIPHY_API_KEY secret to enable the GIF picker.",
    });
    return;
  }
  const q = String(req.query.q ?? "");
  const rawLimit = parseInt(String(req.query.limit ?? "24"), 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), 50)
    : 24;
  const rawOffset = parseInt(String(req.query.offset ?? "0"), 10);
  const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;

  try {
    const page = await searchGiphy(q, limit, offset);
    res.json(page);
  } catch (err) {
    req.log.warn({ err }, "Giphy fetch failed");
    res.status(502).json({
      error: "gif_provider_error",
      message: "Failed to load GIFs from provider.",
    });
  }
});

router.get("/gifs/categories", requireAuth, async (req, res): Promise<void> => {
  if (!isGiphyConfigured()) {
    res.status(503).json({
      error: "gif_provider_not_configured",
      message:
        "GIF provider not configured. Set the GIPHY_API_KEY secret to enable the GIF picker.",
    });
    return;
  }
  try {
    const page = await getGiphyCategories();
    res.json(page);
  } catch (err) {
    req.log.warn({ err }, "Giphy categories fetch failed");
    res.status(502).json({
      error: "gif_provider_error",
      message: "Failed to load GIF categories from provider.",
    });
  }
});

router.get(
  "/gifs/trending-searches",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!isGiphyConfigured()) {
      res.status(503).json({
        error: "gif_provider_not_configured",
        message:
          "GIF provider not configured. Set the GIPHY_API_KEY secret to enable the GIF picker.",
      });
      return;
    }
    try {
      const page = await getGiphyTrendingSearches();
      res.json(page);
    } catch (err) {
      req.log.warn({ err }, "Giphy trending searches fetch failed");
      res.status(502).json({
        error: "gif_provider_error",
        message: "Failed to load trending GIF searches from provider.",
      });
    }
  },
);

export default router;
