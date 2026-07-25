/**
 * One-time baseline: mark the existing migrations as already applied.
 *
 * The database was built with `drizzle-kit push`, which mutates the schema
 * without writing journal rows. So the tables exist but
 * `drizzle.__drizzle_migrations` is empty, and a plain `db:migrate` would try
 * to run 0000 against tables that are already there and fail on "already
 * exists".
 *
 * This inserts one row per journal entry with the exact (hash, created_at)
 * pair the migrator itself would have written — sha256 of the raw .sql file,
 * and the journal's `when`. Drizzle decides what to re-run by comparing each
 * migration's `folderMillis` against the newest `created_at` in the table, so
 * writing them all makes the next `db:migrate` a no-op and any future
 * migration run normally.
 *
 * Idempotent: exits without writing if the table is already populated.
 * Run: bunx tsx scripts/baseline-migrations.ts
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set. Add it to .env.local (or .env).");
}

type JournalEntry = { idx: number; when: number; tag: string };

async function main() {
  const sql = neon(databaseUrl!);
  const migrationsDir = path.join(process.cwd(), "drizzle");

  const journal = JSON.parse(
    fs.readFileSync(path.join(migrationsDir, "meta", "_journal.json"), "utf8"),
  ) as { entries: JournalEntry[] };

  // Same DDL the migrator runs before it reads, so this works on a fresh DB too.
  await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await sql`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at bigint
  )`;

  // Match on created_at, not on row count: a run that died partway through
  // leaves some entries recorded and the rest missing, and migrate's gate only
  // ever looks at the newest row — so the gaps would never be noticed. Insert
  // per entry, skipping the ones already there.
  const existing =
    await sql`select created_at from drizzle.__drizzle_migrations`;
  const applied = new Set(
    (existing as { created_at: string | number }[]).map((row) =>
      Number(row.created_at),
    ),
  );

  let inserted = 0;

  for (const entry of journal.entries) {
    if (applied.has(entry.when)) {
      console.log(`already recorded, skipping ${entry.tag}`);
      continue;
    }

    const file = path.join(migrationsDir, `${entry.tag}.sql`);
    const query = fs.readFileSync(file, "utf8");
    const hash = crypto.createHash("sha256").update(query).digest("hex");

    await sql`insert into drizzle.__drizzle_migrations ("hash", "created_at")
      values (${hash}, ${entry.when})`;

    console.log(`baselined ${entry.tag} (${hash.slice(0, 12)}…)`);
    inserted++;
  }

  console.log(
    `baseline complete: ${inserted} inserted, ${journal.entries.length - inserted} already present`,
  );
}

main();
