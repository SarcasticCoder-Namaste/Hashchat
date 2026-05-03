import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { normalizeTag } from "../lib/hashtags";

const router: IRouter = Router();

router.post("/presence/ping", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const body = (req.body ?? {}) as { roomTag?: unknown };
  let roomTag: string | null = null;
  if (typeof body.roomTag === "string" && body.roomTag.trim().length > 0) {
    const normalized = normalizeTag(body.roomTag);
    if (normalized) roomTag = normalized;
  } else if (body.roomTag === null) {
    roomTag = null;
  }
  const now = new Date();
  const [updated] = await db
    .update(usersTable)
    .set({ lastSeenAt: now, currentRoomTag: roomTag })
    .where(eq(usersTable.id, me))
    .returning({
      lastSeenAt: usersTable.lastSeenAt,
      currentRoomTag: usersTable.currentRoomTag,
      hidePresence: usersTable.hidePresence,
    });
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({
    lastSeenAt: updated.lastSeenAt.toISOString(),
    currentRoomTag: updated.currentRoomTag ?? null,
    hidePresence: updated.hidePresence,
  });
});

export default router;
