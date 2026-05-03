import { logger } from "./logger";
import { publishDueScheduledPosts } from "../routes/posts";
import { publishDueScheduledMessages } from "../routes/scheduledMessages";

const POLL_INTERVAL_MS = 30 * 1000;

let timer: NodeJS.Timeout | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const [posts, dms] = await Promise.all([
      publishDueScheduledPosts().catch((err) => {
        logger.error({ err }, "scheduled posts publish failed");
        return 0;
      }),
      publishDueScheduledMessages().catch((err) => {
        logger.error({ err }, "scheduled DMs publish failed");
        return 0;
      }),
    ]);
    if (posts > 0 || dms > 0) {
      logger.info({ posts, dms }, "scheduled items published");
    }
  } catch (err) {
    logger.error({ err }, "scheduled tick failed");
  } finally {
    running = false;
  }
}

export function startScheduledPostsScheduler(): void {
  if (timer) return;
  setTimeout(() => void tick(), 5_000);
  timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
  logger.info({ intervalMs: POLL_INTERVAL_MS }, "scheduled items scheduler started");
}
