import { connection } from "next/server";
import { LegalPage } from "@/components/marketing/legal-page";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { LEGAL_UPDATED, legalConfig } from "@/lib/legal";

export const metadata = { title: "Privacy Policy" };

export default async function PrivacyPage() {
  await connection(); // the company details come from the environment at request time
  const { entity, email, address } = legalConfig();
  return (
    <>
      <SiteHeader />
      <LegalPage title="Privacy Policy" updated={LEGAL_UPDATED}>
        <p>
          This policy explains what personal information App Builder collects, how we use it, who we
          share it with and the choices you have. App Builder is operated by{" "}
          <strong>{entity}</strong> (&ldquo;we&rdquo;, &ldquo;us&rdquo;), the controller of the
          personal information described here. Questions: <a href={`mailto:${email}`}>{email}</a>.
        </p>

        <h2>1. Information we collect</h2>
        <h3>You give us</h3>
        <ul>
          <li>
            <strong>Account details:</strong> your name, email address and password. Passwords are
            stored only as a salted hash.
          </li>
          <li>
            <strong>What you build:</strong> the prompts and chat messages you write, reference
            images and other files you upload, your app plans, the generated source code and every
            version of it, and the store listing text we write for you.
          </li>
          <li>
            <strong>Accounts you connect:</strong> access tokens and keys for services you choose to
            connect, such as Expo, App Store Connect, Google Play, RevenueCat, GitHub, Linear,
            Notion and the other connectors in Settings. We store them encrypted and use them only
            to do what you ask (for example, to build and upload your app or to read an issue you
            mention).
          </li>
          <li>
            <strong>Payment details:</strong> paid plans are billed by Stripe. Stripe collects your
            card details; we receive your billing name, email, plan and payment status, never your
            full card number.
          </li>
          <li>
            <strong>Messages to us</strong> and answers you give in our surveys, such as the App
            Store check.
          </li>
          <li>
            <strong>Bug reports and feature requests:</strong> what you write, any screenshots you
            attach and, unless you switch it off, technical details that help us reproduce a bug:
            the page you were on, your browser and window size, the builder&rsquo;s recent errors in
            that tab and the project&rsquo;s last failed step. Never your apps&rsquo; data.
          </li>
        </ul>
        <h3>We collect automatically</h3>
        <ul>
          <li>
            <strong>Usage and credits:</strong> which steps you run (plans, builds, edits), what
            each one cost in credits, and errors.
          </li>
          <li>
            <strong>Technical data:</strong> IP address, browser and device type, and server logs,
            used for security, rate limiting and fixing problems.
          </li>
          <li>
            <strong>Cookies and local storage:</strong> a sign-in session cookie that is necessary
            for the service, and your light or dark theme preference in your browser. We don&rsquo;t
            use advertising cookies or third-party analytics on this website.
          </li>
        </ul>

        <h2>2. How we use your information</h2>
        <ul>
          <li>To provide the service: generate, preview, store, build and publish your apps.</li>
          <li>To bill you and keep track of credits.</li>
          <li>To keep the service secure, prevent abuse and enforce our Terms.</li>
          <li>To answer you and send service messages (for example, password resets).</li>
          <li>
            To improve App Builder, using aggregated usage (for example, how many credits a typical
            build uses).
          </li>
          <li>
            To send you emails about launching your app, only if you asked for them. Every such
            email has an unsubscribe link.
          </li>
        </ul>
        <p>
          Where the GDPR or UK GDPR applies, our legal bases are: performing our contract with you
          (providing the service and billing), our legitimate interests (security, abuse prevention
          and improving the service), your consent (marketing emails, which you can withdraw at any
          time) and legal obligations (tax and accounting records).
        </p>

        <h2>3. AI features and your prompts</h2>
        <p>
          To plan, write and edit your app, we send your prompts, the relevant parts of your project
          and any images you attach to our AI provider, Anthropic (Claude), through its commercial
          API. Under its commercial terms, Anthropic doesn&rsquo;t use this data to train its
          models. We don&rsquo;t sell your prompts or code, and we don&rsquo;t use them to train
          models of our own. AI output can be wrong; review it before you publish.
        </p>

        <h2>4. Data in the apps you build</h2>
        <p>
          If you turn on App Cloud, analytics, push notifications or AI features in an app you
          build, we store data about that app&rsquo;s users for you: their account email and a
          hashed password, the records your app saves, push tokens, usage events (with a random
          install id, never names, emails or advertising ids) and the questions they send to the
          app&rsquo;s AI (passed to Anthropic, not stored by us). For that data,{" "}
          <strong>you</strong> are the controller and we process it on your behalf. We host a
          starting privacy policy for each app, written from the features it uses, at a link the app
          shows by default; you&rsquo;re responsible for reviewing it or replacing it with your own,
          and for the disclosures the App Store and Google Play ask for.
        </p>

        <h2>5. Who we share information with</h2>
        <p>We don&rsquo;t sell personal information. We share it only with:</p>
        <ul>
          <li>
            <strong>Service providers</strong> that run App Builder for us: Railway (hosting,
            database and file storage, in the United States), Anthropic (AI), Stripe (payments),
            Resend (email) and, when enabled, ImageKit (generated images).
          </li>
          <li>
            <strong>Services you connect or publish to:</strong> Expo (builds and phone previews),
            Apple and Google (store submissions), RevenueCat, GitHub and any connector you enable,
            with your access and only to do what you ask.
          </li>
          <li>
            <strong>People you share with:</strong> collaborators you invite, and anyone who sees an
            app you make public or publish to the web.
          </li>
          <li>
            <strong>Authorities and advisers,</strong> when the law requires it, to protect rights
            and safety, or as part of a merger or sale of the business (with notice to you).
          </li>
        </ul>

        <h2>6. International transfers</h2>
        <p>
          App Builder is hosted in the United States. If you use it from elsewhere, your information
          is transferred there. Where the law requires it, we rely on appropriate safeguards such as
          the European Commission&rsquo;s Standard Contractual Clauses.
        </p>

        <h2>7. How long we keep it</h2>
        <ul>
          <li>
            Your account, projects and versions: while your account is open. When you ask us to
            delete your account, we delete it and its projects within 30 days, except records we
            must keep for tax or legal reasons.
          </li>
          <li>Usage events from apps with analytics on: 90 days.</li>
          <li>
            Bug reports and feature requests: while your account is open, so you can follow their
            status.
          </li>
          <li>
            App Cloud sessions expire after 90 days; anonymous app users who never saved anything
            are removed after 30 days.
          </li>
          <li>Billing records: as long as tax law requires.</li>
          <li>Server logs: a limited period set by our hosting provider.</li>
        </ul>

        <h2>8. Security</h2>
        <p>
          We use encryption in transit (HTTPS), hash passwords, encrypt connected-account tokens and
          store keys at rest, and run the code we generate in an isolated preview on a separate
          domain. No system is perfectly secure; tell us at <a href={`mailto:${email}`}>{email}</a>{" "}
          if you find a problem.
        </p>

        <h2>9. Your rights and choices</h2>
        <ul>
          <li>
            You can see and change your account details in Settings, download your app&rsquo;s
            source code at any time, and disconnect any connected account.
          </li>
          <li>
            You can ask us for a copy of your personal information, to correct or delete it, or to
            restrict or object to how we use it, by writing to{" "}
            <a href={`mailto:${email}`}>{email}</a>. We&rsquo;ll answer within 30 days.
          </li>
          <li>You can unsubscribe from marketing emails with the link in any of them.</li>
          <li>
            If you&rsquo;re in the EU, the UK or another place with a data protection authority, you
            can complain to it.
          </li>
        </ul>
        <h3>California residents</h3>
        <p>
          We collect the categories of information described in section 1 for the purposes in
          section 2. We don&rsquo;t sell personal information or share it for cross-context
          behavioural advertising, and we don&rsquo;t use sensitive personal information to infer
          characteristics about you. You have the right to know, delete and correct your information
          and to not be discriminated against for using these rights; use the email above.
        </p>

        <h2>10. Children</h2>
        <p>
          App Builder isn&rsquo;t for children under 16, and we don&rsquo;t knowingly collect their
          personal information. If you think a child has given us information, contact us and
          we&rsquo;ll delete it.
        </p>

        <h2>11. Changes to this policy</h2>
        <p>
          We&rsquo;ll post changes on this page and update the date at the top. If a change is
          significant, we&rsquo;ll tell you by email or in the app before it takes effect.
        </p>

        <h2>12. Contact</h2>
        <p>
          {entity}
          {address ? (
            <>
              <br />
              {address}
            </>
          ) : null}
          <br />
          <a href={`mailto:${email}`}>{email}</a>
        </p>
      </LegalPage>
      <SiteFooter entity={entity} />
    </>
  );
}
