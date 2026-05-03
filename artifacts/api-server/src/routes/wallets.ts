import { Router, type IRouter } from "express";
import {
  db,
  solanaWalletsTable,
  solanaWalletChallengesTable,
} from "@workspace/db";
import { eq, and, desc, lt, sql } from "drizzle-orm";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import crypto from "node:crypto";
import { requireAuth, getUserId } from "../middlewares/requireAuth";

const router: IRouter = Router();

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_WALLETS_PER_USER = 5;

function isValidPublicKey(input: unknown): input is string {
  if (typeof input !== "string") return false;
  try {
    new PublicKey(input);
    return true;
  } catch {
    return false;
  }
}

function buildSignMessage(nonce: string, publicKey: string): string {
  return [
    "HashChat wallet verification",
    `Wallet: ${publicKey}`,
    `Nonce: ${nonce}`,
    "Signing this message proves you own this wallet. No transaction is sent and no funds are moved.",
  ].join("\n");
}

function shapeWallet(row: typeof solanaWalletsTable.$inferSelect) {
  return {
    id: row.id,
    publicKey: row.publicKey,
    label: row.label,
    isPrimary: row.isPrimary,
    createdAt: row.createdAt.toISOString(),
  };
}

router.post(
  "/me/wallets/challenge",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const body = (req.body ?? {}) as { publicKey?: unknown };
    if (!isValidPublicKey(body.publicKey)) {
      res.status(400).json({ error: "Invalid Solana public key" });
      return;
    }
    const publicKey = body.publicKey;

    // Garbage-collect expired challenges for this user/key
    await db
      .delete(solanaWalletChallengesTable)
      .where(lt(solanaWalletChallengesTable.expiresAt, new Date()));

    const nonce = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);

    await db.insert(solanaWalletChallengesTable).values({
      userId: me,
      publicKey,
      nonce,
      expiresAt,
    });

    res.json({
      nonce,
      message: buildSignMessage(nonce, publicKey),
      expiresAt: expiresAt.toISOString(),
    });
  },
);

router.post(
  "/me/wallets/verify",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const body = (req.body ?? {}) as {
      publicKey?: unknown;
      signature?: unknown;
      label?: unknown;
    };

    if (!isValidPublicKey(body.publicKey)) {
      res.status(400).json({ error: "Invalid Solana public key" });
      return;
    }
    if (typeof body.signature !== "string" || body.signature.length === 0) {
      res.status(400).json({ error: "Missing signature" });
      return;
    }
    const publicKey = body.publicKey;
    const label =
      typeof body.label === "string"
        ? body.label.trim().slice(0, 64) || null
        : null;

    // Find a non-expired challenge
    const [challenge] = await db
      .select()
      .from(solanaWalletChallengesTable)
      .where(
        and(
          eq(solanaWalletChallengesTable.userId, me),
          eq(solanaWalletChallengesTable.publicKey, publicKey),
        ),
      )
      .orderBy(desc(solanaWalletChallengesTable.createdAt))
      .limit(1);

    if (!challenge || challenge.expiresAt.getTime() < Date.now()) {
      res
        .status(400)
        .json({ error: "Challenge not found or expired. Try again." });
      return;
    }

    // Verify signature with tweetnacl
    const message = buildSignMessage(challenge.nonce, publicKey);
    let signatureBytes: Uint8Array;
    try {
      signatureBytes = bs58.decode(body.signature);
    } catch {
      res.status(400).json({ error: "Signature is not valid base58" });
      return;
    }
    const messageBytes = new TextEncoder().encode(message);
    const pubKeyBytes = new PublicKey(publicKey).toBytes();

    const ok = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      pubKeyBytes,
    );
    if (!ok) {
      res.status(400).json({ error: "Signature verification failed" });
      return;
    }

    // Consume the challenge (and any other outstanding ones for this pair)
    await db
      .delete(solanaWalletChallengesTable)
      .where(
        and(
          eq(solanaWalletChallengesTable.userId, me),
          eq(solanaWalletChallengesTable.publicKey, publicKey),
        ),
      );

    // Check ownership of an existing entry for this key
    const [existing] = await db
      .select()
      .from(solanaWalletsTable)
      .where(eq(solanaWalletsTable.publicKey, publicKey))
      .limit(1);

    if (existing && existing.userId !== me) {
      res
        .status(409)
        .json({ error: "This wallet is already linked to another account" });
      return;
    }
    if (existing) {
      res.json(shapeWallet(existing));
      return;
    }

    // Enforce max wallets
    const [{ c }] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(solanaWalletsTable)
      .where(eq(solanaWalletsTable.userId, me));
    if ((c ?? 0) >= MAX_WALLETS_PER_USER) {
      res.status(400).json({
        error: `You can link at most ${MAX_WALLETS_PER_USER} wallets`,
      });
      return;
    }

    const isPrimary = (c ?? 0) === 0;
    const [row] = await db
      .insert(solanaWalletsTable)
      .values({ userId: me, publicKey, label, isPrimary })
      .returning();

    res.status(201).json(shapeWallet(row));
  },
);

router.get("/me/wallets", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const rows = await db
    .select()
    .from(solanaWalletsTable)
    .where(eq(solanaWalletsTable.userId, me))
    .orderBy(desc(solanaWalletsTable.isPrimary), desc(solanaWalletsTable.createdAt));
  res.json({ wallets: rows.map(shapeWallet) });
});

router.delete(
  "/me/wallets/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [row] = await db
      .select()
      .from(solanaWalletsTable)
      .where(
        and(eq(solanaWalletsTable.id, id), eq(solanaWalletsTable.userId, me)),
      )
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Wallet not found" });
      return;
    }
    await db.delete(solanaWalletsTable).where(eq(solanaWalletsTable.id, id));

    // If we removed the primary, promote the next one
    if (row.isPrimary) {
      const [next] = await db
        .select()
        .from(solanaWalletsTable)
        .where(eq(solanaWalletsTable.userId, me))
        .orderBy(desc(solanaWalletsTable.createdAt))
        .limit(1);
      if (next) {
        await db
          .update(solanaWalletsTable)
          .set({ isPrimary: true })
          .where(eq(solanaWalletsTable.id, next.id));
      }
    }
    res.status(204).end();
  },
);

router.post(
  "/me/wallets/:id/primary",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [row] = await db
      .select()
      .from(solanaWalletsTable)
      .where(
        and(eq(solanaWalletsTable.id, id), eq(solanaWalletsTable.userId, me)),
      )
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Wallet not found" });
      return;
    }
    await db
      .update(solanaWalletsTable)
      .set({ isPrimary: false })
      .where(eq(solanaWalletsTable.userId, me));
    await db
      .update(solanaWalletsTable)
      .set({ isPrimary: true })
      .where(eq(solanaWalletsTable.id, id));
    const [updated] = await db
      .select()
      .from(solanaWalletsTable)
      .where(eq(solanaWalletsTable.id, id))
      .limit(1);
    res.json(shapeWallet(updated));
  },
);

// Public: fetch wallets for any user (used to render the verified-wallet badge)
router.get("/users/:id/wallets", async (req, res): Promise<void> => {
  const userId = req.params.id;
  const rows = await db
    .select()
    .from(solanaWalletsTable)
    .where(eq(solanaWalletsTable.userId, userId))
    .orderBy(desc(solanaWalletsTable.isPrimary), desc(solanaWalletsTable.createdAt));
  res.json({ wallets: rows.map(shapeWallet) });
});

export default router;
