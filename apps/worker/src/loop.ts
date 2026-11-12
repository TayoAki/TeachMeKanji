import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { eq } from "drizzle-orm";
import {
  addEvent,
  backupIfDue,
  workerCanDesign,
  getStorage,
  addMessage,
  claimNextRun,
  completeRun,
  failRun,
  heartbeat,
  latestPlan,
  emailProviderSet,
  hireShelbyEnabled,
  pruneAnalytics,
  pruneAppErrors,
  sendDueFunnelEmails,
  sendEmail,
  pruneAppCloud,
  reapAbandonedRuns,
  syncSupportUsage,
  syncSupportWorkspaces,
  recordWorkerHeartbeat,
  reportError,
  runBudgetUsd,
  updateProject,
  type Run,
} from "@appbuilder/core";
import { schema, type Database } from "@appbuilder/db";
import { AgentError } from "./agents/agents";
import { DeviceManager } from "./device";
import { GenerationStopped } from "./generation/generate-file";
import { handleBuild, handleEdit, handlePlan } from "./handlers/agent-runs";
import { handlePaymentsSetup } from "./handlers/payments-setup";
import { handlePromoRender, handlePromoStoryboard } from "./handlers/promo-video";
import { handleStoreListing } from "./handlers/store-listing";
import type { HandlerContext, HandlerResult } from "./handlers/context";
import { handleGitHubPush } from "./handlers/github";
import { handleNativeBuild } from "./handlers/native-build";
import { handleReview } from "./handlers/review";
import { handleDesign, handleMockup } from "./handlers/design";
import { Cancelled, cancellable, getProvider, metered, type Provider } from "./llm";

