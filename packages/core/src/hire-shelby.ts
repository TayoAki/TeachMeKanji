/**
 * Hire Shelby (hireshelby.com), our in-app support chat, included on paid plans through its
 * partner API (docs/11-hire-shelby-partner.md): a workspace per owner, a Hire Shelby app per
 * project, a claim link into its dashboard, AI reply costs charged in credits, and the workspace
 * kept in step with the owner's plan and credits. Without HIRESHELBY_API_URL and
 * HIRESHELBY_PARTNER_KEY none of this runs, and owners can still paste their own App ID.
 */
import { and, eq, sql } from "drizzle-orm";
import { HIRESHELBY_PACKAGE, HIRESHELBY_VERSION } from "@appbuilder/contract";
import { schema, type Database } from "@appbuilder/db";
import { CREDIT_USD, PLANS } from "./billing";
import { creditBalance, userPlan } from "./credits";

const { creditLedger, project, supportAiUsage, supportWorkspace, syncCursor, user } = schema;

const USAGE_CURSOR = "hireshelby:usage";

export class HireShelbyError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface PartnerWorkspace {
  externalId: string;
  active: boolean;
  aiAllowed: boolean;
  claimed: boolean;
  dashboardUrl: string;
}

export interface PartnerUsageItem {
  id: string;
  workspaceExternalId: string;
  appExternalId: string;
  costUsd: number;
  createdAt: string;
}

/** The partner API is configured on this server. */
export function hireShelbyEnabled(): boolean {
  return Boolean(process.env.HIRESHELBY_API_URL && process.env.HIRESHELBY_PARTNER_KEY);
}

async function partner<T>(method: string, path: string, body?: unknown): Promise<T> {
  const base = (process.env.HIRESHELBY_API_URL || "").replace(/\/$/, "");
  const key = process.env.HIRESHELBY_PARTNER_KEY || "";
  if (!base || !key) throw new HireShelbyError(501, "Hire Shelby isn't set up on this server.");
  const response = await fetch(`${base}/partner/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 204) return undefined as T;
  const json = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
  } & T;
  if (!response.ok)
    throw new HireShelbyError(
      response.status,
      json.error?.message || `Hire Shelby answered ${response.status}.`,
    );
  return json;
}

/**
 * Store builds install the SDK from npm, so it has to be published before an app uses it
 * (HIRESHELBY_SDK_CHECK=0 skips the check). A registry that can't be reached doesn't block.
 */
export async function hireShelbySdkPublished(): Promise<boolean> {
  if (process.env.HIRESHELBY_SDK_CHECK === "0") return true;
  try {
    const response = await fetch(
      `https://registry.npmjs.org/${HIRESHELBY_PACKAGE.replace("/", "%2F")}/${HIRESHELBY_VERSION}`,
      { signal: AbortSignal.timeout(5_000) },
    );
    return response.status !== 404;
  } catch {
    return true;
  }
}

async function owner(db: Database, userId: string) {
  const [row] = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, userId));
  if (!row) throw new HireShelbyError(404, "Owner not found.");
  return row;
}

/** What the owner's workspace should be now: subscribed while paying, AI while credits last. */
async function desiredState(db: Database, userId: string) {
  return {
    active: PLANS[await userPlan(db, userId)].supportChat,
    aiAllowed: (await creditBalance(db, userId)) >= 1,
  };
}

/** Create (or refresh) the owner's Hire Shelby workspace. */
export async function ensureSupportWorkspace(
  db: Database,
  userId: string,
): Promise<PartnerWorkspace> {
  const who = await owner(db, userId);
  let { workspace } = await partner<{ workspace: PartnerWorkspace }>(
    "PUT",
    `/workspaces/${encodeURIComponent(who.id)}`,
    { name: `${who.name.split(" ")[0] || "My"}'s apps`, ownerEmail: who.email },
  );
  const desired = await desiredState(db, userId);
  if (workspace.active !== desired.active || workspace.aiAllowed !== desired.aiAllowed)
    ({ workspace } = await partner<{ workspace: PartnerWorkspace }>(
      "PATCH",
      `/workspaces/${encodeURIComponent(who.id)}`,
      desired,
    ));
  await db
    .insert(supportWorkspace)
    .values({ userId, active: workspace.active, aiAllowed: workspace.aiAllowed })
    .onConflictDoUpdate({
      target: supportWorkspace.userId,
      set: { active: workspace.active, aiAllowed: workspace.aiAllowed, syncedAt: new Date() },
    });
  return workspace;
}

/** The project's Hire Shelby app (created once): its public app_ ID, remembered on the project. */
export async function ensureSupportApp(db: Database, projectId: string): Promise<string> {
  const [row] = await db.select().from(project).where(eq(project.id, projectId));
  if (!row) throw new HireShelbyError(404, "Project not found.");
  await ensureSupportWorkspace(db, row.ownerId);
  const { app } = await partner<{ app: { appId: string } }>(
    "PUT",
    `/workspaces/${encodeURIComponent(row.ownerId)}/apps/${encodeURIComponent(row.id)}`,
    { name: row.name.slice(0, 100) || "App" },
  );
  if (row.supportChatAppId !== app.appId)
    await db.update(project).set({ supportChatAppId: app.appId }).where(eq(project.id, projectId));
  return app.appId;
}

