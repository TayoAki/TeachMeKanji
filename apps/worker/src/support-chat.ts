/**
 * Hire Shelby support chat, included on paid plans (docs/11-hire-shelby-partner.md): when a
 * paying owner's app is built or sent to the stores, its Hire Shelby app is created and the chat
 * switched on in the app's files, unless the owner switched it off. After a downgrade the chat
 * goes back to email. An App ID the owner pasted themselves (their own Hire Shelby account) is
 * left alone.
 */
import { readSupportChat, withSupportChat, type ProjectFiles } from "@appbuilder/contract";
import {
  ensureSupportApp,
  hireShelbyEnabled,
  hireShelbySdkPublished,
  PLANS,
  reportError,
  userPlan,
} from "@appbuilder/core";
import { schema, type Database } from "@appbuilder/db";

type Project = typeof schema.project.$inferSelect;

/**
 * What to do with an app's support chat: keep its files, switch the chat back to email, or
 * create its Hire Shelby app and switch the chat on.
 */
export function supportChatDecision(input: {
  /** The App ID in data/support-chat.ts ("" when none). */
  current: string;
  /** The App ID App Builder created for the project, if any. */
  managedAppId: string | null;
  /** The owner's plan includes the chat. */
  included: boolean;
  /** The owner's switch for this app. */
  enabled: boolean;
}): "keep" | "email" | "provision" {
  const managed = Boolean(input.current) && input.current === input.managedAppId;
  if (input.current && !managed) return "keep"; // the owner's own Hire Shelby account
  if (!input.included || !input.enabled) return managed ? "email" : "keep";
  return managed ? "keep" : "provision";
}

export async function withIncludedSupportChat(
  db: Database,
  project: Project,
  files: ProjectFiles,
): Promise<ProjectFiles> {
  if (!hireShelbyEnabled()) return files;
  const decision = supportChatDecision({
    current: readSupportChat(files).appId,
    managedAppId: project.supportChatAppId,
    included: PLANS[await userPlan(db, project.ownerId)].supportChat,
    enabled: project.supportChat,
  });
  if (decision === "keep") return files;
  if (decision === "email") return withSupportChat(files, "");
  if (!(await hireShelbySdkPublished())) return files;
  try {
    return withSupportChat(files, await ensureSupportApp(db, project.id));
  } catch (error) {
    // Hire Shelby unreachable: the app keeps the email fallback, and the next build tries again.
    reportError(error, { where: "hire-shelby", projectId: project.id });
    return files;
  }
}
