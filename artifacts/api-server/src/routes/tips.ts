import { Router, type IRouter } from "express";
import {
  db,
  tipsTable,
  usersTable,
  creatorBalancesTable,
  solanaWalletsTable,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import {
  getUncachableStripeClient,
  isStripeConnected,
} from "../lib/stripeClient";
import { appOrigin } from "../lib/premiumHelpers";
import { createNotification } from "../lib/notifications";

const router: IRouter = Router();

const MIN_TIP_CENTS = 100;
const MAX_TIP_CENTS = 50000;

async function shapeTip(t: typeof tipsTable.$inferSelect) {
  const [from] = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
      avatarUrl: usersTable.avatarUrl,
      animatedAvatarUrl: usersTable.animatedAvatarUrl,
      discriminator: usersTable.discriminator,
      role: usersTable.role,
      mvpPlan: usersTable.mvpPlan,
      verified: usersTable.verified,
      tier: usersTable.tier,
    })
    .from(usersTable)
    .where(eq(usersTable.id, t.fromUserId))
    .limit(1);
  const [to] = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
      avatarUrl: usersTable.avatarUrl,
      animatedAvatarUrl: usersTable.animatedAvatarUrl,
      discriminator: usersTable.discriminator,
      role: usersTable.role,
      mvpPlan: usersTable.mvpPlan,
      verified: usersTable.verified,
      tier: usersTable.tier,
    })
    .from(usersTable)
    .where(eq(usersTable.id, t.toUserId))
    .limit(1);
  const lamports = t.amountLamports
    ? typeof t.amountLamports === "string"
      ? t.amountLamports
      : String(t.amountLamports)
    : null;
  return {
    id: t.id,
    fromUser: from,
    toUser: to,
    postId: t.postId,
    currency: t.currency,
    amountCents: t.amountCents ?? null,
    amountLamports: lamports,
    amountSol: lamports ? Number(lamports) / 1_000_000_000 : null,
    message: t.message,
    status: t.status,
    solanaSignature: t.solanaSignature,
    createdAt: t.createdAt.toISOString(),
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
  };
}

router.post("/tips/checkout", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const body = (req.body ?? {}) as {
    toUserId?: unknown;
    amountCents?: unknown;
    message?: unknown;
    postId?: unknown;
  };
  const toUserId = typeof body.toUserId === "string" ? body.toUserId : "";
  const amountCents =
    typeof body.amountCents === "number" ? Math.floor(body.amountCents) : 0;
  const message =
    typeof body.message === "string" ? body.message.slice(0, 280) : null;
  const postId =
    typeof body.postId === "number" ? Math.floor(body.postId) : null;
  if (!toUserId || toUserId === me) {
    res.status(400).json({ error: "Invalid recipient" });
    return;
  }
  if (amountCents < MIN_TIP_CENTS || amountCents > MAX_TIP_CENTS) {
    res
      .status(400)
      .json({ error: `Amount must be between $1 and $${MAX_TIP_CENTS / 100}` });
    return;
  }
  const [recipient] = await db
    .select({
      id: usersTable.id,
      displayName: usersTable.displayName,
      username: usersTable.username,
    })
    .from(usersTable)
    .where(eq(usersTable.id, toUserId))
    .limit(1);
  if (!recipient) {
    res.status(404).json({ error: "Recipient not found" });
    return;
  }

  if (!isStripeConnected()) {
    // Dev fallback: complete tip immediately
    const [created] = await db
      .insert(tipsTable)
      .values({
        fromUserId: me,
        toUserId,
        postId,
        currency: "usd",
        amountCents,
        message,
        status: "completed",
        completedAt: new Date(),
      })
      .returning();
    await db
      .insert(creatorBalancesTable)
      .values({ userId: toUserId, usdCents: amountCents })
      .onConflictDoUpdate({
        target: creatorBalancesTable.userId,
        set: {
          usdCents: (
            (
              await db
                .select()
                .from(creatorBalancesTable)
                .where(eq(creatorBalancesTable.userId, toUserId))
                .limit(1)
            )[0]?.usdCents ?? 0
          ) + amountCents,
          updatedAt: new Date(),
        },
      });
    await createNotification({
      recipientId: toUserId,
      actorId: me,
      kind: "reaction",
      targetType: postId ? "post" : "user",
      targetId: postId ?? null,
      snippet: `tipped you $${(amountCents / 100).toFixed(2)}`,
    });
    res.json({
      url: `${appOrigin()}/app/tips/inbox?dev_confirm=1&tip=${created.id}`,
      sessionId: `dev_${created.id}`,
    });
    return;
  }

  try {
    const [pending] = await db
      .insert(tipsTable)
      .values({
        fromUserId: me,
        toUserId,
        postId,
        currency: "usd",
        amountCents,
        message,
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
            unit_amount: amountCents,
            product_data: {
              name: `Tip to @${recipient.username}`,
              description: message ?? "HashChat creator tip",
            },
          },
        },
      ],
      success_url: `${origin}/app/tips/inbox?tip_success=1`,
      cancel_url: `${origin}/app/profile/${recipient.username}`,
      metadata: {
        kind: "tip",
        tipId: String(pending.id),
        fromUserId: me,
        toUserId,
      },
    });
    await db
      .update(tipsTable)
      .set({ stripeSessionId: session.id })
      .where(eq(tipsTable.id, pending.id));
    res.json({ url: session.url ?? `${origin}/app/tips/inbox`, sessionId: session.id });
  } catch (err) {
    req.log.error({ err }, "tips: stripe checkout failed");
    res.status(500).json({ error: "Could not start checkout" });
  }
});

