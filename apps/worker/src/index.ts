/**
 * Worker entrypoint: claims queued runs (plans, builds, edits, exports, native builds) from
 * Postgres and runs them, and manages on-device preview dev servers.
 */
import { getDb } from "@appbuilder/db";
import { runWorker } from "./loop";

const controller = new AbortController();
const shutdown = () => {
  console.log("worker: shutting down");
  controller.abort();
  setTimeout(() => process.exit(0), 500).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await runWorker(getDb(), { signal: controller.signal });
