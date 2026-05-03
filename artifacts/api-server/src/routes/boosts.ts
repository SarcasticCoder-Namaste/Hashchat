import { Router, type IRouter } from "express";
import {
  db,
  postsTable,
  postBoostsTable,
  usersTable,
} from "@workspace/db";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import {
  getUncachableStripeClient,
  isStripeConnected,
} from "../lib/stripeClient";
import { appOrigin } from "../lib/premiumHelpers";

const router: IRouter = Router();

const BOOST_PRICE_CENTS = 499; // $4.99 for a 24h boost
const BOOST_DURATION_HOURS = 24;

router.post(
  "/posts/:id/boost/checkout",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid post id" });
      return;
    }
    const [post] = await db
      .select({
        id: postsTable.id,
        authorId: postsTable.authorId,
        deletedAt: postsTable.deletedAt,
        status: postsTable.status,
      })
      .from(postsTable)
      .where(eq(postsTable.id, id))
      .limit(1);
    if (!post || post.deletedAt || post.status !== "published") {
      res.status(404).json({ error: "Post not found" });
      return;
    }
    if (post.authorId !== me) {
      res.status(403).json({ error: "Only the author can boost this post" });
      return;
    }
    const now = new Date();
    const [active] = await db
      .select()
      .from(postBoostsTable)
      .where(
        and(
          eq(postBoostsTable.postId, id),
          eq(postBoostsTable.status, "active"),
          gt(postBoostsTable.expiresAt, now),
        ),
      )
      .limit(1);
    if (active) {
      res
        .status(409)
        .json({ error: "Post is already boosted", expiresAt: active.expiresAt });
      return;
    }

    if (!isStripeConnected()) {
      // Dev fallback: instantly activate
      const expires = new Date(
        now.getTime() + BOOST_DURATION_HOURS * 60 * 60 * 1000,
      );
      const [created] = await db
        .insert(postBoostsTable)
        .values({
          postId: id,
          buyerId: me,
          amountCents: BOOST_PRICE_CENTS,
          durationHours: BOOST_DURATION_HOURS,
          status: "active",
          startsAt: now,
          expiresAt: expires,
        })
        .returning();
      res.json({
        url: `${appOrigin()}/app/post/${id}?boost_success=1`,
        sessionId: `dev_boost_${created.id}`,
      });
      return;
    }

    try {
      const [pending] = await db
        .insert(postBoostsTable)
        .values({
          postId: id,
          buyerId: me,
          amountCents: BOOST_PRICE_CENTS,
          durationHours: BOOST_DURATION_HOURS,
          status: "pending",
        })
        .returning();
      const stripe = await getUncachableStripeClient();
      const origin = appOrigin();
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: BOOST_PRICE_CENTS,
              product_data: {
                name: "HashChat Post Boost — 24 hours",
                description: "Boost your post for 24h to surface higher in feeds.",
              },
            },
          },
        ],
        success_url: `${origin}/app/post/${id}?boost_success=1`,
        cancel_url: `${origin}/app/post/${id}`,
        metadata: {
          kind: "boost",
          boostId: String(pending.id),
          postId: String(id),
          buyerId: me,
        },
      });
      await db
        .update(postBoostsTable)
        .set({ stripeSessionId: session.id })
        .where(eq(postBoostsTable.id, pending.id));
      res.json({
        url: session.url ?? `${origin}/app/post/${id}`,
        sessionId: session.id,
      });
    } catch (err) {
      req.log.error({ err }, "boosts: stripe checkout failed");
      res.status(500).json({ error: "Could not start checkout" });
    }
  },
);

router.get(
  "/posts/:id/boost",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid post id" });
      return;
    }
    const now = new Date();
    const [active] = await db
      .select({
        expiresAt: postBoostsTable.expiresAt,
        buyerId: postBoostsTable.buyerId,
      })
      .from(postBoostsTable)
      .where(
        and(
          eq(postBoostsTable.postId, id),
          eq(postBoostsTable.status, "active"),
          gt(postBoostsTable.expiresAt, now),
        ),
      )
      .orderBy(desc(postBoostsTable.expiresAt))
      .limit(1);
    if (!active) {
      res.json({ active: false, expiresAt: null, boostedBy: null });
      return;
    }
    res.json({
      active: true,
      expiresAt: active.expiresAt?.toISOString() ?? null,
      boostedBy: active.buyerId,
    });
  },
);

/**
 * Returns active boosted post IDs as a Map of postId -> expiresAt.
 * Used by buildPosts and discovery ranking.
 */
export async function loadActiveBoostsForPosts(
  postIds: number[],
): Promise<Map<number, Date>> {
  if (postIds.length === 0) return new Map();
  const rows = await db
    .select({
      postId: postBoostsTable.postId,
      expiresAt: postBoostsTable.expiresAt,
    })
    .from(postBoostsTable)
    .where(
      and(
        sql`${postBoostsTable.postId} = ANY(${postIds})`,
        eq(postBoostsTable.status, "active"),
        gt(postBoostsTable.expiresAt, new Date()),
      ),
    );
  const map = new Map<number, Date>();
  for (const r of rows) {
    if (r.expiresAt && (!map.has(r.postId) || map.get(r.postId)! < r.expiresAt)) {
      map.set(r.postId, r.expiresAt);
    }
  }
  return map;
}

export default router;
