import { publicUser } from "@appbuilder/core";
import { appRoute, json, preflight } from "@/lib/app-cloud-http";

export const OPTIONS = preflight;

export const GET = appRoute(async (_request, ctx) => json({ user: publicUser(ctx.requireUser()) }));
