import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export function getUserId(req: Request): string {
  const id = (req as Request & { userId?: string }).userId;
  if (!id) throw new Error("getUserId called without requireAuth");
  return id;
}

export function getUserRole(req: Request): string {
  return (req as Request & { userRole?: string }).userRole ?? "user";
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 24) || "user"
  );
}

async function generateDiscriminator(): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const code = String(Math.floor(Math.random() * 90000) + 10000);
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.discriminator, code))
      .limit(1);
    if (existing.length === 0) return code;
  }
  // Last-resort fallback
  return String(Date.now()).slice(-5);
}

function isBootstrapAdminId(userId: string): boolean {
  const raw = process.env["ADMIN_USER_IDS"];
  if (!raw) return false;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(userId);
}

const lastSeenCache = new Map<string, number>();
const LAST_SEEN_THROTTLE_MS = 30_000;

async function touchLastSeen(userId: string) {
  const now = Date.now();
  const prev = lastSeenCache.get(userId) ?? 0;
  if (now - prev < LAST_SEEN_THROTTLE_MS) return;
  lastSeenCache.set(userId, now);
  try {
    await db
      .update(usersTable)
      .set({ lastSeenAt: new Date(now) })
      .where(eq(usersTable.id, userId));
  } catch {
    // best-effort
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId as string | undefined;
  const clerkUserId = userId ?? auth?.userId;
  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let existingRow = (
    await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, clerkUserId))
      .limit(1)
  )[0];

  if (!existingRow) {
    try {
      const clerkUser = await clerkClient.users.getUser(clerkUserId);
      const handle =
        clerkUser.username ||
        clerkUser.emailAddresses[0]?.emailAddress?.split("@")[0] ||
        clerkUser.firstName ||
        clerkUserId;
      let username = slugify(handle);

      const collide = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.username, username))
        .limit(1);
      if (collide.length > 0) {
        username = `${username}${Math.floor(Math.random() * 9000) + 1000}`;
      }

      const displayName =
        [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
        clerkUser.username ||
        username;

      const discriminator = await generateDiscriminator();
      const role = isBootstrapAdminId(clerkUserId) ? "admin" : "user";

      await db
        .insert(usersTable)
        .values({
          id: clerkUserId,
          username,
          displayName,
          avatarUrl: clerkUser.imageUrl ?? null,
          status: "online",
          discriminator,
          role,
        })
        .onConflictDoNothing();

      existingRow = (
        await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, clerkUserId))
          .limit(1)
      )[0];
    } catch (err) {
      req.log.warn({ err }, "Failed to bootstrap user from Clerk");
      res.status(500).json({ error: "Failed to bootstrap user" });
      return;
    }
  }

  if (!existingRow) {
    res.status(500).json({ error: "Failed to bootstrap user" });
    return;
  }

  // Backfill discriminator if missing
  if (!existingRow.discriminator) {
    const discriminator = await generateDiscriminator();
    await db
      .update(usersTable)
      .set({ discriminator })
      .where(eq(usersTable.id, clerkUserId));
    existingRow.discriminator = discriminator;
  }

  // Auto-promote bootstrap admin (immutable Clerk user IDs) if not already
  if (isBootstrapAdminId(clerkUserId) && existingRow.role !== "admin") {
    await db
      .update(usersTable)
      .set({ role: "admin" })
      .where(eq(usersTable.id, clerkUserId));
    existingRow.role = "admin";
  }

  if (existingRow.bannedAt) {
    res.status(403).json({ error: "Account suspended" });
    return;
  }

  void touchLastSeen(clerkUserId);

  (req as Request & { userId?: string }).userId = clerkUserId;
  (req as Request & { userRole?: string }).userRole = existingRow.role;
  next();
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const role = getUserRole(req);
  if (role !== "admin") {
    res.status(403).json({ error: "Admins only" });
    return;
  }
  next();
}

export function requireModerator(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const role = getUserRole(req);
  if (role !== "admin" && role !== "moderator") {
    res.status(403).json({ error: "Moderators only" });
    return;
  }
  next();
}
