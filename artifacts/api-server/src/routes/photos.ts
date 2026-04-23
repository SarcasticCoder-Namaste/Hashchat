import { Router, type IRouter } from "express";
import { db, userPhotosTable, usersTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { AddMyPhotoBody } from "@workspace/api-zod";
import { isValidStorageUrl } from "../lib/storageUrls";

const router: IRouter = Router();

function serialize(p: typeof userPhotosTable.$inferSelect) {
  return {
    id: p.id,
    userId: p.userId,
    imageUrl: p.imageUrl,
    caption: p.caption,
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/me/photos", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const rows = await db
    .select()
    .from(userPhotosTable)
    .where(eq(userPhotosTable.userId, me))
    .orderBy(desc(userPhotosTable.createdAt))
    .limit(60);
  res.json(rows.map(serialize));
});

router.post("/me/photos", requireAuth, async (req, res): Promise<void> => {
  const parsed = AddMyPhotoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!isValidStorageUrl(parsed.data.imageUrl)) {
    res.status(400).json({ error: "imageUrl must reference an uploaded object" });
    return;
  }
  const me = getUserId(req);
  const [created] = await db
    .insert(userPhotosTable)
    .values({ userId: me, imageUrl: parsed.data.imageUrl, caption: parsed.data.caption ?? null })
    .returning();
  res.status(201).json(serialize(created));
});

router.delete("/me/photos/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const me = getUserId(req);
  await db
    .delete(userPhotosTable)
    .where(and(eq(userPhotosTable.id, id), eq(userPhotosTable.userId, me)));
  res.status(204).end();
});

router.get("/users/:username/photos", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.username) ? req.params.username[0] : req.params.username;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, raw)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const rows = await db
    .select()
    .from(userPhotosTable)
    .where(eq(userPhotosTable.userId, user.id))
    .orderBy(desc(userPhotosTable.createdAt))
    .limit(60);
  res.json(rows.map(serialize));
});

export default router;
