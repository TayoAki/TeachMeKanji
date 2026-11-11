import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { BACKUP_PREFIX, backupDatabase, backupIfDue, backupKey } from "./backup";
import { fileStorage } from "./storage";
import { testDb } from "./test-db";

const url =
  process.env.TEST_DATABASE_URL ??
  "postgres://appbuilder:appbuilder@localhost:5432/appbuilder_test";
afterEach(() => delete process.env.DB_BACKUP_ENABLED);

/** pg_dump refuses servers newer than itself; machines with an older client skip the test. */
async function pgDumpCanDump(): Promise<boolean> {
  try {
    const client = new Client({ connectionString: url });
    await client.connect();
    const { rows } = await client.query<{ v: string }>(
      "select current_setting('server_version_num') as v",
    );
    await client.end();
    const server = Math.floor(Number(rows[0]!.v) / 10000);
    const tool = Number(/(\d+)\./.exec(execFileSync("pg_dump", ["--version"]).toString())?.[1]);
    return tool >= server;
  } catch {
    return false;
  }
}

describe("database backups", () => {
  it("names backups so they sort by time", () => {
    expect(backupKey(new Date("2026-11-11T03:07:59Z"))).toBe(
      `${BACKUP_PREFIX}appbuilder-2026-11-11T0307Z.dump`,
    );
  });

  it("dumps the database restorably, keeps the newest N, and runs once a day", async (ctx) => {
    const handle = await testDb();
    if (!handle) return ctx.skip(); // no database here
    await handle.close();
    if (!(await pgDumpCanDump())) return ctx.skip();
    const storage = fileStorage(await mkdtemp(join(tmpdir(), "backup-")));
    const day = (d: number) => new Date(Date.UTC(2026, 10, d, 3));

    const first = await backupDatabase({ storage, databaseUrl: url, now: day(1), keep: 2 });
    const object = await storage.get(first.key);
    expect(object?.data.subarray(0, 5).toString()).toBe("PGDMP");
    // pg_restore can read it and finds the app's tables.
    const file = join(await mkdtemp(join(tmpdir(), "restore-")), "b.dump");
    await writeFile(file, object!.data);
    expect(execFileSync("pg_restore", ["--list", file]).toString()).toMatch(
      /TABLE public agent_run/,
    );

    await backupDatabase({ storage, databaseUrl: url, now: day(2), keep: 2 });
    const third = await backupDatabase({ storage, databaseUrl: url, now: day(3), keep: 2 });
    expect(third.deleted).toEqual([first.key]);
    expect((await storage.list(BACKUP_PREFIX)).sort()).toEqual([
      backupKey(day(2)),
      backupKey(day(3)),
    ]);

    // Off unless enabled (production turns it on); once a day when on.
    expect(await backupIfDue(storage, day(3))).toBeNull();
    process.env.DB_BACKUP_ENABLED = "1";
    const saved = process.env.DATABASE_URL;
    process.env.DATABASE_URL = url;
    expect(await backupIfDue(storage, day(3))).toBeNull(); // today's exists
    expect(await backupIfDue(storage, day(4))).toBe(backupKey(day(4)));
    process.env.DATABASE_URL = saved;
  }, 60_000);
});
