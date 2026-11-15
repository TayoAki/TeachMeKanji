import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { materialize, syncFiles } from "./project";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("syncFiles", () => {
  it("writes only what changed and removes only what's gone, never the source folders", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sync-"));
    dirs.push(dir);
    await materialize(
      {
        "package.json": "{}",
        "app/_layout.tsx": "layout",
        "components/support.tsx": "support",
        "components/old/Thing.tsx": "old",
      },
      dir,
    );
    const support = await stat(join(dir, "components/support.tsx"));
    await writeFile(join(dir, "node_modules.txt"), "kept");

    await syncFiles(
      {
        "package.json": "{}",
        "app/_layout.tsx": "layout v2",
        "components/support.tsx": "support",
        "app/new.tsx": "new",
      },
      dir,
    );

    expect(await readFile(join(dir, "app/_layout.tsx"), "utf8")).toBe("layout v2");
    expect(await readFile(join(dir, "app/new.tsx"), "utf8")).toBe("new");
    // An unchanged file is left alone: Metro never sees it disappear.
    expect((await stat(join(dir, "components/support.tsx"))).ino).toBe(support.ino);
    expect((await stat(join(dir, "components/support.tsx"))).mtimeMs).toBe(support.mtimeMs);
    // Removed files go, with the folders they leave empty; other files stay.
    expect(await readdir(join(dir, "components"))).toEqual(["support.tsx"]);
    expect(await readFile(join(dir, "node_modules.txt"), "utf8")).toBe("kept");
  });

  it("refuses paths outside the directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sync-"));
    dirs.push(dir);
    await expect(syncFiles({ "../escape.ts": "x" }, dir)).rejects.toThrow(/unsafe path/);
  });
});
