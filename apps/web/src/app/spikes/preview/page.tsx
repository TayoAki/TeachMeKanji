import { join } from "node:path";
import { cacheLife } from "next/cache";
import { loadProject } from "@appbuilder/contract/node";
import { PreviewSpike } from "./preview-spike";

export const metadata = { title: "Spike A · Preview runtime" };

// `next dev` / `next build` run from apps/web.
const repoRoot = join(process.cwd(), "../..");

async function loadFixture() {
  "use cache";
  cacheLife("max");
  return loadProject(
    join(repoRoot, "templates/expo-app"),
    join(repoRoot, "fixtures/habit-tracker"),
  );
}

export default async function PreviewSpikePage() {
  const files = await loadFixture();
  const themes = [
    ...(files["theme/tokens.ts"] ?? "").matchAll(/id: "([^"]+)",\s*name: "([^"]+)"/g),
  ].map(([, id, name]) => ({ id: id!, name: name! }));
  return <PreviewSpike files={files} themes={themes} />;
}
