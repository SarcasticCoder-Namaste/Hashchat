import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "[backfill-post-and-follower-stats] DATABASE_URL is not set; aborting",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
let mode: "full" | "incremental" = "full";
let sinceDate: string | null = null;
let days = 365;

for (const a of args) {
  if (a === "--full") {
    mode = "full";
  } else if (a.startsWith("--since=")) {
    mode = "incremental";
    sinceDate = a.slice("--since=".length);
  } else if (a.startsWith("--days=")) {
    mode = "incremental";
    days = Math.max(1, parseInt(a.slice("--days=".length), 10) || 365);
  } else if (a === "--help" || a === "-h") {
    console.log(
      "Usage: tsx ./src/backfill-post-and-follower-stats.ts [--full | --since=YYYY-MM-DD | --days=N]",
    );
    process.exit(0);
  }
}

if (mode === "incremental" && !sinceDate) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  sinceDate = d.toISOString().slice(0, 10);
}

if (sinceDate && !/^\d{4}-\d{2}-\d{2}$/.test(sinceDate)) {
  console.error(
    `[backfill-post-and-follower-stats] invalid --since value: ${sinceDate} (expected YYYY-MM-DD)`,
  );
  process.exit(1);
}

const sinceIso =
  mode === "incremental" && sinceDate ? `${sinceDate}T00:00:00Z` : null;

function whereSince(column: string): string {
  if (!sinceIso) return "";
  return `AND ${column} >= '${sinceIso}'::timestamptz`;
}

const pool = new pg.Pool({ connectionString: url });

async function run(): Promise<void> {
  const label = mode === "full" ? "FULL rebuild" : `since ${sinceDate}`;
  console.log(`[backfill-post-and-follower-stats] ${label}`);

  // ---- post_stats_daily ----
  if (mode === "full") {
    console.log("[backfill-post-and-follower-stats] clearing post_stats_daily");
    await pool.query("DELETE FROM post_stats_daily");
  } else {
    console.log(
      `[backfill-post-and-follower-stats] clearing post_stats_daily WHERE day >= ${sinceDate}`,
    );
    await pool.query("DELETE FROM post_stats_daily WHERE day >= $1", [
      sinceDate,
    ]);
  }

  console.log(
    "[backfill-post-and-follower-stats] aggregating post_impressions...",
  );
  await pool.query(`
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
    WHERE 1=1
      ${whereSince("pi.created_at")}
    GROUP BY pi.post_id, day
    ON CONFLICT (post_id, day) DO UPDATE SET
      impressions = EXCLUDED.impressions,
      unique_viewers = EXCLUDED.unique_viewers,
      profile_clicks = EXCLUDED.profile_clicks,
      link_clicks = EXCLUDED.link_clicks,
      updated_at = now();
  `);

  console.log(
    "[backfill-post-and-follower-stats] aggregating post_reactions (likes)...",
  );
  await pool.query(`
    INSERT INTO post_stats_daily (post_id, day, impressions, unique_viewers, profile_clicks, link_clicks, likes, updated_at)
    SELECT
      pr.post_id,
      to_char(date_trunc('day', pr.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      0, 0, 0, 0, count(*)::int, now()
    FROM post_reactions pr
    WHERE 1=1
      ${whereSince("pr.created_at")}
    GROUP BY pr.post_id, day
    ON CONFLICT (post_id, day) DO UPDATE SET
      likes = EXCLUDED.likes,
      updated_at = now();
  `);

  // ---- user_follower_stats_daily ----
  if (mode === "full") {
    console.log(
      "[backfill-post-and-follower-stats] clearing user_follower_stats_daily",
    );
    await pool.query("DELETE FROM user_follower_stats_daily");
  } else {
    console.log(
      `[backfill-post-and-follower-stats] clearing user_follower_stats_daily WHERE day >= ${sinceDate}`,
    );
    await pool.query(
      "DELETE FROM user_follower_stats_daily WHERE day >= $1",
      [sinceDate],
    );
  }

  console.log(
    "[backfill-post-and-follower-stats] aggregating new followers (user_follows)...",
  );
  await pool.query(`
    INSERT INTO user_follower_stats_daily (user_id, day, new_followers, total_followers, posts, impressions, updated_at)
    SELECT
      uf.followee_id,
      to_char(date_trunc('day', uf.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      count(*)::int, 0, 0, 0, now()
    FROM user_follows uf
    WHERE 1=1
      ${whereSince("uf.created_at")}
    GROUP BY uf.followee_id, day
    ON CONFLICT (user_id, day) DO UPDATE SET
      new_followers = EXCLUDED.new_followers,
      updated_at = now();
  `);

  console.log(
    "[backfill-post-and-follower-stats] aggregating per-author post counts...",
  );
  await pool.query(`
    INSERT INTO user_follower_stats_daily (user_id, day, new_followers, total_followers, posts, impressions, updated_at)
    SELECT
      p.author_id,
      to_char(date_trunc('day', p.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      0, 0, count(*)::int, 0, now()
    FROM posts p
    WHERE p.deleted_at IS NULL
      ${whereSince("p.created_at")}
    GROUP BY p.author_id, day
    ON CONFLICT (user_id, day) DO UPDATE SET
      posts = EXCLUDED.posts,
      updated_at = now();
  `);

  console.log(
    "[backfill-post-and-follower-stats] aggregating per-author impressions...",
  );
  await pool.query(`
    INSERT INTO user_follower_stats_daily (user_id, day, new_followers, total_followers, posts, impressions, updated_at)
    SELECT
      p.author_id,
      to_char(date_trunc('day', pi.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      0, 0, 0, count(*) filter (where pi.kind = 'view')::int, now()
    FROM post_impressions pi
    JOIN posts p ON p.id = pi.post_id
    WHERE 1=1
      ${whereSince("pi.created_at")}
    GROUP BY p.author_id, day
    ON CONFLICT (user_id, day) DO UPDATE SET
      impressions = EXCLUDED.impressions,
      updated_at = now();
  `);

  // ---- running totals: total_followers as cumulative sum of new_followers per user ----
  console.log(
    "[backfill-post-and-follower-stats] computing running total_followers...",
  );
  await pool.query(`
    WITH running AS (
      SELECT
        user_id,
        day,
        SUM(new_followers) OVER (
          PARTITION BY user_id
          ORDER BY day
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        )::int AS total
      FROM user_follower_stats_daily
    )
    UPDATE user_follower_stats_daily ufs
    SET total_followers = running.total,
        updated_at = now()
    FROM running
    WHERE running.user_id = ufs.user_id
      AND running.day = ufs.day
      AND ufs.total_followers IS DISTINCT FROM running.total;
  `);

  const { rows: psd } = await pool.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM post_stats_daily",
  );
  const { rows: ufsd } = await pool.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM user_follower_stats_daily",
  );
  console.log(
    `[backfill-post-and-follower-stats] done. post_stats_daily=${psd[0].n} rows, user_follower_stats_daily=${ufsd[0].n} rows.`,
  );
}

run()
  .catch((err) => {
    console.error("[backfill-post-and-follower-stats] failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
