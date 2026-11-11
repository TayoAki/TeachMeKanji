# Gap plan: everything we only partly have or don't have

This covers every row marked partial or missing in the competitor feature matrix (November
2026). It also adds the agent workflow and extra features found in a second pass. For each item
it gives four things:

- whether we need it;
- what building it means in this codebase;
- how long it should take;
- which keys or accounts it needs.

**Estimates** assume one engineer working with Claude Code, with tests and docs included.
They don't include waiting on Apple, Google or a third party's approval.

| Size | Time |
|------|------|
| **S** | Up to 2 days |
| **M** | 3 days to 1 week |
| **L** | 1 to 3 weeks |
| **XL** | More than a month |

**Verdicts**, in our positioning: subscription apps for non-technical founders, predictable cost,
apps that pass App Review.

| Verdict | Meaning |
|---------|---------|
| **Now** | Before or right after launch: it protects the promise we sell |
| **Next** | The following 1–2 months |
| **Later** | Once paying users ask for it |
| **Skip** | Doesn't fit the product or isn't worth the cost |

Already done in this pass: in-app account deletion for apps with sign-up, and a hosted privacy
policy for every app. Those were matrix rows "Writes and hosts your privacy policy" and part of
"mock Apple review".

## Before any of this: launch blockers (configuration, not features)

| Blocker | Who | Time |
|---------|-----|------|
| Apply the staged `STRIPE_SECRET_KEY` in Railway, then run one real checkout with the `APPBUILDER-TEST` code | You click Deploy in Railway; I verify | 15 min |
| `LEGAL_CONTACT_EMAIL` and `LEGAL_GOVERNING_LAW` (the company name now falls back to "App Builder") | You give the values; I set them | 5 min |
| A real domain, then Resend: verify the domain, add `RESEND_API_KEY` and `EMAIL_FROM` on web and worker | You buy the domain and create a Resend account; I wire it | 1–2 h, plus DNS propagation |
| One real app through the pipeline: TestFlight, a sandbox purchase through RevenueCat, a push notification | Your Apple, Expo and RevenueCat accounts; I drive it | Half a day, plus Apple processing |
| `ERROR_WEBHOOK_URL` (a Slack or Discord webhook) so production errors reach someone | You create the webhook | 10 min |

## Priority summary

