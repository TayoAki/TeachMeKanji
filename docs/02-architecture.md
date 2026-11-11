# Architecture: AI mobile app builder

This design follows the review in [01-transcript-review.md](01-transcript-review.md). Items
marked **(decision)** depend on the open decisions listed there.

---

## 1. System overview

```
                         ┌──────────────────────────────────────────────┐
  Browser                │  Web app (Next.js, App Router)               │
  ─────────              │  • home / dashboard / workspace UI           │
  workspace UI ─────────►│  • auth (Better Auth)                        │
   │  ▲   SSE progress   │  • thin API routes: CRUD, enqueue runs,      │
   │  └──────────────────│    stream run events, signed upload URLs     │
   │                     └───────────────┬──────────────────────────────┘
   │ postMessage                         │ enqueue / read
   ▼                                     ▼
 ┌────────────────────┐        ┌───────────────────┐      ┌──────────────────────┐
 │ Preview origin     │        │ Postgres (Drizzle)│◄────►│ Worker (job runner)  │
 │ preview.<domain>   │        │ projects, versions│      │ • agent runs         │
 │ sandboxed iframes: │        │ runs, events,     │      │   (plan/build/edit)  │
 │ RN-web runtime +   │        │ ledger, builds …  │      │ • validate / repair  │
 │ vendor bundle      │        └───────────────────┘      │ • zip / GitHub push  │
 └────────────────────┘        ┌───────────────────┐      │ • EAS build / deploy │
                               │ Object storage    │◄────►│ • device-preview     │
                               │ (S3-compatible)   │      │   dev servers (Metro)│
                               │ assets, blobs,    │      └──────────┬───────────┘
                               │ zips, artifacts   │                 ▼
                               └───────────────────┘   Anthropic API · Expo (Expo Go, EAS
                                                       Build, EAS Hosting) · GitHub ·
                                                       ImageKit · Stripe · Resend
```

**Principles**

- The web app never runs anything long. Each long operation is an `agent_run` or job that
  the **worker** executes, and the web app streams its progress from the database.
- Every change to an app produces a new immutable **project version**. Export, build, publish
  and preview always point at a specific version.
- Generated code is **untrusted**. It runs only on the preview origin, in sandboxed iframes
  with no access to platform cookies or secrets.
- Each vendor sits behind an adapter: `StorageAdapter`, `JobQueue`, `LLMClient`,
  `BackendProvider`, `BuildService`, `HostingService`, `ImageGen`.

---

## 2. The generated-app contract (v1)

Every generated app follows this contract. The template provides the fixed files; the model
writes only the files marked *generated*. A validator enforces the contract on every write.

### 2.1 Runtime and dependencies
- **Expo SDK:** pinned to the version Expo Go currently ships (SDK 58 as of Phase 0), since
  the QR flow depends on it. The single source of truth is `packages/contract/src/sdk.ts`,
  mirrored in `templates/expo-app/package.json` (`expo install --check` passes on it).
- **Router:** Expo Router (file-based).
- **Importable modules (contract v0):** `react`, `react-native`, `expo-router` (named
  exports listed), `expo-status-bar`, `expo-image`, `expo-linear-gradient`,
  `@expo/vector-icons` (**Ionicons only**), `react-native-safe-area-context`,
  `@react-native-async-storage/async-storage` (data layer only). `react-native-svg` was
  dropped from v0 because the preview would need its web build. The list lives in
  `packages/contract/src/allowed.ts`; the preview's vendor bundle ships exactly these modules
  (a unit test keeps the two in sync) and the validator rejects any other import.
- **SDK upgrades** are a scripted procedure: bump the template, re-pin dependencies, rebuild
  the vendor bundle, run codemods on existing projects, and re-run evals.

### 2.2 File layout
```
app/_layout.tsx              template  — ThemeProvider, DataProvider, root Stack
app/(tabs)/_layout.tsx       generated — tab definitions from the plan
app/(tabs)/<screen>.tsx      generated — one file per tab screen
app/<screen>.tsx             generated — stack screens (detail, add/edit forms …)
components/*.tsx             generated — shared UI components
theme/tokens.ts              generated — 5 theme packs (same keys, different values)
theme/types.ts               template  — the Theme type every pack must satisfy
theme/active.ts              template  — active theme id store (the preview switches it)
theme/ThemeProvider.tsx      template  — context + useTheme(), active pack by id
data/schema.ts               generated — entity types from the plan's data model
data/seed.ts                 generated — realistic seed data
data/repo.ts                 template  — Repository<T> interface + useCollection hooks
data/local.ts                template  — AsyncStorage implementation
data/remote.ts               template  — App Cloud implementation of the same repository
data/auth.ts                 template  — useAuth(): App Cloud accounts (sign up / in / out)
data/backend.ts              platform  — App Cloud URL and ImageKit endpoint; never model-written
components/AiImage.tsx       template  — <AiImage prompt="…" />: ImageKit-generated images
app.json / package.json      template  — name, slug, icons from plan
```

