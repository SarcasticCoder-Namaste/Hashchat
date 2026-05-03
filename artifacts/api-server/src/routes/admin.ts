import { Router, type IRouter } from "express";
import {
  db,
  usersTable,
  messagesTable,
  mvpCodesTable,
} from "@workspace/db";
import { eq, desc, sql, isNull, and } from "drizzle-orm";
import { requireAuth, requireAdmin, requireModerator, getUserId } from "../middlewares/requireAuth";
import { publicUser } from "../lib/serializeUser";
import { presenceStateFor, publicCurrentRoom } from "../lib/presence";

const router: IRouter = Router();

router.get("/admin/users", requireAuth, requireModerator, async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(desc(usersTable.createdAt)).limit(500);
  res.json(
    users.map((u) => ({
      ...publicUser(u),
      presenceState: presenceStateFor(u.lastSeenAt, u.hidePresence),
      currentRoomTag: publicCurrentRoom(u.currentRoomTag, u.lastSeenAt, u.hidePresence),
      bannedAt: u.bannedAt ? u.bannedAt.toISOString() : null,
      createdAt: u.createdAt.toISOString(),
    })),
  );
});

router.post("/admin/users/:id/ban", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = String(raw);
  if (id === getUserId(req)) {
    res.status(400).json({ error: "Cannot ban yourself" });
    return;
  }
  await db.update(usersTable).set({ bannedAt: new Date() }).where(eq(usersTable.id, id));
  res.status(204).end();
});

router.delete("/admin/users/:id/ban", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = String(raw);
  await db.update(usersTable).set({ bannedAt: null }).where(eq(usersTable.id, id));
  res.status(204).end();
});

router.post("/admin/users/:id/role", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = String(raw);
  const role = String((req.body as { role?: string })?.role ?? "");
  if (!["user", "moderator", "admin"].includes(role)) {
    res.status(400).json({ error: "Invalid role" });
    return;
  }
  if (id === getUserId(req) && role !== "admin") {
    res.status(400).json({ error: "Cannot demote yourself" });
    return;
  }
  await db.update(usersTable).set({ role }).where(eq(usersTable.id, id));
  res.status(204).end();
});

router.delete("/admin/messages/:id", requireAuth, requireModerator, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(raw), 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.update(messagesTable).set({ deletedAt: new Date() }).where(eq(messagesTable.id, id));
  res.status(204).end();
});

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const blocks = [4, 4, 4];
  return blocks
    .map((n) =>
      Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join(""),
    )
    .join("-");
}

router.get("/admin/mvp-codes", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const codes = await db.select().from(mvpCodesTable).orderBy(desc(mvpCodesTable.createdAt)).limit(200);
  res.json(
    codes.map((c) => ({
      code: c.code,
      createdBy: c.createdBy,
      createdAt: c.createdAt.toISOString(),
      redeemedBy: c.redeemedBy,
      redeemedAt: c.redeemedAt ? c.redeemedAt.toISOString() : null,
      note: c.note,
    })),
  );
});

router.post("/admin/mvp-codes", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const note = ((req.body as { note?: unknown })?.note ?? null) as string | null;
  let code = generateCode();
  for (let i = 0; i < 5; i++) {
    const [exists] = await db.select().from(mvpCodesTable).where(eq(mvpCodesTable.code, code)).limit(1);
    if (!exists) break;
    code = generateCode();
  }
  await db.insert(mvpCodesTable).values({ code, createdBy: getUserId(req), note });
  res.status(201).json({ code });
});

router.get("/admin/stats", requireAuth, requireModerator, async (_req, res): Promise<void> => {
  const [{ users }] = await db
    .select({ users: sql<number>`count(*)::int` })
    .from(usersTable);
  const [{ messages }] = await db
    .select({ messages: sql<number>`count(*)::int` })
    .from(messagesTable)
    .where(isNull(messagesTable.deletedAt));
  const [{ mvp }] = await db
    .select({ mvp: sql<number>`count(*)::int` })
    .from(usersTable)
    .where(eq(usersTable.mvpPlan, true));
  const [{ banned }] = await db
    .select({ banned: sql<number>`count(*) FILTER (WHERE ${usersTable.bannedAt} IS NOT NULL)::int` })
    .from(usersTable);
  void and;
  res.json({ users, messages, mvp, banned });
});

export default router;
