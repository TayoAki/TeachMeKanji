import { listPublicProjects } from "@appbuilder/core";
import { SiteHeader } from "@/components/marketing/site-header";
import { ProjectCard, type ProjectCardData } from "@/components/project-card";
import { AppShell } from "@/components/shell/app-shell";
import { plain } from "@/lib/serialize";
import { db, getViewer } from "@/lib/server";

export const metadata = { title: "Community" };

export default async function CommunityPage() {
  const viewer = await getViewer();
  const projects = plain(await listPublicProjects(db(), 48)) as unknown as ProjectCardData[];
  const grid = (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold">Community apps</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Apps people built and shared. Open one to try it, or remix it into your own project.
      </p>
      <div
        className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        data-testid="community-grid"
      >
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing here yet.</p>
        ) : null}
      </div>
    </div>
  );
  if (!viewer) {
    return (
      <>
        <SiteHeader />
        {grid}
      </>
    );
  }
  return (
    <AppShell
      user={{ name: viewer.name, email: viewer.email, image: viewer.image }}
      active="community"
      bottomRight={<span>Expo SDK 58</span>}
    >
      {grid}
    </AppShell>
  );
}
