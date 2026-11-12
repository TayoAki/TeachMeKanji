/**
 * After a chat edit passes the platform's checks, make sure it didn't break the rest of the app
 * (see regression.ts for what is checked). A broken or drifted screen gets one repair, which the
 * user doesn't pay for; if a screen is still broken the edit is not saved (the run fails, and a
 * failed run is free). Screens that drifted from their mockup or changed outside the request are
 * named in the chat, where "Undo this edit" gives the credits back.
 */
import {
  formatIssues,
  hasErrors,
  validateProject,
  withAppStructure,
  type AppPlan,
  type ProjectFiles,
} from "@appbuilder/contract";
import { AgentError } from "../agents/agents";
import { codeSystem, filesAsContext, screenComponentDir } from "../agents/prompts";
import { generateFiles } from "../generation/generate-files";
import type { HandlerContext } from "../handlers/context";
import { BudgetExceeded, freeCalls } from "../llm";
import { compareScreen } from "./match";
import { checkRegressions, type RegressionReport } from "./regression";

export interface LockResult {
  files: ProjectFiles;
  /** Paths the edit (and its repair) wrote or deleted. */
  changed: string[];
  /** Lines for the chat: what else changed, and what drifted from the mockups. */
  notes: string[];
  report: RegressionReport | null;
}

export async function lockEdit(
  ctx: HandlerContext,
  input: {
    request: string;
    before: ProjectFiles;
    after: ProjectFiles;
    changed: string[];
    selected?: string | null;
    plan?: AppPlan | null;
    mockups?: Map<string, Buffer>;
    themeId?: string;
    storage?: Record<string, string>;
    buildModel: string;
    reviewModel: string;
  },
): Promise<LockResult> {
  const createMessage = freeCalls(ctx.createMessage);
  const title = (path: string) =>
    input.plan?.screens.find((s) => s.path === path)?.title ??
    path.replace(/^app\//, "").replace(/\.tsx$/, "");
  const componentDirs = Object.fromEntries(
    (input.plan?.screens ?? []).map((s) => [s.path, screenComponentDir(s)]),
  );
  const mockups = input.mockups?.size ? input.mockups : undefined;
  const score = async (path: string, shot: Buffer) =>
    (
      await compareScreen({
        createMessage,
        model: input.reviewModel,
        title: title(path),
        mockup: mockups!.get(path)!,
        shot,
      })
    ).score;
  const check = (after: ProjectFiles, changed: string[], only?: string[]) =>
    checkRegressions({
      before: input.before,
      after,
      changed,
      selected: input.selected,
      themeId: input.themeId,
      storage: input.storage,
      settleMs: ctx.offline ? 150 : undefined,
      componentDirs,
      mockups,
      score: mockups ? score : undefined,
      only,
    });

  let files = input.after;
  let changed = input.changed;
  let report: RegressionReport | null;
  try {
    await ctx.emit("step", { label: "Checking that the rest of the app still works" });
    report = await check(files, changed);
  } catch (error) {
    // Out of budget for checks: the edit already passed the platform's checks, so it stands.
    if (error instanceof BudgetExceeded) return { files, changed, notes: [], report: null };
    throw error;
  }
  if (!report) return { files, changed, notes: [], report };

  if (report.broken.length || report.drifted.length) {
    const problems = [
      ...report.broken.map((b) => `- ${b.path} no longer renders: ${b.error}`),
      ...report.drifted.map(
        (d) =>
          `- ${d.path} matches its approved mockup much less than before (${d.before}% → ${d.after}%), though the request wasn't about it. Keep it as it looked before unless the request needs the change.`,
      ),
    ];
    const previous = changed
      .filter((path) => path in input.before)
      .map((path) => `<file path="${path}">\n${input.before[path]}\n</file>`)
      .join("\n")
      .slice(0, 60_000);
    await ctx.emit("step", {
      label: `Fixing ${[...report.broken, ...report.drifted].map((p) => title(p.path)).join(", ")}, which the change affected`,
    });
    try {
      const repair = await generateFiles({
        createMessage,
        model: input.buildModel,
        system: codeSystem("The app's current files (after the change):", filesAsContext(files)),
        request: `You just made this change to the app: "${input.request}". Rendering the app afterwards found problems:\n${problems.join("\n")}\n\n${previous ? `Before the change, the files you changed read:\n${previous}\n\n` : ""}Fix these problems while keeping the requested change. Start with <summary>one sentence</summary>, then a <file> block with the complete new contents of every file you change.`,
        baseFiles: files,
      });
      if (repair.ok) {
        let next: ProjectFiles = { ...files, ...repair.files };
        for (const path of repair.deletes) delete next[path];
        next = withAppStructure(next);
        if (!hasErrors(validateProject(next))) {
          const repaired = [...Object.keys(repair.files), ...repair.deletes];
          const allChanged = [...new Set([...changed, ...repaired])];
          const again = await check(
            next,
            allChanged,
            [...report.broken, ...report.drifted].map((p) => p.path),
          );
          if (again) {
            files = next;
            changed = allChanged;
            report = {
              broken: again.broken,
              drifted: again.drifted,
              alsoChanged: [...new Set([...report.alsoChanged, ...again.alsoChanged])],
              checked: report.checked,
            };
          }
        } else {
          await ctx.emit("step", {
            label: `The fix didn't pass the platform's checks: ${formatIssues(validateProject(next)).split("\n")[0]}`,
          });
        }
      }
    } catch (error) {
      if (!(error instanceof BudgetExceeded)) throw error;
    }
  }

  if (report.broken.length) {
    throw new AgentError(
      `This change broke ${report.broken.map((b) => title(b.path)).join(", ")} (${report.broken[0]!.error.slice(0, 160)}), and fixing it didn't work, so your app was kept as it was. Try asking for the change differently.`,
    );
  }
  const notes: string[] = [];
  for (const d of report.drifted)
    notes.push(
      `${title(d.path)} now matches its approved mockup less (${d.before}% → ${d.after}%). "Undo this edit" brings back the old look, with your credits.`,
    );
  const others = report.alsoChanged.filter((p) => !report!.drifted.some((d) => d.path === p));
  if (others.length)
    notes.push(
      `This also changed how ${others.map(title).join(", ")} look${others.length === 1 ? "s" : ""}.`,
    );
  return { files, changed, notes, report };
}
