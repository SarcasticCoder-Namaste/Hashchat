import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function isUserPremium(userId: string): Promise<boolean> {
  const [u] = await db
    .select({
      tier: usersTable.tier,
      premiumUntil: usersTable.premiumUntil,
      mvpPlan: usersTable.mvpPlan,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!u) return false;
  if (u.mvpPlan) return true;
  if (u.tier !== "premium" && u.tier !== "pro") return false;
  if (!u.premiumUntil) return false;
  return u.premiumUntil.getTime() > Date.now();
}

export function appOrigin(): string {
  return (
    process.env.PUBLIC_APP_URL ??
    (process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
      : process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : "http://localhost:5000")
  );
}
