/**
 * After a build from approved mockups: draw the pictures the app asks for by description, render
 * every screen, score each against its mockup, and rebuild the screens under the target (up to
 * MATCH_ROUNDS rounds), committing a version after each round. It stays inside the build run's
 * credit reserve: once that is spent, the last good version stands. The check and its fixes make
 * the build match what the user approved, so the user doesn't pay for them.
 */
import {
  formatIssues,
  hasErrors,
  refreshTemplate,
  validateProject,
  withAppStructure,
  type AppPlan,
  type ProjectFiles,
} from "@appbuilder/contract";
import { commitVersion, getStorage, newId } from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import {
  codeSystem,
  filesAsContext,
  screenComponentDir,
  type BuildDesign,
} from "../agents/prompts";
import { generateFiles } from "../generation/generate-files";
import type { HandlerContext } from "../handlers/context";
import { getDetailImageModel } from "../images/client";
import { BudgetExceeded, freeCalls } from "../llm";
import { platformUrl } from "../platform-url";
import { canRenderScreens, renderScreens } from "../render/screens";
import { compareScreen, fixRequest, MATCH_ROUNDS, MATCH_TARGET, type ScreenMatch } from "./match";

/** Screens rebuilt per round at most (the furthest from their mockups first). */
const MATCH_FIXES_PER_ROUND = Number(process.env.MATCH_FIXES_PER_ROUND) || 3;
/** The check renders on a taller canvas than a phone, to see more of long screens. */
const MATCH_CANVAS_HEIGHT = 1200;
import { picturePrompt, picturePrompts, withPictures } from "./pictures";

export interface MatchResult {
  files: ProjectFiles;
  versionId: string | null;
  /** Per screen: its first and final score and what still differs. */
  screens: Array<{ path: string; title: string; first: number; score: number; gaps: string[] }>;
  rounds: number;
  /** Why it stopped early, if it did. */
  stopped?: string;
}

async function storeAppImage(
  ctx: HandlerContext,
  projectId: string,
  label: string,
  data: Buffer,
  mime: string,
): Promise<string> {
  const id = newId("img");
  const storageKey = `projects/${projectId}/images/${id}`;
  await getStorage().put(storageKey, data, mime);
  await ctx.db.insert(schema.projectAsset).values({
    id,
    projectId,
    storageKey,
    fileName: `${
      label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 40) || "picture"
    }.png`,
    mime,
    bytes: data.byteLength,
    purpose: "app_image",
  });
  return `${platformUrl()}/api/app-images/${id}`;
}

/** Draw the pictures the app describes in <AiImage prompt="..."> and add them to its images. */
export async function addPromptPictures(
  ctx: HandlerContext,
  projectId: string,
  files: ProjectFiles,
  style?: string,
  options: { free?: boolean } = {},
): Promise<ProjectFiles> {
  const model = getDetailImageModel();
  const prompts = picturePrompts(files);
  if (!model || !prompts.length) return files;
  await ctx.emit("step", {
    label: `Drawing ${prompts.length} picture${prompts.length === 1 ? "" : "s"} the app shows`,
  });
  const urls: Record<string, string> = {};
  await Promise.all(
    prompts.map(async (prompt) => {
      if (ctx.overBudget()) return;
      try {
        const image = await model.draw({ prompt: picturePrompt(prompt, style), aspect: "4:3" });
        ctx.charge(image.costUsd, options);
        urls[prompt] = await storeAppImage(ctx, projectId, prompt, image.data, image.mediaType);
      } catch {
        // A picture that can't be drawn keeps its placeholder.
      }
    }),
  );
  return withPictures(files, urls);
}

