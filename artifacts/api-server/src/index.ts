import app from "./app";
import { logger } from "./lib/logger";
import { startHashtagMetricsScheduler } from "./lib/hashtagMetricsJob";
import { startEventReminderScheduler } from "./lib/eventReminders";
import { startPollReminderScheduler } from "./lib/pollReminders";
import { startScheduledPostsScheduler } from "./lib/scheduledPostsJob";
import { startExpiredSparksScheduler } from "./lib/schedulers/expiredSparksJob";
import { startWeeklyLeaderboardScheduler } from "./lib/weeklyLeaderboardJob";
import { initStripe } from "./lib/stripeInit";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startHashtagMetricsScheduler();
  startEventReminderScheduler();
  startPollReminderScheduler();
  startScheduledPostsScheduler();
  startExpiredSparksScheduler();
  startWeeklyLeaderboardScheduler();
  void initStripe();
});
