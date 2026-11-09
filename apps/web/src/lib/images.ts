import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { isPublicRoutableHost } from "@better-auth/core/utils/host";
import { Agent, fetch as undiciFetch } from "undici";
import { sniffImage } from "@appbuilder/core";

export { sniffImage };

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Connections resolve names through this lookup, which refuses non-public addresses. The
 * address that was checked is the one connected to, so DNS rebinding between a check and the
 * connection isn't possible.
 */
const publicOnly = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      dnsLookup(hostname, { all: true }, (error, addresses: LookupAddress[]) => {
        if (error) return callback(error, "", 4);
        if (addresses.length === 0 || addresses.some((a) => !isPublicRoutableHost(a.address))) {
          return callback(new ImageFetchError("That host isn't reachable from here."), "", 4);
        }
        if ((options as { all?: boolean }).all) {
          return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, addresses);
        }
        callback(null, addresses[0]!.address, addresses[0]!.family);
      });
    },
  },
});

export class ImageFetchError extends Error {}

/**
 * Download an image from a public https URL (an assistant's generated image, or a link it
 * found): no private addresses, no redirects to them, at most MAX_IMAGE_BYTES, and the bytes
 * must really be an image.
 */
export async function fetchPublicImage(url: string): Promise<{ data: Buffer; mime: string }> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      throw new ImageFetchError("Not a valid URL.");
    }
    if (parsed.protocol !== "https:")
      throw new ImageFetchError("Only https image URLs are accepted.");
    // Names like metadata.google.internal and literal IPs (which skip the lookup) are checked
    // here; resolved names are checked in the pinned lookup.
    if (!isPublicRoutableHost(parsed.hostname.replace(/^\[|\]$/g, ""))) {
      throw new ImageFetchError("That host isn't reachable from here.");
    }
    const response = await undiciFetch(parsed, {
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
      dispatcher: publicOnly,
    }).catch((error: unknown) => {
      const blocked =
        error instanceof ImageFetchError ||
        (error as { cause?: unknown } | null)?.cause instanceof ImageFetchError;
      throw new ImageFetchError(
        blocked ? "That host isn't reachable from here." : "Couldn't download the image.",
      );
    });
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get("location");
      if (!next) throw new ImageFetchError("The image URL redirects nowhere.");
      current = new URL(next, parsed).toString();
      continue;
    }
    if (!response.ok || !response.body) {
      throw new ImageFetchError(`The image URL answered ${response.status}.`);
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES) {
        await reader.cancel();
        throw new ImageFetchError("Images must be under 8 MB.");
      }
      chunks.push(value);
    }
    const data = Buffer.concat(chunks);
    const mime = sniffImage(data);
    if (!mime) throw new ImageFetchError("That isn't a PNG, JPEG, GIF or WebP image.");
    return { data, mime };
  }
  throw new ImageFetchError("Too many redirects.");
}
