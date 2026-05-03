import type { Request } from "express";
import { getAuth } from "@clerk/express";
import { db, userSessionsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "./logger";

const TOUCH_THROTTLE_MS = 60_000;
const lastTouch = new Map<string, number>();

function uaToLabel(ua: string | undefined): string {
  if (!ua) return "Unknown device";
  const u = ua.toLowerCase();
  if (u.includes("expo") || u.includes("react-native")) return "Mobile app";
  if (u.includes("iphone")) return "iPhone";
  if (u.includes("ipad")) return "iPad";
  if (u.includes("android")) return "Android";
  if (u.includes("mac os x")) return "Mac";
  if (u.includes("windows")) return "Windows";
  if (u.includes("linux")) return "Linux";
  return "Web browser";
}

function ipRegion(req: Request): string | null {
  const cf = req.header("cf-ipcountry");
  if (cf) return String(cf);
  const region = req.header("x-vercel-ip-country") ?? req.header("x-replit-region");
  if (region) return String(region);
  return null;
}

export function getCurrentClerkSessionId(req: Request): string | null {
  try {
    const a = getAuth(req);
    return a?.sessionId ?? null;
  } catch {
    return null;
  }
}

export async function trackUserSession(req: Request, userId: string): Promise<void> {
  const sessionId = getCurrentClerkSessionId(req);
  if (!sessionId) return;
  const cacheKey = `${userId}:${sessionId}`;
  const now = Date.now();
  const prev = lastTouch.get(cacheKey) ?? 0;
  if (now - prev < TOUCH_THROTTLE_MS) return;
  lastTouch.set(cacheKey, now);
  const ua = req.header("user-agent") ?? null;
  try {
    await db
      .insert(userSessionsTable)
      .values({
        userId,
        sessionId,
        deviceLabel: uaToLabel(ua ?? undefined),
        userAgent: ua,
        ipRegion: ipRegion(req),
        lastSeenAt: new Date(now),
      })
      .onConflictDoUpdate({
        target: [userSessionsTable.userId, userSessionsTable.sessionId],
        set: {
          lastSeenAt: new Date(now),
          userAgent: ua,
          ipRegion: ipRegion(req),
          revokedAt: null,
        },
      });
  } catch (err) {
    logger.warn({ err }, "failed to track user session");
  }
}

export async function revokeUserSession(
  userId: string,
  rowId: number,
): Promise<{ ok: boolean; sessionId: string | null }> {
  const [row] = await db
    .select()
    .from(userSessionsTable)
    .where(and(eq(userSessionsTable.id, rowId), eq(userSessionsTable.userId, userId)))
    .limit(1);
  if (!row) return { ok: false, sessionId: null };
  await db
    .update(userSessionsTable)
    .set({ revokedAt: new Date() })
    .where(eq(userSessionsTable.id, rowId));
  // Best-effort: also try Clerk session revoke. Clerk sessions API may or may
  // not be available depending on key scope; failures are non-fatal.
  try {
    const mod = (await import("@clerk/express")) as {
      clerkClient?: {
        sessions?: {
          revokeSession?: (id: string) => Promise<unknown>;
        };
      };
    };
    await mod.clerkClient?.sessions?.revokeSession?.(row.sessionId);
  } catch (err) {
    logger.warn({ err }, "clerk session revoke failed (non-fatal)");
  }
  return { ok: true, sessionId: row.sessionId };
}
