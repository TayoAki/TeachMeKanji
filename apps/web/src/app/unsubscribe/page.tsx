import { SiteHeader } from "@/components/marketing/site-header";
import { UnsubscribeButton } from "./unsubscribe-button";

export const metadata = { title: "Unsubscribe" };

/** From the link in a launch email. A button, so mail scanners opening the link don't unsubscribe. */
export default async function UnsubscribePage({ searchParams }: PageProps<"/unsubscribe">) {
  const token = (await searchParams).t;
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold">Stop the launch emails?</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You won&rsquo;t get any more emails from the App Store check.
        </p>
        {typeof token === "string" && token ? (
          <UnsubscribeButton token={token} />
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">This link is incomplete.</p>
        )}
      </main>
    </>
  );
}
