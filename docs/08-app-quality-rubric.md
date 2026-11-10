# App quality rubric

How we judge the apps the builder makes, and how the builder is set up to make them well.
Every generated app has four parts: **onboarding, a paywall, the main app and settings**,
plus the craft that runs through all of them. The rubric scores each part out of 100 points
in total; `npm run eval -w @appbuilder/worker` applies it to a built app.

## Why these four parts

An app that people download, keep and pay for needs more than screens that render:

- **Onboarding** gets people to their first win fast. Steps should do work: ask a question
  that personalizes the app, let them try the core action once, or explain a permission
  before asking. Expo's skills call the generic promo carousel a "slop" tell: it "delays the
  first useful screen without collecting required setup or teaching necessary concepts".
- **The paywall** sells something that exists in the app, with clear prices, trial terms,
  restore, a visible close button and the renewal terms Apple requires for subscriptions.
  Paid access comes from an entitlement, never from a success animation: the membership
  skill's rule that "a successful UI animation is not proof of a database write or payment".
- **The main app** nails one core loop. Talks we drew on make the same point from two sides:
  build from a real person's angle rather than the generic idea every AI produces, start with
  one core feature and iterate; and growth comes from a result worth sharing (virality), a
  product that converts, and formats that repeat.
- **Settings** carries the obligations users and the stores expect: subscription status,
  restore and manage, support, privacy, terms, the version, and (with accounts) sign out and
  account deletion (App Store guideline 5.1.1(v)).

## How the builder makes them

- **The plan** records the product decisions before any code: who the app is for, its angle,
  the core loop, a shareable moment, 2–4 onboarding steps, what premium unlocks and the
  offers. It always contains exactly one onboarding, paywall and settings screen at fixed
  routes (`app/onboarding.tsx`, `app/paywall.tsx`, `app/settings.tsx`); they don't count
  toward the plan's screen limit.
- **The template** (platform-owned) provides the plumbing so the model writes product, not
  infrastructure: `useAppState()` (first-launch state and onboarding answers),
  `usePurchases()` (offers, purchase, restore, entitlement; simulated in Expo Go and the
  preview, labeled as test mode), `appInfo` (support and legal links), `useShareImage()` (share
  a card as an image: react-native-view-shot and expo-sharing on a phone, text in the
  preview), `useReminder()` (one daily local notification via expo-notifications, asked for
  when the user turns it on), and a root layout that
  uses `Stack.Protected` to show onboarding until it is completed and opens the paywall as a
  modal.
- **Each screen's prompt** carries its part's job (see `roleGuidance` in
  `apps/worker/src/agents/prompts.ts`), and the contract rules carry the native-quality rules
  from Expo's skills: Pressable with pressed states, no Alert confirmations or custom modals,
  labeled icon buttons, 44pt targets, loading/empty/content states, no placeholder copy.
- **The validator** rejects (and sends back for repair) an onboarding that never calls
  `completeOnboarding()` and a paywall that can't buy, restore and close.

## The rubric

Each criterion is scored 0–3: **3** what a top indie app on the App Store does, **2** solid
and shippable with small gaps, **1** present but weak, generic or partly broken, **0** missing
or broken. Points are the criterion's weight × score / 3.

### Onboarding (15 points)

| | Criterion | Points | 3: good | 0: bad |
|---|---|---:|---|---|
| O1 | Fast to first value | 5 | 2–4 steps with progress, skippable, ending in the app with the core action one tap away. | No onboarding, or a long flow that can't be skipped and ends somewhere unrelated. |
| O2 | Steps that do work | 5 | Questions that personalize the app (answers saved and visibly used by the main screens), a try-it-once demo, or a permission explained before it's asked. | Generic promotional slides (the onboarding carousel) that collect nothing and teach nothing. |
| O3 | Specific voice | 5 | Short, warm copy written for this audience and angle; it could not belong to another app. | "Welcome to <App>", placeholder or generic AI copy, fake screenshots. |

### Paywall (20 points)

| | Criterion | Points | 3: good | 0: bad |
|---|---|---:|---|---|
| P1 | Clear value | 4 | A headline about the outcome and 2–4 concrete premium features that exist in the app. | Vague "unlock premium content" with no idea what is gained. |
| P2 | Clear prices | 4 | Each offer shows its price per period, trial length and badge; the selected offer and what is billed when are obvious. | Prices hidden, ambiguous (no period) or trial terms missing. |
| P3 | Required controls | 4 | A visible close button, Restore Purchases, the auto-renewal terms, and Terms and Privacy links. | No way to close, no restore, or no renewal disclosure (App Store rejection risk). |
| P4 | Honest and well timed | 4 | Shown after onboarding and at locked features; no fake urgency or hidden close; simulated purchases say so. | Fake countdowns or scarcity, delayed or disguised close, or a hard wall before any value. |
| P5 | Entitlements wired | 4 | Premium features in the main app check isPremium and open the paywall when locked; purchase shows progress, errors and the already-premium state. | Nothing is actually gated, or a success animation is the only purchase handling. |

