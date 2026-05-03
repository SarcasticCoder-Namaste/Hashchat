import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import {
  getGiphyCategories,
  getGiphyTrendingSearches,
  isGiphyConfigured,
  searchGiphy,
} from "../lib/giphy";

const router: IRouter = Router();

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
