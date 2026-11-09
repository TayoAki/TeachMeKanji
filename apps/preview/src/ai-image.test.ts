import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  appImagesFile,
  backendConfigFile,
  readAppImages,
  readPlatformConfig,
} from "@appbuilder/contract";
import { loadProject } from "@appbuilder/contract/node";
import { createModuleSystem } from "./loader";
import { vendorModules } from "./vendor";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const project = await loadProject(
  join(root, "templates/expo-app"),
  join(root, "fixtures/habit-tracker"),
);

function aiImageUrl(imageEndpoint: string) {
  const files = {
    ...project,
    "data/backend.ts": backendConfigFile({ apiUrl: "", projectId: "p1", imageEndpoint }),
  };
  const modules = createModuleSystem(files, vendorModules, { instrument: false });
  return (
    modules.require("components/AiImage.tsx") as {
      aiImageUrl: (p: string, w?: number, h?: number) => string | null;
    }
  ).aiImageUrl;
}

describe("AI images (template components/AiImage.tsx)", () => {
  it("builds ImageKit generation URLs when an endpoint is configured", () => {
    const url = aiImageUrl("https://ik.imagekit.io/demo")(
      "Fresh strawberries on a table",
      600,
      400,
    );
    expect(url).toMatch(
      /^https:\/\/ik\.imagekit\.io\/demo\/ik-genimg-prompt-Fresh%20strawberries%20on%20a%20table\/fresh-strawberries-on-a-table-[0-9a-z]+\.jpg\?tr=w-600,h-400$/,
    );
    // ImageKit caches each path forever, so prompts that start alike must not share one.
    const a = aiImageUrl("https://x")("A very long prompt that starts the same way, version one");
    const b = aiImageUrl("https://x")("A very long prompt that starts the same way, version two");
    expect(a).not.toBe(b);
  });

  it("returns null (placeholder) without an endpoint", () => {
    expect(aiImageUrl("")("anything")).toBeNull();
  });

  it("round-trips the platform config file", () => {
    const config = {
      apiUrl: "https://app.example.com",
      projectId: "p_123",
      imageEndpoint: "https://ik.imagekit.io/x",
    };
    expect(readPlatformConfig({ "data/backend.ts": backendConfigFile(config) })).toEqual(config);
  });

  it("round-trips the images added to a project", () => {
    const images = { hero: "https://app.example.com/api/app-images/a_1" };
    expect(readAppImages({ "data/images.ts": appImagesFile(images) })).toEqual(images);
    expect(readAppImages({})).toEqual({});
  });
});
