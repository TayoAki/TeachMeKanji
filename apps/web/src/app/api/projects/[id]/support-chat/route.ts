import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { HIRESHELBY_APP_ID, readSupportChat, withSupportChat } from "@appbuilder/contract";
import {
  ensureSupportApp,
  getCurrentFiles,
  HireShelbyError,
  hireShelbyEnabled,
  hireShelbySdkPublished,
  PLANS,
  supportAiSummary,
  userPlan,
} from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { commitPlatformChange } from "@/lib/platform-change";
import { db, HttpError, readJson, requireProject, route } from "@/lib/server";

const notPublished = () =>
  new HttpError(
    409,
    "Hire Shelby's React Native SDK isn't on npm yet, so store builds couldn't install it. Publish it, then switch the chat on.",
  );

/**
 * The app's support chat: whether paid plans include it here (partner mode), the owner's switch,
 * and the App ID it uses (one App Builder created, or one the owner pasted).
 */
export const GET = route(
  async (_request: Request, ctx: RouteContext<"/api/projects/[id]/support-chat">) => {
    const { id } = await ctx.params;
    const { project } = await requireProject(id, "edit");
    const { files } = await getCurrentFiles(db(), id);
    const { appId } = readSupportChat(files);
    const partner = hireShelbyEnabled();
    return NextResponse.json({
      appId,
      connected: Boolean(appId),
      partner,
      included: partner && PLANS[await userPlan(db(), project.ownerId)].supportChat,
      enabled: project.supportChat,
      managed: Boolean(appId) && appId === project.supportChatAppId,
      ai: await supportAiSummary(db(), id),
    });
  },
);

/**
 * Switch the included chat on or off ({ enabled }), or use the owner's own Hire Shelby app
 * ({ appId }, "" to disconnect). Either way data/support-chat.ts and the SDK dependency change
 * as a new version.
 */
export const PUT = route(
  async (request: Request, ctx: RouteContext<"/api/projects/[id]/support-chat">) => {
    const { id } = await ctx.params;
    const { viewer, project } = await requireProject(id, "manage");
    const body = await readJson<{ appId?: unknown; enabled?: unknown }>(request);

    if (typeof body.enabled === "boolean") {
      if (!hireShelbyEnabled())
        throw new HttpError(400, "Support chat isn't included on this server.");
      if (body.enabled && !PLANS[await userPlan(db(), project.ownerId)].supportChat)
        throw new HttpError(403, "The support chat is included on Builder and Pro.");
      await db()
        .update(schema.project)
        .set({ supportChat: body.enabled })
        .where(eq(schema.project.id, id));
      let appId = "";
      if (body.enabled) {
        if (!(await hireShelbySdkPublished())) throw notPublished();
        try {
          appId = await ensureSupportApp(db(), id);
        } catch (error) {
          if (error instanceof HireShelbyError)
            throw new HttpError(502, `Hire Shelby didn't answer as expected: ${error.message}`);
          throw error;
        }
      }
      const { versionId } = await commitPlatformChange({
        projectId: id,
        userId: viewer!.id,
        summary: body.enabled
          ? "Turned on Hire Shelby support chat"
          : "Switched Help & support to email",
        change: (files) => withSupportChat(files, appId),
      });
      return NextResponse.json({
        appId,
        connected: Boolean(appId),
        enabled: body.enabled,
        versionId,
      });
    }

    const appId = String(body.appId ?? "").trim();
    if (appId && !HIRESHELBY_APP_ID.test(appId))
      throw new HttpError(
        400,
        "Paste the App ID from the Hire Shelby dashboard (it starts with app_).",
      );
    if (appId && !(await hireShelbySdkPublished())) throw notPublished();
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
