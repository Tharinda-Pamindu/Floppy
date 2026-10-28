/** Applies committed SQL migrations using the migration connection when set. */
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { migrationFailureDetails } from "../src/db/migration-error.js";

const source = process.env.DATABASE_MIGRATION_URL ? "DATABASE_MIGRATION_URL" : "DATABASE_URL";
const url = process.env[source];
if (!url) {
  console.error("Set DATABASE_MIGRATION_URL or DATABASE_URL in the environment before running migrations.");
  process.exit(1);
}
// Migrations use a direct or session-pooler connection (5432), not transaction mode (6543).
const ssl = (process.env.DATABASE_SSL ?? "true") === "true";
// Both the npm workspace command and Heroku release run from apps/api.
const migrationsFolder = path.resolve("drizzle");
let client: ReturnType<typeof postgres> | undefined;
try {
  console.log(`Migration connection: ${source}; SSL ${ssl ? "required" : "disabled"}.`);
  client = postgres(url, { max: 1, ssl: ssl ? "require" : false, connect_timeout: 15 });
  await migrate(drizzle(client), { migrationsFolder });
  console.log("Migrations applied.");
} catch (err) {
  console.error("Migration failed:");
  for (const detail of migrationFailureDetails(err)) console.error(`  ${detail}`);
  process.exitCode = 1;
} finally {
  await client?.end({ timeout: 5 });
}
