// Applies pending migrations in supabase/migrations, then (with --seed) loads supabase/seed.sql.
// Usage: npm run db:setup            npm run db:setup -- --seed
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url || url.includes("[YOUR-PASSWORD]")) {
  console.error("Set DATABASE_URL in .env first (see .env.example).");
  process.exit(1);
}

const root = new URL("../supabase/", import.meta.url);
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query(`create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now())`);
  await client.query(`alter table public._migrations enable row level security`);
  await client.query(`revoke all on public._migrations from anon, authenticated`);
  const done = new Set((await client.query("select name from public._migrations")).rows.map((r) => r.name));
  const files = (await readdir(new URL("migrations/", root))).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(new URL(`migrations/${file}`, root), "utf8");
    process.stdout.write(`Applying ${file}... `);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into public._migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log("ok");
    } catch (err) {
      await client.query("rollback");
      console.log("failed");
      throw err;
    }
  }

  if (process.argv.includes("--seed")) {
    process.stdout.write("Seeding sample listings... ");
    await client.query(await readFile(new URL("seed.sql", root), "utf8"));
    console.log("ok");
  }
} finally {
  await client.end();
}
