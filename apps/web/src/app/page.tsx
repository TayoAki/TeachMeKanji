import {
  aiNeedsVerifiedEmail,
  creditBalance,
  listProjectsFor,
  listPublicProjects,
  PLANS,
  userPlan,
  invitesNeedVerifiedEmail,
} from "@appbuilder/core";
import { Dashboard } from "@/components/dashboard";
import { Landing } from "@/components/marketing/landing";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import type { ProjectCardData } from "@/components/project-card";
import { plain } from "@/lib/serialize";
import { db, getViewer } from "@/lib/server";
import { emailConfigured } from "@/lib/email";

export default async function Home({ searchParams }: PageProps<"/">) {
  const prompt = (await searchParams).prompt;
  const viewer = await getViewer();
  const community = plain(await listPublicProjects(db(), 12)) as unknown as ProjectCardData[];
  if (!viewer) {
    return (
      <>
        <SiteHeader />
        <Landing community={community} />
        <SiteFooter />
      </>
    );
  }
  const plan = await userPlan(db(), viewer.id);
  return (
    <Dashboard
      initial={{
        user: { name: viewer.name, email: viewer.email, image: viewer.image },
        projects: plain(await listProjectsFor(db(), viewer)) as unknown as ProjectCardData[],
        community,
        credits: await creditBalance(db(), viewer.id),
        plan,
        limits: PLANS[plan],
        pendingPrompt: typeof prompt === "string" ? prompt.slice(0, 4000) : "",
        // The "verify your email" banner: building needs it (free credits), or invites do.
        verifyEmail: viewer.emailVerified
          ? null
          : aiNeedsVerifiedEmail()
            ? "build"
            : emailConfigured() && invitesNeedVerifiedEmail()
              ? "invites"
              : null,
      }}
    />
  );
}
