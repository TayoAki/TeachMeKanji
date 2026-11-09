"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import type { ProjectFiles } from "@appbuilder/contract/protocol";
import { PreviewFrame } from "@/components/preview/preview-frame";
import { Button } from "@/components/ui/button";

let cachedSize: { width: number; height: number } | null = null;
function windowSize() {
  if (
    !cachedSize ||
    cachedSize.width !== window.innerWidth ||
    cachedSize.height !== window.innerHeight
  ) {
    cachedSize = { width: window.innerWidth, height: window.innerHeight };
  }
  return cachedSize;
}
function subscribeResize(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

/** A published app: full screen on phones, in a device frame on larger screens. */
export function PublishedApp({
  name,
  projectId,
  themeId,
  files,
  remixable,
}: {
  remixable: boolean;
  name: string;
  projectId: string;
  themeId: string | null;
  files: ProjectFiles;
}) {
  const size = useSyncExternalStore(subscribeResize, windowSize, () => null);
  if (!size) return null;
  const phone = size.width < 640;

  if (phone) {
    return (
      <PreviewFrame
        frameId="published"
        files={files}
        mode="app"
        href="/"
        themeId={themeId ?? undefined}
        width={size.width}
        height={size.height}
        className="block border-0"
      />
    );
  }
  const scale = Math.min(1, (size.height - 120) / 844);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-muted/40 p-6">
      <PreviewFrame
        frameId="published"
        files={files}
        mode="app"
        href="/"
        themeId={themeId ?? undefined}
        width={390}
        height={844}
        scale={scale}
      />
      <div className="flex items-center gap-3 text-sm">
        <span className="font-medium">{name}</span>
        <span className="text-muted-foreground">· Made with App Builder</span>
        {remixable ? (
          <Button size="sm" variant="outline" asChild>
            <Link href={`/projects/${projectId}`}>Remix</Link>
          </Button>
        ) : null}
      </div>
    </main>
  );
}