export async function matchMockups(
  ctx: HandlerContext,
  input: {
    projectId: string;
    plan: AppPlan;
    files: ProjectFiles;
    design: BuildDesign;
    themeId?: string;
    buildModel: string;
    reviewModel: string;
    /** The version the build committed, kept when nothing improves. */
    versionId: string;
    /** The current template: fixes follow today's rules, so they need today's platform files. */
    template: ProjectFiles;
    /** Preview storage for rendering (an App Cloud session with the sample data). */
    storage?: Record<string, string>;
    /** How long a rendered screen settles before its screenshot (offline builds need little). */
    settleMs?: number;
  },
): Promise<MatchResult | null> {
  if (!(await canRenderScreens())) return null;
  const { plan, design } = input;
  const createMessage = freeCalls(ctx.createMessage);
  const screens = plan.screens.filter((s) => design.mockups[s.path]);
  if (!screens.length) return null;
  const mockups = new Map(
    screens.map((s) => [s.path, Buffer.from(design.mockups[s.path]!.data, "base64")]),
  );
  let files = refreshTemplate(input.files, input.template);
  let versionId: string | null = input.versionId;
  const first = new Map<string, number>();
  const latest = new Map<string, ScreenMatch>();
  const shots = new Map<string, Buffer>();

  const check = async (paths: string[]) => {
    const rendered = await renderScreens(files, {
      themeId: input.themeId,
      only: paths,
      storage: input.storage,
      height: MATCH_CANVAS_HEIGHT,
      settleMs: input.settleMs,
    });
    await Promise.all(
      rendered.map(async (r) => {
        const screen = screens.find((s) => s.path === r.file)!;
        if (!r.png) {
          latest.set(r.file, {
            score: 0,
            gaps: [
              { issue: r.error ?? "The screen didn't render.", fix: "Make the screen render." },
            ],
            missingPictures: [],
          });
          return;
        }
        shots.set(r.file, r.png);
        const match = await compareScreen({
          createMessage,
          model: input.reviewModel,
          title: screen.title,
          mockup: mockups.get(r.file)!,
          shot: r.png,
        });
        latest.set(r.file, match);
        if (!first.has(r.file)) first.set(r.file, match.score);
      }),
    );
  };

  let rounds = 0;
  let stopped: string | undefined;
  try {
    await ctx.emit("step", { label: "Checking every screen against your mockups" });
    await check(screens.map((s) => s.path));
    for (let round = 1; round <= MATCH_ROUNDS; round++) {
      // The furthest from their mockups first, a few per round, so a round stays affordable.
      const failing = screens
        .filter((s) => (latest.get(s.path)?.score ?? 0) < MATCH_TARGET && shots.has(s.path))
        .sort((a, b) => latest.get(a.path)!.score - latest.get(b.path)!.score)
        .slice(0, MATCH_FIXES_PER_ROUND);
      if (!failing.length) break;
      await ctx.emit("step", {
        label: `Bringing ${failing.map((s) => `${s.title} (${latest.get(s.path)!.score}%)`).join(", ")} closer to the mockups`,
      });
      // Like the build's screen step: the shared layer as a cached system prompt (the same for
      // every screen), and the screen's own current code in its request.
      const owned = (path: string) =>
        plan.screens.some((p) => path === p.path || path.startsWith(screenComponentDir(p)));
      const shared = Object.fromEntries(Object.entries(files).filter(([path]) => !owned(path)));
      const system = codeSystem("The app's shared files:", filesAsContext(shared));
      const base = files;
      const names = Object.keys(design.images ?? {});
      const results = await Promise.all(
        failing.map(async (screen) => {
          const dir = screenComponentDir(screen);
          const mockup = design.mockups[screen.path]!;
          const result = await generateFiles({
            createMessage,
            model: input.buildModel,
            system,
            request: [
              {
                type: "image",
                source: { type: "base64", media_type: mockup.mediaType, data: mockup.data },
              },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                  data: shots.get(screen.path)!.toString("base64"),
                },
              },
              {
                type: "text",
                text: `Current code:\n${Object.entries(files)
                  .filter(([path]) => path === screen.path || path.startsWith(dir))
                  .map(([path, content]) => `<file path="${path}">\n${content}\n</file>`)
                  .join("\n")}\n\n${fixRequest({
                  path: screen.path,
                  componentDir: dir,
                  match: latest.get(screen.path)!,
                  imageNames: names,
                })}`,
              },
            ],
            baseFiles: base,
            expectPaths: [screen.path],
            allowWrite: {
              test: (path) => path === screen.path || path.startsWith(dir),
              describe: `${screen.path} and components in ${dir} may be written`,
            },
          });
          return { screen, result };
        }),
      );
      let next = { ...files };
      const fixed: string[] = [];
      for (const { screen, result } of results) {
        if (!result.ok) {
          await ctx.emit("step", {
            label: `Couldn't improve ${screen.title}: ${formatIssues(result.issues).split("\n")[0]}`,
          });
          continue;
        }
        const candidate = withAppStructure({ ...next, ...result.files });
        const issues = validateProject(candidate);
        if (hasErrors(issues)) {
          await ctx.emit("step", {
            label: `Couldn't improve ${screen.title}: ${formatIssues(issues).split("\n")[0]}`,
          });
          continue;
        }
        next = candidate;
        fixed.push(screen.path);
      }
      if (!fixed.length) break;
      rounds = round;
      files = await addPromptPictures(ctx, input.projectId, next, design.style, { free: true });
      const version = await commitVersion(ctx.db, {
        projectId: input.projectId,
        files,
        kind: "ai_edit",
        summary: `Matched the mockups more closely: ${fixed
          .map((p) => screens.find((s) => s.path === p)!.title)
          .join(", ")}`,
        runId: ctx.run.id,
        createdBy: ctx.run.userId,
      });
      versionId = version.id;
      await check(fixed);
    }
  } catch (error) {
    if (!(error instanceof BudgetExceeded)) throw error;
    stopped = "The build's credit reserve ran out, so the last checked version stands.";
  }

  return {
    files,
    versionId,
    rounds,
    stopped,
    screens: screens.map((s) => ({
      path: s.path,
      title: s.title,
      first: first.get(s.path) ?? 0,
      score: latest.get(s.path)?.score ?? 0,
      gaps: (latest.get(s.path)?.gaps ?? []).map((g) => g.issue),
    })),
  };
}

/** One line per screen for the chat: how close it got, and what still differs on the worst. */
export function matchSummary(result: MatchResult): string {
  const list = result.screens
    .map((s) => `${s.title} ${s.score}%${s.score !== s.first ? ` (was ${s.first}%)` : ""}`)
    .join(", ");
  const below = result.screens.filter((s) => s.score < MATCH_TARGET && s.gaps.length);
  return `Checked against your mockups: ${list}.${
    below.length
      ? ` Still different: ${below
          .slice(0, 3)
          .map((s) => `${s.title}: ${s.gaps[0]}`)
          .join(" ")} Ask me to change any of it.`
      : ""
  }${result.stopped ? ` ${result.stopped}` : ""}`;
}
