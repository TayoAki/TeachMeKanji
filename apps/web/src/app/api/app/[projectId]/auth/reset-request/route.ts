import { eq } from "drizzle-orm";
import {
  APP_PASSWORD_RESET,
  AppCloudError,
  emailConfigured,
  requestAppPasswordReset,
  sendEmail,
  WindowLimiter,
} from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { appRoute, body, json, preflight } from "@/lib/app-cloud-http";
import { clientIp } from "@/lib/client-ip";
import { db } from "@/lib/server";

export const OPTIONS = preflight;

/** A few codes per account and per address every 15 minutes: no mail-bombing through an app. */
const perAccount = new WindowLimiter(3, 15 * 60_000);
const perAddress = new WindowLimiter(10, 15 * 60_000);

/**
 * "Forgot password" in a generated app: email a six-digit code to the account. The answer is the
 * same whether or not the email has an account.
 */
export const POST = appRoute(async (request, ctx) => {
  if (!emailConfigured())
    throw new AppCloudError(503, "Password reset isn't available for this app yet.");
  const input = await body<{ email: string }>(request);
  const email = String(input.email ?? "")
    .trim()
    .toLowerCase();
  if (
    !perAddress.take(`${ctx.projectId}:${clientIp(request)}`) ||
    !perAccount.take(`${ctx.projectId}:${email}`)
  ) {
    throw new AppCloudError(429, "Too many requests. Try again in a few minutes.");
  }
  const reset = await requestAppPasswordReset(db(), ctx.projectId, email);
  if (reset) {
    const [project] = await db()
      .select({ name: schema.project.name })
      .from(schema.project)
      .where(eq(schema.project.id, ctx.projectId));
    const app = project?.name || "the app";
    await sendEmail({
      to: reset.email,
      subject: `Your ${app} code: ${reset.code}`,
      text: `Enter this code in ${app} to choose a new password:\n\n${reset.code}\n\nIt works for ${APP_PASSWORD_RESET.codeMinutes} minutes. If you didn't ask to reset your password, ignore this email: nothing changes.`,
    });
  }
  return json({ ok: true });
});
