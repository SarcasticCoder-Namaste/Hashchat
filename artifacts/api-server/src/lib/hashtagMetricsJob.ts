import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export async function aggregateHashtagMetrics(sinceDays = 2): Promise<void> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - sinceDays);
  const sinceIso = since.toISOString();
  const sinceDay = sinceIso.slice(0, 10);

  await db.execute(sql`
    DELETE FROM hashtag_metrics_daily WHERE day >= ${sinceDay}
  `);

  await db.execute(sql`
    INSERT INTO hashtag_metrics_daily (tag, day, posts, messages, new_members, new_followers, updated_at)
    SELECT
      m.room_tag AS tag,
      to_char(date_trunc('day', m.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      0, count(*)::int, 0, 0, now()
    FROM messages m
    WHERE m.room_tag IS NOT NULL
      AND m.deleted_at IS NULL
      AND m.created_at >= ${sinceIso}::timestamptz
    GROUP BY m.room_tag, day
    ON CONFLICT (tag, day) DO UPDATE SET messages = EXCLUDED.messages, updated_at = now()
  `);

  await db.execute(sql`
    INSERT INTO hashtag_metrics_daily (tag, day, posts, messages, new_members, new_followers, updated_at)
    SELECT
      ph.tag,
      to_char(date_trunc('day', p.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      count(*)::int, 0, 0, 0, now()
    FROM post_hashtags ph
    JOIN posts p ON p.id = ph.post_id
    WHERE p.deleted_at IS NULL
      AND p.created_at >= ${sinceIso}::timestamptz
    GROUP BY ph.tag, day
    ON CONFLICT (tag, day) DO UPDATE SET posts = EXCLUDED.posts, updated_at = now()
  `);

  await db.execute(sql`
    INSERT INTO hashtag_metrics_daily (tag, day, posts, messages, new_members, new_followers, updated_at)
    SELECT
      uh.tag,
      to_char(date_trunc('day', uh.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      0, 0, count(*)::int, 0, now()
    FROM user_hashtags uh
    WHERE uh.created_at >= ${sinceIso}::timestamptz
    GROUP BY uh.tag, day
    ON CONFLICT (tag, day) DO UPDATE SET new_members = EXCLUDED.new_members, updated_at = now()
  `);

  await db.execute(sql`
    INSERT INTO hashtag_metrics_daily (tag, day, posts, messages, new_members, new_followers, updated_at)
    SELECT
      ufh.tag,
      to_char(date_trunc('day', ufh.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      0, 0, 0, count(*)::int, now()
    FROM user_followed_hashtags ufh
    WHERE ufh.created_at >= ${sinceIso}::timestamptz
    GROUP BY ufh.tag, day
    ON CONFLICT (tag, day) DO UPDATE SET new_followers = EXCLUDED.new_followers, updated_at = now()
  `);
}

let scheduled = false;

export function startHashtagMetricsScheduler(): void {
  if (scheduled) return;
  scheduled = true;

  const run = async (label: string) => {
    try {
      const start = Date.now();
      await aggregateHashtagMetrics(2);
      logger.info(
        { ms: Date.now() - start, label },
        "hashtag metrics aggregated",
      );
    } catch (err) {
      logger.error({ err, label }, "hashtag metrics aggregation failed");
    }
  };

  // Run once shortly after startup to catch up.
  setTimeout(() => void run("startup"), 30_000);

  // Schedule the next run for ~00:10 UTC, then every 24h thereafter.
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(24, 10, 0, 0);
  const msUntilNext = Math.max(60_000, next.getTime() - now.getTime());
  setTimeout(() => {
    void run("nightly");
    setInterval(() => void run("nightly"), 24 * 60 * 60 * 1000);
  }, msUntilNext);

  logger.info(
    { firstRunInMs: msUntilNext },
    "hashtag metrics scheduler started",
  );
}
