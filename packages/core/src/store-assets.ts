/**
 * The App Store assets a Store listing run made for an app (the icon and the framed
 * screenshots), kept in storage under the run, and the run's output that lists them.
 */
import { and, desc, eq } from "drizzle-orm";
import type { StoreListing } from "@appbuilder/contract";
import { schema, type Database } from "@appbuilder/db";

export interface StoreShot {
  /** The screen it shows, e.g. app/(tabs)/index.tsx. */
  screen: string;
  caption: string;
  /** File name under the run, e.g. shot-01.png (1320 x 2868). */
  file: string;
}

export interface StoreAssets {
  runId: string;
  listing: StoreListing;
  /** icon.png (1024 x 1024, no transparency), or null when no image model could draw it. */
  icon: string | null;
  shots: StoreShot[];
}

export function storeAssetKey(projectId: string, runId: string, file: string): string {
  return `projects/${projectId}/store/${runId}/${file}`;
}

/** File names a run may store: icon.png and shot-NN.png. */
export const STORE_ASSET_FILE = /^(icon|shot-\d{2})\.png$/;

/** What the latest successful Store listing run wrote and made, or null. */
export async function latestStoreAssets(
  db: Database,
  projectId: string,
): Promise<StoreAssets | null> {
  const [row] = await db
    .select({ id: schema.agentRun.id, output: schema.agentRun.output })
    .from(schema.agentRun)
    .where(
      and(
        eq(schema.agentRun.projectId, projectId),
        eq(schema.agentRun.kind, "store_listing"),
        eq(schema.agentRun.status, "succeeded"),
      ),
    )
    .orderBy(desc(schema.agentRun.createdAt))
    .limit(1);
  const output = row?.output as
    { listing?: StoreListing; icon?: string | null; shots?: StoreShot[] } | null | undefined;
  if (!row || !output?.listing) return null;
  return {
    runId: row.id,
    listing: output.listing,
    icon: output.icon ?? null,
    shots: output.shots ?? [],
  };
}
