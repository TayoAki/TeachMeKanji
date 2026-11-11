/**
 * Daily database backups: `pg_dump` (custom format) of DATABASE_URL into the file storage
 * (the S3 bucket in production) under backups/postgres/, keeping the newest DB_BACKUP_KEEP
 * (default 14). The worker runs it once a day; on by default in production, DB_BACKUP_ENABLED
 * turns it on (1) or off (0) anywhere.
 *
 * Restore one: download it from the bucket, then
 *   pg_restore --clean --if-exists --no-owner --no-acl -d "$DATABASE_URL" appbuilder-….dump
 * pg_dump must be at least the server's major version (PG_DUMP_PATH picks the binary).
 */
import { spawn } from "node:child_process";
import { reportError } from "./report";
import type { Storage } from "./storage";

export const BACKUP_PREFIX = "backups/postgres/";

export function backupsEnabled(): boolean {
  const flag = process.env.DB_BACKUP_ENABLED;
  if (flag === "0") return false;
  if (flag === "1") return true;
  return process.env.NODE_ENV === "production";
}

/** `appbuilder-2026-11-11T0300Z.dump`: sorts by time, and says which day it covers. */
export function backupKey(at: Date): string {
  const stamp = at.toISOString().slice(0, 16).replace(":", "");
  return `${BACKUP_PREFIX}appbuilder-${stamp}Z.dump`;
}

function dump(databaseUrl: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // The URL goes in through the environment, never on the command line (visible in `ps`).
    const child = spawn(
      process.env.PG_DUMP_PATH || "pg_dump",
      ["--format=custom", "--no-owner", "--no-acl"],
      // Only what pg_dump needs (a cast: Next.js types require NODE_ENV in every env object).
      {
        env: {
          PATH: process.env.PATH ?? "",
          ...pgEnv(databaseUrl),
        } as unknown as NodeJS.ProcessEnv,
      },
    );
    const chunks: Buffer[] = [];
    let errors = "";
    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.stderr.on("data", (d) => (errors = (errors + d).slice(-2000)));
    child.on("error", reject);
    child.on("exit", (code) => {
      const data = Buffer.concat(chunks);
      if (code === 0 && data.subarray(0, 5).toString("latin1") === "PGDMP") resolve(data);
      else reject(new Error(`pg_dump failed (${code}): ${errors.trim() || "no output"}`));
    });
  });
}

/** Connection settings as libpq environment variables (keeps secrets off argv). */
function pgEnv(databaseUrl: string): Record<string, string> {
  const url = new URL(databaseUrl);
  const env: Record<string, string> = {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: url.pathname.replace(/^\//, "") || "postgres",
  };
  const sslmode = url.searchParams.get("sslmode");
  if (sslmode) env.PGSSLMODE = sslmode;
  return env;
}

/** Take a backup now, then delete all but the newest `keep`. */
export async function backupDatabase(options: {
  storage: Storage;
  databaseUrl?: string;
  now?: Date;
  keep?: number;
}): Promise<{ key: string; bytes: number; deleted: string[] }> {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const data = await dump(databaseUrl);
  const key = backupKey(options.now ?? new Date());
  await options.storage.put(key, data, "application/octet-stream");
  const keep = Math.max(1, options.keep ?? (Number(process.env.DB_BACKUP_KEEP) || 14));
  const all = (await options.storage.list(BACKUP_PREFIX)).filter((k) => k.endsWith(".dump")).sort();
  const deleted = all.slice(0, Math.max(0, all.length - keep));
  for (const old of deleted) await options.storage.delete(old);
  return { key, bytes: data.length, deleted };
}

/** Back up when today's (UTC) backup is missing. Safe to call often; never throws. */
export async function backupIfDue(storage: Storage, now = new Date()): Promise<string | null> {
  if (!backupsEnabled()) return null;
  try {
    const today = backupKey(now).slice(0, `${BACKUP_PREFIX}appbuilder-YYYY-MM-DD`.length);
    const existing = await storage.list(BACKUP_PREFIX);
    if (existing.some((key) => key.startsWith(today))) return null;
    const result = await backupDatabase({ storage, now });
    console.log(
      `worker: database backup ${result.key} (${Math.round(result.bytes / 1024)} KB), ${result.deleted.length} old removed`,
    );
    return result.key;
  } catch (error) {
    reportError(error, { where: "db-backup" });
    return null;
  }
}
