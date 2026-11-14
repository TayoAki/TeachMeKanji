import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { readAppDataPractices } from "@appbuilder/contract";
import { appPolicySource } from "@appbuilder/core";
import { LegalPage } from "@/components/marketing/legal-page";
import { db } from "@/lib/server";

/**
 * The privacy policy App Builder hosts for an app built on it, written from what the app's
 * current version actually uses. Its Privacy link (data/app-info.ts) points here by default;
 * the owner can replace it with their own policy.
 */
export default async function AppPrivacyPage({ params }: PageProps<"/apps/[projectId]/privacy">) {
  const { projectId } = await params;
  const source = await appPolicySource(db(), projectId);
  if (!source) notFound();
  const p = readAppDataPractices(source.files);
  const app = p.appName || source.name;
  const updated = source.updatedAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const contact = p.supportEmail ? (
    <a href={`mailto:${p.supportEmail}`}>{p.supportEmail}</a>
  ) : (
    "the support link on the app's App Store or Google Play page"
  );

  const collected: ReactNode[] = [];
  if (p.accounts)
    collected.push(
      <>
        <strong>Your account:</strong> if you create one, your email address, the name you give and
        your password, which is stored only as a salted hash.
      </>,
    );
  collected.push(
    p.cloud ? (
      <>
        <strong>What you save in the app</strong> is stored on our servers, linked to a random
        account id, so it&rsquo;s there when you come back
        {p.accounts ? " and on any device where you sign in" : ""}.
      </>
    ) : (
      <>
        <strong>What you save in the app</strong> stays on your phone. We don&rsquo;t receive it.
      </>
    ),
  );
  if (p.analytics)
    collected.push(
      <>
        <strong>Usage:</strong> when the app opens, which screens are viewed and actions such as
        finishing onboarding or a purchase, with a random install id. Never your name, email or an
        advertising id.
      </>,
    );
  collected.push(
    <>
      <strong>Error reports:</strong> when the app runs into a problem, the error message, the
      screen it happened on and the kind of phone (iPhone or Android), with a random install id, so
      it can be fixed. Never your name, email or what you saved.
    </>,
  );
  if (p.supportChat)
    collected.push(
      <>
        <strong>Support conversations:</strong> what you write in the app&rsquo;s support chat, any
        photo you attach, and your name and email if you&rsquo;re signed in, so the team can answer.
        They&rsquo;re kept by Hire Shelby, the support chat provider. If the team turns on AI
        replies, the chat asks you first and names who would receive your messages.
      </>,
    );
  if (p.ai)
    collected.push(
      <>
        <strong>Questions you ask the app&rsquo;s AI</strong>, and any photo you choose to send with
        one, go to our AI provider, Anthropic, to produce the answer. They aren&rsquo;t stored on
        our servers, and under Anthropic&rsquo;s commercial terms they aren&rsquo;t used to train
        its models.
      </>,
    );
  if (p.camera || p.photos)
    collected.push(
      <>
        <strong>Photos</strong> you take or choose, only after you allow it. They&rsquo;re used in
        the app and stay on your phone
        {p.ai ? " unless you send one to the AI" : ""}
        {p.cloud ? " or save it in the app" : ""}.
      </>,
    );
  if (p.location)
    collected.push(
      <>
        <strong>Your location</strong>, only while you use the app and after you allow it, to show
        where you are and the name of the place. It&rsquo;s kept only if you save it in the app.
      </>,
    );
  if (p.push)
    collected.push(
      <>
        <strong>A notification token</strong> for your device, if you allow notifications, so we can
        send them.
      </>,
    );
  if (p.reminders)
    collected.push(
      <>
        <strong>Reminders and alarms</strong> you set are scheduled on your phone; we don&rsquo;t
        receive them.
      </>,
    );
  if (p.purchases)
    collected.push(
      <>
        <strong>Purchases</strong> are made through Apple or Google, so we never see your payment
        details. RevenueCat keeps track of your subscription with an anonymous id and your purchase
        history.
      </>,
    );

  // Error reports always reach the platform, so it is always a processor.
  const providers: ReactNode[] = [
    <>
      App Builder, the platform the app is built and hosted on, which stores and processes this data
      on our behalf (its servers run on Railway in the United States).
    </>,
  ];
  if (p.ai) providers.push(<>Anthropic, which answers the questions you ask the app&rsquo;s AI.</>);
  if (p.supportChat) providers.push(<>Hire Shelby, which runs the in-app support chat.</>);
  if (p.push) providers.push(<>Expo, Apple and Google, which deliver notifications.</>);
  if (p.purchases)
    providers.push(<>Apple, Google and RevenueCat, which handle purchases and subscriptions.</>);

  return (
    <LegalPage title={`${app} Privacy Policy`} updated={updated}>
      <p>
        This policy explains what {app} (&ldquo;the app&rdquo;) collects, why, and the choices you
        have. &ldquo;We&rdquo; means the app&rsquo;s developer. Questions: {contact}.
      </p>

      <h2>1. What the app collects</h2>
      <ul>
        {collected.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>

      <h2>2. How it&rsquo;s used</h2>
      <p>
        Only to run the app&rsquo;s features and fix its errors
        {p.analytics ? ", and to understand how it's used, so we can improve it" : ""}. We
        don&rsquo;t sell your information, show third-party ads, or track you across other
        companies&rsquo; apps and websites.
      </p>

      <h2>3. Who it&rsquo;s shared with</h2>
      <p>Only the service providers the app needs to work:</p>
      <ul>
        {providers.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
      <p>We may also disclose information when the law requires it.</p>

      <h2>4. How long it&rsquo;s kept</h2>
      <ul>
        {p.cloud ? (
          <li>
            What you save in the app: until you delete it
            {p.accounts ? " or delete your account" : ""}. Unused anonymous accounts that never
            saved anything are removed after 30 days.
          </li>
        ) : (
          <li>What you save in the app: on your phone until you delete it or the app.</li>
        )}
        {p.analytics ? <li>Usage events: 90 days.</li> : null}
        <li>Error reports: 90 days after the error was last seen.</li>
      </ul>

      <h2>5. Your choices</h2>
      <ul>
        {p.accounts ? (
          <li>
            Delete your account and everything saved in it at any time in the app (Settings or
            Account → Delete account).
          </li>
        ) : null}
        <li>
          Turn off the app&rsquo;s access to your camera, photos, location or notifications in your
          phone&rsquo;s settings.
        </li>
        <li>
          Ask us to see, correct or delete your information by contacting {contact}. Depending on
          where you live (for example the EU, UK or California) you may have further rights, and you
          can complain to your data protection authority.
        </li>
      </ul>

      <h2>6. Changes</h2>
      <p>
        This page follows the app: when its features change, this policy changes with them and the
        date at the top shows when.
      </p>

      <p className="pt-6 text-xs">
        This policy was generated by App Builder from the features {app} uses.
      </p>
    </LegalPage>
  );
}

export async function generateMetadata({ params }: PageProps<"/apps/[projectId]/privacy">) {
  const { projectId } = await params;
  const source = await appPolicySource(db(), projectId);
  const app = source ? readAppDataPractices(source.files).appName || source.name : "App";
  return { title: `${app} Privacy Policy`, robots: { index: false } };
}
