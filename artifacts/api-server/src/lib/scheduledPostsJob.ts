import { logger } from "./logger";
import { publishDueScheduledPosts } from "../routes/posts";

const POLL_INTERVAL_MS = 30 * 1000;

let timer: NodeJS.Timeout | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const n = await publishDueScheduledPosts();
    if (n > 0) {
      logger.info({ published: n }, "scheduled posts published");
    }
  } catch (err) {
    logger.error({ err }, "scheduled posts tick failed");
  } finally {
    running = false;
  }
}

export function startScheduledPostsScheduler(): void {
  if (timer) return;
  setTimeout(() => void tick(), 5_000);
  timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
  logger.info({ intervalMs: POLL_INTERVAL_MS }, "scheduled posts scheduler started");
}
