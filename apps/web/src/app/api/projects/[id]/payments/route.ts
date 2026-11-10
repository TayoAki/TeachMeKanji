import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  PAYMENTS_FILE,
  paymentsConfigFile,
  readAppIdentifiers,
  readPaymentsConfig,
  withAppIdentifiers,
} from "@appbuilder/contract";
import { getCurrentFiles } from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { commitPlatformChange } from "@/lib/platform-change";
import { db, HttpError, readJson, requireProject, route } from "@/lib/server";

/** Payments: RevenueCat keys (real purchases in builds) or test mode, for the workspace panel. */
export const GET = route(
  async (_request: Request, ctx: RouteContext<"/api/projects/[id]/payments">) => {
    const { id } = await ctx.params;
    const { viewer } = await requireProject(id, "edit");
    const { files } = await getCurrentFiles(db(), id);
    const [revenuecat] = viewer
      ? await db()
          .select({ provider: schema.integration.provider })
          .from(schema.integration)
          .where(
            and(
              eq(schema.integration.userId, viewer.id),
              eq(schema.integration.provider, "revenuecat"),
            ),
          )
      : [];
    return NextResponse.json({
      payments: readPaymentsConfig(files),
      identifiers: readAppIdentifiers(withAppIdentifiers(files, id)),
      revenuecatConnected: Boolean(revenuecat),
    });
  },
);

const KEY = { ios: /^appl_[A-Za-z0-9]{10,}$/, android: /^goog_[A-Za-z0-9]{10,}$/ };

export const PUT = route(
  async (request: Request, ctx: RouteContext<"/api/projects/[id]/payments">) => {
    const { id } = await ctx.params;
    const { viewer } = await requireProject(id, "manage");
    const body = await readJson<{
      iosApiKey?: string;
      androidApiKey?: string;
      entitlement?: string;
    }>(request);
    const iosApiKey = String(body.iosApiKey ?? "").trim();
    const androidApiKey = String(body.androidApiKey ?? "").trim();
    const entitlement = String(body.entitlement ?? "premium").trim() || "premium";
    if (iosApiKey && !KEY.ios.test(iosApiKey))
      throw new HttpError(
        400,
        "The App Store key is RevenueCat's public key that starts with appl_.",
      );
    if (androidApiKey && !KEY.android.test(androidApiKey))
      throw new HttpError(
        400,
        "The Google Play key is RevenueCat's public key that starts with goog_.",
      );
    if (!/^[\w.-]{1,64}$/.test(entitlement))
      throw new HttpError(400, "That entitlement id isn't valid.");
    const live = Boolean(iosApiKey || androidApiKey);
    const { versionId } = await commitPlatformChange({
      projectId: id,
      userId: viewer!.id,
      summary: live
        ? "Connected RevenueCat: real purchases in store builds"
        : "Purchases back to test mode",
      change: (files) => ({
        ...withAppIdentifiers(files, id),
        [PAYMENTS_FILE]: paymentsConfigFile({ iosApiKey, androidApiKey, entitlement }),
      }),
    });
    return NextResponse.json({ versionId, live });
  },
);