router.post(
  "/tips/solana/record",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const body = (req.body ?? {}) as {
      toUserId?: unknown;
      amountLamports?: unknown;
      signature?: unknown;
      message?: unknown;
      postId?: unknown;
    };
    const toUserId = typeof body.toUserId === "string" ? body.toUserId : "";
    const lamports =
      typeof body.amountLamports === "string" ? body.amountLamports : "";
    const signature =
      typeof body.signature === "string" ? body.signature : "";
    const message =
      typeof body.message === "string" ? body.message.slice(0, 280) : null;
    const postId =
      typeof body.postId === "number" ? Math.floor(body.postId) : null;
    if (!toUserId || toUserId === me || !signature || !/^[0-9]+$/.test(lamports)) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const lamportsBig = BigInt(lamports);
    if (lamportsBig <= 0n) {
      res.status(400).json({ error: "Amount must be positive" });
      return;
    }
    // Idempotency: skip if signature already recorded
    const [existing] = await db
      .select()
      .from(tipsTable)
      .where(eq(tipsTable.solanaSignature, signature))
      .limit(1);
    if (existing) {
      res.status(201).json(await shapeTip(existing));
      return;
    }
    const [created] = await db
      .insert(tipsTable)
      .values({
        fromUserId: me,
        toUserId,
        postId,
        currency: "sol",
        amountLamports: lamports,
        message,
        solanaSignature: signature,
        status: "completed",
        completedAt: new Date(),
      })
      .returning();
    // Update balance
    const [bal] = await db
      .select()
      .from(creatorBalancesTable)
      .where(eq(creatorBalancesTable.userId, toUserId))
      .limit(1);
    const newLamports = (BigInt(bal?.solLamports ?? "0") + lamportsBig).toString();
    if (bal) {
      await db
        .update(creatorBalancesTable)
        .set({ solLamports: newLamports, updatedAt: new Date() })
        .where(eq(creatorBalancesTable.userId, toUserId));
    } else {
      await db
        .insert(creatorBalancesTable)
        .values({ userId: toUserId, solLamports: newLamports });
    }
    await createNotification({
      recipientId: toUserId,
      actorId: me,
      kind: "reaction",
      targetType: postId ? "post" : "user",
      targetId: postId ?? null,
      snippet: `tipped you ${(Number(lamportsBig) / 1_000_000_000).toFixed(4)} SOL`,
    });
    res.status(201).json(await shapeTip(created));
  },
);

router.get("/me/tips/inbox", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const rows = await db
    .select()
    .from(tipsTable)
    .where(and(eq(tipsTable.toUserId, me), eq(tipsTable.status, "completed")))
    .orderBy(desc(tipsTable.createdAt))
    .limit(100);
  const result = await Promise.all(rows.map(shapeTip));
  res.json(result);
});

router.get("/me/tips/outbox", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const rows = await db
    .select()
    .from(tipsTable)
    .where(eq(tipsTable.fromUserId, me))
    .orderBy(desc(tipsTable.createdAt))
    .limit(100);
  const result = await Promise.all(rows.map(shapeTip));
  res.json(result);
});

router.get(
  "/me/tips/balance",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const [bal] = await db
      .select()
      .from(creatorBalancesTable)
      .where(eq(creatorBalancesTable.userId, me))
      .limit(1);
    res.json({
      usdCents: bal?.usdCents ?? 0,
      solLamports: bal?.solLamports ?? "0",
      cashOutAvailable: false,
    });
  },
);

router.get(
  "/users/:id/tip-target",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const [user] = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        displayName: usersTable.displayName,
      })
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);
    if (!user) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const [primary] = await db
      .select({ publicKey: solanaWalletsTable.publicKey })
      .from(solanaWalletsTable)
      .where(
        and(
          eq(solanaWalletsTable.userId, id),
          eq(solanaWalletsTable.isPrimary, true),
        ),
      )
      .limit(1);
    res.json({
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      acceptsUsd: isStripeConnected() || true,
      acceptsSol: !!primary,
      solanaAddress: primary?.publicKey ?? null,
    });
  },
);

export default router;
