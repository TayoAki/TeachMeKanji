import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@appbuilder/db";
import { AppCloudError, createAnonymousUser } from "./app-cloud";
import { PUSH_BROADCASTS_PER_DAY, pushSummary, registerPushToken, sendPush } from "./app-push";
import { createProject } from "./projects";
import { makeUser, testDb } from "./test-db";

let handle: Awaited<ReturnType<typeof testDb>>;
let db: Database;
beforeAll(async () => {
  handle = await testDb();
  if (handle) db = handle.db;
});
afterAll(async () => handle?.close());

describe("push notifications (Postgres)", () => {
  it("registers phones, sends to all of them, drops dead ones, and limits sends per day", async () => {
    const owner = await makeUser(db);
    const p = await createProject(db, { ownerId: owner.id, prompt: "x", platforms: "both" });
    const alice = await createAnonymousUser(db, p.id);
    const bob = await createAnonymousUser(db, p.id);
    await expect(
      registerPushToken(db, {
        projectId: p.id,
        userId: alice.user.id,
        token: "nope",
        platform: "ios",
      }),
    ).rejects.toBeInstanceOf(AppCloudError);
    await registerPushToken(db, {
      projectId: p.id,
      userId: alice.user.id,
      token: "ExponentPushToken[alice]",
      platform: "ios",
    });
    // Registering again (a new session on the same phone) doesn't add a device.
    await registerPushToken(db, {
      projectId: p.id,
      userId: alice.user.id,
      token: "ExponentPushToken[alice]",
      platform: "ios",
    });
    await registerPushToken(db, {
      projectId: p.id,
      userId: bob.user.id,
      token: "ExponentPushToken[bob]",
      platform: "android",
    });
    expect((await pushSummary(db, p.id)).devices).toBe(2);

    const sentBodies: unknown[] = [];
    const expo = (async (_url: string, init: RequestInit) => {
      const messages = JSON.parse(String(init.body)) as Array<{ to: string }>;
      sentBodies.push(messages);
      return new Response(
        JSON.stringify({
          data: messages.map((m) =>
            m.to.includes("bob")
              ? { status: "error", details: { error: "DeviceNotRegistered" } }
              : { status: "ok", id: "x" },
          ),
        }),
      );
    }) as typeof fetch;
    const sent = await sendPush(
      db,
      p.id,
      { title: "New lessons", body: "Ten new kanji today" },
      expo,
    );
    expect(sent).toEqual({ ok: 1, failed: 1, removed: 1 });
    expect(sentBodies[0]).toEqual([
      expect.objectContaining({ to: "ExponentPushToken[alice]", title: "New lessons" }),
      expect.objectContaining({ to: "ExponentPushToken[bob]" }),
    ]);
    const summary = await pushSummary(db, p.id);
    expect(summary.devices).toBe(1);
    expect(summary.recent[0]).toMatchObject({ title: "New lessons", sent: { ok: 1, removed: 1 } });

    for (let i = 1; i < PUSH_BROADCASTS_PER_DAY; i++)
      await sendPush(db, p.id, { title: `t${i}`, body: "b" }, expo);
    await expect(sendPush(db, p.id, { title: "one more", body: "b" }, expo)).rejects.toMatchObject({
      status: 429,
    });
  });
});
