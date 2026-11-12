/**
 * Pictures a built app asks for by description (<AiImage prompt="..." />) render as grey boxes
 * unless an ImageKit endpoint is set. After a build, the worker draws each literal prompt with
 * the image model in the app's illustration style and adds it to the app's images under the
 * prompt's own text, which AiImage looks up first. Prompts computed at runtime (prompt={x}) can't
 * be drawn ahead and keep the ImageKit or placeholder behaviour.
 */
import {
  appImagesFile,
  IMAGES_FILE,
  isTemplateFile,
  readAppImages,
  type ProjectFiles,
} from "@appbuilder/contract";

/** At most this many pictures are drawn for one build. */
export const MAX_PICTURES = 6;

const PROMPT =
  /<AiImage\b[^>]*?\bprompt=(?:"([^"]{3,300})"|\{\s*(?:"([^"]{3,300})"|'([^']{3,300})'|`([^`$]{3,300})`)\s*\})/g;

/** The literal picture descriptions in the app's screens and components, without ones it has. */
export function picturePrompts(files: ProjectFiles): string[] {
  const have = readAppImages(files);
  const found = new Set<string>();
  for (const [path, source] of Object.entries(files)) {
    // The platform's own files only mention prompts in their docs.
    if (!/^(app|components)\/.+\.tsx?$/.test(path) || isTemplateFile(path)) continue;
    for (const m of source.matchAll(PROMPT)) {
      const prompt = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? "").trim();
      // A real description has words, not a placeholder like "...".
      if (/[a-z]{3}/i.test(prompt) && prompt.length >= 8 && !have[prompt]) found.add(prompt);
    }
  }
  return [...found].slice(0, MAX_PICTURES);
}

/** What the image model is asked to draw for one prompt. */
export function picturePrompt(prompt: string, style: string | undefined): string {
  return `${prompt}. An illustration for a polished iPhone app${style ? `, in this style: ${style}` : ""}. Just the picture: no text, no words, no UI, no phone, no frame or border.`;
}

/** The app's files with the drawn pictures added to data/images.ts under their prompts. */
export function withPictures(files: ProjectFiles, urls: Record<string, string>): ProjectFiles {
  if (!Object.keys(urls).length) return files;
  return { ...files, [IMAGES_FILE]: appImagesFile({ ...readAppImages(files), ...urls }) };
}
