/**
 * Mascot poses are drawn on a pure green background; this turns one into a transparent PNG of
 * just the character: key out the green (with a soft edge and the green spill removed), keep the
 * character and anything that touches it (a hat, a sparkle) while dropping stray sketches drawn
 * apart from it, and trim to the character with a small margin.
 */
import sharp from "sharp";

export async function cutOutCharacter(input: Buffer, maxSize = 512): Promise<Buffer> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const px = (x: number, y: number) => (y * width + x) * 4;

  // The key color: the average of the four corners (image models rarely draw pure #00FF00).
  let kr = 0;
  let kg = 0;
  let kb = 0;
  for (const [x, y] of [
    [2, 2],
    [width - 3, 2],
    [2, height - 3],
    [width - 3, height - 3],
  ] as const) {
    const i = px(x, y);
    kr += data[i]!;
    kg += data[i + 1]!;
    kb += data[i + 2]!;
  }
  kr /= 4;
  kg /= 4;
  kb /= 4;

  // Alpha from the distance to the key color; soft between the two thresholds.
  const near = 70;
  const far = 140;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const distance = Math.hypot(r - kr, g - kg, b - kb);
    const greenish = g > r + 25 && g > b + 25;
    let alpha = 255;
    if (greenish && distance < near) alpha = 0;
    else if (greenish && distance < far)
      alpha = Math.round(((distance - near) / (far - near)) * 255);
    data[i + 3] = Math.min(data[i + 3]!, alpha);
    // Despill: no green tint left on the edges.
    if (alpha < 255 || greenish) data[i + 1] = Math.min(g, Math.max(r, b));
  }

  // Keep the biggest shape and the shapes close to it; drop sketches drawn away from it.
  const label = new Int32Array(width * height).fill(-1);
  const blobs: Array<{ size: number; x0: number; y0: number; x1: number; y1: number }> = [];
  const stack: number[] = [];
  for (let start = 0; start < width * height; start++) {
    if (label[start] !== -1 || data[start * 4 + 3]! < 40) continue;
    const id = blobs.length;
    const blob = { size: 0, x0: width, y0: height, x1: 0, y1: 0 };
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % width;
      const y = (p - x) / width;
      blob.size++;
      blob.x0 = Math.min(blob.x0, x);
      blob.x1 = Math.max(blob.x1, x);
      blob.y0 = Math.min(blob.y0, y);
      blob.y1 = Math.max(blob.y1, y);
      for (const q of [p - 1, p + 1, p - width, p + width]) {
        if (q < 0 || q >= width * height) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === width - 1)) continue;
        if (label[q] === -1 && data[q * 4 + 3]! >= 40) {
          label[q] = id;
          stack.push(q);
        }
      }
    }
    blobs.push(blob);
  }
  if (blobs.length === 0) throw new Error("The character couldn't be cut out of its background.");
  const main = blobs.reduce((a, b) => (b.size > a.size ? b : a));
  const padX = (main.x1 - main.x0) * 0.25;
  const padY = (main.y1 - main.y0) * 0.25;
  const keep = blobs.map(
    (b) =>
      b === main ||
      (b.size >= 30 &&
        b.x1 >= main.x0 - padX &&
        b.x0 <= main.x1 + padX &&
        b.y1 >= main.y0 - padY &&
        b.y0 <= main.y1 + padY),
  );
  let x0 = width;
  let y0 = height;
  let x1 = 0;
  let y1 = 0;
  for (let p = 0; p < width * height; p++) {
    const id = label[p]!;
    if (id === -1) continue;
    if (!keep[id]) {
      data[p * 4 + 3] = 0;
      continue;
    }
    const b = blobs[id]!;
    x0 = Math.min(x0, b.x0);
    y0 = Math.min(y0, b.y0);
    x1 = Math.max(x1, b.x1);
    y1 = Math.max(y1, b.y1);
  }
  // Faint pixels that belonged to dropped or unlabeled areas stay fully transparent.
  for (let p = 0; p < width * height; p++) if (label[p] === -1) data[p * 4 + 3] = 0;

  const margin = Math.round(Math.max(x1 - x0, y1 - y0) * 0.04);
  const left = Math.max(0, x0 - margin);
  const top = Math.max(0, y0 - margin);
  const cropWidth = Math.min(width - left, x1 - x0 + 1 + margin * 2);
  const cropHeight = Math.min(height - top, y1 - y0 + 1 + margin * 2);
  return sharp(data, { raw: { width, height, channels: 4 } })
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .resize({ width: maxSize, height: maxSize, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
}
