import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Schema = typeof schema;
/** Any Drizzle Postgres database or transaction over our schema (postgres-js in prod, PGlite in tests). */
export type Db = PgDatabase<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

export function createDb(url: string, ssl: boolean) {
  // Supabase's transaction pooler (port 6543) does not support prepared statements.
  const client = postgres(url, { ssl: ssl ? "require" : false, prepare: false, max: 10 });
  const db = drizzle(client, { schema }) as unknown as Db;
  return { db, close: () => client.end({ timeout: 5 }) };
}

export { schema };
