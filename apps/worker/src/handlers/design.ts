/**
 * The design-first runs.
 * - design: choose the direction, draw the mascot (when the app has one), draw two options for
 *   the key screen and keep the better one, then draw every other screen to match it, checking
 *   each and fixing what's wrong. Each image is stored and shown as soon as it's ready.
 * - mockup: redraw one screen (or the mascot) from the user's note.
 * The user approves the mockups in the workspace; the build then follows them.
 */
import { eq } from "drizzle-orm";
import {
  keyScreenPath,
  normalizeResearch,
  type AppPlan,
  type DesignDirection,
} from "@appbuilder/contract";
import {
  addDesignCost,
  designImageKey,
  getDesign,
  getStorage,
  updateDesign,
  type DesignRow,
} from "@appbuilder/core";
import { schema, type DesignMascotRecord, type DesignScreenRecord } from "@appbuilder/db";
import { AgentError } from "../agents/agents";
import {
  checkAndFix,
  chooseDirection,
  draw,
  drawKey,
  drawMascot,
  pickKeyScreen,
  type DesignDeps,
} from "../design/engine";
import { DESIGN_REVIEW_MODEL } from "../design/build-design";
import { screenMockupPrompt } from "../design/prompts";
import { getDetailImageModel, getImageModel, ImageError, type DrawnImage } from "../images/client";
import type { HandlerContext, HandlerResult } from "./context";

/**
 * The design direction: Gemini 3.8 Flash won the blind bake-off of twelve models (8.0 against
 * 7.33 for Opus) at $0.02, so it's the default when OpenRouter is set up; Haiku otherwise.
 */
const DESIGN_MODEL = () =>
  process.env.DESIGN_MODEL ||
  (process.env.OPENROUTER_API_KEY ? "google/gemini-3.8-flash" : "claude-haiku-5-5");
const REVIEW_MODEL = DESIGN_REVIEW_MODEL;
const PARALLEL_SCREENS = 4;

const fileSlug = (path: string) =>
  path
    .replace(/^app\//, "")
    .replace(/\.tsx$/, "")
    .replace(/[()[\]]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "screen";

/** Image spend is added to the run (its credits) and to the design (what it cost so far). */
function deps(ctx: HandlerContext, onSpend: (usd: number) => void): DesignDeps {
  const keyImages = getImageModel();
  const images = getDetailImageModel();
  if (!keyImages || !images)
    throw new AgentError(
      "Mockups aren't available right now (no image model is set up). Build the app straight from the plan instead.",
    );
  return {
    createMessage: ctx.createMessage,
    images,
    keyImages,
    directionModel: ctx.offline ? ctx.model : DESIGN_MODEL(),
    reviewModel: ctx.offline ? ctx.model : REVIEW_MODEL(),
    charge: (usd) => {
      ctx.charge(usd);
      onSpend(usd);
    },
    overBudget: ctx.overBudget,
  };
}

async function loadDesign(
  ctx: HandlerContext,
): Promise<{ row: DesignRow; plan: AppPlan; research: ReturnType<typeof normalizeResearch> }> {
  const { designId } = ctx.run.input as { designId?: string };
  const row = designId ? await getDesign(ctx.db, designId) : null;
  if (!row || row.projectId !== ctx.run.projectId)
    throw new AgentError("That design no longer exists.");
  const [planRow] = await ctx.db.select().from(schema.plan).where(eq(schema.plan.id, row.planId));
  if (!planRow) throw new AgentError("The plan behind this design no longer exists.");
  return {
    row,
    plan: planRow.data as unknown as AppPlan,
    research: normalizeResearch(planRow.research),
  };
}

/**
 * The design's screens and mascot live in memory while the run draws in parallel; every change
 * is written through one queue so parallel screens never overwrite each other.
 */
function recorder(ctx: HandlerContext, row: DesignRow) {
  let screens: DesignScreenRecord[] = row.screens;
  let mascot: DesignMascotRecord | null = row.mascot;
  let spent = 0;
  let queue: Promise<void> = Promise.resolve();
  const flush = () => {
    const snapshot = { screens, mascot };
    const cost = spent;
    spent = 0;
    queue = queue.then(async () => {
      await updateDesign(ctx.db, row.id, snapshot);
      if (cost > 0) await addDesignCost(ctx.db, row.id, cost);
      await ctx.emit("design", { designId: row.id });
    });
    return queue;
  };
  return {
    get screens() {
      return screens;
    },
    get mascot() {
      return mascot;
    },
    setScreens(next: DesignScreenRecord[]) {
      screens = next;
    },
    setMascot(next: DesignMascotRecord | null) {
      mascot = next;
    },
    patchScreen(path: string, patch: Partial<DesignScreenRecord>) {
      screens = screens.map((s) => (s.path === path ? { ...s, ...patch } : s));
    },
    spend(usd: number) {
      spent += usd;
    },
    flush,
  };
}

async function store(
  ctx: HandlerContext,
  row: DesignRow,
  name: string,
  image: { data: Buffer; mediaType: string },
) {
  const ext = image.mediaType === "image/png" ? "png" : "jpg";
  const key = designImageKey(row.projectId, row.id, `${name}.${ext}`);
  await getStorage().put(key, image.data, image.mediaType);
  return key;
}

async function read(key: string | null): Promise<Buffer | null> {
  if (!key) return null;
  const object = await getStorage().get(key);
  return object ? Buffer.from(object.data) : null;
}

const asAgentError = (error: unknown) =>
  error instanceof ImageError ? new AgentError(error.message) : error;

async function mapLimit<T>(items: T[], limit: number, run: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await run(items[next++]!);
    }),
  );
}

