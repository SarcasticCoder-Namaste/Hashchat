import { Router, type IRouter } from "express";
import {
  db,
  userPreferencesTable,
  pushSubscriptionsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";

const router: IRouter = Router();

const DEFAULTS = {
  theme: "light",
  accent: "default",
  emailMentions: true,
  emailReplies: true,
  emailDms: true,
  emailFollows: false,
  emailReactions: false,
  pushMentions: true,
  pushReplies: true,
  pushDms: true,
  pushFollows: true,
  pushReactions: false,
  likesPublic: false,
  emailAddress: null as string | null,
};

async function fetchPrefs(userId: string) {
  const [row] = await db
    .select()
    .from(userPreferencesTable)
    .where(eq(userPreferencesTable.userId, userId))
    .limit(1);
  if (row) return row;
  const [created] = await db
    .insert(userPreferencesTable)
    .values({ userId })
    .returning();
  return created;
}

async function pushSubCount(userId: string): Promise<number> {
  const [r] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.userId, userId));
  return r?.c ?? 0;
}

function shape(row: any, count: number) {
  const emailEnabled =
    process.env.SENDGRID_API_KEY != null ||
    process.env.RESEND_API_KEY != null;
  const pushEnabled =
    process.env.VAPID_PUBLIC_KEY != null &&
    process.env.VAPID_PRIVATE_KEY != null;
  return {
    theme: row.theme,
    accent: row.accent,
    emailMentions: row.emailMentions,
    emailReplies: row.emailReplies,
    emailDms: row.emailDms,
    emailFollows: row.emailFollows,
    emailReactions: row.emailReactions,
    pushMentions: row.pushMentions,
    pushReplies: row.pushReplies,
    pushDms: row.pushDms,
    pushFollows: row.pushFollows,
    pushReactions: row.pushReactions,
    likesPublic: row.likesPublic,
    emailAddress: row.emailAddress,
    emailEnabled,
    pushEnabled,
    pushSubscriptionCount: count,
  };
}

router.get("/me/preferences", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const row = await fetchPrefs(me);
  const c = await pushSubCount(me);
  res.json(shape(row, c));
});

router.put("/me/preferences", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  await fetchPrefs(me);

  const b = (req.body ?? {}) as Record<string, unknown>;
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof b.theme === "string") update.theme = b.theme.slice(0, 32);
  if (typeof b.accent === "string") update.accent = b.accent.slice(0, 32);
  for (const k of [
    "emailMentions",
    "emailReplies",
    "emailDms",
    "emailFollows",
    "emailReactions",
    "pushMentions",
    "pushReplies",
    "pushDms",
    "pushFollows",
    "pushReactions",
    "likesPublic",
  ] as const) {
    if (typeof b[k] === "boolean") update[k] = b[k];
  }
  if (typeof b.emailAddress === "string" || b.emailAddress === null) {
    update.emailAddress =
      typeof b.emailAddress === "string"
        ? b.emailAddress.slice(0, 200)
        : null;
  }

  const [row] = await db
    .update(userPreferencesTable)
    .set(update as any)
    .where(eq(userPreferencesTable.userId, me))
    .returning();
  const c = await pushSubCount(me);
  res.json(shape(row, c));
});

export { DEFAULTS, fetchPrefs };
export default router;
