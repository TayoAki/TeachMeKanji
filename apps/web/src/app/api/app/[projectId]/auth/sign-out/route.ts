import { signOutApp } from "@appbuilder/core";
import { appRoute, json, preflight } from "@/lib/app-cloud-http";
import { db } from "@/lib/server";

export const OPTIONS = preflight;

export const POST = appRoute(async (_request, ctx) => {
  if (ctx.token) await signOutApp(db(), ctx.token);
  return json({ ok: true });
});
