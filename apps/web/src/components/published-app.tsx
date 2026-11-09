"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import type { FrameToParent } from "@appbuilder/contract/protocol";
import type { ProjectFiles } from "@appbuilder/contract/protocol";
import { PreviewFrame } from "@/components/preview/preview-frame";
import { Button } from "@/components/ui/button";

/** About 1 MB of UTF-16 per published app. */
const MAX_STORED_CHARS = 512 * 1024;

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
  // The app's on-device data (and its App Cloud session) survive reloads, per visitor.
  const storageKey = `appbuilder:published:${projectId}`;
  const storage = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Record<string, string>;
    } catch {
      return {};
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The frame runs untrusted code: accept only string entries, and cap what one app can keep
  // (the app origin's localStorage quota is shared by every published app).
  const saved = useRef<Record<string, string> | null>(null);
  const flush = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessage = useCallback(
    (message: FrameToParent) => {
      if (message.type !== "storage") return;
      const { key, value } = message as { key: unknown; value: unknown };
      if (typeof key !== "string" || key.length > 200) return;
      if (value !== null && typeof value !== "string") return;
      saved.current ??= { ...storage };
      const next = { ...saved.current };
      if (value === null) delete next[key];
      else next[key] = value;
      if (JSON.stringify(next).length > MAX_STORED_CHARS) return;
      saved.current = next;
      // Write at most every 250 ms, not on every message.
      flush.current ??= setTimeout(() => {
        flush.current = null;
        try {
          localStorage.setItem(storageKey, JSON.stringify(saved.current));
        } catch {
          // storage unavailable or full: the app still works, it just won't remember
        }
      }, 250);
    },
    [storage, storageKey],
  );
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
        storage={storage}
        persistStorage
        onMessage={onMessage}
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
        storage={storage}
        persistStorage
        onMessage={onMessage}
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
