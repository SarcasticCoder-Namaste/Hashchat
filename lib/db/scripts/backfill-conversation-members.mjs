import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("[backfill-conversation-members] DATABASE_URL not set; skipping");
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: url });
try {
  const { rows } = await pool.query(
    `SELECT id, user_a_id, user_b_id FROM conversations
     WHERE user_a_id IS NOT NULL AND user_b_id IS NOT NULL`,
  );
  if (rows.length === 0) {
    console.log("[backfill-conversation-members] no conversations to backfill");
  } else {
    let inserted = 0;
    for (const row of rows) {
      const r = await pool.query(
        `INSERT INTO conversation_members (conversation_id, user_id)
         VALUES ($1, $2), ($1, $3)
         ON CONFLICT DO NOTHING`,
        [row.id, row.user_a_id, row.user_b_id],
      );
      inserted += r.rowCount ?? 0;
    }
    console.log(
      `[backfill-conversation-members] inserted ${inserted} member rows across ${rows.length} conversations`,
    );
  }
} finally {
  await pool.end();
}