/** Where the owner answers: a one-time claim link the first time, then the dashboard. */
export async function supportInboxLink(db: Database, userId: string): Promise<string> {
  await ensureSupportWorkspace(db, userId);
  const { url } = await partner<{ url: string }>(
    "POST",
    `/workspaces/${encodeURIComponent(userId)}/claim-link`,
  );
  return url;
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Add one AI reply's cost to the app's day and charge the owner whole credits as it crosses each
 * (as in-app AI does), inside the caller's transaction.
 */
async function chargeSupportReply(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  input: { projectId: string; ownerId: string; costUsd: number; day: string },
): Promise<number> {
  const micro = Math.max(0, Math.round(input.costUsd * 1_000_000));
  const [row] = await tx
    .insert(supportAiUsage)
    .values({ projectId: input.projectId, day: input.day, replies: 1, costMicroUsd: micro })
    .onConflictDoUpdate({
      target: [supportAiUsage.projectId, supportAiUsage.day],
      set: {
        replies: sql`${supportAiUsage.replies} + 1`,
        costMicroUsd: sql`${supportAiUsage.costMicroUsd} + ${micro}`,
      },
    })
    .returning();
  const owed = Math.ceil(row!.costMicroUsd / (CREDIT_USD * 1_000_000)) - row!.creditsCharged;
  if (owed <= 0) return 0;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"credits:" + input.ownerId}))`);
  await tx
    .update(supportAiUsage)
    .set({ creditsCharged: row!.creditsCharged + owed })
    .where(and(eq(supportAiUsage.projectId, input.projectId), eq(supportAiUsage.day, input.day)));
  await tx.insert(creditLedger).values({
    userId: input.ownerId,
    delta: -owed,
    reason: "support_ai",
    note: `Support chat AI replies in your app (${input.projectId}), ${input.day}`,
  });
  return owed;
}

/**
 * Read Hire Shelby's AI reply costs since last time and charge them to the apps' owners. Each
 * page's charges and the cursor move together, so a crash never charges a reply twice.
 */
export async function syncSupportUsage(
  db: Database,
): Promise<{ replies: number; credits: number }> {
  let replies = 0;
  let credits = 0;
  for (let page = 0; page < 20; page++) {
    const [cursor] = await db.select().from(syncCursor).where(eq(syncCursor.name, USAGE_CURSOR));
    const query = new URLSearchParams({ limit: "500" });
    if (cursor?.value) query.set("after", cursor.value);
    const { items, next } = await partner<{ items: PartnerUsageItem[]; next: string | null }>(
      "GET",
      `/usage?${query}`,
    );
    if (!items.length || !next) break;
    await db.transaction(async (tx) => {
      for (const item of items) {
        const [row] = await tx
          .select({ id: project.id, ownerId: project.ownerId })
          .from(project)
          .where(eq(project.id, item.appExternalId));
        // An app whose project is gone, or that moved owners outside the partner's records.
        if (!row || row.ownerId !== item.workspaceExternalId) continue;
        replies += 1;
        credits += await chargeSupportReply(tx, {
          projectId: row.id,
          ownerId: row.ownerId,
          costUsd: item.costUsd,
          day: (item.createdAt || new Date().toISOString()).slice(0, 10) || today(),
        });
      }
      await tx
        .insert(syncCursor)
        .values({ name: USAGE_CURSOR, value: next })
        .onConflictDoUpdate({
          target: syncCursor.name,
          set: { value: next, updatedAt: new Date() },
        });
    });
    if (items.length < 500) break;
  }
  return { replies, credits };
}

/**
 * Keep every owner's workspace in step: subscribed while their plan is paid, AI replies on while
 * they have credits. Only changes are sent.
 */
export async function syncSupportWorkspaces(db: Database): Promise<number> {
  const rows = await db.select().from(supportWorkspace);
  let changed = 0;
  for (const row of rows) {
    const desired = await desiredState(db, row.userId);
    if (desired.active === row.active && desired.aiAllowed === row.aiAllowed) continue;
    await partner("PATCH", `/workspaces/${encodeURIComponent(row.userId)}`, desired);
    await db
      .update(supportWorkspace)
      .set({ ...desired, syncedAt: new Date() })
      .where(eq(supportWorkspace.userId, row.userId));
    changed += 1;
  }
  return changed;
}

/** This month's support chat AI replies of one app (for the Data tab). */
export async function supportAiSummary(db: Database, projectId: string) {
  const month = today().slice(0, 7);
  const [row] = await db
    .select({
      replies: sql<number>`coalesce(sum(${supportAiUsage.replies}), 0)::int`,
      credits: sql<number>`coalesce(sum(${supportAiUsage.creditsCharged}), 0)::int`,
    })
    .from(supportAiUsage)
    .where(
      and(eq(supportAiUsage.projectId, projectId), sql`${supportAiUsage.day} like ${month + "%"}`),
    );
  return { replies: row?.replies ?? 0, credits: row?.credits ?? 0 };
}
