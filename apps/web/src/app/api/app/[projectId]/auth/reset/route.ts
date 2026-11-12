import { AppCloudError, publicUser, resetAppPassword, WindowLimiter } from "@appbuilder/core";
import { appRoute, body, json, preflight } from "@/lib/app-cloud-http";
import { clientIp } from "@/lib/client-ip";
import { db } from "@/lib/server";

export const OPTIONS = preflight;

/** Code guessing: each code allows five tries; addresses get 30 attempts per 15 minutes. */
const perAddress = new WindowLimiter(30, 15 * 60_000);

/** Finish "Forgot password": the emailed code and a new password sign the person in. */
export const POST = appRoute(async (request, ctx) => {
  if (!perAddress.take(`${ctx.projectId}:${clientIp(request)}`))
    throw new AppCloudError(429, "Too many attempts. Try again in a few minutes.");
  const input = await body<{ email: string; code: string; password: string }>(request);
  const { user, token } = await resetAppPassword(db(), ctx.projectId, {
    email: String(input.email ?? ""),
    code: String(input.code ?? ""),
    password: String(input.password ?? ""),
  });
  return json({ token, user: publicUser(user) });
});
