import { AppCloudError, listRecords, putRecords } from "@appbuilder/core";
import { appRoute, body, BODY_LIMITS, json, preflight } from "@/lib/app-cloud-http";
import { db } from "@/lib/server";

export const OPTIONS = preflight;

/** The signed-in (or anonymous) user's records in one collection. */
export const GET = appRoute<{ projectId: string; collection: string }>(
  async (_request, ctx, params) => {
    return json({ records: await listRecords(db(), ctx.requireUser(), params.collection) });
  },
);

/** Insert or replace records: { records: [{ id, ...fields }] }. */
export const POST = appRoute<{ projectId: string; collection: string }>(
  async (request, ctx, params) => {
    const user = ctx.requireUser();
    const input = await body<{ records?: unknown }>(request, BODY_LIMITS.records);
    if (!Array.isArray(input.records)) throw new AppCloudError(400, "Send { records: [...] }.");
    const records = input.records.filter(
      (r): r is Record<string, unknown> => typeof r === "object" && r !== null,
    );
    await putRecords(db(), user, params.collection, records);
    return json({ ok: true, count: records.length });
  },
);
