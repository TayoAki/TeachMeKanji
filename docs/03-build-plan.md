# Build plan

The plan is split into phases. Each phase is one feature branch and one PR, like the
chapter-per-PR flow in the video, with automated review on each PR. The order differs from
the video on purpose: **jobs, versions and the credits ledger come early**, and **backend
connection and billing UI come late**. See [01-transcript-review.md](01-transcript-review.md)
§4 for why.

Sizes are relative (S < M < L < XL), not time estimates.

---

## MVP cut

**Phases 0–6 plus the zip export from Phase 7** give a usable product: prompt → plan → app
→ edit by chat or by click → preview in the browser and on a phone → download. Everything
after that is v1.

---

## Phase 0 — Foundations and spikes (L) · **done**, see [04-phase-0-results.md](04-phase-0-results.md)

**Build**
- Repo scaffold: Next.js (App Router, TypeScript strict), shadcn/ui, Drizzle + Postgres,
  Better Auth, ESLint + Prettier, Vitest, Playwright.
- `docker compose` with Postgres and MinIO; a worker entrypoint; CI (typecheck, lint,
  unit tests).
- Contract v0 ([02-architecture.md](02-architecture.md) §2) and `templates/expo-app`.

**Spike A: preview runtime.** Render a hand-written two-tab Expo Router app (with one stack
screen) inside a sandboxed iframe on a separate origin. This proves the router shim, the
vendor bundle and `data-fid` injection.

**Spike B: Snack QR.** Turn the same files into a Snack, get an `exp://` URL, scan it, and
confirm it opens in the current Expo Go with live reload.

**Spike C: generation.** Make one Claude call that generates a screen against the contract,
then validate it (transpile, import allow-list, no color literals).

**Done when** all three spikes are demoed. If Spike A fails, fall back to Snack's web player
for the canvas and record the trade-offs.

## Phase 1 — Home, auth, projects (M) · *video ch. 3–5*
- Home: header, hero, prompt box (attachments: up to 5 images, 10 MB each), platform toggle,
  suggestion chips, empty projects section.
- Auth: email/password (with verification), Google, GitHub. A sign-in dialog opens when a
  signed-out user submits a prompt, and the prompt is kept across sign-in.
- `credit_ledger` with a 100-credit `grant` on sign-up, and the balance shown in the header.
- Create project: pre-signed uploads with progress → `project` + `project_asset` rows → the
  first `message` → redirect to `/workspace/[id]`.
- The `authorize()` helper, with tests.

**Done when** a new user can sign up, submit a prompt with 2 images, land on the workspace
URL, and see the project and assets in the DB and storage. Another user gets a 404 on that
URL.

## Phase 2 — Workspace shell (M) · *video ch. 6*
- Header: name, status, Share / Export / Publish (stubs), credits.
- Left: chat panel with message history and attachments.
- Center: canvas with pan, zoom, drag frames, select/hand tools, zoom-to-fit, fullscreen.
- Right: preview panel (app mode) and Code tab (file tree + read-only CodeMirror).
- Frames render from a fixture version, using the Phase 0 runtime.

**Done when** the fixture app renders on the canvas and in the preview, the code is
browsable, and the layout survives a reload.

## Phase 3 — Jobs and planning agent (L) · *video ch. 7*
- `agent_run` + `run_event`, the worker loop (claim → run → heartbeat → finish), an SSE
  endpoint, cancellation, and retry with backoff.
- Plan and revise with structured output; plan card UI; **Confirm & build** enqueues a build
  run. The plan and conversation persist across reloads.
- Credits reserve on start, settle from token usage at the end, release on failure.
- Eval harness skeleton: 10 reference prompts, plan schema checks.

**Done when** prompt → plan in under a minute; "keep only 3 screens" revises the plan
correctly; a reload mid-run resumes the progress stream; the ledger balances.

## Phase 4 — Build pipeline (XL) · *video ch. 8*
- Template scaffold, shared layer call, per-screen calls with streamed progress, validate →
  repair, smoke render in headless Chromium, `project_version` commits.
- Theme packs: 5 per app, an instant switcher in the header, persisted `active_theme_id`.
- Interactive app-mode preview with a working local data layer (seeded).
- Edit agent with tools (`add_screen`, `edit_file`, etc.); version history with undo and
  restore.
