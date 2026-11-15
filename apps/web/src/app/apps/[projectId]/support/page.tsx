import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import {
  APPLE_STANDARD_EULA_URL,
  appPagePath,
  appPrivacyPath,
  readAppDataPractices,
  readAppPrivacyUrl,
  readAppTermsUrl,
  STRUCTURE_SCREENS,
} from "@appbuilder/contract";
import { appPolicySource } from "@appbuilder/core";
import { LegalPage } from "@/components/marketing/legal-page";
import { db } from "@/lib/server";

/**
 * The support page App Builder hosts for every app, from one template filled with the app's own
 * details: how to reach the team, and answers to what people ask about (purchases, their data,
 * notifications). It's the Support URL "Send to TestFlight" fills in App Store Connect, so App
 * Review always finds real contact details.
 */
export default async function AppSupportPage({ params }: PageProps<"/apps/[projectId]/support">) {
  const { projectId } = await params;
  const source = await appPolicySource(db(), projectId);
  if (!source) notFound();
  const p = readAppDataPractices(source.files);
  const app = p.appName || source.name;
  const sells = STRUCTURE_SCREENS.paywall in source.files;
  const privacyUrl = readAppPrivacyUrl(source.files) || appPrivacyPath(projectId);
  const termsUrl = readAppTermsUrl(source.files) || APPLE_STANDARD_EULA_URL;
  const updated = source.updatedAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  const questions: Array<{ q: string; a: ReactNode }> = [];
  if (sells) {
    questions.push(
      {
        q: "How do I restore a purchase?",
        a: (
          <>
            Open {app}, go to Settings and tap Restore purchases (it&rsquo;s also on the Premium
            screen). Use the same Apple ID or Google account you bought it with.
          </>
        ),
      },
      {
        q: "How do I cancel my subscription?",
        a: (
          <>
            Subscriptions are handled by Apple and Google, so you cancel them there. Deleting the
            app doesn&rsquo;t cancel it. On iPhone: Settings → your name → Subscriptions → {app} →
            Cancel Subscription. On Android: Google Play → your profile → Payments &amp;
            subscriptions → Subscriptions → {app} → Cancel.
          </>
        ),
      },
      {
        q: "Can I get a refund?",
        a: (
          <>
            Apple and Google handle payments and refunds. On iPhone, request one at{" "}
            <a href="https://reportaproblem.apple.com">reportaproblem.apple.com</a>; on Android,
            follow{" "}
            <a href="https://support.google.com/googleplay/answer/2479637">
              Google Play&rsquo;s refund steps
            </a>
            .
          </>
        ),
      },
    );
  }
  if (p.accounts)
    questions.push({
      q: "How do I delete my account?",
      a: (
        <>
          In {app}, open Settings and tap Delete account. Your account and everything saved in it
          are deleted.
        </>
      ),
    });
  if (p.reminders || p.push)
    questions.push({
      q: "How do I turn notifications off?",
      a: (
        <>
          {p.reminders ? (
            <>Turn reminders off in {app}&rsquo;s Settings, or turn off </>
          ) : (
            "Turn off "
          )}
          notifications for {app} in your phone&rsquo;s Settings → Notifications.
        </>
      ),
    });
  questions.push(
    {
      q: "What happens to my data?",
      a: (
        <>
          {p.cloud
            ? `What you save in ${app} is kept on our servers so it's there when you come back.`
            : `What you save in ${app} stays on your phone.`}{" "}
          The <a href={privacyUrl}>privacy policy</a> explains exactly what the app collects and
          why.
        </>
      ),
    },
    {
      q: "Something isn't working",
      a: (
        <>
          Update {app} to the latest version and restart it. If it still happens, contact us below
          with what you were doing and your phone model, and we&rsquo;ll look into it.
        </>
      ),
    },
  );

  return (
    <LegalPage title={`${app} Support`} updated={updated}>
      <h2>Contact us</h2>
      <div data-testid="support-contact">
        {p.supportEmail ? (
          <p>
            Email{" "}
            <a href={`mailto:${p.supportEmail}`} data-testid="support-email">
              {p.supportEmail}
            </a>
            . We read every message and reply by email.
          </p>
        ) : null}
        {p.supportChat ? (
          <p>
            In the app, open Settings → Help &amp; support to chat with the team
            {p.supportEmail ? "" : " (on iPhone)"}.
          </p>
        ) : null}
        {!p.supportEmail && !p.supportChat ? (
          <p>
            Open {app}&rsquo;s Settings and choose Help &amp; support. The team is adding an email
            address here.
          </p>
        ) : null}
      </div>

      <h2>Common questions</h2>
      {questions.map(({ q, a }) => (
        <section key={q}>
          <h3>{q}</h3>
          <p>{a}</p>
        </section>
      ))}

      <h2>More</h2>
      <ul>
        <li>
          <a href={privacyUrl}>Privacy policy</a>
        </li>
        <li>
          <a href={termsUrl}>Terms of use</a>
        </li>
        <li>
          <a href={appPagePath(projectId)}>About {app}</a>
        </li>
      </ul>
    </LegalPage>
  );
}

export async function generateMetadata({ params }: PageProps<"/apps/[projectId]/support">) {
  const { projectId } = await params;
  const source = await appPolicySource(db(), projectId);
  const app = source ? readAppDataPractices(source.files).appName || source.name : "App";
  return { title: `${app} Support`, robots: { index: false } };
}
