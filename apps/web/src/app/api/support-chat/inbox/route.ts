import { NextResponse } from "next/server";
import {
  HireShelbyError,
  hireShelbyEnabled,
  PLANS,
  supportInboxLink,
  userPlan,
} from "@appbuilder/core";
import { db, HttpError, requireViewer, route } from "@/lib/server";

/**
 * Where the owner answers their apps' support chats: a one-time link that signs them up (or in)
 * to their Hire Shelby workspace the first time, then the dashboard itself.
 */
export const POST = route(async () => {
  const viewer = await requireViewer();
  if (!hireShelbyEnabled()) throw new HttpError(400, "Support chat isn't included on this server.");
  if (!PLANS[await userPlan(db(), viewer.id)].supportChat)
    throw new HttpError(403, "The support chat is included on Builder and Pro.");
  try {
    return NextResponse.json({ url: await supportInboxLink(db(), viewer.id) });
  } catch (error) {
    if (error instanceof HireShelbyError)
      throw new HttpError(502, `Hire Shelby didn't answer as expected: ${error.message}`);
    throw error;
  }
});
