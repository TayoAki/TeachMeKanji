import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema, type Database } from "@appbuilder/db";
import { testDb } from "./test-db";
import { devicePreviewsAvailable, recordWorkerHeartbeat, WORKER_FRESH_MS } from "./workers";

let handle: Awaited<ReturnType<typeof testDb>>;
let db: Database;

beforeAll(async () => {
  handle = await testDb();
  if (handle) db = handle.db;
});
afterAll(async () => handle?.close());

describe("worker heartbeat (Postgres)", () => {
  it("phone previews are available only while a worker that runs them checks in", async () => {
    await db.delete(schema.workerHeartbeat);
    expect(await devicePreviewsAvailable(db)).toBe(false);

    await recordWorkerHeartbeat(db, "worker-a", { devicePreviews: false });
    expect(await devicePreviewsAvailable(db)).toBe(false);

    await recordWorkerHeartbeat(db, "worker-b", { devicePreviews: true });
    expect(await devicePreviewsAvailable(db)).toBe(true);

    // The worker stopped checking in.
    await db
      .update(schema.workerHeartbeat)
      .set({ seenAt: new Date(Date.now() - WORKER_FRESH_MS - 1000) })
      .where(eq(schema.workerHeartbeat.id, "worker-b"));
    expect(await devicePreviewsAvailable(db)).toBe(false);

    // Rows from long-gone workers are cleaned up by the next heartbeat.
    await db
      .update(schema.workerHeartbeat)
      .set({ seenAt: new Date(Date.now() - 2 * 86_400_000) })
      .where(eq(schema.workerHeartbeat.id, "worker-b"));
    await recordWorkerHeartbeat(db, "worker-a", { devicePreviews: false });
    const ids = (await db.select().from(schema.workerHeartbeat)).map((r) => r.id);
    expect(ids).toEqual(["worker-a"]);
  });
});
