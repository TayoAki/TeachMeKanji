import {
  ANALYTICS,
  AppCloudError,
  parseEventBatch,
  recordEvents,
  WindowLimiter,
} from "@appbuilder/core";
import { appRoute, body, json, preflight } from "@/lib/app-cloud-http";
import { clientIp } from "@/lib/client-ip";
import { db } from "@/lib/server";

export const OPTIONS = preflight;

const perInstall = new WindowLimiter(ANALYTICS.requestsPerInstallPerMinute, 60_000);
/** Install ids are made up by the app, so a network gets its own (generous) limit too. */
const perAddress = new WindowLimiter(600, 60_000);

/**
 * Usage events from a generated app (template data/analytics.ts), batched every few seconds.
 * No sign-in: an app with analytics on sends them from every install, whether or not it keeps
 * its data in App Cloud. Limits keep one app from flooding the database.
 */
export const POST = appRoute(
  async (request, ctx) => {
    if (!perAddress.take(`${ctx.projectId}:${clientIp(request)}`))
      throw new AppCloudError(429, "Too many requests from this network. Try again in a minute.");
    const batch = parseEventBatch(await body(request, ANALYTICS.bodyBytes));
    if (!perInstall.take(`${ctx.projectId}:${batch.install}`))
      throw new AppCloudError(429, "Too many requests. Try again in a minute.");
    const { accepted } = await recordEvents(db(), ctx.projectId, batch);
    return json({ accepted, dropped: batch.dropped + batch.events.length - accepted });
  },
  { requires: "analytics" },
);