| # | Item | Today | Verdict | Size | Keys or accounts |
|---|------|-------|---------|------|------------------|
| 1 | Store check inside the product (pre-flight) | Partial | **Now** | S–M | — |
| 2 | Credits back when the AI's fix breaks something | Missing | **Now** | S–M | — |
| 3 | Usage dashboard | Partial | **Now** | S | — |
| 4 | Auto-fix runtime errors and an "AI review" button | Partial | **Now** | M | — |
| 5 | Creates App Store subscription products | Partial | **Next** | M | User's ASC key (already collected) |
| 6 | Revenue in money (RevenueCat) | Missing | **Next** | S–M | User's RevenueCat secret key |
| 7 | Paywall template gallery that passes review | Missing | **Next** | M | — |
| 8 | Review notes, demo login, screen recording | Missing | **Next** | M | User's ASC key |
| 9 | Fix from Apple's rejection (paste-in first) | Missing | **Next** | S | — |
| 10 | Instant updates (EAS Update) | Missing | **Next** | M | User's Expo token (have) |
| 11 | App website and support page | Missing | **Next** | S–M | — (custom domains later) |
| 12 | Sign in with Apple | Missing | **Next** | M | Apple developer account (user's) |
| 13 | Project memory and skills | Missing | **Next** | M | — |
| 14 | Agent modes: Discuss, Build, Max | Partial | **Next** | S–M | — |
| 15 | Pick the AI model per message | Missing | **Next** | S | — |
| 16 | Starting data from CSV or JSON | Missing | **Next** | S–M | — |
| 17 | Templates gallery | Partial | **Next** | M | — |
| 18 | iPad layouts and the iPad check | Missing | **Next** | M | — |
| 19 | Look-alike check for Guideline 4.3 | Missing | **Next** | M | — |
| 20 | Install by QR or USB (internal distribution) | Partial | **Next** | M | User's Apple developer account |
| 21 | Inside ChatGPT and Claude (live test the MCP) | Partial | **Next** | S | A ChatGPT and a Claude account |
| 22 | Text-to-speech in apps (on-device) | Missing | **Next** | S | — |
| 23 | Mock Apple review on the release build | Missing | **Later** | L | Cloud iOS simulator (Appetize or EAS Workflows with Maestro) |
| 24 | Submit for Review | Missing | **Later** | L | User's ASC key |
| 25 | Google Play to production | Partial | **Later** | M | User's Play service account (have) |
| 26 | Paywall A/B testing | Missing | **Later** | M | User's RevenueCat |
| 27 | Localization and translated screenshots | Missing | **Later** | L | — |
| 28 | Store reviews: read and reply | Missing | **Later** | M | User's ASC key |
| 29 | Store-page conversion tracking | Missing | **Later** | M–L | User's ASC key |
| 30 | AI marketing videos | **Built** (promo videos, no voiceover yet) | — | — | Remotion licence check; ElevenLabs key for a voiceover |
| 31 | Real iOS simulator in the browser | Partial | **Later** | M | Appetize (paid per minute) |
| 32 | Fake GPS and webcam in the preview | Missing | **Later** | S–M | — |
| 33 | Test a real purchase before TestFlight | Partial | **Later** | M | User's RevenueCat |
| 34 | Keys kept out of the app (secrets proxy) | Partial | **Later** | M | — |
| 35 | Teams with shared credits and comments | Partial | **Later** | L | — |
| 36 | Voice prompt | Missing | **Later** | S | — |
| 37 | Figma import | Missing | **Later** | M | User's Figma account |
| 38 | Start from a website | Missing | **Later** | S–M | Firecrawl key (or none) |
| 39 | Biometrics (Face ID lock) | Missing | **Later** | S | — |
| 40 | Builder on the phone (responsive web or PWA) | Missing | **Later** | M | — |
| 41 | Scheduled agent runs | Missing | **Later** | M | — |
| 42 | GitHub two-way sync | Partial | **Later** | L | GitHub App (ours) |
| 43 | CLI and public API | Partial | **Later** | M | — |
| 44 | Parallel agents | Partial | **Later** | L | — |
| 45 | Home-screen widgets and Live Activities | Missing | **Later** | L | — |
| 46 | AdMob ads | Missing | **Later** | M | User's AdMob ids |
| 47 | Bring your own Supabase | Missing | **Later** | L | User's Supabase keys |
| 48 | Apple Search Ads | Missing | **Later** | L | User's Apple Ads account |
| 49 | Keyword rank tracking | Missing | **Later** | M | Paid data provider |
| 50 | Human publishing help | Missing | **Later** | S (page) | — (a service, not code) |
| 51 | From Slack | Missing | **Skip** | M | Slack app (ours) |
| 52 | From a Shopify store | Missing | **Skip** | M | — |
| 53 | Native Swift, Kotlin or Flutter | Missing | **Skip** | XL each | — |
| 54 | Watch, TV, Vision Pro, CarPlay, Siri/Shortcuts | Missing | **Skip** | L–XL each | — |
| 55 | On-device Apple AI (Foundation Models) | Missing | **Skip** | L | — |
| 56 | NFC and Bluetooth | Missing | **Skip** | L each | — |
| 57 | Stripe payments inside apps | Missing | **Skip** | M | — |
| 58 | Video, music, 3D and game voice chat generation | Missing | **Skip** | L–XL | Third-party model keys |
| 59 | Hiring UGC creators | Missing | **Skip** | — | — |
| 60 | Desktop app | Missing | **Skip** | L | — |

**Rough totals:**

| Group | Items | Time |
|-------|-------|------|
| Now | 1–4 | About 2 weeks |
| Next | 5–22 | About 2–3 months |
| Later | 23–50 | Built only as users ask; the full set would be 6+ months |

---

## Now: protects the promise we sell

### 1. Store check inside the product (pre-flight) — partial
- **Need it?** Yes. Our funnel (/check) and landing page sell "passes App Review". Today the
  check is a quiz, and the per-build checks are invisible.
- **Work:** a "Store check" panel in the workspace (or the build dialog), run on the current
  files. It should cover:
  - **Paywall:** close button, Restore Purchases, terms and privacy links, price and period,
    trial text.
  - **Settings:** restore purchases, delete account.
  - **App Store Connect:** the store identifiers are set.
  - **iPad:** whether the app supports iPad.

  Each failed item has a "Fix with AI" button that runs a scoped edit. It reuses
  `packages/contract/src/quality.ts` and `STORE_CHECKS`, and the checks for price, period and
  trial text are new. The panel blocks "Send to TestFlight" with a warning (not a hard stop).
- **Size:** S–M, 2–3 days.
- **Keys:** none.

### 2. Credits back when the AI's fix breaks something — missing
- **Need it?** Yes. "Paying to re-fix what the AI broke" is the #1 complaint we found in 900
  competitor reviews, and no competitor refunds it (Anything and Cabano refund only failed
  builds).
- **Work:**
  - **Triggers:** a run is refunded when its version is restored within 24 hours, when it
    introduced render errors the canvas reports, or when the user taps "This broke my app" on
    the run.
  - **The refund:** a ledger credit of the run's charge.
  - **Abuse limits:** a monthly cap per plan (for example 20% of included credits) and one
    refund per run.
  - **Code:** `credits.ts` and `runs.ts` hold the logic, plus a button in the chat run card and
    a line in the terms.
- **Size:** S–M, 2–3 days.
- **Keys:** none.

### 3. Usage dashboard — partial
- **Need it?** Yes. "No surprise bill" needs the bill to be visible.
- **Work:** Settings → Usage, read from `credit_ledger` and `agent_run`. It shows:
  - credits spent per day;
  - each run with its type, model, credits and refunds;
  - in-app AI spend per app;
  - remaining credits against the plan's monthly grant;
  - the next renewal date.

  Add a CSV export.
- **Size:** S, 2 days.
- **Keys:** none.

### 4. Auto-fix runtime errors and an "AI review" button — partial
- **Need it?** Yes. It turns breakages into one free click instead of a paid chat round.
- **Work:**
  - **Runtime errors:** the preview frame already posts render errors. Show a "Fix this error"
    action that starts an edit with the error and the stack, and make those fixes free when the
    previous run caused them (ties to #2).
  - **AI review:** expose the existing `review` run (screenshots plus two judges against the
    rubric) as an "AI review" button that captures the canvas frames, which the eval CLI
    already does.
- **Size:** M, 4–5 days.
- **Keys:** none.

## Next: the 1–2 months after launch

### 5. Creates App Store subscription products — partial
- **Need it?** Yes. Setting up subscriptions is where founders get stuck. Today we create them
  in RevenueCat but tell the user to create them in App Store Connect by hand.
- **Work:** use the user's App Store Connect API key (already stored, App Manager role) to
  create:
  - the subscription group;
  - the subscriptions, with prices by territory, localizations and the review screenshot.

  Then link them in RevenueCat. RevenueCat's API can also push products to the store and may be
  simpler; pick after a spike. Google Play subscriptions go through the Play Developer API with
  the stored service account.
- **Size:** M, about 1 week.
- **Keys:** the user's ASC key (have) and Play service account (have).

### 6. Revenue in money — missing
- **Need it?** Yes, for a subscription-app builder.
- **Work:** an Analytics tab section with MRR, active subscriptions, trials, trial-to-paid
  conversion and revenue by day, from RevenueCat's v2 API. Ask for a secret key in the Payments
  panel, encrypted like the other store keys.
- **Size:** S–M, 2–3 days.
- **Keys:** the user's RevenueCat secret API key.

### 7. Paywall template gallery that passes review — missing
- **Need it?** Yes. It's a concrete, demo-able proof of "passes App Review".
- **Work:** 6–10 paywall designs as templates, including:
  - single plan;
  - plan picker;
  - trial-first;
  - feature list;
  - testimonial.

  Each passes the paywall checks in every theme. The planner and edits can pick one ("use the
  trial-first paywall"), and a gallery in the workspace shows them live. They live in
  `templates/expo-app/components/paywalls/`, owned by the platform but configured by the model.
- **Size:** M, about 1 week.
- **Keys:** none.

### 8. Review notes, demo login and a screen recording for Apple — missing
- **Need it?** Yes. A missing demo account and unclear review notes are common rejection
  reasons.
- **Work:**
  - **Demo login:** create a demo App Cloud account for each app.
  - **Review notes:** write them from the plan (what the app does, where the paywall is, how to
    test the purchase).
  - **Screen recording:** record the preview walking through onboarding, the paywall and
    settings (Playwright video of the web preview).
  - **App Store Connect:** fill the App Review information through the API.
- **Size:** M, 4–5 days.
- **Keys:** the user's ASC key (have).

### 9. Fix from Apple's rejection — missing
- **Need it?** Yes, and it's cheap.
- **Work:** a "Paste Apple's message" box in the build dialog. The agent maps it to the
  guideline, makes the fix as a scoped edit and drafts the reply for Resolution Center. Reading
  rejections through the API comes later if Apple exposes the full thread.
- **Size:** S, 2 days.
- **Keys:** none.

### 10. Instant updates without a new store build (EAS Update) — missing
- **Need it?** Yes. Founders can fix a typo or a bug after launch without another review.
  Apple allows updates that don't change what the app is.
- **Work:**
  - add `expo-updates` to the template with a `runtimeVersion` policy;
  - add a "Push update" action that runs `eas update` on the user's Expo account for the
    current version;
  - show which version each channel runs;
  - block updates that change native modules.
- **Size:** M, about 1 week.
- **Keys:** the user's Expo token (have).

### 11. App website and support page — missing
- **Need it?** Yes. App Store Connect requires a support URL, and a small site helps
  discovery.
- **Work:** `/apps/<id>`, next to the privacy page we just added, with:
  - a hero built from the store listing;
  - screenshots;
  - store badges;
  - support email;
  - privacy and terms links.

  Custom domains later through Railway's custom domains.
- **Size:** S–M, 2–3 days.
- **Keys:** none.

### 12. Sign in with Apple — missing
- **Need it?** Yes. Sign-in friction hurts conversion, and Apple requires it the moment we add
  Google sign-in.
- **Work:** `expo-apple-authentication` in the template. App Cloud verifies Apple's identity
  token (Apple's public keys, audience = the bundle ID), then links or creates the app user.
  Delete account must also revoke the Apple token, which needs a key from the user's Apple
  developer account. It works in store builds only, not Expo Go.
- **Size:** M, 4–5 days.
- **Keys:** the user's Apple developer account with the capability on (EAS can enable it) and a
  Sign in with Apple key for token revocation.

### 13. Project memory and skills — missing
- **Need it?** Yes. It gives consistent edits and fewer paid re-explanations.
- **Work:**
  - **Project notes:** a per-project file the agent keeps (decisions, style, "always use
    furigana") and the user can edit, added to every run.
  - **Skills:** reusable instruction packs the user saves and applies across projects.
  - **Storage:** a new `project_memory` table, a Memory tab and an addition to the edit prompt.
- **Size:** M, 4–5 days.
- **Keys:** none.

### 14. Agent modes — partial (we have plan → build)
- **Need it?** Yes. A Discuss mode stops accidental paid edits.
- **Work:**
  - **Discuss:** answers and advice with no file changes, on Sonnet or Haiku, a fraction of a
    credit.
  - **Build:** today's edits.
  - **Max:** Opus, plus the AI review (#4) after the change.

  Add a mode switch in the composer and show the cost of each mode.
- **Size:** S–M, 2–3 days.
- **Keys:** none.

### 15. Pick the AI model per message — missing
- **Need it?** Useful, and it fits cost transparency.
- **Work:** a model menu in the composer (Sonnet by default, Opus) with an estimated credit
  range. `EDIT_MODEL` becomes a per-run input, and the worker already prices each call by its
  own model.
- **Size:** S, 1–2 days.
- **Keys:** none.

### 16. Starting data from CSV or JSON — missing
- **Need it?** Yes, for content apps (word lists, recipes, workouts), including our own kanji
  example.
- **Work:** upload a CSV or JSON in the composer or the Data tab. The agent infers the
  collection's shape, writes `data/content/<name>.ts` and spreads it into `data/seed.ts`.
  Large files are split into content files. Validate the size against the contract.
- **Size:** S–M, 2–3 days.
- **Keys:** none.

### 17. Templates gallery — partial (themes and community remix)
- **Need it?** Yes. It speeds up the first build and helps activation.
- **Work:** curated starter apps (habit tracker, language flashcards, workout log, journal,
  recipe box), each a saved plan plus files. "Start from template" copies one and opens the
  plan for changes. The community gallery becomes a second tab.
- **Size:** M, about 1 week, mostly curating and checking quality.
- **Keys:** none.

### 18. iPad layouts and the iPad check — missing
- **Need it?** Yes. Apple runs iPhone apps on iPad during review, and broken layouts there are
  a rejection reason.
- **Work:**
  - layout rules for wide screens (max content width, two columns where it fits);
  - an iPad frame on the canvas;
  - iPad screenshots (2048×2732) in Store listing;
  - `supportsTablet` as a store setting, off by default until the layouts pass.
- **Size:** M, about 1 week.
- **Keys:** none.

### 19. Look-alike check for Guideline 4.3 — missing
- **Need it?** Yes, and it's special to us. Every app we build shares the same
  onboarding → paywall → main → settings structure, so founders who ship several apps from us
  are at real 4.3 (spam) risk.
- **Work:** compare a new app's plan, screen text and canvas screenshots with the same owner's
  other apps, using text similarity plus a perceptual hash of the screenshots. Above a
  threshold, warn and suggest what to change.
- **Size:** M, 3–4 days.
- **Keys:** none.

### 20. Install by QR or USB — partial (Expo Go QR)
- **Need it?** Useful: testers can install a real build without TestFlight.
- **Work:** an EAS internal-distribution build (ad hoc). It needs the tester's device registered
  (`eas device:create` gives a link to open on the phone), and the build page shows an install
  QR. USB install isn't possible from a website; skip it.
- **Size:** M, 3–4 days.
- **Keys:** the user's Expo token and Apple developer account (have, through the ASC key).

### 21. Inside ChatGPT and Claude — partial (MCP built, never connected from them)
- **Need it?** Yes. It's a Pro selling point, and it's untested.
- **Work:** connect from Claude.ai and from ChatGPT's developer mode with real accounts, then
  fix what breaks (OAuth details, tool shapes, image passing). Optionally add a ChatGPT app
  later.
- **Size:** S, 1–2 days.
- **Keys:** a Claude account and a ChatGPT account with custom connectors.

### 22. Text-to-speech in apps — missing (from "media generation")
- **Need it?** Yes, as a cheap version: pronunciation for language apps, reading aloud for
  accessibility.
- **Work:** `expo-speech` in the template (on-device voices, free, works in Expo Go) with a
  `speak()` helper and a rule. Cloned or premium voices (ElevenLabs) can come later through App
  Cloud, billed to credits.
- **Size:** S, 1 day.
- **Keys:** none (ElevenLabs only for premium voices).

## Later: build once paying users ask for it

### 23. Mock Apple review on the real release build — missing
- **Need it?** It's the strongest differentiator on the list, but expensive. Start with #1, #4
  and #8, which cover most of the value on the web preview.
- **Work:** take the release build to a cloud iOS simulator, then run a scripted walkthrough
  with Maestro flows:
  - onboarding;
  - demo login;
  - a StoreKit test purchase;
  - account deletion;
  - an iPad pass.

  Record video, judge it with the rubric and produce a report. EAS Workflows can run Maestro on
  simulators; Appetize is the alternative.
- **Size:** L, 2–3 weeks.
- **Keys:** an EAS plan with workflows, or an Appetize account (paid per minute).

### 24. Presses "Submit for Review" — missing
- **Need it?** Later. Submitting is one click for the founder. The value is in preparing
  everything (#5, #8, #11), and the API has many edge cases: export compliance, age rating,
  content rights, pricing and availability.
- **Work:** through the App Store Connect API, create the app store version, attach the build,
  fill the review details and create the review submission. Start in dry-run mode with a
  checklist.
- **Size:** L, 1–2 weeks.
- **Keys:** the user's ASC key (have).

### 25. Google Play to production — partial (internal testing only)
- **Need it?** Later. Google requires the first release and the app-content forms (data
  safety, content rating) in Play Console, and automation can't skip those.
- **Work:** promote internal → closed → production tracks with release notes through the Play
  Developer API, and show a checklist of the forms Google requires.
- **Size:** M, 3–4 days.
- **Keys:** the user's Play service account (have).

### 26. Paywall A/B testing — missing
- **Need it?** Later. It needs traffic first.
- **Work:** use RevenueCat Experiments through the connector (two offerings, one experiment),
  or our own variant flag from App Cloud with the analytics funnel split by variant. Works with
  #7's templates.
- **Size:** M, about 1 week.
- **Keys:** the user's RevenueCat (connector or secret key).

### 27. Localization, translated screenshots and per-language store pages — missing
- **Need it?** Later. It multiplies reach, but only after an app works in one language.
- **Work:**
  - move generated apps' strings into `data/i18n/<lang>.ts`;
  - have the agent translate them;
  - add a language switch in the preview;
  - translate the store listing and screenshots per language, with a per-language store page
    preview.
- **Size:** L, 2 weeks.
- **Keys:** none.

### 28. Store reviews: read and reply — missing
- **Need it?** Later, after launch.
- **Work:** pull App Store customer reviews through the ASC API and draft replies with Claude.
  The owner approves each one, which is then posted with `customerReviewResponses`. Google Play
  through the Play Developer API.
- **Size:** M, 3–4 days.
- **Keys:** the user's ASC key and Play service account (have).

### 29. Store-page conversion tracking — missing
- **Need it?** Later.
- **Work:** App Store Connect Analytics Reports API (impressions, page views, downloads,
  conversion), requested daily and shown in the Analytics tab next to in-app numbers. Apple
  produces the reports with a delay.
- **Size:** M–L, 1–2 weeks.
- **Keys:** the user's ASC key (have).

### 30. AI marketing videos — built as promo videos
- **Done:** Project menu → Promo video. An editable AI storyboard, the app's real screens
  filmed with Remotion on the worker, vertical 9:16 or landscape 16:9, optional music the owner
  has the rights to, 1 credit per render (see 05-v1-status.md).
- **Still to do:** a voiceover (ElevenLabs text-to-speech from a script the owner approves,
  billed to credits; never a cloned real person's voice), music synced to its beats, captions
  as SRT, an App Store app preview cut (886×1920, footage only, 15–30 s), and a "Made with App
  Builder" end card on the Free plan as a growth loop.
- **Keys:** an ElevenLabs API key for the voiceover. Check Remotion's licence before launch: it's
  free only for companies of up to three people, and larger ones pay per render.

### 31. Real iOS simulator in the browser — partial (web preview plus Expo Go)
- **Need it?** Later. The web preview and Expo Go cover building, and a real simulator costs
  per minute.
- **Work:** embed an Appetize session of the latest simulator build, metered and capped per
  plan.
- **Size:** M, about 1 week.
- **Keys:** an Appetize account.

### 32. Fake GPS and webcam in the preview — missing
- **Need it?** Later, nice to have.
- **Work:** a location picker (city search) that sets what `useLocation()` returns in the
  preview, and `getUserMedia` behind `CameraCapture` in the preview instead of the sample photo.
- **Size:** S–M, 2 days.
- **Keys:** none.

### 33. Test a real purchase before TestFlight — partial (simulated purchases)
- **Need it?** Later. Sandbox purchases already work in TestFlight builds.
- **Work:** a development build with a StoreKit configuration file generated from
  `data/monetization.ts`, so purchases can be tested on a simulator or device without App Store
  Connect products.
- **Size:** M, 3–5 days.
- **Keys:** the user's Apple developer account.

### 34. Keys kept out of the app — partial (AI goes through App Cloud)
- **Need it?** Later. It unlocks any third-party API but is security-sensitive.
- **Work:**
  - owners store API keys per app, encrypted;
  - apps call `/api/app/<id>/proxy/<name>`, which adds the key;
  - each key has an allowlisted host and is rate-limited per user and per app.

  This also fixes the known ImageKit issue: sign image URLs on the server (S).
- **Size:** M, about 1 week.
- **Keys:** none.

### 35. Teams with shared credits, roles and comments — partial (per-project invites)
- **Need it?** Later. Our buyers are mostly solo founders.
- **Work:** team workspaces with a shared credit pool and owner billing, roles (owner, admin,
  editor, viewer) and comments pinned to canvas screens.
- **Size:** L, 2 weeks.
- **Keys:** none.

### 36. Voice prompt — missing
- **Need it?** Later. It's cheap and matters mostly on phones (#40).
- **Work:** a microphone button in the composer using the browser's speech recognition (Chrome
  and Safari; hidden where unsupported).
- **Size:** S, 1 day.
- **Keys:** none.

### 37. Figma import — missing
- **Need it?** Later. Few of our founders have Figma designs.
- **Work:** a Figma connector through Figma's MCP server (our connector system already handles
  MCP sign-in), or its REST API. Frames come in as reference images, and their layers become
  hints for the planner.
- **Size:** M, 3–5 days.
- **Keys:** the user's Figma account (an OAuth app registered by us if we use the REST API).

### 38. Start from a website — missing
- **Need it?** Later.
- **Work:** paste a URL. The worker takes screenshots and reads the text (Playwright in the
  worker, or Firecrawl), and both go to the planner as references.
- **Size:** S–M, 2 days.
- **Keys:** none with Playwright; a Firecrawl key if we use it.

### 39. Biometrics (Face ID or fingerprint lock) — missing
- **Need it?** Later. Useful for journal and finance apps.
- **Work:** `expo-local-authentication` with an `unlockWithBiometrics()` helper, the Face ID
  permission string in app.json and a rule. It works in Expo Go.
- **Size:** S, 1 day.
- **Keys:** none.

### 40. Builder on the phone — missing
- **Need it?** Later. Vibecode, Rork and Lovable lead with phone apps, but a responsive web
  builder gets most of the way.
- **Work:** a mobile layout for the workspace (chat first, preview as a sheet) and an installable
  PWA. A native app is a separate XL project.
- **Size:** M, about 1 week.
- **Keys:** none.

### 41. Scheduled agent runs — missing
- **Need it?** Later.
- **Work:** schedules per project, such as a weekly AI review, new content every week or a
  template refresh. They run in the worker with a credit cap per schedule and an email summary.
- **Size:** M, 3–4 days.
- **Keys:** none (email needs Resend).

### 42. GitHub two-way sync — partial (push and PR)
- **Need it?** Later, for technical Pro users.
- **Work:** a GitHub App. A webhook on push imports the commit as a version after validating it
  against the contract, and conflicts become a branch and PR.
- **Size:** L, 1–2 weeks.
- **Keys:** a GitHub App (ours): app id, private key and webhook secret.

### 43. CLI and public API — partial (MCP only)
- **Need it?** Later. MCP covers agents.
- **Work:** personal API tokens, a REST API over the same operations as the MCP tools, and a
  thin `npx appbuilder` CLI.
- **Size:** M, about 1 week.
- **Keys:** none.

### 44. Parallel agents — partial (parallel screens in a build)
- **Need it?** Later.
- **Work:** several edit runs per project on separate screens, with a merge step that
  re-validates the whole project. This needs a change to the one-run-per-project rule.
- **Size:** L, 2 weeks.
- **Keys:** none.

### 45. Home-screen widgets and Live Activities — missing
- **Need it?** Later. They need Swift targets inside the Expo project, beyond what the model
  writes today.
- **Work:** Apple targets through an Expo config plugin, with a small set of platform-owned
  widget templates fed from App Cloud or shared storage.
- **Size:** L, 2–3 weeks.
- **Keys:** none.

### 46. AdMob ads — missing
- **Need it?** Later. Our positioning is subscriptions.
- **Work:** `react-native-google-mobile-ads` (store builds only, not Expo Go), the App Tracking
  Transparency prompt, `app-ads.txt` on the app website (#11) and banner or interstitial
  components.
- **Size:** M, about 1 week.
- **Keys:** the user's AdMob app and ad unit ids.

### 47. Bring your own Supabase — missing
- **Need it?** Later. App Cloud's no-setup backend is part of our pitch. This matters only for
  hand-off to a developer.
- **Work:** a `data/remote.ts` variant that uses the Supabase client, with tables from the app's
  schema and row-level security policies.
- **Size:** L, 1–2 weeks.
- **Keys:** the user's Supabase URL and anon key.

### 48. Apple Search Ads — missing
- **Need it?** Later.
- **Work:** Apple Ads Campaign Management API: create a campaign from the store listing's
  keywords with a budget cap, and report installs and cost per install.
- **Size:** L, 1–2 weeks.
- **Keys:** the user's Apple Ads account (API credentials).

### 49. Keyword rank tracking — missing
- **Need it?** Later.
- **Work:** a daily rank check for the listing's keywords from a data provider, charted in
  Analytics.
- **Size:** M, about 1 week.
- **Keys:** a paid data provider (AppTweak, AppFollow or similar). Scraping store search is
  against the stores' terms.

### 50. Human publishing help — missing
- **Need it?** Later, as a paid add-on (Draftbit, BuildNatively and a0 sell it). It's a service
  decision, not code.
- **Work:** a "Launch help" page and booking. The cost is people's time.
- **Size:** S for the page.
- **Keys:** none.

## Skip: doesn't fit, or isn't worth it

| # | Item | Why we skip it |
|---|------|----------------|
| 51 | **From Slack** | Solo founders don't build apps from Slack. M if a team customer asks (a Slack app with signing secret and OAuth). |
| 52 | **From a Shopify store** | Commerce apps aren't our subscription-app buyer. |
| 53 | **Native Swift, Kotlin or Flutter** | A second generator, contract and preview each (XL, months). Expo covers our buyers, and we compete on cost and shipping, not native code. |
| 54 | **Apple Watch, Apple TV, Vision Pro, CarPlay, Siri and Shortcuts** | Each needs native targets and its own review rules; demand is low among first-app founders. Widgets (#45) are the one Apple extra worth doing later. |
| 55 | **On-device Apple AI (Foundation Models)** | Only on Apple Intelligence devices with the latest iOS, behind a native module. Our App Cloud AI works on every phone today. |
| 56 | **NFC and Bluetooth** | Store builds only, hardware-specific testing, rare in subscription apps. |
| 57 | **Stripe payments inside apps** | Digital subscriptions must use Apple and Google billing in most cases; Stripe fits physical goods, which isn't our market. |
| 58 | **Video, music, 3D and game voice chat generation** | Expensive third-party models, a weak link to subscription utility apps, and moderation risk. On-device speech (#22) and our image generation cover the useful part. |
| 59 | **Hiring UGC creators** | A marketplace business, not a builder feature. Partner instead. |
| 60 | **Desktop app** | The web app works on desktop; a wrapper adds nothing. |

## Suggested order

| Weeks | Work |
|-------|------|
| 1–2 | Launch blockers, then #1–#4 (store check, credits back, usage, auto-fix) |
| 3–5 | #5 subscriptions in App Store Connect, #7 paywall gallery, #8 review notes, #9 rejection fixes, #12 Sign in with Apple |
| 6–8 | #10 instant updates, #11 app website, #13 memory, #14–#15 modes and model picker, #18 iPad, #19 look-alike check |
| 9–12 | #6 revenue, #16 CSV data, #17 templates, #20 install QR, #21 live MCP test, #22 speech, and whatever paying users ask for most |
