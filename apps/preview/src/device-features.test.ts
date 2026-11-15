import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadProject } from "@appbuilder/contract/node";
import { createModuleSystem } from "./loader";
import { SAMPLE_PHOTO_BASE64 } from "./shims/device-features";
import { notifications, resetNotifications } from "./shims/native-capabilities";
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

describe("alarms on dates (template helpers)", () => {
  interface Alarm {
    id: string;
    hour: number;
    minute: number;
    days: number[];
    dates?: string[];
    title: string;
    body: string;
    href: string;
  }
  const { setAlarms, nextRing } = modules.require("data/alarms.ts") as {
    setAlarms: (alarms: Alarm[]) => Promise<boolean>;
    nextRing: (alarms: Alarm[]) => Date | null;
  };
  /** A Date's local day, as "YYYY-MM-DD". */
  const ymd = (d: Date) =>
    [d.getFullYear(), d.getMonth() + 1, d.getDate()]
      .map((n) => String(n).padStart(2, "0"))
      .join("-");
  /** The local date `offset` days from today. */
  const day = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return ymd(d);
  };
  const scheduledDates = async () =>
    (await notifications.getAllScheduledNotificationsAsync()).map((n) => {
      const at = new Date(n.trigger!.date as Date);
      return `${n.trigger!.type} ${ymd(at)} ${at.getHours()}:${at.getMinutes()}`;
    });

  it("rings at hour:minute on each date for schedules that aren't weekly, skipping past dates", async () => {
    resetNotifications();
    const cycle: Alarm = {
      id: "p1",
      hour: 8,
      minute: 30,
      days: [1],
      dates: [day(-2), day(3), day(1)],
      title: "BPC-157",
      body: "Your 8:30 dose is due.",
      href: "/log-dose",
    };
    expect(await setAlarms([cycle])).toBe(true);
    // Dates replace days: no weekly Monday ring.
    expect(await scheduledDates()).toEqual([`date ${day(1)} 8:30`, `date ${day(3)} 8:30`]);
    const next = nextRing([cycle])!;
    expect(`${ymd(next)} ${next.getHours()}:${next.getMinutes()}`).toBe(`${day(1)} 8:30`);
    expect(nextRing([{ ...cycle, dates: [day(-1)] }])).toBeNull();
    resetNotifications();
  });

  it("keeps the soonest 48 dated rings, within what phones keep, replacing the ones before", async () => {
    resetNotifications();
    const daily = (id: string, hour: number): Alarm => ({
      id,
      hour,
      minute: 0,
      days: [],
      dates: Array.from({ length: 30 }, (_, i) => day(i + 1)),
      title: id,
      body: "",
      href: "/",
    });
    await setAlarms([daily("a", 8), daily("b", 20)]);
    const first = await scheduledDates();
    expect(first).toHaveLength(48);
    expect(first[0]).toBe(`date ${day(1)} 8:0`);
    expect(first.at(-1)).toBe(`date ${day(24)} 20:0`);
    // Calling it again replaces them rather than adding more.
    await setAlarms([daily("a", 8)]);
    expect(await scheduledDates()).toHaveLength(30);
    resetNotifications();
  });
});

describe("kept photos (template helpers)", () => {
  const { keepPhoto, photoUri, keptName, forgetPhoto } = modules.require("data/photos.ts") as {
    keepPhoto: (p: {
      uri: string;
      base64: string | null;
      width: number;
      height: number;
    }) => Promise<{
      uri: string;
    }>;
    photoUri: (uri: string) => string;
    keptName: (uri: string) => string | null;
    forgetPhoto: (uri: string) => void;
  };

  it("finds a kept photo by its name, wherever the documents folder has moved", () => {
    expect(
      keptName("file:///var/mobile/Containers/Data/Application/1F0A/Documents/photos/lx8k2a9.jpg"),
    ).toBe("lx8k2a9.jpg");
    expect(keptName("file:///data/user/0/app/files/photos/a1.png")).toBe("a1.png");
    // Picked photos still in the cache, and web URLs, aren't kept ones.
    expect(
      keptName(
        "file:///var/mobile/Containers/Data/Application/1F0A/Library/Caches/ImagePicker/x.jpg",
      ),
    ).toBeNull();
    expect(keptName("https://example.com/photos/x.jpg")).toBeNull();
  });

  it("leaves photos as they are in the preview, which has no files", async () => {
    const photo = { uri: "data:image/png;base64,AAAA", base64: "AAAA", width: 1, height: 1 };
    expect(await keepPhoto(photo)).toEqual(photo);
    expect(photoUri(photo.uri)).toBe(photo.uri);
    expect(() => forgetPhoto(photo.uri)).not.toThrow();
  });
});
