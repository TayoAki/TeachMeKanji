# Transcript review: "Build an AI Agent App Builder with Claude Code & Next.js"

Source: a ~3-hour sponsored YouTube course (19 chapters) that builds **AppForge**, a
prompt-to-mobile-app SaaS in the same category as Rork, Lovable and Bolt. This document
lists what the video builds, where it skips hard work, and what we should do differently.
The system design is in [02-architecture.md](02-architecture.md) and the phased plan is in
[03-build-plan.md](03-build-plan.md).

---

## TL;DR

- **The product:** a user types a prompt (plus optional reference images). An AI agent
  proposes a plan of 3–8 screens, the user revises and confirms it, and the agent generates
  an **Expo / React Native** app one screen at a time. The user then edits it by chat or by
  clicking elements, previews it in the browser and on a phone (QR + Expo Go), connects a
  backend, exports it (zip / GitHub), builds APK/AAB/IPA, publishes it to the web, and pays
  for more credits.
- **Verdict:** the feature list is a good target for v1. But the video only shows the happy
  path. A large share of the real engineering is in parts it skips or adds late:
  1. the **in-browser preview runtime** (live React Native screens on a canvas),
  2. the **generated-app contract**, which is what makes theme switching, inline editing,
     preview, export and builds possible,
  3. **durable background jobs** for generation (the video finds out about serverless
     timeouts halfway through),
  4. **security**: running untrusted generated code, and storing users' GitHub, Expo and
     backend tokens.
- **Most important change:** define the generated-app contract (pinned Expo SDK, allowed
  dependencies, file layout, theme tokens, data-layer interface) **before** building the
  agent. In the video, almost every late fix traces back to not having one: data stored as
  JSON blobs, the Snack/Expo Go SDK mismatch, the agent refusing to "add a screen", Google
  sign-in missing from generated auth screens.
- **Vendor coupling:** the video is built around its sponsors (CloudHike, CodeRabbit,
  ImageKit), and CloudHike alone fills five roles. Keep every vendor behind an interface so
  each one can be replaced.

---

## 1. Feature inventory (what the video actually builds)

| # | Chapter | What gets built | Notes |
|---|---------|-----------------|-------|
| 1 | Project setup | Next.js boilerplate ("Fast Next.js") with shadcn/ui, Postgres + Drizzle, Better Auth, npm | The boilerplate is optional. `create-next-app` + `shadcn init` + Drizzle + Better Auth takes about 30 minutes. |
| 2 | CodeRabbit | AI PR review on every feature branch; "deep scan" security review | Part of the dev process, not the product. The intro says it will scan *generated* apps, but the video never builds that. |
| 3 | Home screen | Header, hero, prompt box with image attachments, iOS/Android/Both toggle, suggestion chips, projects grid, sign-in dialog | Attachments: max 5 files, 10 MB each. |
| 4 | Auth & DB | Email/password, Google, GitHub sign-in; `users` gets `credits` (default 100); signing in is required before submitting a prompt | Uses CloudHike-hosted auth and Postgres. |
| 5 | Create project | `projects`, `project_assets`, `messages` tables; S3-compatible upload with progress; redirect to `/workspace/[id]` | |
| 6 | Workspace layout | Header (logo, name, status, Share/Export/Publish); **left** chat; **center** canvas (pan, zoom, drag, select/hand tools, fullscreen); **right** live preview + Code tab (file tree) | QR is later moved to a header button so the preview can be bigger. |
| 7 | AI agent | Plan → revise loop → confirm → build. 3–8 screens (default count set by an env var), app name, theme palette; the conversation is saved | Uses OpenAI Agents SDK through CloudHike's OpenAI-compatible gateway, defaulting to a Claude Sonnet model. |
| 8 | Generate app | Screen-by-screen generation with streamed progress ("lines written"); **5 theme packs with instant switching**; working navigation and state; local-storage data layer; scrollable screens; background job runner; adding a screen by chat | Background jobs and add-screen are both added after they break. |
| 9 | Generated-app backend | "Connect CloudHike" OAuth per user; the agent provisions DB/auth/storage for the generated app via MCP; migration from one JSON blob to normalized tables; auth screens | The first version stored everything as a JSON blob with a device ID as owner. |
| 10 | Inline editing | Select an element → quick editor (text, color, spacing, layout, border, effects); "Edit with AI" attaches the selection to chat; dynamic values are read-only | |
| 11 | Expo preview & QR | Expo Snack session → `exp://` link → QR; live reload when the code changes | Runs into the Expo Go SDK version lock. |
| 12 | ImageKit | URL-based AI image generation (`ik-genimg-prompt-…`) for product and placeholder images | |
| 13 | Export | Zip with README; GitHub OAuth app; create or select a repo; the first push goes to main, later pushes go to a **new branch + PR**; share by email; copy link | |
| 14 | Native builds | **EAS Build** with the user's Expo access token (GitHub Actions was tried and dropped); APK / AAB / IPA; build status | Glosses over Apple signing (see §2.9). |
| 15 | Web publish | `expo export --platform web` + EAS Hosting, run as a background job; public URL; republish | The free EAS queue showed a ~13-minute wait. |
| 16 | Project gallery | My projects (open, new tab, rename, duplicate, share, make public, export, delete, last edited); public showcase with live previews for signed-out visitors | Public previews deliberately do not connect to the real backend, which is the right call. |
| 17 | Free / Pro plans | Credits are deducted per action. Free: 100 credits, 2 projects, 5 screens per project, no native builds. Pro: unlimited projects, more credits. Stripe checkout, pricing page | Credits never decreased until this chapter. |
| 18 | Production deploy | Vercel; env vars; updating the OAuth callback URLs (CloudHike, GitHub) and the job webhook URL | |

