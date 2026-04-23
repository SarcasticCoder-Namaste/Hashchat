import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export function getUserId(req: Request): string {
  const id = (req as Request & { userId?: string }).userId;
  if (!id) throw new Error("getUserId called without requireAuth");
  return id;
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 24) || "user"
  );
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

  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, clerkUserId))
    .limit(1);

  if (existing.length === 0) {
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

      await db
        .insert(usersTable)
        .values({
          id: clerkUserId,
          username,
          displayName,
          avatarUrl: clerkUser.imageUrl ?? null,
          status: "online",
        })
        .onConflictDoNothing();
    } catch (err) {
      req.log.warn({ err }, "Failed to bootstrap user from Clerk");
      res.status(500).json({ error: "Failed to bootstrap user" });
      return;
    }
  }

  (req as Request & { userId?: string }).userId = clerkUserId;
  next();
}
