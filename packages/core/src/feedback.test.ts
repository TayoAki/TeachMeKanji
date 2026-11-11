import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { schema, type Database } from "@appbuilder/db";
import {
  FEEDBACK_LIMITS,
  feedbackImage,
  isAdminEmail,
  listFeedback,
  listUserFeedback,
  submitFeedback,
  updateFeedback,
} from "./feedback";
import { createProject } from "./projects";
import { fileStorage } from "./storage";
import { makeUser, testDb } from "./test-db";

let handle: Awaited<ReturnType<typeof testDb>>;
let db: Database;
beforeAll(async () => {
  handle = await testDb();
  if (handle) db = handle.db;
});
afterAll(async () => handle?.close());

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

describe("feedback", () => {
  it("knows the operator from ADMIN_EMAILS", () => {
    process.env.ADMIN_EMAILS = "Ops@Example.com, second@example.com";
    expect(isAdminEmail("ops@example.com")).toBe(true);
    expect(isAdminEmail("someone@example.com")).toBe(false);
    delete process.env.ADMIN_EMAILS;
    expect(isAdminEmail("ops@example.com")).toBe(false);
  });

  it("stores a report with its screenshots and safe context, then triages it", async () => {
    const storage = fileStorage(await mkdtemp(join(tmpdir(), "feedback-")));
    const owner = await makeUser(db);
    const stranger = await makeUser(db);
    const viewer = { id: owner.id, email: owner.email, name: "Owner" };
    const project = await createProject(db, { ownerId: owner.id, prompt: "x", platforms: "both" });
    const send = (patch: Record<string, unknown> = {}) =>
      submitFeedback(db, storage, {
        viewer,
        kind: "bug",
        title: "  The build   stops at 80%  ",
        body: "I pressed build and it stopped at 80% twice.",
        ...patch,
      });

    await expect(send({ kind: "nonsense" })).rejects.toMatchObject({ status: 400 });
    await expect(send({ title: "x" })).rejects.toMatchObject({ status: 400 });
    await expect(send({ body: "short" })).rejects.toMatchObject({ status: 400 });
    await expect(send({ images: [Buffer.from("not an image at all")] })).rejects.toMatchObject({
      status: 400,
    });
    await expect(send({ images: [PNG, PNG, PNG, PNG] })).rejects.toMatchObject({ status: 400 });

    // A failed run on the project rides along as a clue; a project you can't open doesn't.
    await db.insert(schema.agentRun).values({
      id: `run_${Date.now()}`,
      projectId: project.id,
      userId: owner.id,
      kind: "build",
      status: "failed",
      error: "The model's answer was cut off.",
      finishedAt: new Date(),
    });
    const row = await send({
      projectId: project.id,
      images: [PNG],
      context: {
        path: "/projects/" + project.id,
        viewport: "1440×900",
        errors: ["one", 42, "two"],
        secret: "dropped",
      },
    });
    expect(row.title).toBe("The build stops at 80%");
    expect(row.status).toBe("new");
    expect(row.projectId).toBe(project.id);
    expect(row.images).toHaveLength(1);
    expect(row.context).toMatchObject({
      path: `/projects/${project.id}`,
      viewport: "1440×900",
      errors: ["one", "two"],
      lastFailedRun: { kind: "build", error: "The model's answer was cut off." },
    });
    expect(row.context).not.toHaveProperty("secret");
    const quiet = await send({ projectId: project.id, includeRunError: false });
    expect(quiet.context.lastFailedRun).toBeUndefined();
    const foreign = await submitFeedback(db, storage, {
      viewer: { id: stranger.id, email: stranger.email, name: "Stranger" },
      kind: "request",
      title: "Dark mode for the canvas",
      body: "Please add a darker canvas for night work.",
      projectId: project.id,
    });
    expect(foreign.projectId).toBeNull();

    // Screenshots: the sender and the operator only.
    const image = { id: row.id, n: 0 };
    expect(
      (await feedbackImage(db, storage, image.id, image.n, { id: owner.id, admin: false }))?.data,
    ).toEqual(PNG);
    expect(
      await feedbackImage(db, storage, image.id, image.n, { id: stranger.id, admin: false }),
    ).toBeNull();
    expect(
      await feedbackImage(db, storage, image.id, image.n, { id: stranger.id, admin: true }),
    ).not.toBeNull();

    expect((await listUserFeedback(db, owner.id)).map((f) => f.id)).toContain(row.id);
    expect((await listUserFeedback(db, owner.id)).map((f) => f.id)).not.toContain(foreign.id);
    const requests = await listFeedback(db, { kind: "request" });
    expect(requests.find((r) => r.feedback.id === foreign.id)?.userEmail).toBe(stranger.email);
    expect(requests.every((r) => r.feedback.kind === "request")).toBe(true);

    await expect(updateFeedback(db, row.id, { status: "shipped" })).rejects.toMatchObject({
      status: 400,
    });
    const triaged = await updateFeedback(db, row.id, {
      status: "planned",
      reply: "  Thanks, we can reproduce it.  ",
    });
    expect(triaged).toMatchObject({ status: "planned", reply: "Thanks, we can reproduce it." });
    expect((await updateFeedback(db, row.id, { reply: "" })).reply).toBeNull();
  });

  it("limits reports per hour", async () => {
    const storage = fileStorage(await mkdtemp(join(tmpdir(), "feedback-")));
    const someone = await makeUser(db);
    const viewer = { id: someone.id, email: someone.email, name: "Busy" };
    for (let i = 0; i < FEEDBACK_LIMITS.perHour; i++)
      await submitFeedback(db, storage, {
        viewer,
        kind: "other",
        title: `Note ${i}`,
        body: "Just a thought about the builder.",
      });
    await expect(
      submitFeedback(db, storage, {
        viewer,
        kind: "other",
        title: "One more",
        body: "Just a thought about the builder.",
      }),
    ).rejects.toThrow(/a lot of reports/);
  });
});