export async function handleDesign(ctx: HandlerContext): Promise<HandlerResult> {
  const { row, plan, research } = await loadDesign(ctx);
  const rec = recorder(ctx, row);
  const d = deps(ctx, (usd) => rec.spend(usd));
  try {
    await ctx.emit("step", { label: "Choosing the look and feel" });
    const direction = await chooseDirection(d, plan, research);
    rec.setScreens(
      direction.screens.map((s) => ({
        path: s.path,
        title: s.title,
        brief: s.mockupBrief,
        image: null,
        status: "pending",
        note: "",
        version: 0,
      })),
    );
    rec.setMascot(
      direction.mascot
        ? {
            name: direction.mascot.name,
            look: direction.mascot.look,
            personality: direction.mascot.personality,
            poses: direction.mascot.poses.map((p) => ({ ...p, image: null })),
            status: "pending",
            note: "",
          }
        : null,
    );
    await updateDesign(ctx.db, row.id, {
      direction: direction as unknown as Record<string, unknown>,
    });
    await rec.flush();

    const mascotRef = direction.mascot
      ? await drawAndStoreMascot(ctx, row, rec, d, plan, direction)
      : null;

    const keyPath = keyScreenPath(plan);
    const keyBrief = direction.screens.find((s) => s.path === keyPath) ?? direction.screens[0]!;
    await ctx.emit("step", { label: `Drawing two options for ${keyBrief.title}` });
    const keyPrompt = screenMockupPrompt(plan, direction, keyBrief, {
      references: mascotRef ? [`the mascot ${direction.mascot!.name}`] : [],
      tabScreen: keyBrief.path.includes("(tabs)"),
    });
    const keyRefs = mascotRef ? [mascotRef] : [];
    const [a, b] = await Promise.all([
      drawKey(d, { prompt: keyPrompt, refs: keyRefs, aspect: "9:16" }),
      drawKey(d, { prompt: keyPrompt, refs: keyRefs, aspect: "9:16" }),
    ]);
    const { winner } = await pickKeyScreen(d, keyBrief.mockupBrief, direction, a.data, b.data);
    const key = winner === 2 ? b : a;
    rec.patchScreen(keyBrief.path, {
      image: await store(ctx, row, `${fileSlug(keyBrief.path)}-v1`, key),
      version: 1,
    });
    await rec.flush();

    const others = direction.screens.filter((s) => s.path !== keyBrief.path);
    await ctx.emit("step", {
      label: `Drawing ${others.length} more screen${others.length === 1 ? "" : "s"} to match`,
    });
    await mapLimit(others, PARALLEL_SCREENS, async (screen) => {
      const drawn = await draw(d, {
        prompt: screenMockupPrompt(plan, direction, screen, {
          references: [
            `the app's main screen; match its visual system exactly (palette, type, cards, icons, spacing${screen.path.includes("(tabs)") ? ", tab bar" : ""})`,
            ...(mascotRef ? [`the mascot ${direction.mascot!.name}`] : []),
          ],
          tabScreen: screen.path.includes("(tabs)"),
        }),
        refs: [key.data, ...(mascotRef ? [mascotRef] : [])],
        aspect: "9:16",
      });
      const checked = await checkAndFix(d, key.data, drawn);
      rec.patchScreen(screen.path, {
        image: await store(ctx, row, `${fileSlug(screen.path)}-v1`, checked),
        version: 1,
      });
      await rec.flush();
    });

    await updateDesign(ctx.db, row.id, { status: "ready", error: null });
    await rec.flush();
    return { output: { designId: row.id } };
  } catch (error) {
    await rec.flush().catch(() => {});
    const failure = asAgentError(error);
    await updateDesign(ctx.db, row.id, {
      status: "failed",
      error: failure instanceof AgentError ? failure.message : "Drawing the mockups failed.",
    });
    await ctx.emit("design", { designId: row.id });
    throw failure;
  }
}

