import Link from "next/link";
import { redirect } from "next/navigation";
import { peekInvite } from "@appbuilder/core";
import { Button } from "@/components/ui/button";
import { db, getViewer } from "@/lib/server";
import { AcceptInvite } from "./accept-invite";

export const metadata = { title: "Join a project" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  if (!(await getViewer())) redirect(`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`);
  const invite = await peekInvite(db(), token);
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4">
      {invite ? (
        <>
          <h1 className="text-2xl font-semibold">Join “{invite.projectName}”</h1>
          <p className="text-sm text-muted-foreground">
            You were invited as {invite.role === "editor" ? "an editor" : "a viewer"}.
          </p>
          <AcceptInvite token={token} />
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">This invite has expired</h1>
          <p className="text-sm text-muted-foreground">
            Invite links work once, for a week. Ask the project&apos;s owner for a new one.
          </p>
          <Button asChild variant="outline">
            <Link href="/">Go to your projects</Link>
          </Button>
        </>
      )}
    </div>
  );
}
