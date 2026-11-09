import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./client";

// Defaults to the docker-compose database for local development.
const url =
  process.env.DATABASE_URL ?? "postgres://appbuilder:appbuilder@localhost:5432/appbuilder";

const { db, pool } = createDb(url);
await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
await pool.end();
console.log("migrations applied");
