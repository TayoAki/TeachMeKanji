import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadProject } from "@appbuilder/contract/node";
import { createModuleSystem } from "./loader";
import { SAMPLE_PHOTO_BASE64 } from "./shims/device-features";
import { vendorModules } from "./vendor";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const project = await loadProject(
  join(root, "templates/expo-app"),
  join(root, "fixtures/habit-tracker"),
);
const modules = createModuleSystem(project, vendorModules, { instrument: false });

describe("camera, photos, location and push in the preview (template helpers)", () => {
  it("pickPhoto() returns a real sample image with base64, from the library or the camera", async () => {
    const { pickPhoto } = modules.require("data/photos.ts") as {
      pickPhoto: (o?: { source?: string }) => Promise<{ uri: string; base64: string } | null>;
    };
    for (const source of ["library", "camera"]) {
      const photo = await pickPhoto({ source });
      expect(photo?.base64).toBe(SAMPLE_PHOTO_BASE64);
      expect(photo?.uri).toMatch(/^data:image\/png;base64,/);
    }
    // A real PNG, so askAI() can send it to the model from the preview.
    expect(Buffer.from(SAMPLE_PHOTO_BASE64, "base64").subarray(1, 4).toString()).toBe("PNG");
  });

  it("registerForPush() resolves false: the preview isn't a build", async () => {
    const { registerForPush } = modules.require("data/push.ts") as {
      registerForPush: () => Promise<boolean>;
    };
    expect(await registerForPush()).toBe(false);
  });

  it("the camera and location helpers load against the preview's stand-ins", () => {
    expect(
      typeof (modules.require("components/camera.tsx") as { CameraCapture: unknown }).CameraCapture,
    ).toBe("function");
    expect(
      typeof (modules.require("data/location.ts") as { useLocation: unknown }).useLocation,
    ).toBe("function");
  });
});
