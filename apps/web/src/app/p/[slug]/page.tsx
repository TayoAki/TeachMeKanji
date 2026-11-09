import { notFound } from "next/navigation";
import { findPublished, getVersionFiles } from "@appbuilder/core";
import { PublishedApp } from "@/components/published-app";
import { db } from "@/lib/server";

export default async function PublishedPage({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const project = await findPublished(db(), slug);
  if (!project?.publishedVersionId) notFound();
  const files = await getVersionFiles(db(), project.publishedVersionId);
  return (
    <PublishedApp
      name={project.name}
      projectId={project.id}
      themeId={project.activeThemeId}
      files={files}
      remixable={project.visibility === "public"}
    />
  );
}

export async function generateMetadata({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const project = await findPublished(db(), slug);
  return { title: project?.name ?? "App" };
}
