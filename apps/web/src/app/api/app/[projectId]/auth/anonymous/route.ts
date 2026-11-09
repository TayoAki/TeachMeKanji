import { and, count, eq, gt } from "drizzle-orm";
import { AppCloudError, createAnonymousUser, publicUser, WindowLimiter } from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { appRoute, json, preflight } from "@/lib/app-cloud-http";
import { clientIp } from "@/lib/client-ip";
import { db } from "@/lib/server";

export const OPTIONS = preflight;

/** A device needs one anonymous user per install: 30 an hour per address is generous. */
const perAddress = new WindowLimiter(30, 3_600_000);

/** A device's first visit: an anonymous account so its data can be saved right away. */
export const POST = appRoute(async (request, ctx) => {
  if (!perAddress.take(`${ctx.projectId}:${clientIp(request)}`)) {
    throw new AppCloudError(429, "Too many new sessions from this network. Try again later.");
  }
  // A backstop across all addresses (served by the (project_id, created_at) index).
  const [recent] = await db()
    .select({ n: count() })
    .from(schema.appUser)
    .where(
      and(
        eq(schema.appUser.projectId, ctx.projectId),
        gt(schema.appUser.createdAt, new Date(Date.now() - 60_000)),
      ),
    );
  if ((recent?.n ?? 0) > 120)
    throw new AppCloudError(429, "Too many new devices right now. Try again in a minute.");
  const { user, token } = await createAnonymousUser(db(), ctx.projectId);
  return json({ token, user: publicUser(user) }, 201);
});
