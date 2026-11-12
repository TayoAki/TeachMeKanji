import {
  APP_ERRORS,
  AppCloudError,
  parseErrorReport,
  recordAppError,
  WindowLimiter,
} from "@appbuilder/core";
import { appRoute, body, json, preflight } from "@/lib/app-cloud-http";
import { clientIp } from "@/lib/client-ip";
import { db } from "@/lib/server";

export const OPTIONS = preflight;

const perInstall = new WindowLimiter(APP_ERRORS.requestsPerInstallPerMinute, 60_000);
/** Install ids are made up by the app, so a network gets its own limit too. */
const perAddress = new WindowLimiter(120, 60_000);

/**
 * An error from a generated app on a phone (template data/errors.ts). No sign-in: every app the
 * platform builds reports its errors, whether or not it uses App Cloud. Reports are grouped and
 * counted, and the number of distinct errors per app is capped.
 */
export const POST = appRoute(
  async (request, ctx) => {
    if (!perAddress.take(`${ctx.projectId}:${clientIp(request)}`))
      throw new AppCloudError(429, "Too many requests from this network. Try again in a minute.");
    const report = parseErrorReport(await body(request, APP_ERRORS.bodyBytes));
    if (!perInstall.take(`${ctx.projectId}:${report.install}`))
      throw new AppCloudError(429, "Too many requests. Try again in a minute.");
    const recorded = await recordAppError(db(), ctx.projectId, report);
    return json({ accepted: Boolean(recorded) });
  },
  { requires: "app" },
);
