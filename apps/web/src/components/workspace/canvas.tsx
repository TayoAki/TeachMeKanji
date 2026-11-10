"use client";

import { useMemo, useRef, useState } from "react";
import { Hand, Loader2, Maximize, Minus, MousePointer2, Plus } from "lucide-react";
import {
  buildRouteTree,
  journeyRank,
  screens as listScreens,
  type FrameToParent,
  type ProjectFiles,
  type ScreenRoute,
} from "@appbuilder/contract/protocol";
import { PreviewFrame } from "@/components/preview/preview-frame";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DEVICE = { width: 390, height: 844 };

/** "/expense/[id]" keeps its placeholder; the preview fills it from the seed data. */
export function canvasHref(screen: ScreenRoute): string {
  return "/" + screen.pattern.map((s) => (s.type === "static" ? s.value : `[${s.name}]`)).join("/");
}

export function screenTitle(screen: ScreenRoute): string {
  const name = screen.name
    .split("/")
    .filter((p) => !p.startsWith("("))
    .join(" / ");
  if (name === "index") return "Home";
  return name
    .replace(/\[(\w+)\]/g, ":$1")
    .replace(/[-_]/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function Canvas({
  files,
  themeId,
  selectMode,
  onFrameMessage,
  onOpenScreen,
  building,
  emptyState,
  storage,
}: {
  storage?: Record<string, string>;
  files: ProjectFiles;
  themeId?: string;
  selectMode: boolean;
  onFrameMessage: (frameId: string, message: FrameToParent) => void;
  onOpenScreen: (href: string) => void;
  building: boolean;
  emptyState: React.ReactNode;
}) {
  const [zoom, setZoom] = useState(0.55);
  const [pan, setPan] = useState({ x: 32, y: 24 });
  const [tool, setTool] = useState<"select" | "hand">("select");
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const screens = useMemo(() => {
    const paths = Object.keys(files);
    if (!paths.some((p) => p.startsWith("app/") && !p.endsWith("_layout.tsx"))) return [];
    // In the user's journey: onboarding, paywall, the main app, then settings.
    return listScreens(buildRouteTree(paths))
      .map((s) => s.screen)
      .sort((a, b) => journeyRank(a.file) - journeyRank(b.file));
  }, [files]);

  if (screens.length === 0) {
    return <div className="flex h-full items-center justify-center p-8">{emptyState}</div>;
  }

  const fit = () => {
    setZoom(0.55);
    setPan({ x: 32, y: 24 });
  };

  return (
    <div
      className={cn(
        "relative h-full overflow-hidden bg-[radial-gradient(circle,var(--border)_1px,transparent_1px)] [background-size:20px_20px]",
        tool === "hand" && "cursor-grab active:cursor-grabbing",
      )}
      data-testid="canvas"
      onWheel={(e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          setZoom((z) => Math.min(1.5, Math.max(0.2, z - e.deltaY * 0.002)));
        } else {
          setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
        }
      }}
      onPointerDown={(e) => {
        if (tool !== "hand") return;
        drag.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        setPan({
          x: drag.current.panX + e.clientX - drag.current.x,
          y: drag.current.panY + e.clientY - drag.current.y,
        });
      }}
      onPointerUp={() => (drag.current = null)}
    >
      <div
        className={cn(
          "absolute left-0 top-0 flex origin-top-left gap-10",
          tool === "hand" && "pointer-events-none",
        )}
        style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}
      >
        {screens.map((screen) => {
          const href = canvasHref(screen);
          return (
            <div key={screen.file} className="flex flex-col gap-2" data-testid="canvas-screen">
              <button
                type="button"
                className="self-start rounded px-1 text-left text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={() => onOpenScreen(href)}
                title="Open this screen in the interactive preview"
              >
                {screenTitle(screen)}{" "}
                <span className="font-mono text-[10px] opacity-60">
                  {screen.file.replace(/^app\//, "")}
                </span>
              </button>
              <PreviewFrame
                frameId={`canvas:${screen.file}`}
                files={files}
                mode="screen"
                href={href}
                themeId={themeId}
                selectMode={selectMode}
                width={DEVICE.width}
                height={DEVICE.height}
                scale={zoom}
                storage={storage}
                onMessage={(message) => onFrameMessage(`canvas:${screen.file}`, message)}
              />
            </div>
          );
        })}
        {building ? (
          <div
            className="flex items-center justify-center rounded-[2rem] border-2 border-dashed text-sm text-muted-foreground"
            style={{ width: DEVICE.width * zoom, height: DEVICE.height * zoom, marginTop: 28 }}
          >
            <Loader2 className="mr-2 size-4 animate-spin" /> Building…
          </div>
        ) : null}
      </div>

      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border bg-background p-1 shadow-sm">
        <Button
          size="icon"
          variant={tool === "select" ? "secondary" : "ghost"}
          className="size-8"
          onClick={() => setTool("select")}
          aria-label="Select tool"
        >
          <MousePointer2 />
        </Button>
        <Button
          size="icon"
          variant={tool === "hand" ? "secondary" : "ghost"}
          className="size-8"
          onClick={() => setTool("hand")}
          aria-label="Hand tool"
        >
          <Hand />
        </Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={() => setZoom((z) => Math.max(0.2, z - 0.1))}
          aria-label="Zoom out"
        >
          <Minus />
        </Button>
        <span className="w-10 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}
          aria-label="Zoom in"
        >
          <Plus />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={fit}
          aria-label="Reset view"
        >
          <Maximize />
        </Button>
      </div>
    </div>
  );
}
