import Link from "next/link";
import { connection } from "next/server";
import { CREDIT_USD } from "@appbuilder/core";
import { LegalPage } from "@/components/marketing/legal-page";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { LEGAL_UPDATED, legalConfig } from "@/lib/legal";

export const metadata = { title: "Terms of Service" };

export default async function TermsPage() {
  await connection(); // the company details come from the environment at request time
  const { entity, email, law } = legalConfig();
  return (
    <>
      <SiteHeader />
      <LegalPage title="Terms of Service" updated={LEGAL_UPDATED}>
        <p>
          These terms are an agreement between you and <strong>{entity}</strong> (&ldquo;we&rdquo;,
          &ldquo;us&rdquo;) for using App Builder, the website, the builder and its related
          services. By creating an account or using App Builder you agree to them and to our{" "}
          <Link href="/privacy">Privacy Policy</Link>. If you use App Builder for a company, you
          confirm you can bind it to these terms.
        </p>

        <h2>1. Your account</h2>
        <ul>
          <li>You must be at least 16 and able to form a binding contract.</li>
          <li>
            Give accurate details and keep your password safe. You&rsquo;re responsible for what
            happens in your account, including what collaborators you invite do in your projects.
          </li>
        </ul>

        <h2>2. What App Builder does</h2>
        <p>
          App Builder uses AI to plan, write and edit mobile apps, shows them in a live preview,
          stores them with their history, and can build and send them to the App Store and Google
          Play through <strong>your own</strong> Apple, Google and Expo accounts. Some features,
          such as App Cloud, analytics, AI inside your apps and store builds, depend on your plan
          and on third-party services.
        </p>

        <h2>3. Plans, credits and billing</h2>
        <ul>
          <li>
            AI work uses credits. One credit is ${CREDIT_USD.toFixed(2)} of AI usage, charged at
            what each step actually used. A step that fails is charged only for what it used.
            Editing text and styles yourself, and restoring an earlier version, use no credits.
          </li>
          <li>
            There are no overage charges: when your credits run out, AI steps stop until you have
            more. We never charge your card beyond your plan without you choosing to buy more.
          </li>
          <li>
            Paid plans renew automatically every month until you cancel. Stripe processes payments;
            you authorise us to charge your payment method for each period. Prices exclude taxes
            where those are added at checkout.
          </li>
          <li>
            Credits included in your plan are added each billing period. Credits don&rsquo;t expire
            while your account is open, have no cash value and can&rsquo;t be transferred or
            refunded.
          </li>
          <li>
            You can cancel any time in Settings → Manage subscription; your plan stays active until
            the end of the period you paid for. Fees already paid aren&rsquo;t refundable, except
            where the law requires it. If something went wrong, write to us and we&rsquo;ll look at
            it.
          </li>
          <li>We&rsquo;ll give you at least 30 days&rsquo; notice before a price increase.</li>
        </ul>

        <h2>4. Your content and your apps</h2>
        <ul>
          <li>
            <strong>You own what you put in</strong> (prompts, files, data){" "}
            <strong>and the code App Builder generates for you.</strong> Generated apps include
            open-source components (such as Expo and React Native) under their own licences.
          </li>
          <li>
            You give us a licence to host, copy, process and display your content only as needed to
            run App Builder for you, including sending it to our AI provider. If you make a project
            public, others can view and remix it.
          </li>
          <li>
            <strong>You&rsquo;re responsible for your apps:</strong> what they do, the content in
            them, meeting the App Store and Google Play rules, your app&rsquo;s privacy policy, and
            the data of your app&rsquo;s users. Apps go to the stores from your own developer
            accounts, and Apple and Google decide whether to approve them.
          </li>
          <li>
            When your app stores its users&rsquo; data in App Cloud, we process it on your behalf
            and on your instructions, as described in our Privacy Policy.
          </li>
        </ul>

        <h2>5. AI output</h2>
        <p>
          AI can make mistakes. Generated code, text, store listings and suggestions may be wrong,
          incomplete or similar to what others receive. Review and test everything before you
          publish or rely on it. Store-readiness checks help, but they don&rsquo;t guarantee that
          Apple or Google will approve your app.
        </p>

        <h2>6. Acceptable use</h2>
        <p>Don&rsquo;t use App Builder to:</p>
        <ul>
          <li>break the law, infringe others&rsquo; rights, or build apps that do;</li>
          <li>
            create malware, phishing, scams, spam, or apps that deceive people about who made them;
          </li>
          <li>
            create sexual content involving minors, or content that promotes violence or hate;
          </li>
          <li>
            get around limits, credits or security, probe or attack our systems or the preview
            sandbox, or scrape the service;
          </li>
          <li>resell App Builder or its AI access as a service without our written permission.</li>
        </ul>
        <p>We may remove content or suspend accounts that break these rules.</p>

        <h2>7. Third-party services</h2>
        <p>
          App Builder works with services such as Apple, Google, Expo, Stripe, RevenueCat, GitHub
          and the connectors you enable. Your use of them is governed by their terms, and we
          aren&rsquo;t responsible for them. If one changes or stops working, the features that
          depend on it may change too.
        </p>

        <h2>8. Changes, suspension and ending</h2>
        <ul>
          <li>
            We may change or improve App Builder, and will tell you about significant changes.
          </li>
          <li>
            You can stop using App Builder and ask us to delete your account at any time. Download
            your source code first.
          </li>
          <li>
            We may suspend or close an account that breaks these terms or puts others at risk,
            usually with notice. Sections that by their nature should survive (ownership,
            disclaimers, liability) continue after the agreement ends.
          </li>
        </ul>

        <h2>9. Disclaimers</h2>
        <p>
          App Builder is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. To the extent
          the law allows, we disclaim all warranties, including merchantability, fitness for a
          particular purpose and non-infringement, and we don&rsquo;t promise the service will be
          uninterrupted or error-free.
        </p>

        <h2>10. Limitation of liability</h2>
        <p>
          To the extent the law allows, we aren&rsquo;t liable for indirect, incidental, special or
          consequential damages, or for lost profits, revenue or data. Our total liability for any
          claim about App Builder is limited to the greater of the amount you paid us in the 12
          months before the claim, or US$100. Nothing in these terms limits liability that the law
          doesn&rsquo;t allow us to limit.
        </p>

        <h2>11. Indemnity</h2>
        <p>
          You&rsquo;ll defend and indemnify us against claims arising from your apps, your content
          or your breach of these terms.
        </p>

        <h2>12. Governing law</h2>
        <p>
          These terms are governed by the laws of {law}, without regard to conflict-of-law rules.
          Courts there have jurisdiction, unless the law where you live gives you the right to bring
          a claim at home.
        </p>

        <h2>13. Changes to these terms</h2>
        <p>
          We&rsquo;ll post updates here and change the date above. For significant changes
          we&rsquo;ll notify you in advance; continuing to use App Builder after they take effect
          means you accept them.
        </p>

        <h2>14. Contact</h2>
        <p>
          {entity} · <a href={`mailto:${email}`}>{email}</a>
        </p>
      </LegalPage>
      <SiteFooter entity={entity} />
    </>
  );
}
