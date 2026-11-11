/**
 * What the build follows when the user approved mockups: each screen's mockup (as an image the
 * screen's model call sees) and the mascot's poses, added to the app as images it can show.
 */
import { and, eq } from "drizzle-orm";
import { poseImageName } from "@appbuilder/contract";
import { designApproved, designForPlan, getStorage, newId } from "@appbuilder/core";
import { schema, type Database } from "@appbuilder/db";
import type { BuildDesign, MockupImage } from "../agents/prompts";
import { mediaTypeOf } from "../images/client";
import { platformUrl } from "../platform-url";

/** The build model when mockups carry the design: Sonnet matched them as well as Opus at half the cost. */
export const DESIGN_BUILD_MODEL = () => process.env.DESIGN_BUILD_MODEL || "claude-sonnet-5-5";

export async function approvedDesignFor(
  db: Database,
  projectId: string,
  planId: string,
): Promise<{ design: BuildDesign; designId: string } | undefined> {
  const row = await designForPlan(db, planId);
  if (!row || row.projectId !== projectId || !designApproved(row)) return undefined;
  const storage = getStorage();
  const mockups: Record<string, MockupImage> = {};
  for (const screen of row.screens) {
    const object = screen.image ? await storage.get(screen.image) : null;
    if (!object) continue;
    const data = Buffer.from(object.data);
    mockups[screen.path] = { mediaType: mediaTypeOf(data), data: data.toString("base64") };
  }
  // Mascot poses become app images (stored once; the asset points at the design's file).
  const images: Record<string, string> = {};
  for (const pose of row.mascot?.poses ?? []) {
    if (!pose.image) continue;
    const name = poseImageName(row.mascot!.name, pose.name);
    const [existing] = await db
      .select({ id: schema.projectAsset.id })
      .from(schema.projectAsset)
      .where(
        and(
          eq(schema.projectAsset.projectId, projectId),
          eq(schema.projectAsset.storageKey, pose.image),
        ),
      );
    let id = existing?.id;
    if (!id) {
      const object = await storage.get(pose.image);
      if (!object) continue;
      id = newId("img");
      await db.insert(schema.projectAsset).values({
        id,
        projectId,
        storageKey: pose.image,
        fileName: name,
        mime: "image/png",
        bytes: object.data.byteLength,
        purpose: "app_image",
      });
    }
    images[name] = `${platformUrl()}/api/app-images/${id}`;
  }
  return { design: { mockups, images }, designId: row.id };
}