---

## 2. What the video glosses over (the hard parts)

### 2.1 Live React Native preview in the browser
The video never explains how the canvas renders several *live* screens side by side. The
options:

- **(a) Embed Expo Snack's web player in each frame.** Fastest to ship. But each frame is a
  separate bundler session (slow cold start, heavy with 5+ frames), and we would have little
  control over click-to-select.
- **(b) Our own runtime.** Transpile the generated TSX (Sucrase or esbuild-wasm), resolve
  imports against a prebuilt vendor bundle (React, react-native-web, an expo-router shim, the
  allowed libraries), and render each screen in a sandboxed iframe on a **separate origin**.

**Recommendation:** use (b) for the canvas and inline editing, and Snack only for the
on-device QR path. This is the biggest single engineering item. The riskiest piece is an
expo-router shim (Tabs, Stack, Link, `router`, `useLocalSearchParams`) that works without
Metro. Spike it first.

### 2.2 The generated-app contract
- **Theme switching without regenerating** only works if generated code never hard-codes
  colors and always reads tokens.
- **Inline editing** only works if every rendered element can be mapped back to a location
  in the source.
- **Export and builds** only work if dependencies are pinned to one Expo SDK.

The video bolts these on afterwards. We should write the contract first, check every
generated file against it (transpile + import allow-list + lint rules), and send violations
back to the model for repair automatically.

### 2.3 Inline edits must be written back to source safely
Changing an element's color in the quick editor has to become a code change. Do it with an
AST transform (Babel + recast, which keeps formatting) keyed on the element's source
location, not with regex or an LLM call. Literal text and literal styles are editable; JSX
expressions are not (the video shows the same limit with "dynamic values"). Files need
versions so an inline edit and an AI edit happening at the same time cannot overwrite each
other.

### 2.4 Long-running generation
Generating a 5-screen app takes minutes. Serverless function time limits (which depend on
the plan) make running it inside a request fragile. The video finds this out mid-course and
adds a job runner reached through an ngrok webhook. From day one, every agent run should be
a **durable job**:
- a database-backed state machine,
- progress events streamed to the client,
- resumable per screen, idempotent, and cancellable.

