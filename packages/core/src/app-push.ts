/**
 * Push notifications for generated apps: their users opt in (registerForPush() in the
 * template's data/push.ts registers an Expo push token through App Cloud), and the app's owner
 * sends a notification from the builder's Data tab. Delivery goes through Expo's push service,
 * which forwards to Apple and Google; tokens Expo reports as unregistered are removed.
 */
import { and, count, desc, eq, gte } from "drizzle-orm";
import { schema, type Database } from "@appbuilder/db";
import { AppCloudError } from "./app-cloud";
import { newId } from "./ids";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH = 100;
/** Notifications an owner can send per app per day. */
export const PUSH_BROADCASTS_PER_DAY = 10;

export function isExpoPushToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[[\w-]+\]$/.test(token);
}

export async function registerPushToken(
  db: Database,
  input: { projectId: string; userId: string; token: string; platform: string },
): Promise<void> {
  if (!isExpoPushToken(input.token)) throw new AppCloudError(400, "Not an Expo push token.");
  const platform =
    input.platform === "ios" || input.platform === "android" ? input.platform : "other";
  await db
    .insert(schema.appPushToken)
    .values({ ...input, platform, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.appPushToken.projectId, schema.appPushToken.token],
      set: { userId: input.userId, platform, updatedAt: new Date() },
    });
}

export async function pushSummary(db: Database, projectId: string) {
  const [devices] = await db
    .select({ n: count() })
    .from(schema.appPushToken)
    .where(eq(schema.appPushToken.projectId, projectId));
  const recent = await db
    .select()
    .from(schema.appPushBroadcast)
    .where(eq(schema.appPushBroadcast.projectId, projectId))
    .orderBy(desc(schema.appPushBroadcast.createdAt))
    .limit(10);
  return {
    devices: devices?.n ?? 0,
    recent: recent.map((b) => ({
      id: b.id,
      title: b.title,
      body: b.body,
      sent: b.sent,
      createdAt: b.createdAt,
    })),
  };
}

interface Ticket {
  status: "ok" | "error";
  details?: { error?: string };
}

/** Send a notification to every registered device of the app. */
export async function sendPush(
  db: Database,
  projectId: string,
  message: { title: string; body: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: number; failed: number; removed: number }> {
  const title = message.title.trim().slice(0, 80);
  const body = message.body.trim().slice(0, 240);
  if (!title || !body) throw new AppCloudError(400, "A notification needs a title and a message.");
  const [today] = await db
    .select({ n: count() })
    .from(schema.appPushBroadcast)
    .where(
      and(
        eq(schema.appPushBroadcast.projectId, projectId),
        gte(schema.appPushBroadcast.createdAt, new Date(Date.now() - 86_400_000)),
      ),
    );
  if ((today?.n ?? 0) >= PUSH_BROADCASTS_PER_DAY)
    throw new AppCloudError(429, `You can send ${PUSH_BROADCASTS_PER_DAY} notifications a day.`);

  const tokens = (
    await db
      .select({ token: schema.appPushToken.token })
      .from(schema.appPushToken)
      .where(eq(schema.appPushToken.projectId, projectId))
  ).map((r) => r.token);
  const sent = { ok: 0, failed: 0, removed: 0 };
  for (let i = 0; i < tokens.length; i += BATCH) {
    const batch = tokens.slice(i, i + BATCH);
    let tickets: Ticket[] = [];
    try {
      const response = await fetchImpl(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(batch.map((to) => ({ to, title, body, sound: "default" }))),
        signal: AbortSignal.timeout(15_000),
      });
      tickets = ((await response.json()) as { data?: Ticket[] }).data ?? [];
    } catch {
      tickets = [];
    }
    for (const [index, token] of batch.entries()) {
      const ticket = tickets[index];
      if (ticket?.status === "ok") sent.ok++;
      else {
        sent.failed++;
        if (ticket?.details?.error === "DeviceNotRegistered") {
          await db
            .delete(schema.appPushToken)
            .where(
              and(
                eq(schema.appPushToken.projectId, projectId),
                eq(schema.appPushToken.token, token),
              ),
            );
          sent.removed++;
        }
      }
    }
  }
  await db
    .insert(schema.appPushBroadcast)
    .values({ id: newId("pb"), projectId, title, body, sent });
  return sent;
}
