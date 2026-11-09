import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { createDb, schema, type Database } from "@appbuilder/db";
import { newId } from "./ids";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://appbuilder:appbuilder@localhost:5432/appbuilder_test";

/** Create (if needed) and migrate the test database. Returns null when Postgres is unreachable. */
export async function testDb(): Promise<{ db: Database; close: () => Promise<void> } | null> {
  const url = new URL(TEST_URL);
  const dbName = url.pathname.slice(1);
  const admin = new Client({ connectionString: TEST_URL.replace(/\/[^/]+$/, "/postgres") });
  try {
    await admin.connect();
  } catch {
    return null;
  }
  const exists = await admin.query("select 1 from pg_database where datname = $1", [dbName]);
  if (exists.rowCount === 0) await admin.query(`create database "${dbName}"`);
  await admin.end();

  const { db, pool } = createDb(TEST_URL);
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../../db/drizzle", import.meta.url)),
  });
  return { db, close: () => pool.end() };
}

export async function makeUser(db: Database, name = "Test User") {
  const id = newId("u");
  const [row] = await db
    .insert(schema.user)
    .values({ id, name, email: `${id}@example.com`, emailVerified: true })
    .returning();
  return row!;
}