### 2.5 Agent design
Plan → confirm → build is a **workflow**, so our code should drive the steps rather than
leaving them to an open-ended agent. Only chat edits after the build need a tool-using
agent.
- Use structured outputs for the plan.
- Generate each screen in its own call with shared context (contract, plan, theme, shared
  components, signatures of screens already generated).
- After each file, run validate → repair.
- Cache the stable prompt prefix.
- **Editing is a first-class path:** add screen, modify, delete, rename, reorder, global
  changes. In the video the agent at first refused to add a screen.

The video calls the model through an OpenAI-compatible gateway. We recommend calling Claude
directly with the Anthropic TypeScript SDK (details in the architecture doc).

### 2.6 Credits and billing correctness
Charge from **measured token usage** mapped to credits. Use reserve-then-settle so two runs
at the same time cannot push a balance negative. Keep an **append-only ledger**, not just a
mutable `credits` integer. Stripe webhooks must be signature-verified and idempotent. Build
the ledger early, even if paid plans come last.

### 2.7 Per-user backends for generated apps
In the video, the platform registers an OAuth app with CloudHike, the user connects their own
account, and the agent provisions services via MCP. Requirements the video does not cover:
- Encrypt tokens at rest (envelope encryption) and make them revocable.
- Generated code must never contain platform secrets.
- Public showcase previews run against seed data or a sandbox.
- Design the data layer as a typed repository with a local implementation and a remote
  implementation, plus per-row ownership, from the start. No JSON-blob storage.

### 2.8 Expo Go / Snack SDK version lock
Expo Go from the app stores supports **only the latest SDK**, and Snack follows Expo Go.
Generated apps must therefore target the SDK that Expo Go currently ships. The platform needs
a repeatable **SDK upgrade procedure** (template, allowed dependencies, codemods), several
times a year. The video ran into exactly this mismatch.

**Phase 0 update:** it is worse than a lag. Snack's runtime is published only for SDK ≤ 55,
while store Expo Go runs SDK 58, so a Snack QR code cannot open on a current phone at all. We
use Expo's own dev server instead ([04-phase-0-results.md](04-phase-0-results.md)).

### 2.9 Native builds
- **IPA for real devices needs the end user's Apple Developer Program membership and signing
  credentials** (an App Store Connect API key). The video skips this. An iOS onboarding flow
  is required. Simulator builds avoid it but are only useful for testing.
- **Android keystore:** it must exist before the first non-interactive build (the video hit
  this). If it is lost, the app can never be updated on Google Play. Let EAS manage
  credentials, or store the keystore encrypted with a backup.
- Free EAS queues can take minutes to hours. The UI must handle "queued" well.

### 2.10 Security
- **Untrusted code:** generated code runs in the preview. Isolate it on a separate origin
  with sandboxed iframes (no `allow-same-origin`) and a strict CSP, with no access to
  platform cookies.
- **Prompt injection** through prompts or attachments: the agent's context contains no
  secrets, and generated code never receives platform environment variables.
