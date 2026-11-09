"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Copy,
  Download,
  ExternalLink,
  Globe,
  Lock,
  MoreHorizontal,
  Pencil,
  Smartphone,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { ProjectFiles } from "@appbuilder/contract/protocol";
import { PreviewFrame } from "@/components/preview/preview-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { TimeAgo } from "@/components/time-ago";

export interface ProjectCardData {
  id: string;
  name: string;
  status: string;
  visibility: "private" | "public";
  updatedAt: string;
  ownerName: string;
  activeThemeId: string | null;
  currentVersionId: string | null;
  role: "owner" | "editor" | "viewer" | "public";
}

const STATUS: Record<string, string> = {
  draft: "Draft",
  planning: "Planning",
  awaiting_confirmation: "Plan ready",
  building: "Building",
  ready: "Ready",
  error: "Needs attention",
};

/** A live thumbnail: the app's home screen rendered by the preview runtime, loaded when visible. */
export function ProjectThumbnail({
  project,
  scale = 0.42,
}: {
  project: ProjectCardData;
  scale?: number;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const [files, setFiles] = useState<ProjectFiles | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => entry?.isIntersecting && setVisible(true),
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !project.currentVersionId) return;
    api<{ files: ProjectFiles }>(`/api/projects/${project.id}`, { quiet: true })
      .then((r) => setFiles(r.files))
      .catch(() => {});
  }, [visible, project.id, project.currentVersionId]);

  const width = 390 * scale;
  const height = 800 * scale;
  return (
    <div
      ref={holder}
      className="flex justify-center rounded-t-xl bg-muted/50 pt-4"
      style={{ minHeight: height * 0.7 + 16 }}
    >
      <div className="overflow-hidden rounded-t-[1.2rem]" style={{ width, height: height * 0.7 }}>
        {files ? (
          <div className="pointer-events-none">
            <PreviewFrame
              frameId={`thumb-${project.id}`}
              files={files}
              mode="screen"
              href="/"
              themeId={project.activeThemeId ?? undefined}
              width={390}
              height={800}
              scale={scale}
              className="border-0 bg-white"
            />
          </div>
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 bg-background text-xs text-muted-foreground">
            <Smartphone className="size-6" />
            {project.currentVersionId
              ? "Loading preview…"
              : (STATUS[project.status] ?? project.status)}
          </div>
        )}
      </div>
    </div>
  );
}

export function ProjectCard({
  project,
  onChanged,
}: {
  project: ProjectCardData;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const owner = project.role === "owner";

  const rename = async () => {
    const name = window.prompt("Rename project", project.name);
    if (!name || name === project.name) return;
    await api(`/api/projects/${project.id}`, { method: "PATCH", json: { name } });
    onChanged?.();
  };
  const duplicate = async () => {
    const copy = await api<{ id: string }>(`/api/projects/${project.id}/duplicate`, {
      method: "POST",
    });
    toast.success("Project duplicated");
    router.push(`/projects/${copy.id}`);
  };
  const toggleVisibility = async () => {
    const visibility = project.visibility === "public" ? "private" : "public";
    await api(`/api/projects/${project.id}`, { method: "PATCH", json: { visibility } });
    toast.success(visibility === "public" ? "Shown in the community gallery" : "Now private");
    onChanged?.();
  };
  const remove = async () => {
    if (!window.confirm(`Delete “${project.name}”? This can't be undone.`)) return;
    await api(`/api/projects/${project.id}`, { method: "DELETE" });
    toast.success("Project deleted");
    onChanged?.();
  };

  return (
    <div
      className="group overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md"
      data-testid="project-card"
    >
      <Link href={`/projects/${project.id}`} aria-label={`Open ${project.name}`}>
        <ProjectThumbnail project={project} />
      </Link>
      <div className="flex items-center gap-2 border-t p-3">
        <div className="min-w-0 flex-1">
          <Link
            href={`/projects/${project.id}`}
            className="block truncate text-sm font-medium hover:underline"
          >
            {project.name}
          </Link>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              <TimeAgo date={project.updatedAt} />
            </span>
            {project.role !== "owner" ? <span>· {project.ownerName}</span> : null}
          </div>
        </div>
        <Badge variant={project.status === "ready" ? "secondary" : "outline"}>
          {STATUS[project.status] ?? project.status}
        </Badge>
        {project.visibility === "public" ? (
          <Globe className="size-3.5 text-muted-foreground" aria-label="Public" />
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7" aria-label="Project actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => window.open(`/projects/${project.id}`, "_blank")}>
              <ExternalLink /> Open in new tab
            </DropdownMenuItem>
            {project.role !== "viewer" ? (
              <DropdownMenuItem onSelect={rename}>
                <Pencil /> Rename
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={duplicate}>
              <Copy /> Duplicate
            </DropdownMenuItem>
            {project.currentVersionId ? (
              <DropdownMenuItem asChild>
                <a href={`/api/projects/${project.id}/export`} download>
                  <Download /> Download source (.zip)
                </a>
              </DropdownMenuItem>
            ) : null}
            {owner ? (
              <>
                <DropdownMenuItem onSelect={toggleVisibility} disabled={!project.currentVersionId}>
                  {project.visibility === "public" ? <Lock /> : <Globe />}
                  {project.visibility === "public" ? "Make private" : "Show in community"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={remove}>
                  <Trash2 /> Delete
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