- Evals: each reference prompt must produce an app whose screens all transpile, pass the
  contract checks and render. Run them in CI on prompt or model changes.

**Done when** 5-screen apps generate end-to-end; screens appear on the canvas as they
finish; theme switching is instant; "add a welcome screen" works; undo works; the eval
pass rate is ≥ 90 %.

## Phase 5 — Inline editing (M) · *video ch. 10*
- Select mode in frames; hover outline; a quick editor (text, color via token picker,
  spacing, layout, border, effects).
- AST write-back endpoint with version conflict detection; debounced edit sessions; hot
  swap.
- "Edit with AI" attaches the selection reference to the chat.

**Done when** changing a heading's text and color updates the source, the preview and the
Code tab. Dynamic values are shown as read-only. Undo reverts the inline session.

## Phase 6 — On-device preview (L, was M) · *video ch. 11*
Snack does not support current SDKs (Phase 0 finding), so this phase runs Expo's own dev server
per preview session ([02-architecture.md](02-architecture.md) §6).
- A prebuilt worker image with the pinned template's `node_modules`.
- Per-session dev servers: start on demand, idle timeout, public HTTPS hostname per session
  (reverse proxy on a wildcard domain, or a tunnel).
- QR dialog in the header; changed files written into the running session for fast refresh.
- SDK-mismatch guard: show the pinned SDK and an "update Expo Go" hint.

**Done when** scanning the QR opens the app in Expo Go, and a chat edit appears on the phone
without rescanning.

## Phase 7 — Export and sharing (M) · *video ch. 13*
- Download as zip (README, pinned dependencies, run instructions).
- GitHub App install/connect, create or select a repo, first push to the default branch, then
  a branch + PR for each later push.
- Share by email with viewer/editor roles, copy link, invite acceptance.

**Done when** the downloaded zip runs with `npm install && npx expo start`; a second push
opens a PR; a viewer can see but not edit.

## Phase 8 — Generated-app backend (L) · *video ch. 9* · **(decision: provider)**
- `BackendProvider` adapter; connect flow (OAuth or token); provisioning of DB + auth (+
  storage).
- `data/remote.ts` implementation: normalized tables generated from `data/schema.ts`, with
  per-row `owner_id`; auth screens (email/password, plus social sign-in when the provider
  supports it).
- Public and shared previews keep using local seed data.

**Done when** connecting a backend switches an existing app to remote data without
rewriting its screens; records show up as rows (not JSON blobs) owned by the signed-in user.

## Phase 9 — Images (S) · *video ch. 12*
- An `ImageGen` adapter (ImageKit). The agent emits image prompts; images are generated at
  build time and stored in our storage; generated code references stored URLs.

## Phase 10 — Native builds and web publish (L) · *video ch. 14–15*
- Expo account connect (encrypted token).
- Build dialog: Android APK/AAB and iOS IPA, with an Apple credentials onboarding step.
  Build status, artifact download, version/build number management.
- Web publish: `expo export` + `eas deploy`, a URL per version, republish.

**Done when** an APK installs on a device, a web URL serves the app, and an IPA build
succeeds for an account with Apple credentials.

## Phase 11 — Gallery and public showcase (S) · *video ch. 16*
- My projects grid (open, new tab, rename, duplicate, share, make public, export, delete,
  last edited).
- A public showcase for signed-out visitors, with live previews on seed data.

## Phase 12 — Plans and billing (M) · *video ch. 17*
- Pricing page, Stripe Checkout and Customer Portal, webhooks (verified, idempotent), and the
  `subscription` table.
- Enforced limits: free = 100 credits, 2 projects, 5 screens per project, no native builds;
  pro = higher limits and monthly credits. Final numbers come from the measured cost per
  run.

## Phase 13 — Production deploy and hardening (M) · *video ch. 18*
- Web app on Vercel (or the chosen host); worker on a long-running host; preview origin on a
  separate domain.
- Production OAuth callbacks, webhooks and domains; error tracking; DB backups; rate limits;
  a security review pass.

---

## Cross-cutting (every phase)
- **Evals** stay green. No prompt or model change merges without an eval run.
- **Authorization tests** for every new route or job.
- **Security review** of each PR (AI review on PRs is optional but cheap).
- **Docs:** update `02-architecture.md` whenever the contract or data model changes.
