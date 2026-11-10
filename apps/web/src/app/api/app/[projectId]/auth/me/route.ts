import { deleteAppUser, publicUser } from "@appbuilder/core";
import { appRoute, json, preflight } from "@/lib/app-cloud-http";
import { db } from "@/lib/server";

export const OPTIONS = preflight;

export const GET = appRoute(async (_request, ctx) => json({ user: publicUser(ctx.requireUser()) }));

/** Delete the signed-in app user and all of their data (data/auth.ts deleteAccount()). */
export const DELETE = appRoute(async (_request, ctx) => {
  await deleteAppUser(db(), ctx.requireUser());
  return json({ ok: true });
});