const HANDLERS: Record<Run["kind"], (ctx: HandlerContext) => Promise<HandlerResult>> = {
  plan: handlePlan,
  build: handleBuild,
  edit: handleEdit,
  review: handleReview,
  github_push: handleGitHubPush,
  native_build: handleNativeBuild,
  payments_setup: handlePaymentsSetup,
  store_listing: handleStoreListing,
  promo_storyboard: handlePromoStoryboard,
  promo_render: handlePromoRender,
  design: handleDesign,
  mockup: handleMockup,
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

  const meter = metered(
    cancellable(provider.createMessage, () => cancelled),
    provider.model,
    runBudgetUsd(run.creditsReserved),
  );
  const ctx: HandlerContext = {
    db,
    run,
    createMessage: meter.createMessage,
    model: provider.model,
    editModel: provider.editModel,
    offline: provider.offline,
    emit: (type, payload) => addEvent(db, run.id, type, payload),
    charge: meter.charge,
    overBudget: meter.overBudget,
  };

  try {
    await ctx.emit("started", { kind: run.kind, offline: provider.offline });
    const result = await HANDLERS[run.kind](ctx);
    await completeRun(db, run, {
      output: result.output,
      model: provider.model,
      usage: meter.usage(),
      costUsd: meter.billable() ?? undefined,
      freeCostUsd: meter.freeCost(),
    });
  } catch (error) {
    if (!(
      error instanceof AgentError ||
      error instanceof Cancelled ||
      error instanceof GenerationStopped
    )) {
      reportError(error, { where: "worker", runId: run.id, kind: run.kind });
    }
    const message = userMessage(error);
    // Failed runs are free; cancelled ones pay for the usage they consumed (never above the
    // reserve).
    await failRun(
      db,
      run,
      error instanceof AgentError ? error.message : message,
      cancelled ? "cancelled" : "failed",
      {
        model: provider.model,
        usage: meter.usage(),
        costUsd: meter.billable() ?? undefined,
      },
    );
    if (AGENT_KINDS.has(run.kind)) {
      await restoreStatus(db, run);
      await addMessage(db, {
        projectId: run.projectId,
        role: "assistant",
        kind: "error",
        runId: run.id,
        // A failed step is the platform's mistake: say plainly that it cost nothing.
        content: {
          text:
            !cancelled && run.creditsReserved > 0
              ? `${message} This step was free: failed steps never use your credits.`
              : message,
        },
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
  let lastReap = 0;
  let lastPrune = 0;
  let lastHeartbeat = 0;
  let backingUp = false;
  // Only one worker should manage phone-preview dev servers (they are local processes).
  const manageDevices = process.env.DEVICE_PREVIEW_ENABLED !== "0";
  const workerId = `${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
  if (manageDevices) devices.listen();
  let active = 0;
  let rendering = false;
  // Runs mostly wait on the model, so many fit on one worker; the model-request cap
  // (MAX_MODEL_REQUESTS, see llm.ts) is what protects the account's rate limit.
  const concurrency = Number(process.env.WORKER_CONCURRENCY || 12);
  // Video renders use every CPU they get: one at a time per worker, the rest of the queue flows.
  const allKinds = Object.keys(HANDLERS) as Run["kind"][];
  const withoutRenders = allKinds.filter((kind) => kind !== "promo_render");

  while (!options.signal?.aborted) {
    let worked = false;
    try {
      const run =
        active < concurrency
          ? await claimNextRun(db, rendering ? withoutRenders : undefined)
          : null;
      if (run) {
        worked = true;
        active += 1;
        const render = run.kind === "promo_render";
        if (render) rendering = true;
        // Runs are independent; don't let one slow build block the queue.
        void processRun(db, run, provider).finally(() => {
          active -= 1;
          if (render) rendering = false;
        });
      }
      if (manageDevices && Date.now() - lastDeviceTick > 2_000) {
        lastDeviceTick = Date.now();
        // Starting a dev server can take minutes; never block the run queue on it.
        void devices.tick().catch((error) => console.error("worker: device preview error", error));
      }
      if (Date.now() - lastHeartbeat > 30_000) {
        lastHeartbeat = Date.now();
        // Tells the web app whether "Open on your phone" and the design step work here.
        void recordWorkerHeartbeat(db, workerId, {
          devicePreviews: manageDevices,
          design: workerCanDesign(),
        }).catch((error) => reportError(error, { where: "worker-heartbeat" }));
      }
      if (Date.now() - lastReap > 30_000) {
        lastReap = Date.now();
        await reapAbandonedRuns(db);
      }
      if (Date.now() - lastPrune > 3_600_000) {
        lastPrune = Date.now();
        // Expired App Cloud sessions and anonymous users who never saved anything.
        await pruneAppCloud(db);
        // Analytics events past their retention window.
        await pruneAnalytics(db);
        await pruneAppErrors(db);
        // Hire Shelby (support chat on paid plans): AI replies into credits, and each owner's
        // workspace in step with their plan and credits.
        if (hireShelbyEnabled()) {
          await syncSupportUsage(db).catch((error) =>
            reportError(error, { where: "hire-shelby usage" }),
          );
          await syncSupportWorkspaces(db).catch((error) =>
            reportError(error, { where: "hire-shelby workspaces" }),
          );
        }
        // Today's database backup into the bucket, if it isn't there yet (in the background:
        // a dump takes seconds and never blocks the run queue; it reports its own errors).
        if (!backingUp) {
          backingUp = true;
          void backupIfDue(getStorage()).finally(() => (backingUp = false));
        }
        // The funnel's launch emails that are due (only when a real email provider is set).
        if (emailProviderSet())
          await sendDueFunnelEmails(db, {
            appUrl: (process.env.APP_PUBLIC_URL || process.env.BETTER_AUTH_URL || "").replace(
              /\/$/,
              "",
            ),
            send: sendEmail,
          });
      }
    } catch (error) {
      reportError(error, { where: "worker-loop" });
    }
    if (!worked) await new Promise((r) => setTimeout(r, 400));
  }
  devices.stopAll();
}
