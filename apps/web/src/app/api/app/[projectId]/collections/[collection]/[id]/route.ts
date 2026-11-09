import { deleteRecord } from "@appbuilder/core";
import { appRoute, json, preflight } from "@/lib/app-cloud-http";
import { db } from "@/lib/server";

export const OPTIONS = preflight;

export const DELETE = appRoute<{ projectId: string; collection: string; id: string }>(
  async (_request, ctx, params) => {
    await deleteRecord(db(), ctx.requireUser(), params.collection, params.id);
    return json({ ok: true });
  },
);
