import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AppPlan } from "@appbuilder/contract";
import type { Database } from "@appbuilder/db";
import {
  approveAllDesign,
  createDesign,
  currentDesign,
  designApproved,
  designView,
  reviewDesignItem,
  updateDesign,
} from "./design";
import { createProject, latestPlan, savePlan } from "./projects";
import { makeUser, testDb } from "./test-db";
import { designStepAvailable, recordWorkerHeartbeat } from "./workers";

let handle: Awaited<ReturnType<typeof testDb>>;
let db: Database;
beforeAll(async () => {
  handle = await testDb();
  if (handle) db = handle.db;
});
afterAll(async () => handle?.close());

const plan = { appName: "Sippo", screens: [], themes: [] } as unknown as AppPlan;

describe("designs", () => {
  it("keeps research across plan revisions, and tracks approvals until every mockup is approved", async (ctx) => {
    if (!handle) return ctx.skip();
    const user = await makeUser(db);
    const project = await createProject(db, {
      ownerId: user.id,
      prompt: "A water tracker",
      platforms: "both",
      name: "Sippo",
    });
    await savePlan(db, project.id, plan, { brief: "Lead with a mascot." });
    const revised = await savePlan(db, project.id, plan);
    expect(revised.research).toEqual({ brief: "Lead with a mascot." });

    const design = await createDesign(db, { projectId: project.id, planId: revised.id });
    expect(
      await currentDesign(db, project.id, (await latestPlan(db, project.id))!.id),
    ).toMatchObject({ id: design.id });
    await expect(approveAllDesign(db, design.id)).rejects.toThrow(/still being drawn/);

    await updateDesign(db, design.id, {
      status: "ready",
      screens: [
        {
          path: "app/(tabs)/index.tsx",
          title: "Today",
          brief: "",
          image: `projects/${project.id}/design/${design.id}/tabs-index-v1.png`,
          status: "pending",
          note: "",
          version: 1,
        },
        {
          path: "app/settings.tsx",
          title: "Settings",
          brief: "",
          image: `projects/${project.id}/design/${design.id}/settings-v1.jpg`,
          status: "pending",
          note: "",
          version: 1,
        },
      ],
      mascot: {
        name: "Sippo",
        look: "",
        personality: "",
        poses: [{ name: "happy", description: "", image: null }],
        status: "pending",
        note: "",
      },
    });
    let row = await reviewDesignItem(db, design.id, {
      path: "app/(tabs)/index.tsx",
      status: "approved",
    });
    row = await reviewDesignItem(db, design.id, {
      path: "app/settings.tsx",
      status: "changes",
      note: "  Warmer colors  ",
    });
    expect(row.screens[1]).toMatchObject({ status: "changes", note: "Warmer colors" });
    expect(designApproved(row)).toBe(false);
    await expect(
      reviewDesignItem(db, design.id, { path: "app/nope.tsx", status: "approved" }),
    ).rejects.toThrow(/isn't part/);

    row = await approveAllDesign(db, design.id);
    expect(designApproved(row)).toBe(true);
    const view = designView(row, (key) => `/img/${key.split("/").pop()}`);
    expect(view.approved).toBe(true);
    expect(view.screens.map((s) => s.url)).toEqual([
      "/img/tabs-index-v1.png",
      "/img/settings-v1.jpg",
    ]);
    expect(view.mascot).toMatchObject({
      name: "Sippo",
      status: "approved",
      poses: [{ name: "happy", url: null }],
    });
  });

  it("is offered only while a worker that can draw mockups is running", async (ctx) => {
    if (!handle) return ctx.skip();
    const id = `worker-design-${Date.now()}`;
    await recordWorkerHeartbeat(db, id, { devicePreviews: false, design: true });
    expect(await designStepAvailable(db)).toBe(true);
  });
});
