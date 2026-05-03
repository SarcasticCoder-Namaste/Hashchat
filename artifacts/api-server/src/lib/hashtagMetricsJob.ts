import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { createNotification } from "./notifications";

const POST_IMPRESSION_MILESTONES = [100, 1000, 10000] as const;

function formatImpressions(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000).toLocaleString()}k`;
  return n.toLocaleString();
}

export async function notifyPostImpressionMilestones(): Promise<void> {
  const thresholds = POST_IMPRESSION_MILESTONES;
  const minThreshold = thresholds[0];

  const result = await db.execute<{
    post_id: number;
    author_id: string;
    total_impressions: number;
  }>(sql`
    SELECT p.id AS post_id,
           p.author_id,
           COALESCE(SUM(psd.impressions), 0)::int AS total_impressions
    FROM posts p
    JOIN post_stats_daily psd ON psd.post_id = p.id
    WHERE p.deleted_at IS NULL
    GROUP BY p.id, p.author_id
    HAVING COALESCE(SUM(psd.impressions), 0) >= ${minThreshold}
  `);

  const rows = (result as unknown as { rows: Array<{ post_id: number; author_id: string; total_impressions: number }> }).rows
    ?? (result as unknown as Array<{ post_id: number; author_id: string; total_impressions: number }>);

  for (const row of rows) {
    const total = Number(row.total_impressions);
    for (const threshold of thresholds) {
      if (total < threshold) continue;
      // Idempotent reservation: only create the notification if this
      // (post, threshold) pair has not been recorded before.
      const insert = await db.execute<{ post_id: number }>(sql`
        INSERT INTO post_milestone_notifications (post_id, threshold)
        VALUES (${row.post_id}, ${threshold})
        ON CONFLICT (post_id, threshold) DO NOTHING
        RETURNING post_id
      `);
      const inserted = (insert as unknown as { rows: unknown[] }).rows
        ?? (insert as unknown as unknown[]);
      if (!inserted || inserted.length === 0) continue;

      try {
        await createNotification({
          recipientId: row.author_id,
          actorId: null,
          kind: "post_milestone",
          targetType: "post",
          targetId: row.post_id,
          snippet: `Your post just passed ${formatImpressions(threshold)} impressions.`,
          extra: JSON.stringify({ threshold, impressions: total }),
        });
      } catch (err) {
        logger.error(
          { err, postId: row.post_id, threshold },
          "post milestone notification failed",
        );
      }
    }
  }
}

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

  // Roll up per-post stats: impressions, unique viewers, profile/link clicks.
  await db.execute(sql`
    DELETE FROM post_stats_daily WHERE day >= ${sinceDay}
  `);
  await db.execute(sql`
    INSERT INTO post_stats_daily (post_id, day, impressions, unique_viewers, profile_clicks, link_clicks, likes, updated_at)
    SELECT
      pi.post_id,
      to_char(date_trunc('day', pi.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      count(*) filter (where pi.kind = 'view')::int,
      count(distinct pi.viewer_id) filter (where pi.kind = 'view')::int,
      count(*) filter (where pi.kind = 'profile_click')::int,
      count(*) filter (where pi.kind = 'link_click')::int,
      0,
      now()
    FROM post_impressions pi
    WHERE pi.created_at >= ${sinceIso}::timestamptz
    GROUP BY pi.post_id, day
    ON CONFLICT (post_id, day) DO UPDATE SET
      impressions = EXCLUDED.impressions,
      unique_viewers = EXCLUDED.unique_viewers,
      profile_clicks = EXCLUDED.profile_clicks,
      link_clicks = EXCLUDED.link_clicks,
      updated_at = now()
  `);
  await db.execute(sql`
    INSERT INTO post_stats_daily (post_id, day, impressions, unique_viewers, profile_clicks, link_clicks, likes, updated_at)
    SELECT
      pr.post_id,
      to_char(date_trunc('day', pr.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      0, 0, 0, 0, count(*)::int, now()
    FROM post_reactions pr
    WHERE pr.created_at >= ${sinceIso}::timestamptz
    GROUP BY pr.post_id, day
    ON CONFLICT (post_id, day) DO UPDATE SET
      likes = EXCLUDED.likes,
      updated_at = now()
  `);

  // Roll up per-user follower / posting / impression activity.
  await db.execute(sql`
    DELETE FROM user_follower_stats_daily WHERE day >= ${sinceDay}
  `);
  await db.execute(sql`
    INSERT INTO user_follower_stats_daily (user_id, day, new_followers, total_followers, posts, impressions, updated_at)
    SELECT
      uf.followee_id,
      to_char(date_trunc('day', uf.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      count(*)::int, 0, 0, 0, now()
    FROM user_follows uf
    WHERE uf.created_at >= ${sinceIso}::timestamptz
    GROUP BY uf.followee_id, day
    ON CONFLICT (user_id, day) DO UPDATE SET
      new_followers = EXCLUDED.new_followers,
      updated_at = now()
  `);
  await db.execute(sql`
    INSERT INTO user_follower_stats_daily (user_id, day, new_followers, total_followers, posts, impressions, updated_at)
    SELECT
      p.author_id,
      to_char(date_trunc('day', p.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      0, 0, count(*)::int, 0, now()
    FROM posts p
    WHERE p.deleted_at IS NULL AND p.created_at >= ${sinceIso}::timestamptz
    GROUP BY p.author_id, day
    ON CONFLICT (user_id, day) DO UPDATE SET
      posts = EXCLUDED.posts,
      updated_at = now()
  `);
  await db.execute(sql`
    INSERT INTO user_follower_stats_daily (user_id, day, new_followers, total_followers, posts, impressions, updated_at)
    SELECT
      p.author_id,
      to_char(date_trunc('day', pi.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      0, 0, 0, count(*) filter (where pi.kind = 'view')::int, now()
    FROM post_impressions pi
    JOIN posts p ON p.id = pi.post_id
    WHERE pi.created_at >= ${sinceIso}::timestamptz
    GROUP BY p.author_id, day
    ON CONFLICT (user_id, day) DO UPDATE SET
      impressions = EXCLUDED.impressions,
      updated_at = now()
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
    try {
      const start = Date.now();
      await notifyPostImpressionMilestones();
      logger.info(
        { ms: Date.now() - start, label },
        "post impression milestones checked",
      );
    } catch (err) {
      logger.error(
        { err, label },
        "post impression milestone notifications failed",
      );
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
