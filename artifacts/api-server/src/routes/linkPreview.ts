import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { fetchLinkPreview } from "../lib/linkPreview";

const router: IRouter = Router();

router.get("/link-preview", requireAuth, async (req, res): Promise<void> => {
  const url = String(req.query.url ?? "");
  if (!url) {
    res.status(400).json({ error: "url is required" });
    return;
  }
  const data = await fetchLinkPreview(url);
  if (!data) {
    res.json({ url, title: null, description: null, thumbnailUrl: null });
    return;
  }
  res.json(data);
});

export default router;
