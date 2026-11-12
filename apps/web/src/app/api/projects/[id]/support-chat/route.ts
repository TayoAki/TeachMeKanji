import { NextResponse } from "next/server";
import {
  HIRESHELBY_APP_ID,
  HIRESHELBY_PACKAGE,
  HIRESHELBY_VERSION,
  readSupportChat,
  withSupportChat,
} from "@appbuilder/contract";
import { getCurrentFiles } from "@appbuilder/core";
import { commitPlatformChange } from "@/lib/platform-change";
import { db, HttpError, readJson, requireProject, route } from "@/lib/server";

/**
 * Store builds install the SDK from npm, so it has to be published before an app connects
 * (HIRESHELBY_SDK_CHECK=0 skips the check). A registry that can't be reached doesn't block.
 */
async function sdkPublished(): Promise<boolean> {
  if (process.env.HIRESHELBY_SDK_CHECK === "0") return true;
  try {
    const response = await fetch(
      `https://registry.npmjs.org/${HIRESHELBY_PACKAGE.replace("/", "%2F")}/${HIRESHELBY_VERSION}`,
      { signal: AbortSignal.timeout(5_000) },
    );
    return response.status !== 404;
  } catch {
    return true;
  }
}

/** The app's Hire Shelby support chat: its App ID, if connected. */
export const GET = route(
  async (_request: Request, ctx: RouteContext<"/api/projects/[id]/support-chat">) => {
    const { id } = await ctx.params;
    await requireProject(id, "edit");
    const { files } = await getCurrentFiles(db(), id);
    const { appId } = readSupportChat(files);
    return NextResponse.json({ appId, connected: Boolean(appId) });
  },
);

/**
 * Connect Hire Shelby with the App ID from its dashboard ({ appId }), or disconnect
 * ({ appId: "" }): rewrites the platform file data/support-chat.ts and adds or removes the SDK.
 */
export const PUT = route(
  async (request: Request, ctx: RouteContext<"/api/projects/[id]/support-chat">) => {
    const { id } = await ctx.params;
    const { viewer } = await requireProject(id, "manage");
    const { appId: raw } = await readJson<{ appId?: unknown }>(request);
    const appId = String(raw ?? "").trim();
    if (appId && !HIRESHELBY_APP_ID.test(appId))
      throw new HttpError(
        400,
        "Paste the App ID from the Hire Shelby dashboard (it starts with app_).",
      );
    if (appId && !(await sdkPublished()))
      throw new HttpError(
        409,
        `Hire Shelby's React Native SDK (${HIRESHELBY_PACKAGE} ${HIRESHELBY_VERSION}) isn't on npm yet, so store builds couldn't install it. Publish it, then connect.`,
      );
    const { versionId } = await commitPlatformChange({
      projectId: id,
      userId: viewer!.id,
      summary: appId
        ? "Connected Hire Shelby support chat"
        : "Disconnected Hire Shelby support chat",
      change: (files) => withSupportChat(files, appId),
    });
    return NextResponse.json({ appId, connected: Boolean(appId), versionId });
  },
);
