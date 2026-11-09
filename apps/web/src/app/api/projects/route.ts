import { NextResponse } from "next/server";
import {
  addMessage,
  creditBalance,
  createProject,
  enqueueRun,
  getStorage,
  listProjectsFor,
  newId,
  RUN_CREDITS,
} from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { db, HttpError, requireViewer, route } from "@/lib/server";

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;

/** Detect the real image type from magic bytes (never trust the client's MIME type). */
function sniffImage(bytes: Buffer): string | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 4).toString("ascii") === "GIF8") return "image/gif";
  if (
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  return null;
}

export const GET = route(async () => {
  const viewer = await requireViewer();
  return NextResponse.json({ projects: await listProjectsFor(db(), viewer) });
});

export const POST = route(async (request: Request) => {
  const viewer = await requireViewer();
  const form = await request.formData();
  const prompt = String(form.get("prompt") ?? "").trim();
  const platforms = String(form.get("platforms") ?? "both") as "ios" | "android" | "both";
  if (prompt.length < 3 || prompt.length > 4000)
    throw new HttpError(400, "Describe your app in 3 to 4000 characters.");
  if (!["ios", "android", "both"].includes(platforms))
    throw new HttpError(400, "Invalid platform.");

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_FILES) throw new HttpError(400, `Attach at most ${MAX_FILES} images.`);
  const images: Array<{ name: string; mime: string; data: Buffer }> = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) throw new HttpError(400, `${file.name} is larger than 10 MB.`);
    const data = Buffer.from(await file.arrayBuffer());
    const mime = sniffImage(data);
    if (!mime) throw new HttpError(400, `${file.name} is not a PNG, JPEG, GIF or WebP image.`);
    images.push({ name: file.name.slice(0, 200), mime, data });
  }

  const balance = await creditBalance(db(), viewer.id);
  const needed = RUN_CREDITS.plan!.reserve;
  if (balance < needed) {
    throw new HttpError(
      402,
      `You need ${needed} credits to start a project (you have ${balance}).`,
    );
  }

  const project = await createProject(db(), { ownerId: viewer.id, prompt, platforms });
  const assetIds: string[] = [];
  for (const image of images) {
    const id = newId("a");
    const key = `projects/${project.id}/assets/${id}`;
    await getStorage().put(key, image.data, image.mime);
    await db().insert(schema.projectAsset).values({
      id,
      projectId: project.id,
      storageKey: key,
      fileName: image.name,
      mime: image.mime,
      bytes: image.data.length,
    });
    assetIds.push(id);
  }
  await addMessage(db(), {
    projectId: project.id,
    role: "user",
    userId: viewer.id,
    content: { text: prompt, assetIds },
  });
  const run = await enqueueRun(db(), {
    projectId: project.id,
    userId: viewer.id,
    kind: "plan",
    input: { assetIds },
  });
  return NextResponse.json({ id: project.id, runId: run.id }, { status: 201 });
});
