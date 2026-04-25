import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("[backfill-hashtag-metrics] DATABASE_URL not set; skipping");
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: url });
try {
  console.log("[backfill-hashtag-metrics] clearing existing rows...");
  await pool.query("DELETE FROM hashtag_metrics_daily");

  console.log("[backfill-hashtag-metrics] aggregating room messages...");
  await pool.query(`
    INSERT INTO hashtag_metrics_daily (tag, day, posts, messages, new_members, new_followers, updated_at)
    SELECT
      m.room_tag AS tag,
      to_char(date_trunc('day', m.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      0 AS posts,
      count(*)::int AS messages,
      0 AS new_members,
      0 AS new_followers,
      now() AS updated_at
    FROM messages m
    WHERE m.room_tag IS NOT NULL
      AND m.deleted_at IS NULL
    GROUP BY m.room_tag, day
    ON CONFLICT (tag, day) DO UPDATE SET messages = EXCLUDED.messages, updated_at = now();
  `);

  console.log("[backfill-hashtag-metrics] aggregating posts...");
  await pool.query(`
    INSERT INTO hashtag_metrics_daily (tag, day, posts, messages, new_members, new_followers, updated_at)
    SELECT
      ph.tag AS tag,
      to_char(date_trunc('day', p.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      count(*)::int AS posts,
      0 AS messages,
      0 AS new_members,
      0 AS new_followers,
      now() AS updated_at
    FROM post_hashtags ph
    JOIN posts p ON p.id = ph.post_id
    WHERE p.deleted_at IS NULL
    GROUP BY ph.tag, day
    ON CONFLICT (tag, day) DO UPDATE SET posts = EXCLUDED.posts, updated_at = now();
  `);

  console.log("[backfill-hashtag-metrics] aggregating new members...");
  await pool.query(`
    INSERT INTO hashtag_metrics_daily (tag, day, posts, messages, new_members, new_followers, updated_at)
    SELECT
      uh.tag AS tag,
      to_char(date_trunc('day', uh.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      0 AS posts,
      0 AS messages,
      count(*)::int AS new_members,
      0 AS new_followers,
      now() AS updated_at
    FROM user_hashtags uh
    GROUP BY uh.tag, day
    ON CONFLICT (tag, day) DO UPDATE SET new_members = EXCLUDED.new_members, updated_at = now();
  `);

  console.log("[backfill-hashtag-metrics] aggregating new followers...");
  await pool.query(`
    INSERT INTO hashtag_metrics_daily (tag, day, posts, messages, new_members, new_followers, updated_at)
    SELECT
      ufh.tag AS tag,
      to_char(date_trunc('day', ufh.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      0 AS posts,
      0 AS messages,
      0 AS new_members,
      count(*)::int AS new_followers,
      now() AS updated_at
    FROM user_followed_hashtags ufh
    GROUP BY ufh.tag, day
    ON CONFLICT (tag, day) DO UPDATE SET new_followers = EXCLUDED.new_followers, updated_at = now();
  `);

  const { rows } = await pool.query(
    "SELECT count(*)::int as n FROM hashtag_metrics_daily",
  );
  console.log(`[backfill-hashtag-metrics] done; ${rows[0].n} rows.`);
} catch (err) {
  console.error("[backfill-hashtag-metrics] failed", err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
