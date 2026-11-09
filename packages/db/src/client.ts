import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export function createDb(connectionString: string): { db: Database; pool: Pool } {
  const pool = new Pool({ connectionString, max: 10 });
  return { db: drizzle(pool, { schema }), pool };
}

let shared: { db: Database; pool: Pool } | undefined;

/** Process-wide database handle, created lazily from DATABASE_URL. */
export function getDb(): Database {
  if (!shared) {
    // `next build` loads route modules (and with them the auth config) without a database. The
    // pool only connects on the first query, so a placeholder is safe there and nowhere else.
    const building = process.env.NEXT_PHASE === "phase-production-build";
    const url =
      process.env.DATABASE_URL || (building ? "postgres://build:build@127.0.0.1:1/build" : "");
    if (!url) throw new Error("DATABASE_URL is not set");
    shared = createDb(url);
  }
  return shared.db;
}
