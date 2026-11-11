import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  isPromoFormat,
  normalizePromoColors,
  normalizeStoryboard,
  promoProblems,
  promoScreens,
} from "@appbuilder/contract";
import { assertRunRate, enqueueRun, getCurrentFiles, getStorage } from "@appbuilder/core";
import { db, HttpError, requireProject, route } from "@/lib/server";

const MAX_SHOT_BYTES = 5 * 1024 * 1024;
const MAX_MUSIC_BYTES = 12 * 1024 * 1024;

function imageType(data: Buffer): { extension: string; contentType: string } | null {
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return { extension: "png", contentType: "image/png" };
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)
    return { extension: "jpg", contentType: "image/jpeg" };
  return null;
}

/** The music formats Chrome plays, recognised from the file's own bytes, not its name. */
function audioType(data: Buffer): { extension: string; contentType: string } | null {
  const ascii = (start: number, end: number) => data.subarray(start, end).toString("latin1");
  if (ascii(0, 3) === "ID3" || (data[0] === 0xff && ((data[1] ?? 0) & 0xe0) === 0xe0))
    return { extension: "mp3", contentType: "audio/mpeg" };
  if (ascii(4, 8) === "ftyp") return { extension: "m4a", contentType: "audio/mp4" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE")
    return { extension: "wav", contentType: "audio/wav" };
  if (ascii(0, 4) === "OggS") return { extension: "ogg", contentType: "audio/ogg" };
  return null;
}

async function bytesOf(value: FormDataEntryValue | null, max: number, what: string) {
  if (!value || typeof value === "string") return null;
  if (value.size > max) throw new HttpError(413, `${what} must be under ${max / 1024 / 1024} MB.`);
  return Buffer.from(await value.arrayBuffer());
}

/**
 * Render a promo video (a promo_render run). The builder sends the edited storyboard, the
 * format, the theme's colors and one capture per beat (taken from the app's own preview), plus
 * optional music the owner has the rights to use.
 */
export const POST = route(
  async (request: Request, ctx: RouteContext<"/api/projects/[id]/promo/render">) => {
    const { id } = await ctx.params;
    const { viewer } = await requireProject(id, "edit");
    const form = await request.formData().catch(() => {
      throw new HttpError(400, "Send the storyboard as a form.");
    });
    const format = form.get("format");
    if (!isPromoFormat(format)) throw new HttpError(400, "Pick vertical or landscape.");
    const { versionId, files } = await getCurrentFiles(db(), id);
    if (!versionId) throw new HttpError(400, "Build the app first.");
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(form.get("storyboard") ?? ""));
    } catch {
      throw new HttpError(400, "The storyboard is malformed.");
    }
    const storyboard = normalizeStoryboard(parsed, promoScreens(Object.keys(files)));
    const problems = promoProblems(storyboard);
    if (problems.length) throw new HttpError(400, problems[0]!);
    let colors: unknown = {};
    try {
      colors = JSON.parse(String(form.get("colors") ?? "{}"));
    } catch {
      // Neutral colors below.
    }

    const music = await bytesOf(form.get("music"), MAX_MUSIC_BYTES, "Music");
    const musicType = music ? audioType(music) : null;
    if (music && !musicType)
      throw new HttpError(400, "Music must be an MP3, M4A, WAV or OGG file.");
    if (music && form.get("musicRights") !== "yes")
      throw new HttpError(400, "Confirm you have the rights to use this music.");

    await assertRunRate(db(), viewer!.id);
    const storage = getStorage();
    const prefix = `projects/${id}/promo/uploads/${randomUUID()}`;
    const shots: string[] = [];
    for (const [i] of storyboard.beats.entries()) {
      const data = await bytesOf(form.get(`shot-${i}`), MAX_SHOT_BYTES, "Each screen");
      const type = data ? imageType(data) : null;
      if (!data || !type) throw new HttpError(400, `Screen ${i + 1} wasn't captured. Try again.`);
      const key = `${prefix}/shot-${i}.${type.extension}`;
      await storage.put(key, data, type.contentType);
      shots.push(key);
    }
    let musicInput: { key: string; extension: string } | null = null;
    if (music && musicType) {
      const key = `${prefix}/music.${musicType.extension}`;
      await storage.put(key, music, musicType.contentType);
      musicInput = { key, extension: musicType.extension };
    }

    const run = await enqueueRun(db(), {
      projectId: id,
      userId: viewer!.id,
      kind: "promo_render",
      input: {
        storyboard,
        format,
        colors: normalizePromoColors(colors),
        shots,
        music: musicInput,
      },
    });
    return NextResponse.json({ runId: run.id });
  },
);
