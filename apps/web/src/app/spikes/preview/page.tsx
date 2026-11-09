import { join } from "node:path";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { loadProject } from "@appbuilder/contract/node";
import { PreviewSpike } from "./preview-spike";

export const metadata = { title: "Spike A · Preview runtime" };

// `next dev` / `next build` run from apps/web.
const repoRoot = join(process.cwd(), "../..");

async function loadFixture() {
  return loadProject(
    join(repoRoot, "templates/expo-app"),
    join(repoRoot, "fixtures/habit-tracker"),
  );
}

export default async function PreviewSpikePage() {
  // A development harness for the preview runtime (and its e2e tests), not a product page.
  // Rendered per request, so ENABLE_SPIKES is read at run time, not baked in at build time.
  await connection();
  if (process.env.NODE_ENV === "production" && !process.env.ENABLE_SPIKES) notFound();
  const files = await loadFixture();
  const themes = [
    ...(files["theme/tokens.ts"] ?? "").matchAll(/id: "([^"]+)",\s*name: "([^"]+)"/g),
  ].map(([, id, name]) => ({ id: id!, name: name! }));
  return <PreviewSpike files={files} themes={themes} />;
}