async function drawAndStoreMascot(
  ctx: HandlerContext,
  row: DesignRow,
  rec: ReturnType<typeof recorder>,
  d: DesignDeps,
  plan: AppPlan,
  direction: DesignDirection,
  options: { note?: string; current?: Buffer; version?: number } = {},
): Promise<Buffer | null> {
  await ctx.emit("step", { label: `Drawing ${direction.mascot!.name}` });
  const poses = await drawMascot(d, plan, direction, options);
  const version = options.version ?? 1;
  const mascot = rec.mascot!;
  const images = await Promise.all(
    poses.map((p) =>
      store(ctx, row, `mascot-${fileSlug(p.name)}-v${version}`, {
        data: p.png,
        mediaType: "image/png",
      }),
    ),
  );
  rec.setMascot({
    ...mascot,
    poses: mascot.poses.map((p, i) => ({ ...p, image: images[i] ?? p.image })),
  });
  await rec.flush();
  return poses[0]?.png ?? null;
}

/** Redraw one screen (or the mascot) from the user's note; it then waits for approval again. */
export async function handleMockup(ctx: HandlerContext): Promise<HandlerResult> {
  const { row, plan } = await loadDesign(ctx);
  const { path } = ctx.run.input as { path?: string };
  const direction = row.direction as unknown as DesignDirection | null;
  if (!direction || row.status !== "ready") throw new AgentError("The mockups aren't ready yet.");
  const rec = recorder(ctx, row);
  const d = deps(ctx, (usd) => rec.spend(usd));
  try {
    if (path === "mascot") {
      if (!row.mascot || !direction.mascot) throw new AgentError("This design has no mascot.");
      const current = await read(row.mascot.poses[0]?.image ?? null);
      const version = Number(/-v(\d+)\./.exec(row.mascot.poses[0]?.image ?? "")?.[1] ?? 1) + 1;
      await drawAndStoreMascot(ctx, row, rec, d, plan, direction, {
        note: row.mascot.note,
        current: current ?? undefined,
        version,
      });
      rec.setMascot({ ...rec.mascot!, status: "pending" });
      await rec.flush();
      return { output: { designId: row.id, path } };
    }

    const screen = row.screens.find((s) => s.path === path);
    if (!screen) throw new AgentError("That screen isn't part of this design.");
    const keyPath = keyScreenPath(plan);
    const current = await read(screen.image);
    const key =
      path === keyPath
        ? null
        : await read(row.screens.find((s) => s.path === keyPath)?.image ?? null);
    const mascot = await read(row.mascot?.poses[0]?.image ?? null);
    await ctx.emit("step", { label: `Redrawing ${screen.title}` });
    const references: string[] = [];
    const refs: Buffer[] = [];
    if (current) {
      references.push(
        "the current mockup of this screen: keep it, and change only what the user asked",
      );
      refs.push(current);
    }
    if (key) {
      references.push("the app's main screen; keep the same visual system");
      refs.push(key);
    }
    if (mascot && direction.mascot) {
      references.push(`the mascot ${direction.mascot.name}`);
      refs.push(mascot);
    }
    let drawn: DrawnImage = await draw(d, {
      prompt: screenMockupPrompt(
        plan,
        direction,
        { path: screen.path, title: screen.title, mockupBrief: screen.brief },
        { references, tabScreen: screen.path.includes("(tabs)"), note: screen.note },
      ),
      refs,
      aspect: "9:16",
    });
    if (key) drawn = await checkAndFix(d, key, drawn);
    const version = screen.version + 1;
    rec.patchScreen(screen.path, {
      image: await store(ctx, row, `${fileSlug(screen.path)}-v${version}`, drawn),
      version,
      status: "pending",
    });
    await rec.flush();
    return { output: { designId: row.id, path } };
  } catch (error) {
    await rec.flush().catch(() => {});
    throw asAgentError(error);
  }
}
