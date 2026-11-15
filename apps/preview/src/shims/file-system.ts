/**
 * expo-file-system in the preview. Photos stay as the browser gives them (data: or blob: URLs),
 * so keepPhoto(), photoUri() and forgetPhoto() from data/photos return before touching files;
 * these names only have to exist for the template to load.
 */
function unavailable(): never {
  throw new Error("Files aren't available in the preview.");
}

export class File {
  constructor(..._uris: unknown[]) {
    unavailable();
  }
}

export class Directory {
  constructor(..._uris: unknown[]) {
    unavailable();
  }
}

export const Paths = {
  get document(): never {
    return unavailable();
  },
  get cache(): never {
    return unavailable();
  },
};
