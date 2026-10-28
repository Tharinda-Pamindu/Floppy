/** Applies the SQL migrations in ./drizzle to DATABASE_URL (your Supabase database). */
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env and fill it in.");
  process.exit(1);
}
// Migrations need a session connection: use Supabase's direct or session-pooler URL (port 5432), not 6543.
const ssl = (process.env.DATABASE_SSL ?? "true") === "true";
const client = postgres(process.env.DATABASE_MIGRATION_URL || url, { max: 1, ssl: ssl ? "require" : false });
// npm workspace scripts and the Heroku launcher run from apps/api.
// Resolve from the workspace for both TypeScript and compiled JavaScript.
const migrationsFolder = path.resolve("drizzle");

try {
  await migrate(drizzle(client), { migrationsFolder });
  console.log("✔ Migrations applied.");
} catch (err) {
  console.error("✖ Migration failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end();
}
