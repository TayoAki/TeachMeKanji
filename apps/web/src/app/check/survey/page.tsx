import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { LeadSurvey } from "@/components/marketing/store-check";

export const metadata = { title: "Four quick questions" };

/** The survey link in the results email (/check/survey?t=…). */
export default async function SurveyPage({ searchParams }: PageProps<"/check/survey">) {
  const token = (await searchParams).t;
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-16">
        {typeof token === "string" && token ? (
          <LeadSurvey token={token} />
        ) : (
          <p className="text-muted-foreground">This link is incomplete.</p>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
