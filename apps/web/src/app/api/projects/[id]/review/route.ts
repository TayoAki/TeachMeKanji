import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { assertRunRate, enqueueRun, getStorage } from "@appbuilder/core";
import { db, HttpError, readJson, requireProject, route } from "@/lib/server";

const MAX_SHOTS = 16;
const MAX_SHOT_BYTES = 4 * 1024 * 1024;

/**
 * Review the app against the quality rubric (docs/08-app-quality-rubric.md). The caller sends
 * screenshots of the screens (the eval CLI captures them from the canvas); the worker runs the
 * deterministic checks and the judges, and the result is the run's output.
 */
export const POST = route(
  async (request: Request, ctx: RouteContext<"/api/projects/[id]/review">) => {
    const { id } = await ctx.params;
    const { project, viewer } = await requireProject(id, "edit");
    if (!project.currentVersionId) throw new HttpError(400, "Build the app first.");
    const body = await readJson<{
      shots?: Array<{ label?: string; theme?: string; png?: string }>;
      renderErrors?: string[];
      judges?: number;
    }>(request);
    const shots = Array.isArray(body.shots) ? body.shots : [];
    if (shots.length === 0 || shots.length > MAX_SHOTS)
      throw new HttpError(400, `Send 1 to ${MAX_SHOTS} screenshots.`);
    await assertRunRate(db(), viewer!.id);

    const storage = getStorage();
    const batch = randomUUID();
    const stored: Array<{ label: string; theme: string; key: string }> = [];
    for (const [index, shot] of shots.entries()) {
      const data = Buffer.from(String(shot.png ?? ""), "base64");
      const isPng = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      if (!isPng || data.length > MAX_SHOT_BYTES)
        throw new HttpError(400, "Each screenshot must be a PNG under 4 MB.");
      const key = `projects/${id}/reviews/${batch}/${index}.png`;
      await storage.put(key, data, "image/png");
      stored.push({
        label: String(shot.label ?? `Screen ${index + 1}`).slice(0, 120),
        theme: String(shot.theme ?? "default").slice(0, 60),
        key,
      });
    }
    const run = await enqueueRun(db(), {
      projectId: id,
      userId: viewer!.id,
      kind: "review",
      input: {
        shots: stored,
        renderErrors: (Array.isArray(body.renderErrors) ? body.renderErrors : [])
          .map((e) => String(e).slice(0, 120))
          .slice(0, MAX_SHOTS),
        judges: Math.min(3, Math.max(1, Number(body.judges) || 2)),
      },
    });
    return NextResponse.json({ runId: run.id });
  },
);
