import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema, type Database } from "@appbuilder/db";
import { creditBalance, ensureSignupGrant } from "./credits";
import {
  ensureSupportApp,
  supportInboxLink,
  syncSupportUsage,
  syncSupportWorkspaces,
} from "./hire-shelby";
import { createProject } from "./projects";
import { makeUser, testDb } from "./test-db";

/** A stand-in for Hire Shelby's partner API (docs/11-hire-shelby-partner.md). */
function fakeHireShelby() {
  const workspaces = new Map<string, { active: boolean; aiAllowed: boolean; ownerEmail: string }>();
  const apps = new Map<string, string>();
  const usage: Array<Record<string, unknown>> = [];
  const patches: Array<{ externalId: string; body: Record<string, unknown> }> = [];
  const read = (req: IncomingMessage) =>
    new Promise<Record<string, unknown>>((resolve) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {}));
    });
  const server: Server = createServer(async (req, res) => {
    const send = (status: number, body?: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(body === undefined ? undefined : JSON.stringify(body));
    };
    if (req.headers.authorization !== "Bearer test-partner-key")
      return send(401, { error: { code: "unauthorized", message: "Bad key" } });
    const url = new URL(req.url!, "http://x");
    const parts = url.pathname.replace("/partner/v1/", "").split("/").map(decodeURIComponent);
    const view = (id: string) => ({
      externalId: id,
      ...workspaces.get(id)!,
      claimed: false,
      dashboardUrl: "https://app.hireshelby.test",
    });
    if (parts[0] === "workspaces" && parts.length === 2 && req.method === "PUT") {
      const body = await read(req);
      if (!workspaces.has(parts[1]!))
        workspaces.set(parts[1]!, {
          active: true,
          aiAllowed: true,
          ownerEmail: String(body.ownerEmail),
        });
      return send(200, { workspace: view(parts[1]!) });
    }
    if (parts[0] === "workspaces" && parts.length === 2 && req.method === "PATCH") {
      const body = await read(req);
      patches.push({ externalId: parts[1]!, body });
      Object.assign(workspaces.get(parts[1]!)!, body);
      return send(200, { workspace: view(parts[1]!) });
    }
    if (parts[2] === "claim-link")
      return send(200, { url: `https://app.hireshelby.test/claim/t-${parts[1]}` });
    if (parts[2] === "apps" && req.method === "PUT") {
      if (!apps.has(parts[3]!)) apps.set(parts[3]!, `app_${parts[3]!.replace(/\W/g, "")}`);
      return send(200, { app: { externalId: parts[3], appId: apps.get(parts[3]!), name: "x" } });
    }
    if (parts[0] === "usage") {
      const after = url.searchParams.get("after");
      const start = after ? usage.findIndex((u) => u.id === after) + 1 : 0;
      const items = usage.slice(start, start + Number(url.searchParams.get("limit") || 200));
      return send(200, { items, next: items.at(-1)?.id ?? null });
    }
    send(404, { error: { code: "not_found", message: "No route" } });
  });
  return { server, workspaces, apps, usage, patches };
}

let handle: Awaited<ReturnType<typeof testDb>>;
let db: Database;
const fake = fakeHireShelby();

beforeAll(async () => {
  handle = await testDb();
  if (handle) db = handle.db;
  await new Promise<void>((resolve) => fake.server.listen(0, "127.0.0.1", resolve));
  const { port } = fake.server.address() as AddressInfo;
  process.env.HIRESHELBY_API_URL = `http://127.0.0.1:${port}`;
  process.env.HIRESHELBY_PARTNER_KEY = "test-partner-key";
});
afterAll(async () => {
  delete process.env.HIRESHELBY_API_URL;
  delete process.env.HIRESHELBY_PARTNER_KEY;
  fake.server.close();
  await handle?.close();
});

async function payingOwner(plan: "builder" | "free" = "builder") {
  const u = await makeUser(db);
  await ensureSignupGrant(db, u.id);
  if (plan !== "free")
    await db.insert(schema.subscription).values({ userId: u.id, plan, status: "active" });
  return u;
}

describe("Hire Shelby included on paid plans", () => {
  it("creates the owner's workspace and one Hire Shelby app per project, once", async () => {
    const u = await payingOwner();
    const p = await createProject(db, { ownerId: u.id, prompt: "x", platforms: "both" });
    const first = await ensureSupportApp(db, p.id);
    expect(await ensureSupportApp(db, p.id)).toBe(first);
    expect(fake.workspaces.get(u.id)).toMatchObject({
      active: true,
      aiAllowed: true,
      ownerEmail: u.email,
    });
    const [row] = await db.select().from(schema.project).where(eq(schema.project.id, p.id));
    expect(row!.supportChatAppId).toBe(first);
    expect(await supportInboxLink(db, u.id)).toBe(`https://app.hireshelby.test/claim/t-${u.id}`);
  });

  it("charges AI replies in whole credits as they add up, each reply once", async () => {
    const u = await payingOwner();
    const p = await createProject(db, { ownerId: u.id, prompt: "x", platforms: "both" });
    await ensureSupportApp(db, p.id);
    const before = await creditBalance(db, u.id);
    // 30 replies at $0.007: $0.21, so 5 credits (a credit is $0.05).
    for (let i = 0; i < 30; i++)
      fake.usage.push({
        id: `run-${p.id}-${String(i).padStart(3, "0")}`,
        workspaceExternalId: u.id,
        appExternalId: p.id,
        costUsd: 0.007,
        createdAt: "2026-11-12T10:00:00Z",
      });
    // Another owner's project can't be charged to this one.
    fake.usage.push({
      id: `run-${p.id}-zzz`,
      workspaceExternalId: "someone-else",
      appExternalId: p.id,
      costUsd: 5,
      createdAt: "2026-11-12T10:00:00Z",
    });
    await syncSupportUsage(db);
    expect(await creditBalance(db, u.id)).toBe(before - 5);
    await syncSupportUsage(db);
    expect(await creditBalance(db, u.id)).toBe(before - 5);
  });

  it("keeps the workspace in step: no AI without credits, not subscribed after a downgrade", async () => {
    const u = await payingOwner();
    const p = await createProject(db, { ownerId: u.id, prompt: "x", platforms: "both" });
    await ensureSupportApp(db, p.id);
    await db.insert(schema.creditLedger).values({
      userId: u.id,
      delta: -(await creditBalance(db, u.id)),
      reason: "grant",
      note: "Spent",
    });
    expect(await syncSupportWorkspaces(db)).toBeGreaterThanOrEqual(1);
    expect(fake.workspaces.get(u.id)).toMatchObject({ active: true, aiAllowed: false });

    await db
      .update(schema.subscription)
      .set({ status: "canceled" })
      .where(eq(schema.subscription.userId, u.id));
    await syncSupportWorkspaces(db);
    expect(fake.workspaces.get(u.id)).toMatchObject({ active: false, aiAllowed: false });
    // Nothing changed: nothing is sent.
    const sent = fake.patches.length;
    await syncSupportWorkspaces(db);
    expect(fake.patches.length).toBe(sent);
  });
});
