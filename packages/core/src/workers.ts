import { and, eq, gt, lt } from "drizzle-orm";
import { schema, type Database } from "@appbuilder/db";

const { workerHeartbeat } = schema;

/** A worker that hasn't checked in for this long is treated as gone. */
export const WORKER_FRESH_MS = 90_000;

/** Called by each worker every 30 seconds, so the web app knows what this deployment can do. */
export async function recordWorkerHeartbeat(
  db: Database,
  id: string,
  capabilities: { devicePreviews: boolean },
): Promise<void> {
  const seenAt = new Date();
  await db
    .insert(workerHeartbeat)
    .values({ id, devicePreviews: capabilities.devicePreviews, seenAt })
    .onConflictDoUpdate({
      target: workerHeartbeat.id,
      set: { devicePreviews: capabilities.devicePreviews, seenAt },
    });
  // Workers that stopped long ago (restarts, redeploys).
  await db
    .delete(workerHeartbeat)
    .where(lt(workerHeartbeat.seenAt, new Date(Date.now() - 86_400_000)));
}

/** Whether a live worker runs phone-preview dev servers. */
export async function devicePreviewsAvailable(db: Database): Promise<boolean> {
  const [row] = await db
    .select({ id: workerHeartbeat.id })
    .from(workerHeartbeat)
    .where(
      and(
        eq(workerHeartbeat.devicePreviews, true),
        gt(workerHeartbeat.seenAt, new Date(Date.now() - WORKER_FRESH_MS)),
      ),
    )
    .limit(1);
  return Boolean(row);
}