### Main app (35 points)

| | Criterion | Points | 3: good | 0: bad |
|---|---|---:|---|---|
| M1 | Core loop first | 7 | The one repeatable action is obvious and one tap from home; the app does that thing really well. | A grab bag of screens with no clear reason to come back. |
| M2 | Real content and states | 7 | Realistic seed data; loading, empty (with a next action) and content states; no placeholder text. | Lorem ipsum, TODOs, empty screens with no guidance, or the empty state flashing while loading. |
| M3 | Every control works | 7 | Each button does what its label promises; forms validate; data changes persist. | Dead buttons, empty handlers, or Alert pop-ups standing in for features. |
| M4 | Distinctive and shareable | 7 | A visible point of view for its audience and one result worth screenshotting and sharing. | A generic template app indistinguishable from thousands of others. |
| M5 | Navigation conventions | 7 | 2–5 tabs, titles in the navigator header for stack screens, settings reachable from home, back always works, modals as routes. | Hand-rolled headers and modals, dead ends, settings unreachable. |

### Settings (10 points)

| | Criterion | Points | 3: good | 0: bad |
|---|---|---:|---|---|
| S1 | Subscription | 4 | Plan status, Upgrade, Restore Purchases and Manage subscription (store link). | No subscription controls at all. |
| S2 | Support, legal and about | 3 | Contact support, Privacy Policy, Terms of Use and the app version (and sign out and account deletion when the app has accounts). | No way to get help or read the policies. |
| S3 | Preferences that matter | 3 | Grouped sections of settings that change the app (including onboarding answers and replaying onboarding). | Decorative toggles that do nothing. |

### Craft (20 points)

| | Criterion | Points | 3: good | 0: bad |
|---|---|---:|---|---|
| C1 | Layout and hierarchy | 5 | One focal point and primary action per screen; grouping through spacing and size rather than boxes. | Everything is a card of equal weight; no clear first read. |
| C2 | Spacing and type | 5 | A consistent spacing scale (tight within groups, wider between), a clear type ramp, tabular numbers. | Cramped or uniform 16-everything spacing; random font sizes. |
| C3 | Color and contrast | 4 | Legible text on every surface in light and dark themes; color is not the only signal. | Low-contrast text, a dark theme that breaks, gradient-heavy hero banners. |
| C4 | Accessibility | 3 | Icon-only controls have labels and roles; 44pt targets; font scaling allowed. | Unlabeled icon buttons, tiny targets, disabled font scaling. |
| C5 | No slop tells | 3 | None of: emoji as icons, purple gradient heroes, TouchableOpacity, custom modals, Alert confirmations, hand-rolled headers. | Several of them. |

### Caps

Deterministic checks (`packages/contract/src/quality.ts`) run first and cap criteria whatever
the judges say. A paywall without a close button scores 0 on P3; a missing part scores 0
across its criteria; three or more slop tells cap C5 at 0. If any screen fails to render, the
total is capped at 40.

## How an app is evaluated

`npm run eval -w @appbuilder/worker -- --project <id> --name <report-name> [--base-url <url>]`
with `EVAL_EMAIL`, `EVAL_PASSWORD` (an account that can open the project) and
`ANTHROPIC_API_KEY` set.

1. **Capture**: sign in to the builder, open the project's canvas, screenshot every screen as
   the user sees it, plus the home screen, paywall and onboarding again in a dark theme, and
   note any screen that fails to render.
2. **Deterministic checks** over the code.
3. **Two independent judges** (Claude Opus 5.5, high effort) score every criterion from the
   screenshots and code. They are told they did not build the app, to cite the screen and
   element for every score, to give the single most valuable fix, and never to grade on
   intentions. Two judges, averaged, keep one judge's mood from deciding the score
   (disagreements show in the report).
4. **Score and report**: judge scores are averaged, capped by the checks, and written to
   `docs/evals/<name>.md` with a contact sheet of the screens, the issues most severe first,
   and the failed checks. A run costs about $0.30–0.60.

The approach follows ECC's evaluation guidance (a separate, strict evaluator; evidence for
every score; deterministic graders before model graders; hard caps for critical failures) and
Expo's own design rubric (layout, spacing, type, color, platform conventions, polish and
accessibility).

## Sources

- Expo agent skills (github.com/expo/skills): expo-design-system (the native-slop tells),
  expo-native-ui, expo-router, expo-data-fetching (screen states, gating onboarding on loaded
  state), expo-animation, eas-app-stores, and the design rubric in expo-skill-eval.
- ECC (github.com/affaan-m/ECC, MIT): rules/react-native, gan-style-harness, eval-harness,
  santa-method, frontend-design-direction, click-path-audit, product-lens.
- The mobile auth and membership skills (sign-in and access; entitlements, restore,
  verification and account deletion).
- Apple App Store Review Guidelines 3.1.2 (subscriptions) and 5.1.1(v) (account deletion).
