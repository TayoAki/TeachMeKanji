import { eq } from "drizzle-orm";
import {
  addEvent,
  addMessage,
  claimNextRun,
  completeRun,
  failRun,
  heartbeat,
  latestPlan,
  updateProject,
  type Run,
} from "@appbuilder/core";
import { schema, type Database } from "@appbuilder/db";
import { AgentError } from "./agents/agents";
import { DeviceManager } from "./device";
import { GenerationStopped } from "./generation/generate-file";
import { handleBuild, handleEdit, handlePlan } from "./handlers/agent-runs";
import type { HandlerContext, HandlerResult } from "./handlers/context";
import { handleGitHubPush } from "./handlers/github";
import { handleNativeBuild } from "./handlers/native-build";
import { Cancelled, cancellable, getProvider, type Provider } from "./llm";

const HANDLERS: Record<Run["kind"], (ctx: HandlerContext) => Promise<HandlerResult>> = {
  plan: handlePlan,
  build: handleBuild,
  edit: handleEdit,
  github_push: handleGitHubPush,
  native_build: handleNativeBuild,
  device_preview: async () => ({ output: {} }),
};

const AGENT_KINDS = new Set<Run["kind"]>(["plan", "build", "edit"]);

function userMessage(error: unknown): string {
  if (error instanceof Cancelled) return "Cancelled.";
  if (error instanceof AgentError) return error.message;
  if (error instanceof GenerationStopped) {
    return error.stopReason === "refusal"
      ? "The model declined this request. Try rephrasing it."
      : "The model's answer was cut off. Please try again.";
  }
  return "Something went wrong on our side. Please try again.";
}

/** Put the project back in a sensible state after a failed agent run. */
async function restoreStatus(db: Database, run: Run) {
  const [project] = await db
    .select()
    .from(schema.project)
    .where(eq(schema.project.id, run.projectId));
  if (!project) return;
  const status = project.currentVersionId
    ? "ready"
    : (await latestPlan(db, run.projectId))
      ? "awaiting_confirmation"
      : "draft";
  await updateProject(db, run.projectId, { status });
}

export async function processRun(db: Database, run: Run, provider: Provider): Promise<void> {
  let cancelled = false;
  const beat = setInterval(() => {
    heartbeat(db, run.id)
      .then((r) => (cancelled ||= r.cancelRequested))
      .catch(() => {});
  }, 5_000);

  const ctx: HandlerContext = {
    db,
    run,
    createMessage: cancellable(provider.createMessage, () => cancelled),
    model: provider.model,
    offline: provider.offline,
    emit: (type, payload) => addEvent(db, run.id, type, payload),
  };

  try {
    await ctx.emit("started", { kind: run.kind, offline: provider.offline });
    const result = await HANDLERS[run.kind](ctx);
    await completeRun(db, run, {
      output: result.output,
      model: provider.model,
      usage: result.usage,
    });
  } catch (error) {
    if (!(
      error instanceof AgentError ||
      error instanceof Cancelled ||
      error instanceof GenerationStopped
    )) {
      console.error(`run ${run.id} (${run.kind}) failed`, error);
    }
    const message = userMessage(error);
    await failRun(
      db,
      run,
      error instanceof AgentError ? error.message : message,
      cancelled ? "cancelled" : "failed",
    );
    if (AGENT_KINDS.has(run.kind)) {
      await restoreStatus(db, run);
      await addMessage(db, {
        projectId: run.projectId,
        role: "assistant",
        kind: "error",
        runId: run.id,
        content: { text: message },
      });
    }
  } finally {
    clearInterval(beat);
  }
}

export async function runWorker(
  db: Database,
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  const provider = getProvider();
  const devices = new DeviceManager(db);
  console.log(
    `worker: started (${provider.offline ? "OFFLINE template generator" : `model ${provider.model}`})`,
  );
  let lastDeviceTick = 0;
  let active = 0;
  const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 4);

  while (!options.signal?.aborted) {
    let worked = false;
    try {
      const run = active < concurrency ? await claimNextRun(db) : null;
      if (run) {
        worked = true;
        active += 1;
        // Runs are independent; don't let one slow build block the queue.
        void processRun(db, run, provider).finally(() => (active -= 1));
      }
      if (Date.now() - lastDeviceTick > 2_000) {
        lastDeviceTick = Date.now();
        await devices.tick();
      }
    } catch (error) {
      console.error("worker: loop error", error);
    }
    if (!worked) await new Promise((r) => setTimeout(r, 400));
  }
  devices.stopAll();
}