- **Authorization:** every project route checks owner / member / public. IDOR is the classic
  bug in this kind of app. CodeRabbit flagged a related one in the video ("resolve owner
  accepts any 64-char hex").
- **Uploads:** check MIME by content sniffing, enforce size limits, use pre-signed URLs.
- **GitHub:** prefer a GitHub App with per-repo installation over an OAuth app with the
  broad `repo` scope.
- **Rate limits** on generation endpoints, and abuse controls on free accounts.
- **Share-by-email** must not reveal whether an email has an account.

### 2.11 The "free OpenAI tokens" tip
The video suggests turning on OpenAI data sharing to get free daily tokens. That sends your
**users'** prompts and uploaded images to a third party for training. For a SaaS this needs
disclosure and consent in the privacy policy at minimum. **Don't use it.**

### 2.12 No undo or version history
Neither chat edits nor inline edits can be rolled back in the video. If every run and edit
writes a new **project version** (a content-addressed file snapshot), undo, history and
"restore" are cheap. The same versions are what export, build and publish point at.

### 2.13 No quality gate on generation
The video tests by clicking around. A generation platform needs an **eval set**: N reference
prompts → generate → each must transpile, pass the contract checks, and render every screen
without a runtime error in a headless browser, with screenshots kept for review. Gate prompt
and model changes on this eval set.

---

## 3. Vendor assessment

| Vendor | Role in video | Recommendation |
|--------|---------------|----------------|
| Next.js + shadcn/ui + Drizzle + Postgres + Better Auth | Platform app | **Keep.** A solid, common stack. |
| "Fast Next.js" boilerplate | Scaffolding | **Optional.** Building the same setup by hand is quick and avoids an extra dependency. |
| **CloudHike.dev** | Platform DB, auth, storage, AI gateway, jobs, *and* generated-app backends | **Decide** (see §5). It exists as a hosted, MCP-driven backend (Postgres, S3-compatible storage, Redis, auth, email, jobs). It is the sponsor, and we found little independent information about it. Its strongest use case is provisioning **generated-app** backends through an agent. For the platform's own infrastructure, use standard interfaces (Postgres URL, S3 API, self-hosted Better Auth, a jobs adapter) so it can be replaced. |
| CodeRabbit | PR review | **Optional**, and it does not affect the architecture. Using it on this repo's PRs is fine. |
| ImageKit | AI image generation and transforms | **Fine.** Copy generated images into our own storage at generation time, so exported apps don't call ImageKit at runtime and every view doesn't regenerate or bill. |
| Expo (Snack, Expo Go, EAS Build, EAS Hosting) | Preview, builds, web publish | **Keep.** The only practical path for React Native builds. Note the per-user tokens and queue times. |
| Vercel | Hosting | **Fine for the Next.js app.** Long jobs must run in a worker elsewhere. |
| Stripe | Billing | **Fine.** |
| OpenAI Agents SDK via the CloudHike gateway | LLM | **Replace** with the Anthropic TypeScript SDK called directly (structured outputs, tool runner, prompt caching, streaming). |

---

## 4. Recommended changes from the video (summary)

1. **Contract first:** pinned SDK, allowed dependencies, file layout, theme tokens, data
   layer, validator.
2. **Own preview runtime** on a separate origin for the canvas; Snack only for the phone.
3. **Durable jobs from day one**, with progress events streamed to the client.
4. **Credits ledger from day one** (reserve → settle from real token usage).
5. **Versioned project files**, which gives undo, history and stable inputs for
   export/build/publish.
6. **Typed data layer** in generated apps (local and remote implementations), normalized
   schema, per-row ownership.
7. **Security baseline:** isolated preview origin, encrypted third-party tokens, one central
   authorization helper, rate limits.
8. **Generation evals** wired into CI before tuning prompts.
9. **Reorder the work:** backend connection and billing UI move later; jobs, versions and the
   ledger move earlier (see the build plan).

---

## 5. Open decisions

1. ~~**Repo and product.**~~ **Decided:** this repo holds the app builder platform. The
   product name is still open (working title "App Builder"; packages use `@appbuilder/*`).
2. **Platform infrastructure:** CloudHike, or standard providers (managed Postgres such as
   Neon or Supabase, S3/R2, self-hosted Better Auth, Inngest/Trigger.dev or a worker
   process)?
3. **Generated-app backend model:** users bring their own CloudHike account (as in the
   video), users bring their own Supabase project, or the platform hosts a multi-tenant
   backend (simplest for users, but we pay for and operate it)?
4. **LLM routing:** an Opus-tier Claude model everywhere by default, or cheaper tiers for
   some routes (titles, plan revisions) once evals show quality holds?
5. **Hosting:** Vercel plus a separate worker host, or one host for both?
6. **MVP scope:** the build plan suggests a cut (prompt → plan → app → edit → phone preview
   → zip). Confirm or adjust.
7. **Payments:** Stripe, or a regional provider (the video mentions Razorpay for India)?