### 2.3 Rules the validator enforces
1. Each file transpiles (Sucrase / esbuild) and imports only allowed packages or relative
   paths that exist.
2. Screens and components use theme tokens: no hex, rgb or named color literals outside
   `theme/tokens.ts`. Spacing and font sizes use the token scales.
3. Screens read data through `useCollection(...)` from `data/repo.ts`, never by calling
   AsyncStorage or fetch directly. This is what lets an app move from local to remote data
   without touching screens.
4. Every screen file has a default export, scrolls when its content is longer than the
   viewport, and renders with seed data and no route params (needed for canvas frames).
5. The theme pack keys are identical across all 5 packs.

A violation sends the file back to the model with the errors (at most 2 repair attempts).
If it still fails, the run surfaces a "fix with AI" message.

### 2.4 Element identity for inline editing
The model does **not** write element IDs. Instead, when the preview runtime transpiles a file,
it injects `dataSet={{ fid: "<path>:<start>-<end>" }}` into every host JSX element.
react-native-web renders this as a `data-fid` attribute. The ID is the element's source span
in the **current version** of the file, so it is always exact and costs no tokens.

### 2.5 App Cloud (generated-app backend) and AI images
Decision (Phase 8): a built-in backend instead of a third-party provider, so an app gets data
and accounts with one switch and no setup.

- **Data:** `app_user`, `app_session`, `app_record` tables in the platform's Postgres. Records
  are JSON documents keyed by (project, owner, collection, id). Limits: 500 records per
  anonymous user, 5,000 per account, 20,000 per app (checked under a per-app lock), 32 KB per
  record, 200 per write, 7 MB per request body.
- **Users:** a device gets an anonymous user on first launch, so its data is saved
  immediately. `useAuth()` signs up (upgrading the anonymous user in place, so its data stays
  theirs), signs in and out. Passwords are scrypt-hashed; sessions are random bearer tokens
  stored as SHA-256 hashes, valid 90 days.
- **API:** `/api/app/<projectId>/auth/*` and `/collections/<name>[/<id>]`, CORS-open and
  authenticated only by bearer tokens (never cookies), because apps call it from phones, the
  sandboxed preview and published web pages. Every query is scoped to the project and to the
  token's user. Sign-in (per account and per address), sign-up and anonymous-user creation
  (per address, plus a per-app backstop) are rate limited. Errors are logged without query
  parameters, which would contain end users' emails and records.
