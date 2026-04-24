import pg from "pg";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function pick(n) {
  let s = "";
  for (let i = 0; i < n; i++) {
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return s;
}
function randomCode() {
  return `${pick(3)}-${pick(4)}`;
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("[backfill-friend-codes] DATABASE_URL not set; skipping");
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: url });
try {
  const { rows } = await pool.query(
    "SELECT id FROM users WHERE friend_code IS NULL",
  );
  if (rows.length === 0) {
    console.log("[backfill-friend-codes] no users need backfill");
  } else {
    console.log(`[backfill-friend-codes] backfilling ${rows.length} users`);
    for (const row of rows) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const code = randomCode();
        try {
          const r = await pool.query(
            "UPDATE users SET friend_code=$1 WHERE id=$2 AND friend_code IS NULL",
            [code, row.id],
          );
          if (r.rowCount && r.rowCount > 0) break;
          break;
        } catch (err) {
          if (err && err.code === "23505") continue;
          throw err;
        }
      }
    }
    console.log("[backfill-friend-codes] done");
  }
} catch (err) {
  console.error("[backfill-friend-codes] failed", err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
