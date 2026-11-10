import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  IDENTIFIER_PATTERN,
  readStoreSettings,
  withAppIdentifiers,
  withStoreSettings,
} from "@appbuilder/contract";
import { getCurrentFiles } from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { commitPlatformChange } from "@/lib/platform-change";
import { db, HttpError, readJson, requireProject, route } from "@/lib/server";

/** Store settings of the app, and which store keys the viewer has (the build dialog). */
export const GET = route(
  async (_request: Request, ctx: RouteContext<"/api/projects/[id]/store">) => {
    const { id } = await ctx.params;
    const { viewer } = await requireProject(id, "edit");
    const { files } = await getCurrentFiles(db(), id);
    const keys = viewer
      ? await db()
          .select({ provider: schema.integration.provider })
          .from(schema.integration)
          .where(
            and(
              eq(schema.integration.userId, viewer.id),
              inArray(schema.integration.provider, ["expo", "app-store-connect", "play-console"]),
            ),
          )
      : [];
    const has = (provider: string) => keys.some((k) => k.provider === provider);
    return NextResponse.json({
      settings: readStoreSettings(withAppIdentifiers(files, id)),
      keys: { expo: has("expo"), appStore: has("app-store-connect"), play: has("play-console") },
    });
  },
);

export const PUT = route(
  async (request: Request, ctx: RouteContext<"/api/projects/[id]/store">) => {
    const { id } = await ctx.params;
    const { viewer } = await requireProject(id, "manage");
    const body = await readJson<{ ios?: string; android?: string; ascAppId?: string }>(request);
    const settings = {
      ios: String(body.ios ?? "").trim(),
      android: String(body.android ?? "").trim(),
      ascAppId: String(body.ascAppId ?? "").trim(),
    };
    if (!IDENTIFIER_PATTERN.test(settings.ios) || !IDENTIFIER_PATTERN.test(settings.android))
      throw new HttpError(400, "Identifiers look like com.yourname.appname.");
    if (settings.ascAppId && !/^\d{6,12}$/.test(settings.ascAppId))
      throw new HttpError(
        400,
        "The App Store Connect app ID is the number under App Information → Apple ID.",
      );
    const { versionId } = await commitPlatformChange({
      projectId: id,
      userId: viewer!.id,
      summary: "Store settings",
      change: (files) => withStoreSettings(files, settings),
    });
    return NextResponse.json({ versionId, settings });
  },
);