- **Switch:** turning App Cloud on rewrites `data/backend.ts` (a platform file) as a new
  version; `data/repo.ts` then uses `remote.ts` instead of `local.ts`, and screens don't
  change. The workspace preview acts as one stable "Preview" user per project (sessions last a
  day, are revoked when a member is removed, and can't be upgraded to an account), and the
  Data tab shows the app's users and records to editors. A remix never shares the original's
  App Cloud: its `data/backend.ts` is reset to on-device data.
- **Images:** `AiImage` builds an ImageKit URL that contains the prompt
  (`ik-genimg-prompt-…`); ImageKit generates and caches the image on first request. Without
  `IMAGEKIT_URL_ENDPOINT` it renders a themed placeholder.

### 2.6 Analytics in generated apps
- **Switch:** the Analytics tab sets `project.analytics` and rewrites the platform file
  `data/analytics-config.ts` (the platform origin and project id, or empty) as a new version.
  A remix starts with it off.
- **Client:** template `data/analytics.ts` queues events and posts batches of up to 50 every
  4 seconds (and when the app goes to the background) to `/api/app/<projectId>/events`. The
  root layout reports screen views (`usePathname()`); `app-state.ts` and `purchases.ts` report
  onboarding, purchases and restores. Events from the preview, Expo Go and development builds,
  and simulated purchases, carry `test: true`.
- **Server:** `appRoute(..., { requires: "analytics" })` accepts events whether or not App Cloud
  holds the app's data; no bearer token, because every install sends them. Limits: 50 events a
  request, 30 requests per install and 600 per network address a minute, 50,000 events per app a day (`app_analytics_day`).
  Events (`app_event`) are pruned after 90 days by the worker's hourly housekeeping.
- **Summary:** `analyticsSummary()` (packages/core/src/app-analytics.ts) computes everything from
  non-test events with SQL: daily active and new installs, next-day and day-7 return of new
  installs, the funnel (`app_open` → `onboarding_complete` → `screen_view /paywall` →
  `purchase`), top screens, custom events, platforms.
---

## 3. Data model (Drizzle, Postgres)

Better Auth owns `user`, `session`, `account` and `verification`. Our tables:

| Table | Key columns | Notes |
|-------|-------------|-------|
| `project` | id, owner_id, name, slug, prompt, platforms (`ios`/`android`/`both`), status (`draft`/`planning`/`awaiting_confirmation`/`building`/`ready`/`error`), visibility (`private`/`public`), active_theme_id, current_version_id, timestamps, deleted_at | Soft delete |
| `project_asset` | id, project_id, storage_key, mime, bytes, width, height, uploaded_by | Pre-signed upload; MIME checked from content |
| `project_member` | project_id, user_id?, email, role (`viewer`/`editor`), invited_by, accepted_at | Share by email |
| `message` | id, project_id, role, content (jsonb: text, attachment ids, plan ref, selection ref), run_id, created_at | Chat history |
| `plan` | id, project_id, version, app_name, screens (jsonb), data_model (jsonb), themes (jsonb), research (jsonb), status (`proposed`/`confirmed`/`superseded`) | Revisions keep history (and the first plan's research) |
| `project_design` | id, project_id, plan_id, status (`generating`/`ready`/`failed`), direction (jsonb), screens (jsonb: path, brief, image key, status `pending`/`approved`/`changes`, note, version), mascot (jsonb), cost_usd | Mockups before the build; images in storage |
| `project_version` | id, project_id, parent_id, created_by_run_id, kind (`generate`/`ai_edit`/`inline_edit`/`restore`), summary, created_at | Immutable |
| `version_file` | version_id, path, blob_hash | One row per file per version |
| `blob` | hash (sha256), content (text) or storage_key, bytes | Content-addressed and deduplicated |
| `screen` | project_id, key, title, route, file_path, order, canvas_x, canvas_y | Canvas layout |
| `agent_run` | id, project_id, user_id, kind (`plan`/`revise`/`build`/`edit`/`fix`/`backend_connect`), status (`queued`/`running`/`succeeded`/`failed`/`cancelled`), input, progress, error, model, tokens_in/out, cache_read_tokens, credits_reserved, credits_charged, started_at, finished_at | One row per job |
| `run_event` | run_id, seq, type, payload, created_at | Streamed to the UI over SSE |
| `credit_ledger` | id, user_id, delta, reason (`grant`/`reserve`/`settle`/`release`/`purchase`/`refund`), run_id?, stripe_event_id?, created_at | Append-only; the balance is a guarded transactional sum or cache |
| `subscription` | user_id, plan (`free`/`pro`), stripe_customer_id, stripe_subscription_id, status, current_period_end | |
| `integration_connection` | user_id, provider (`github`/`expo`/`backend`), encrypted_token, scopes, account_label, expires_at | Envelope-encrypted |
| `project_github_repo` | project_id, owner, repo, default_branch, last_pushed_version_id | |
| `build` | id, project_id, version_id, platform, artifact (`apk`/`aab`/`ipa`), eas_build_id, status, artifact_url, app_version, build_number | |
| `web_deployment` | id, project_id, version_id, url, provider_deployment_id, status | |
| `backend_binding` | project_id, provider, external_project_id, services (jsonb), connection_id | Generated-app backend |

**Undo and restore:** point `project.current_version_id` at an older version, which also
creates a `restore` version so history stays linear.

---

## 4. Agent pipeline

### 4.1 Plan and revise (structured output)
- **Input:** the prompt, attached images (sent as vision input), platforms, and the
  default/maximum screen count from config (3 and 8 in the video).
- **Output (JSON schema):**
  - `appName`, `summary`
  - `screens[]`: `{ key, title, kind: tab|stack, purpose, keyComponents, dataNeeds }`
  - `dataModel.entities[]`
  - `themes[5]`: `{ id, name, tokens }`
- **Revise:** send the current plan plus the user's feedback and get back plan v(n+1). The
  UI renders a plan card with **Confirm & build**.

### 4.1b Research and design first (mockups before the build)
- **Research** (inside the first plan run): Claude (`RESEARCH_MODEL`, Sonnet) with Anthropic's
  `web_search_20260209` tool finds competing apps and what their users praise and complain
  about. A paused turn is sent back to continue. The result is stored on the plan and a short
  brief goes into the plan request. Research never blocks planning: on failure the plan is made
  from the idea alone.
- **Design** (`design` run, after the plan): the direction (structured output: palette, type,
  shape, illustration style, motion plan, an optional mascot, one brief per plan screen), the
  mascot's poses (first from the description, the rest from the first; cut out of a green
  background with sharp), two options for the key screen (the main tab) rated by Claude, then
  every other screen drawn with the key screen (and mascot) as references, each checked by
  Claude (vision) for a drawn device frame, two screens in one image or leaked design notes and fixed with one image edit.
  Images come from an image model through OpenRouter (`IMAGE_MODEL`, default Nano Banana 2.1,
  chosen by a blind test of every image model there); their cost is added to
  the run's meter, and no new image starts once the reserve is spent.
- **Approval:** the canvas shows the mockups; the user approves each or asks for a change
  (a `mockup` run redraws one, from the current image plus the note). The build waits until
  all are approved, or the user skips the mockups.
- **Build from mockups:** the theme call sees the key screen's mockup and each screen's call
  sees its own; the mascot's poses become `data/images.ts` entries; the default theme is set to
  the plan's first theme by the platform. Builds from mockups run on `DESIGN_BUILD_MODEL`
  (Sonnet), which matched the mockups as well as Opus at half the cost.
- **Motion:** each screen's build call also gets the direction's motion plan for that screen
  (its moments, and the signature interaction on its screen) and builds it with the platform's
  motion kit, `components/motion.tsx` (template-owned): `Appear`, `Stagger`, `PressScale`,
  `CountUp`, `GrowBar` and `Float`, on React Native's `Animated`. Rule 16 of the contract asks
  every screen to use them. They respect Reduce Motion, and in still renders (the preview's
  `screen` mode: canvas frames and screenshots) they show their final state at once, so a
  captured screen is never half-faded. The design prompt only plans motion the code can do.
- **Other models:** every model setting accepts an OpenRouter id (`vendor/model`, e.g. a Gemini
  or DeepSeek model). Those requests go to OpenRouter's chat completions endpoint through an
  adapter (`apps/worker/src/generation/openrouter-chat.ts`) that keeps the Messages shape
  (structured output, effort, images, web search through OpenRouter's web plugin) and meters
  the cost OpenRouter reports. A build model that reads text only gets each screen's written
  brief and the direction's style instead of the mockup images. `DETAIL_IMAGE_MODEL` draws
  everything but the key screen's two options with a cheaper image model.

### 4.2 Build (orchestrated by our code; one `agent_run`)
1. **Scaffold** the template files.
2. **Shared layer, two calls in parallel:** the theme (`theme/tokens.ts`), and the data layer
   with the tab layout and shared components (`data/schema.ts`, `data/seed.ts`,
   `app/(tabs)/_layout.tsx`, `components/*`). They don't depend on each other.
3. **All screens in parallel** (`GENERATION_CONCURRENCY`, default 8), one call per screen.
   Every call has the same cached prefix: the contract plus the template and shared-layer
   source. Each screen writes only its own file and new components in its own folder
   (`components/<screen key>/`); writes elsewhere are discarded and sent back for repair, so
   parallel screens can't collide. Screens appear on the canvas as each one finishes.
4. **Prompt cache warm-up:** in each parallel wave the first call goes alone until its response
   starts streaming; then the rest start and read the cache it wrote (`fanOut`). Starting all
   at once would make every call pay full price for the shared prefix.
5. **Validate** each file (§2.3). On failure, run a repair call with the errors (at most 2). A
   screen that still fails gets a placeholder and a warning; the shared layer must pass.
6. **Commit** a `project_version`.

### 4.3 Edit agent (chat after the build)
A tool-using agent loop with these tools:
- `list_files`, `read_file`, `write_file`, `edit_file` (exact string replace)
- `add_screen`, `delete_screen`, `rename_screen`, `reorder_screens`
- `set_theme`, `validate`

When the user picks an element with the inline editor, the message carries a selection
reference (`path`, source span, snippet). When they pick a whole screen on the canvas (a click
anywhere on its frame: presses inside the preview iframe reach the canvas as a `pressed`
message; the frame shows which of the four parts it belongs to), the chat says "Editing: <screen>"
and the message carries `{ kind: "screen", path }`: the agent changes that screen and touches
other files only when the request needs it. Apps grow this way, one screen and one request at
a time; more reference content goes into new `data/content/<name>.ts` files that
`data/seed.ts` merges, rather than rewrites of one big file. Every run writes a new version, so
users can undo.

### 4.4 Model and SDK notes
- Use the **Anthropic TypeScript SDK** (`@anthropic-ai/sdk`), called directly rather than
  through an OpenAI-compatible gateway.
- Default to the current **Opus-tier** Claude model with adaptive thinking. Set effort
  explicitly per route and tune it with the eval set. Using cheaper tiers for some routes is
  a product decision, made only on eval evidence.
- **Plan:** use structured outputs (`output_config.format`). Current top models reject
  *forced* `tool_choice`, so don't force a tool to get JSON back.
- **Edit agent:** use the SDK tool runner, with strict tool schemas.
- **Stream** every generation call. Cache the stable prefix (system prompt + contract +
  template sources). Check `stop_reason` before using output, and handle `refusal` and
  `max_tokens` (enable server-side fallbacks as the SDK docs recommend).
- **Credits:** reserve an estimate when a run starts, then settle from `response.usage`
  (input, output and cache tokens) when it ends.
- **Rough cost** at current Opus-tier list prices ($4 in / $20 out per million tokens):
  - plan ≈ $0.10
  - shared layer ≈ $0.30
  - each screen ≈ $0.15–0.20 (cache reads make repeated context cheap)
  - **total ≈ $1–2 for a 5-screen app** including repairs; chat edits ≈ $0.05–0.30.

  These are estimates. Measure real usage before setting credit prices.

---

## 5. Preview runtime (canvas and interactive preview)

- **Origin:** `preview.<domain>`, separate from the app origin. It serves a static runtime
  and a prebuilt **vendor bundle** (React, react-native-web, the allowed dependencies, and
  shims for native-only modules).
- **Frames:** `<iframe sandbox="allow-scripts">` without `allow-same-origin`, at device size.
  The parent sends `{ files (or pretranspiled modules), mode, route, themeId, selectMode }`
  over `postMessage`.
- **Module loader:**
  1. Transpile TSX → JS (Sucrase).
  2. Inject `dataSet.fid` (§2.4).
  3. Evaluate CommonJS-style modules, with `require` resolving to the vendor bundle or
     sibling files.
- **Router shim:** implements `Stack`, `Tabs`, `Link`, `router.push/back/replace`,
  `useRouter`, `useLocalSearchParams` and `usePathname` over an in-memory history, using the
  shared route model in `packages/contract/src/routes.ts`. Proven in Phase 0 (see
  [04-phase-0-results.md](04-phase-0-results.md)). Known v0 limits: screens below the top of
  a stack unmount (state resets on back), no transitions, no modals.
- **Storage:** the frame has an opaque origin, so `localStorage` throws; AsyncStorage is an
  in-memory shim, reset on every load.
- **Handshake:** the frame posts `ready` at startup and again in reply to the parent's
  `hello`, because the frame can finish loading before the parent page hydrates.
- **Modes:**
  - **Screen mode** (canvas frames): render a single route with seed data. Navigation
    attempts are posted to the parent, which focuses that screen.
  - **App mode** (right panel): the full app, interactive, with local data.
- **Theme switch:** the parent posts a new `themeId` and the ThemeProvider swaps tokens
  instantly, with no regeneration.
- **Select mode:** hovering outlines the nearest element with `data-fid`. Clicking posts
  `{ fid, text, computedStyle, styleProp }` to the parent.
- **Errors:** an error boundary in each frame posts the error to the parent, which shows a
  "Fix with AI" action.

## 6. On-device preview (QR)

**Changed after Phase 0.** Snack cannot run current SDKs: its runtime is published only for
SDK ≤ 55, while store Expo Go runs only the latest SDK (58). See
[04-phase-0-results.md](04-phase-0-results.md) §Spike B.

- **Design:** a per-session **Expo dev server (Metro)** in a worker sandbox. The worker writes
  the version's files into a prepared project whose `node_modules` come from the pinned
  template (installed once per SDK, shared), starts `expo start`, and exposes it at a public
  URL. The client renders the `exp://` URL as a QR code; Expo Go loads the manifest
  (`runtimeVersion: exposdk:58.0.0`) and bundle from it.
- **Live updates:** the worker writes changed files into the same directory; Metro's fast
  refresh pushes them to the phone.
- **Lifecycle:** dev servers are started on demand when a user opens the QR dialog, and
  stopped after an idle timeout. Measured cold start in Phase 0: about 20 s to install
  dependencies (avoidable with a prebuilt image) plus about 9 s for the first bundle.
- **Exposure:** each session needs a public HTTPS hostname routed to its dev server, either
  through our own reverse proxy on a wildcard domain or a tunnel. This is Phase 6 work.
- **Alternatives kept open:** publishing our own Expo Go-compatible runtime as an EAS Update
  (the way Snack works, but under our control), or a custom preview app in the stores.

## 7. Inline editing write-back
1. A click gives a `fid` (path + span in version N). The quick editor shows text (if it is a
   literal), color (token picker first, custom value second), spacing, layout, border and
   effects.
2. On change, `POST /api/projects/:id/inline-edit { versionId, fid, patch }` runs an AST
   transform with Babel + recast that edits the `style` prop or the literal child, keeping
   formatting. It returns 409 if `versionId` is not the current version.
3. Edits within one editing session are debounced into a single `inline_edit` version, and
   the preview hot-swaps the changed module.
4. JSX expressions are read-only. "Edit with AI" opens the chat with the selection attached.

## 8. Export, GitHub, builds, web publish
- **Zip:** the worker writes the version's files plus a README and pinned `package.json`,
  uploads the zip to storage, and returns a short-lived signed URL.
- **GitHub:** prefer a **GitHub App** (per-repo installation) over an OAuth app with the
  `repo` scope.
  - Create the repo with `auto_init` (the Git Data API cannot commit to an empty repo).
  - Commit with blobs → tree → commit → ref; no git binary needed.
  - The first push goes to the default branch. Later pushes go to a branch named
    `<product>/<version-id>` and open a PR.
- **Native builds (EAS):**
  1. The worker materializes the version into a temp directory, writes `eas.json`, and runs
     `eas build --non-interactive --no-wait` with the user's encrypted `EXPO_TOKEN`.
  2. It polls the build status and stores the artifact URL.
  3. Credentials must exist before the first build: the Android keystore is generated and
     backed up (or managed by EAS), and **iOS requires the user's Apple Developer
     credentials**, collected in an onboarding step.
- **Web publish:** `npx expo export --platform web`, then `eas deploy` with the user's
  token. Store the URL per version, and republish from a newer version.

## 9. Security baseline
- Separate preview origin, sandboxed iframes and a CSP. Generated code never runs on the app
  origin.
- One central `authorize(user, project, action)` helper used by every route and job. Write
  tests for viewer vs editor vs owner vs public.
- Third-party tokens are envelope-encrypted: a data key per record, wrapped by a master key
  held in KMS or an environment variable. Store scopes and an account label, and support
  revocation.
- The agent's context contains no secrets. Generated code receives no platform environment
  variables.
- Uploads: pre-signed PUT URLs, size limits, content-sniffed MIME, image re-encoding.
- Rate limits on run creation, new projects, auth and App Cloud sign-in. Shared projects
  require a verified email in production (sharing is keyed on email).
- Stripe webhooks: verify the signature and store `stripe_event_id` for idempotency.
- Never log or store prompts or assets anywhere that would share them for third-party
  training.

### 4.5 Connectors (the user's own tools)
Settings → Connectors lists Linear, Notion, GitHub, Crowdin, Miro, Jam, Google Play,
RevenueCat, Mobbin, Appllama, Google Maps and Mapbox (`packages/contract/src/connectors.ts`).
Each connectable one is the service's official remote MCP server; Google Play has none, and
Google Maps' takes its key in a header the MCP connector can't send, so both show "Not
available yet".

- **Connecting** (`packages/core/src/connectors.ts`): signing in follows the MCP authorization
  spec: protected-resource metadata → authorization-server metadata → dynamic client
  registration (once per connector and redirect URI, kept in `connector_client`) →
  authorization code with PKCE and `resource` = the MCP server. The flow in flight lives in
  an encrypted cookie scoped to `/api/connectors/callback`. Linear, Crowdin and Jam also take a
  pasted token; GitHub and RevenueCat take only a token (their MCP sign-in accepts only apps
  they registered by hand). A token is checked by opening an MCP session with it. Redirects
  back to the builder use `BETTER_AUTH_URL`, never the request's origin (internal behind a
  proxy). Tokens are
  encrypted in `integration` (one row per user and connector; GitHub's row also exports apps).
- **Using:** a plan or chat message that names a connector (by name or link; see `mentions`)
  starts the run with one extra call (`apps/worker/src/agents/connectors.ts`): the named,
  connected servers are attached through Anthropic's MCP connector (`mcp_servers` +
  `mcp_toolset`, beta `mcp-client-2025-11-20`), signed in as the user, and the model reads what
  the message refers to and writes a brief. The plan or code call gets the brief as
  information, not instructions; it never carries tool definitions itself. Writes to the tools
  happen only when the message asks for them. Expiring OAuth tokens are refreshed before the
  call under a row lock (rotating refresh tokens); a refused refresh drops the connection.
  Problems (not connected, can't refresh, the call failed) become notes in the chat reply and
  never fail the run.
- `CONNECTOR_<ID>_URL` points a connector at another server (the e2e suite uses a local
  stand-in MCP + OAuth server, `apps/web/e2e/mock-mcp-server.mjs`).

## 9b. Bring your own AI (MCP)
Users who already pay for Claude, ChatGPT or Cursor build here without credits: their
assistant writes the code through our MCP server, and everything else (validation, versions,
preview, App Cloud, publishing) stays ours.

- **Auth:** Better Auth's `mcp()` plugin makes the app an OAuth 2.1 authorization server
  (discovery at `/.well-known/oauth-authorization-server/api/auth` and
  `/.well-known/oauth-protected-resource/api/mcp`, dynamic client registration and Client ID
  Metadata Documents, PKCE, consent at `/oauth/consent`). Access tokens are JWTs bound to the
  `/api/mcp` resource. `/api/mcp` also requires the user's consent to still exist, so
  Disconnect in Settings stops a client at once.
- **Server:** `apps/web/src/app/api/mcp/route.ts` (MCP SDK v2, both the 2026-07-28 protocol
  and 2025-era clients, stateless). Tools live in `apps/web/src/lib/mcp-tools.ts`; each call
  acts as the token's user through `projectAccess()`, and needs a plan with `mcp`.
- **Writes:** `applyChanges()` in the contract applies a batch (only app/, components/,
  theme/tokens.ts, data/schema.ts, data/seed.ts are writable), refreshes platform files from
  the template, validates the whole project and enforces the screen limit. Nothing is saved
  unless it passes; then it is one version, and the workspace picks it up by polling
  `/api/projects/<id>/head`.
- **Images:** `add_image` stores an image as a public project asset and records it in the
  platform file `data/images.ts`; code shows it with `<AiImage name="…" />`. Images arrive as
  ChatGPT file references, https URLs (fetched with private-address checks) or base64.

## 10. Environments and configuration

**Local dev:** `docker compose` runs Postgres and MinIO, and the worker runs locally, so jobs
need no tunnel. A tunnel (ngrok or cloudflared) is needed only for third-party webhooks
(Stripe, EAS).

**Environment variables (grouped):**
- **Core:** `DATABASE_URL`, `APP_URL`, `PREVIEW_ORIGIN`, `ENCRYPTION_MASTER_KEY`,
  `BETTER_AUTH_SECRET`
- **OAuth:** Google and GitHub sign-in client ID/secret pairs
- **Storage:** `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
- **LLM:** `ANTHROPIC_API_KEY`, `DEFAULT_SCREEN_COUNT`, `MAX_SCREEN_COUNT`
- **GitHub App:** `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_CLIENT_ID`,
  `GITHUB_APP_CLIENT_SECRET`
- **Images:** `IMAGEKIT_URL_ENDPOINT` (no key: generation is by URL)
- **Billing:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`
- **Generated-app backend:** none (App Cloud is built in); `APP_PUBLIC_URL` is the origin
  generated apps call
- **Email and operations:** `RESEND_API_KEY`, `EMAIL_FROM`, `ERROR_WEBHOOK_URL`,
  `REQUIRE_VERIFIED_EMAIL`, `AUTH_RATE_LIMIT`, `RATE_LIMIT_*` (see `.env.example`)
