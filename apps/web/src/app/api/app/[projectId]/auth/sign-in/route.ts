import { AppCloudError, publicUser, signInApp, WindowLimiter } from "@appbuilder/core";
import { appRoute, body, json, preflight } from "@/lib/app-cloud-http";
import { clientIp } from "@/lib/client-ip";
import { db } from "@/lib/server";

export const OPTIONS = preflight;

/** Password guessing: 10 attempts per account and 30 per address, per 5 minutes. */
const perAccount = new WindowLimiter(10, 5 * 60_000);
const perAddress = new WindowLimiter(30, 5 * 60_000);

export const POST = appRoute(async (request, ctx) => {
  const input = await body<{ email: string; password: string }>(request);
  const email = String(input.email ?? "")
    .trim()
    .toLowerCase();
  if (
    !perAddress.take(`${ctx.projectId}:${clientIp(request)}`) ||
    !perAccount.take(`${ctx.projectId}:${email}`)
  ) {
    throw new AppCloudError(429, "Too many attempts. Try again in a few minutes.");
  }
  const { user, token } = await signInApp(db(), ctx.projectId, {
    email,
    password: String(input.password ?? ""),
  });
  return json({ token, user: publicUser(user) });
});
