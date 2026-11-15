import { notFound } from "next/navigation";
import { readAppDataPractices, readStoreSettings } from "@appbuilder/contract";
import { appPolicySource } from "@appbuilder/core";
import { db } from "@/lib/server";

/**
 * The page an app's invites link to (inviteFriends() in data/growth.ts): the app's name and,
 * once the owner has its App Store record, the App Store page, where it can be pre-ordered before
 * release. Until then it says the app is coming to the App Store.
 */
export default async function AppPage({ params }: PageProps<"/apps/[projectId]">) {
  const { projectId } = await params;
  const source = await appPolicySource(db(), projectId);
  if (!source) notFound();
  const name = readAppDataPractices(source.files).appName || source.name;
  const { ascAppId } = readStoreSettings(source.files);
  const storeUrl = /^\d+$/.test(ascAppId) ? `https://apps.apple.com/app/id${ascAppId}` : null;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-sm rounded-3xl border bg-background p-8 text-center shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          You&rsquo;re invited to
        </p>
        <h1 className="mt-2 text-3xl font-semibold" data-testid="app-page-name">
          {name}
        </h1>
        {storeUrl ? (
          <a
            href={storeUrl}
            className="mt-6 inline-flex items-center justify-center rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background"
            data-testid="app-page-store"
          >
            Get it on the App Store
          </a>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground" data-testid="app-page-soon">
            Coming soon to the App Store.
          </p>
        )}
        <p className="mt-6 flex justify-center gap-4 text-xs text-muted-foreground">
          <a href={`/apps/${projectId}/support`} className="underline underline-offset-2">
            Support
          </a>
          <a href={`/apps/${projectId}/privacy`} className="underline underline-offset-2">
            Privacy policy
          </a>
        </p>
      </div>
    </main>
  );
}

export async function generateMetadata({ params }: PageProps<"/apps/[projectId]">) {
  const { projectId } = await params;
  const source = await appPolicySource(db(), projectId);
  const app = source ? readAppDataPractices(source.files).appName || source.name : "App";
  return {
    title: app,
    description: `You're invited to ${app} on the App Store.`,
    robots: { index: false },
  };
}
