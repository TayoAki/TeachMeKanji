/**
 * Worker entrypoint. Phase 3 adds the durable job loop (agent_run claim → run → heartbeat).
 * In Phase 0 it only verifies its configuration and stays up, so deploy plumbing can be
 * built against a real process.
 */
import { getDb } from "@appbuilder/db";
import { sql } from "drizzle-orm";

const db = getDb();
await db.execute(sql`select 1`);
console.log("worker: database reachable; no job types registered yet (Phase 3)");

const shutdown = () => {
  console.log("worker: shutting down");
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
setInterval(() => {}, 60_000);
