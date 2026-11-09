import { AppCloudError, publicUser, signUpApp, WindowLimiter } from "@appbuilder/core";
import { appRoute, body, json, preflight } from "@/lib/app-cloud-http";
import { clientIp } from "@/lib/client-ip";
import { db } from "@/lib/server";

export const OPTIONS = preflight;

/** New accounts: 10 an hour per address, and 60 a minute per app as a backstop. */
const perAddress = new WindowLimiter(10, 3_600_000);
const perApp = new WindowLimiter(60, 60_000);

export const POST = appRoute(async (request, ctx) => {
  const input = await body<{ email: string; password: string; name?: string }>(request);
  if (!perAddress.take(`${ctx.projectId}:${clientIp(request)}`) || !perApp.take(ctx.projectId)) {
    throw new AppCloudError(429, "Too many new accounts right now. Try again later.");
  }
  const { user, token } = await signUpApp(
    db(),
    ctx.projectId,
    {
      email: String(input.email ?? ""),
      password: String(input.password ?? ""),
      name: typeof input.name === "string" ? input.name : undefined,
    },
    ctx.user,
  );
  return json({ token, user: publicUser(user) }, 201);
});
