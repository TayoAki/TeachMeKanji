import { registerPushToken } from "@appbuilder/core";
import { appRoute, body, json, preflight } from "@/lib/app-cloud-http";
import { db } from "@/lib/server";

export const OPTIONS = preflight;

/** A generated app registers this phone for its owner's notifications (data/push.ts). */
export const POST = appRoute(async (request, ctx) => {
  const user = ctx.requireUser();
  const input = await body<{ token: string; platform: string }>(request);
  await registerPushToken(db(), {
    projectId: ctx.projectId,
    userId: user.id,
    token: String(input.token ?? "").slice(0, 200),
    platform: String(input.platform ?? ""),
  });
  return json({ ok: true });
});
