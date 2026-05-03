import { db, sparksTable } from "@workspace/db";
import { lt } from "drizzle-orm";
import { logger } from "../logger";

const POLL_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const STARTUP_DELAY_MS = 30 * 1000;

let timer: NodeJS.Timeout | null = null;
let running = false;

export async function runExpiredSparksCleanupTick(
  now: Date = new Date(),
): Promise<number> {
  if (running) return 0;
  running = true;
  const start = Date.now();
  try {
    const deleted = await db
      .delete(sparksTable)
      .where(lt(sparksTable.expiresAt, now))
      .returning({ id: sparksTable.id });
    const count = deleted.length;
    if (count > 0) {
      logger.info(
        { count, ms: Date.now() - start },
        "expired sparks cleaned up",
      );
    } else {
      logger.info(
        { count, ms: Date.now() - start },
        "expired sparks cleanup tick (no rows)",
      );
    }
    return count;
  } catch (err) {
    logger.error({ err }, "expired sparks cleanup failed");
    return 0;
  } finally {
    running = false;
  }
}

export function startExpiredSparksScheduler(): void {
  if (timer) return;
  setTimeout(() => {
    void runExpiredSparksCleanupTick();
  }, STARTUP_DELAY_MS);
  timer = setInterval(() => {
    void runExpiredSparksCleanupTick();
  }, POLL_INTERVAL_MS);
  if (typeof timer.unref === "function") timer.unref();
  logger.info(
    { intervalMs: POLL_INTERVAL_MS },
    "expired sparks scheduler started",
  );
}

export function stopExpiredSparksScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
