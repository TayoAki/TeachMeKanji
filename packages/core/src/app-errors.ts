/**
 * Errors from generated apps running on phones (template data/errors.ts): grouped by what went
 * wrong, counted, shown to the owner, and handed to the edit agent so it can fix them. Reports
 * carry no user data the app didn't put in an error message: the message, the top of the stack,
 * the screen, the platform.
 */
import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { schema, type Database } from "@appbuilder/db";
import { AppCloudError } from "./app-cloud";
import { sha256 } from "./crypto";
import { newId } from "./ids";

const { appError } = schema;

export type AppErrorRow = typeof appError.$inferSelect;

export const APP_ERRORS = {
  bodyBytes: 16 * 1024,
  messageChars: 500,
  stackChars: 4000,
  /** Requests per install per minute (an app sends one report per error, a few at most). */
  requestsPerInstallPerMinute: 20,
  /** Distinct errors kept per app; past this new ones are dropped (counts still rise). */
  distinctPerApp: 500,
  /** An error not seen for this long is deleted. */
  retentionDays: 90,
} as const;

const PLATFORMS = new Set(["ios", "android", "web"]);
const INSTALL = /^[A-Za-z0-9_-]{8,64}$/;

export interface AppErrorReport {
  install: string;
  message: string;
  stack: string | null;
  screen: string | null;
  platform: string;
  fatal: boolean;
  test: boolean;
}

export function parseErrorReport(body: unknown): AppErrorReport {
  const input = (body ?? {}) as Record<string, unknown>;
  const install = String(input.install ?? "");
  if (!INSTALL.test(install)) throw new AppCloudError(400, "Missing install id.");
  const message = String(input.message ?? "")
    .trim()
    .slice(0, APP_ERRORS.messageChars);
  if (!message) throw new AppCloudError(400, "Missing message.");
  const stack =
    typeof input.stack === "string" && input.stack.trim()
      ? input.stack.trim().slice(0, APP_ERRORS.stackChars)
      : null;
  const screen =
    typeof input.screen === "string" && input.screen ? input.screen.slice(0, 120) : null;
  return {
    install,
    message,
    stack,
    screen,
    platform: PLATFORMS.has(String(input.platform)) ? String(input.platform) : "web",
    fatal: input.fatal === true,
    test: input.test === true,
  };
}

/**
 * The same error, wherever and however often it happens: its message without numbers and quoted
 * values (ids, counts), plus the first three stack frames without line and column numbers.
 */
export function errorFingerprint(message: string, stack: string | null): string {
  const text = message
    .replace(/(["'`]).*?\1/g, "…")
    .replace(/\d+/g, "#")
    .slice(0, 200);
  const frames = (stack ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && line !== message)
    .slice(0, 3)
    .map((line) => line.replace(/:\d+(:\d+)?\)?$/, "").replace(/\?[^\s)]*/g, ""));
  return sha256(`${text}\n${frames.join("\n")}`).slice(0, 32);
}

/** Count a report: a new row for a new error, else the existing one counted (and reopened). */
export async function recordAppError(
  db: Database,
  projectId: string,
  report: AppErrorReport,
): Promise<{ id: string; reopened: boolean } | null> {
  const fingerprint = errorFingerprint(report.message, report.stack);
  const now = new Date();
  const [existing] = await db
    .select()
    .from(appError)
    .where(and(eq(appError.projectId, projectId), eq(appError.fingerprint, fingerprint)));
  if (existing) {
    await db
      .update(appError)
      .set({
        count: sql`${appError.count} + 1`,
        lastSeen: now,
        message: report.message,
        stack: report.stack ?? existing.stack,
        screen: report.screen ?? existing.screen,
        platform: report.platform,
        fatal: existing.fatal || report.fatal,
        // A report from a real install makes it a real error.
        test: existing.test && report.test,
        resolvedAt: null,
      })
      .where(eq(appError.id, existing.id));
    return { id: existing.id, reopened: existing.resolvedAt !== null };
  }
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(appError)
    .where(eq(appError.projectId, projectId));
  if (n >= APP_ERRORS.distinctPerApp) return null;
  const id = newId("err");
  await db
    .insert(appError)
    .values({ id, projectId, fingerprint, ...report, firstSeen: now, lastSeen: now })
    .onConflictDoNothing();
  return { id, reopened: false };
}

/** The app's errors, open ones first, most recent first. */
export async function listAppErrors(
  db: Database,
  projectId: string,
  options: { includeResolved?: boolean; limit?: number } = {},
): Promise<AppErrorRow[]> {
  return db
    .select()
    .from(appError)
    .where(
      and(
        eq(appError.projectId, projectId),
        options.includeResolved ? undefined : isNull(appError.resolvedAt),
      ),
    )
    .orderBy(sql`${appError.resolvedAt} is not null`, desc(appError.lastSeen))
    .limit(options.limit ?? 100);
}

export async function resolveAppErrors(
  db: Database,
  projectId: string,
  ids: string[],
): Promise<void> {
  for (const id of ids)
    await db
      .update(appError)
      .set({ resolvedAt: new Date() })
      .where(and(eq(appError.projectId, projectId), eq(appError.id, id)));
}

/**
 * What the edit agent is told about the app's open errors from the last two weeks (most
 * frequent first): enough to recognise and fix them, or null when there are none.
 */
export async function errorsForAgent(
  db: Database,
  projectId: string,
  limit = 5,
): Promise<{ ids: string[]; brief: string } | null> {
  const rows = await db
    .select()
    .from(appError)
    .where(
      and(
        eq(appError.projectId, projectId),
        or(isNull(appError.resolvedAt), gt(appError.lastSeen, appError.resolvedAt)),
        gt(appError.lastSeen, new Date(Date.now() - 14 * 86_400_000)),
      ),
    )
    .orderBy(desc(appError.count))
    .limit(limit);
  if (!rows.length) return null;
  const brief = rows
    .map((e) => {
      const where = e.screen ? ` on ${e.screen}` : "";
      const stack = (e.stack ?? "")
        .split("\n")
        .slice(0, 4)
        .map((l) => `    ${l.trim()}`)
        .join("\n");
      return `- ${e.fatal ? "Crash" : "Error"}${where} (${e.count}×, ${e.platform}${e.test ? ", test device" : ""}): ${e.message}${stack.trim() ? `\n${stack}` : ""}`;
    })
    .join("\n");
  return { ids: rows.map((r) => r.id), brief };
}

/** Delete errors not seen for APP_ERRORS.retentionDays (the hosted privacy policy says so). */
export async function pruneAppErrors(db: Database): Promise<number> {
  const cutoff = new Date(Date.now() - APP_ERRORS.retentionDays * 86_400_000);
  const deleted = await db
    .delete(appError)
    .where(lt(appError.lastSeen, cutoff))
    .returning({ id: appError.id });
  return deleted.length;
}
