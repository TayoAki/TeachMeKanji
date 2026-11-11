# Deploying to production

The platform is four processes: the **web app** (Next.js), the **preview runtime** (static
files on their own origin), the **worker** (agents, exports, builds, phone previews) and
**Postgres**. The repo ships one Docker image for the three Node services and a compose file
that runs the stack.

```
           https://app.example.com                 https://preview.example-cdn.com
          ┌──────────────────────┐   iframe       ┌──────────────────────────────┐
browser ─►│ web  (next start)    │───────────────►│ preview  (static, own origin) │
          │ API, auth, App Cloud │                └──────────────────────────────┘
          └─────────┬────────────┘
                    │ Postgres (projects, versions, runs, credits, App Cloud data)
          ┌─────────┴────────────┐
          │ worker               │──► Anthropic · GitHub · EAS · Expo (phone previews)
          └──────────────────────┘
```

## With Docker Compose

```bash
cp .env.example .env
```

Fill in `.env` (see [Settings](#settings)), then:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

This builds the image, starts Postgres, runs the migrations once, and then starts `web`
(port 3000), `preview` (port 3001) and `worker`. The ports listen on localhost only: put a TLS
proxy (Caddy, nginx, a load balancer) in front, with **two hostnames**, one for the app and
one for the preview. Never expose port 3000 directly: per-IP rate limits trust the proxy's
client-address header, and a client talking to the app directly could forge it.

`NEXT_PUBLIC_PREVIEW_ORIGIN` is compiled into the browser bundle, so pass it when building:

```bash
NEXT_PUBLIC_PREVIEW_ORIGIN=https://preview.example-cdn.com docker compose -f docker-compose.prod.yml build
```

If Docker Hub rate-limits the base image, build from a mirror of the official Node image:

```bash
docker build --build-arg NODE_IMAGE=mirror.gcr.io/library/node:22-bookworm-slim -t appbuilder .
```

## On Railway

The repo deploys to Railway as three services built from the same Dockerfile, plus the
Postgres template and a Railway bucket:

| Service | Start command | Notes |
|---------|---------------|-------|
| web | `npm run start -w @appbuilder/web` | Domain on port 3000; pre-deploy `npm run db:migrate`; health check `/api/health` |
| preview | `npm run start -w @appbuilder/preview` | Its own domain on port 3001 (a separate site from the app) |
| worker | `npm run start -w @appbuilder/worker` | For phone previews, `INSTALL_EXPO_RUNTIME=1` and a domain (below); for promo videos, `INSTALL_VIDEO_RENDERER=1` (below) |

**Promo videos.** The worker renders them with Remotion and a headless Chrome. Set
`INSTALL_VIDEO_RENDERER=1` on the worker (a build argument, like `INSTALL_EXPO_RUNTIME`): its
image then carries Chrome's libraries, Remotion's Chrome headless shell at
`/opt/chrome-headless-shell` and the compiled composition at `/opt/video-bundle`. Without it, a
render fails with "Video rendering isn't set up on this server yet" and isn't charged. Each
worker renders one video at a time (other runs keep flowing); a 20-second 1080×1920 film took
about 2 minutes on 4 CPUs. Optional: `VIDEO_RENDER_CONCURRENCY` (Chrome tabs per render;
default half the CPUs, at most 4) and `REMOTION_LICENSE_KEY`.

**Remotion's licence.** Remotion is free for individuals and companies of up to three people;
larger companies need a company licence, and a product whose users render videos counts its
renders. With a licence, set `REMOTION_LICENSE_KEY` (the `rm_sec_…` key from remotion.pro) on
the worker so production renders are reported. Check remotion.dev/license before launch.

**Phone previews on Railway.** Railway gives a service HTTPS domains, not the raw ports each
Metro dev server listens on, so the worker routes phones itself: every preview session gets a
random subdomain of one wildcard domain, and the worker forwards it to that session's dev
server. To turn it on:

1. In the worker's settings, add the custom domain `*.dev.example.com` with target port 8090,
   and add the CNAME and TXT records Railway shows at your DNS provider.
2. Set `INSTALL_EXPO_RUNTIME=1` on the worker. It is a build argument: the worker's image then
   carries the Expo SDK that generated apps pin, so the worker never runs npm at runtime and
   the first preview starts in seconds. (Without it the worker installs the SDK on first use;
   on Railway that install crashed inside npm, so the image route is the one to use there.)
3. Set `DEVICE_PREVIEW_DOMAIN=dev.example.com`, `DEVICE_PREVIEW_ENABLED=1` and `PORT=8090` on
   the worker.

The QR code then encodes `exps://<random>.dev.example.com`, which Expo Go opens over HTTPS on
any network. The router never forwards Metro's debugger or "open in editor" endpoints.

On a physical iPhone, Expo Go only opens a dev server that is signed in to Expo as the same
account as the phone (Android and simulators don't check). Each preview's dev server therefore
runs with the Expo access token of the person who opened it (Settings → Expo, a personal token);
without one, the dialog explains how to add it. Tokens are checked against Expo when saved and
again before a preview starts, because one Expo rejects makes the dev server fail for every phone.

**Without a custom domain (Railway's own addresses).** Railway gives each service one
`*.up.railway.app` address and no wildcard, so the worker can instead share out a pool of fixed
addresses, one preview each:

1. Give the worker a Railway domain with target port 8090.
2. Add relay services, one per extra simultaneous preview: each is built from `relay/` (root
   directory `relay`, its own small Dockerfile; watch path `relay/**`), gets its own Railway
   domain with target port 8080, and forwards everything to the worker over the private network
   (`RELAY_TARGET`, default `worker.railway.internal:8090`), keeping the phone's Host header.
3. Set `DEVICE_PREVIEW_HOSTS` on the worker to every address, comma-separated: the worker's own
   and each relay's.

Each new preview takes a free address; when all are taken, the dialog says how many there are
and that they free up after 15 minutes without use (`DEVICE_PREVIEW_IDLE_MINUTES`), rather than
ending someone else's preview. `DEVICE_PREVIEW_SINGLE_HOST` (one address, where a new preview
ends the previous one) still works. With fixed addresses, anyone who has an address can load the
app being previewed there while it runs, so use a wildcard domain (random addresses) before a
public launch.

Variables reference the database and bucket (`${{Postgres.DATABASE_URL}}`,
`${{uploads.ENDPOINT}}` and so on, with `S3_FORCE_PATH_STYLE=0`). `CLIENT_IP_HEADER=x-real-ip`
is set because Railway's edge sends the client address in X-Real-IP. Set
`NEXT_PUBLIC_PREVIEW_ORIGIN` on the web service before its first build: Railway passes service
variables to the Dockerfile's `ARG`s.

## On separate hosts

| Service | Command | Notes |
|---------|---------|-------|
| web | `npm run build -w @appbuilder/web`, then `npm run start -w @appbuilder/web` | Any Node 22 host. Uploads need `S3_*` unless web and worker share a disk |
| preview | `npm run build -w @appbuilder/preview`, then serve `apps/preview/dist` | A static host that honors `dist/_headers` (Netlify, Cloudflare Pages), or `npm run start -w @appbuilder/preview` |
| worker | `npm run start -w @appbuilder/worker` | A long-running host (not serverless). Several workers can run; set `DEVICE_PREVIEW_ENABLED=0` on all but one |
| migrations | `npm run db:migrate` | Once per deploy, before the new web and worker start |

The preview must be on a **different site** from the app (ideally a different registrable
domain), and `PREVIEW_ALLOWED_PARENTS` must list the app's origin: its CSP allows only that
origin to embed it and only that origin as an API target for generated apps (App Cloud).

## Settings

Required in production:

| Variable | Why |
|----------|-----|
| `DATABASE_URL` | Postgres 16 |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | Sessions. The URL is the app's public `https://` origin; it is also the OAuth issuer, and AI assistants connect to `$BETTER_AUTH_URL/api/mcp`. Connectors register `$BETTER_AUTH_URL/api/connectors/callback` as their sign-in redirect, so changing the URL means users sign in to their connectors again |
| `ENCRYPTION_KEY` | Encrypts users' GitHub and Expo tokens (no fallback in production) |
| `NEXT_PUBLIC_PREVIEW_ORIGIN` (build time), `PREVIEW_ALLOWED_PARENTS` | The preview origin, and the app origin it trusts |
| `APP_PUBLIC_URL` | The origin generated apps call for App Cloud; phones must be able to reach it |
| `ANTHROPIC_API_KEY` | The built-in agent (worker), and AI features inside generated apps (web: App Cloud's `/ai`). On Railway, set the web service's to a reference, `${{worker.ANTHROPIC_API_KEY}}`; leave `LLM_PROVIDER` empty |
| `ADMIN_API_TOKEN` (optional, 32+ characters; or run `npm run credits:grant -- --amount 500 --key <once> --email a@b.com` where the database is reachable, e.g. as a one-off pre-deploy command. Railway runs that command without a shell, so wrap two commands in `sh -c '…'`, and push a commit to apply it: a redeploy reuses the old deployment's settings) | Turns on `POST /api/admin/credits` for giving credits to testers by email: `curl -X POST $BETTER_AUTH_URL/api/admin/credits -H "Authorization: Bearer $ADMIN_API_TOKEN" -H "content-type: application/json" -d '{"emails":["a@b.com"],"amount":500}'` (or `"emailSuffix":"@example.com"`). Unset, the endpoint returns 404 |
| `LEGAL_ENTITY_NAME`, `LEGAL_CONTACT_EMAIL`, `LEGAL_GOVERNING_LAW`, `LEGAL_POSTAL_ADDRESS` (web; the address also on the worker) | Who operates the service, on /privacy and /terms (read at request time, so no rebuild). Without `LEGAL_ENTITY_NAME` the pages name the service ("App Builder"); an unset email or governing law shows as a visible `[… — set LEGAL_…]` placeholder. The postal address goes in the footer of the funnel's marketing emails (required by CAN-SPAM) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_BUILDER`, `STRIPE_PRICE_PRO`, `STRIPE_PORTAL_CONFIGURATION` (web) | Paid plans: Builder $20 and Pro $200 a month, tax-inclusive. Without the key and a price, checkout answers 501 "Billing isn't configured on this server". Test and live prices have different ids: `scripts/stripe-setup.mjs` prints them for either mode. `STRIPE_PORTAL_CONFIGURATION` is App Builder's own customer-portal configuration, so a Stripe account shared with another business keeps its default portal. The webhook endpoint is `https://<web>/api/stripe/webhook` with `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated` and `customer.subscription.deleted` |
| `RESEND_API_KEY` + `EMAIL_FROM` (web **and worker**) | Email. The web app sends auth emails and the App Store check's results; the worker sends the funnel's launch emails (hourly, only when both are set) |
| `ADMIN_EMAILS` (web; comma-separated), `FEEDBACK_WEBHOOK_URL` and `FEEDBACK_EMAIL` (web; optional) | Bug reports and feature requests. People listed in `ADMIN_EMAILS` see **/admin/feedback** (everyone else gets a 404): every report with its screenshots and technical details, a status (New, Planned, In progress, Done, Won't do) and a reply the sender sees in Settings → Your reports (and is emailed, with email set up). Each new report is posted to `FEEDBACK_WEBHOOK_URL` (a Slack or Discord incoming webhook) and emailed to `FEEDBACK_EMAIL` (with Resend). `ADMIN_API_TOKEN` also works for `GET /api/admin/feedback` and `PATCH /api/admin/feedback/<id>` |
| `FUNNEL_PROMO_CODE`, `FUNNEL_PROMO_OFFER`, `FUNNEL_PROMO_ENDS` (worker; optional) | The funnel's two offer emails: a real Stripe promotion code, the offer in words ("$10 off your first month of Builder") and its real end (ISO date). Without all three, or within a day of the end, the offer emails are skipped. Checkout accepts promotion codes |
| `OPENROUTER_API_KEY` (worker only) | Design first: after a plan, users can have every screen (and a mascot) drawn as a mockup, approve or redraw them, and build from them. The images are drawn by `IMAGE_MODEL` (default `google/gemini-nano-banana-2.1`) through OpenRouter; Claude still goes straight to Anthropic. Without the key the step isn't offered (the worker reports it in its heartbeat; `DESIGN_STEP=0` turns it off). See "Design first" under Operating it |
| `CLIENT_IP_HEADER` (and `TRUSTED_PROXIES` for a multi-hop chain) | The header your proxy sets with the client's address, for per-IP rate limits. Caddy overwrites `X-Forwarded-For` (the default works); with nginx, set `proxy_set_header X-Real-IP $remote_addr` and `CLIENT_IP_HEADER=x-real-ip` |

Optional: `S3_*` (object storage), `GOOGLE_*`/`GITHUB_*` (social sign-in), `STRIPE_*`
(billing), `RESEND_API_KEY` + `EMAIL_FROM` (email), `IMAGEKIT_URL_ENDPOINT` (AI images in
generated apps), `ERROR_WEBHOOK_URL`, `RATE_LIMIT_*`, `DEVICE_PREVIEW_*`. `.env.example`
describes each one.

Without email: sharing works through invite links (single-use, a week), sign-up skips the
verification email, and "Forgot password" is hidden, so a locked-out user needs you to reset
their password. Email invites (by address) need a verified email, so they wait until email is
set up.

## Third-party setup

- **OAuth callbacks:** `https://app.example.com/api/auth/callback/google` and
  `.../callback/github`.
- **Stripe:** a webhook to `https://app.example.com/api/stripe/webhook` with the events
  `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated` and
  `customer.subscription.deleted`; put its signing secret in `STRIPE_WEBHOOK_SECRET`. Create
  two monthly prices, Builder ($20) and Pro ($200), tax-inclusive, in `STRIPE_PRICE_BUILDER`
  and `STRIPE_PRICE_PRO` (`scripts/stripe-setup.mjs` does it). The plan always follows the
  price, so upgrades and downgrades in the customer portal just work.
  On a Stripe account shared with other products, App Builder tags its checkouts and
  subscriptions (`metadata.app = app_builder`) and the webhook ignores everything else, so other
  products' events are acknowledged, never retried. Pin the endpoint's API version to one the
  account already uses if Stripe refuses a new one (accounts allow three versions); the handler
  needs `2025-03-31.basil` or later.
- **AI assistants (MCP):** nothing to register. Assistants discover everything from
  `https://app.example.com/.well-known/oauth-protected-resource/api/mcp` and register
  themselves. Users find the URL in Settings → Build from your AI assistant.
- **Email:** verify the sending domain in Resend and use it in `EMAIL_FROM`.

## Operating it

**Design first (mockups before the build).** A first plan now starts with web research
(Claude with Anthropic's web search tool, `RESEARCH_MODEL`, default Sonnet; `RESEARCH=0` turns
it off). After the plan, **Design my screens** runs a `design` job: the visual direction
(`DESIGN_MODEL`, default Opus), a mascot in three poses when the app suits one (cut out of a
green background on the worker), two options for the main screen with the better one kept
(`DESIGN_REVIEW_MODEL`, default Sonnet, also checks every mockup for a drawn phone frame or
leaked design notes and fixes them), then every other screen drawn to match. Users approve
each mockup or ask for a change (a `mockup` job redraws just that one). The build then sees
each screen's mockup, uses the mascot's poses as app images, and runs on
`DESIGN_BUILD_MODEL` (default Sonnet). Measured costs: research and plan about $0.30, the
design $2.05–3.20 (images about $0.14 each), a redraw about $0.20, the build from mockups
$1.25–2.10; one whole app about $3.60 (72 credits). Those figures are with Nano Banana Pro
($0.14 an image); the default is now Nano Banana 2.1 ($0.045 an image), which scored best in a
blind test of the image models on OpenRouter, so a design's images cost about a third as much. Credits: the design reserves 80, a
redraw 10, a build from mockups 60 (it includes the match check), so a free account can design and build one app. Images are
stored under `projects/<id>/design/` and served to the project's editors only. Cheaper setups: any model
setting can be an OpenRouter id (Gemini, DeepSeek; text-only build models build from the
mockups' written briefs), and `DETAIL_IMAGE_MODEL` can draw everything but the key screen's
options with a different image model. After a build from mockups the worker checks every
screen against its mockup and rebuilds the ones under 90% (up to two rounds); it renders the
screens with headless Chrome, so the worker needs `INSTALL_VIDEO_RENDERER=1` (the same Chrome the
promo videos use). Without it the check is skipped. `MATCH_STEP=0` turns it off; `MATCH_TARGET`,
`MATCH_ROUNDS` and `MATCH_FIXES_PER_ROUND` tune it. One live round on two NightRhythm screens
took them from 60% to 72% and 55% to 62% for $0.77.

- **Errors:** every server error (web requests and worker jobs) is one JSON line on stderr.
  Set `ERROR_WEBHOOK_URL` to also POST them to a Slack/Discord incoming webhook or a
  collector.
- **Releases:** production deploys from `main`. Work happens on a branch; a pull request into
  `main` runs CI (format, lint, types, unit tests, a production build, the end-to-end suite
  against production builds, and the Docker image with the worker's optional parts), and
  merging deploys. Protect `main` in GitHub (Settings → Branches: require the CI checks) so
  nothing reaches production without them.
- **Backups:** everything, including generated apps' App Cloud data, is in Postgres (plus
  uploads in the S3 bucket). The worker takes a `pg_dump` once a day into the bucket under
  `backups/postgres/` and keeps the newest 14 (`DB_BACKUP_KEEP`); on by default in production,
  `DB_BACKUP_ENABLED=0/1` to change that. It needs `INSTALL_PG_CLIENT=1` on the worker (a build
  argument: pg_dump 18 from the PostgreSQL repository; `PG_CLIENT_VERSION` must be at least the
  server's major version). To restore: download a dump from the bucket and run
  `pg_restore --clean --if-exists --no-owner --no-acl -d "$DATABASE_URL" <file>.dump`. Also
  turn on Railway's own volume backups for the Postgres service (its Backups tab) as a second
  copy, and keep `ENCRYPTION_KEY` and `BETTER_AUTH_SECRET` somewhere safe outside Railway:
  without `ENCRYPTION_KEY` every saved Expo, GitHub and store key is unreadable.
- **AI throughput:** the worker runs up to `WORKER_CONCURRENCY` jobs at once (default 12) and
  at most `MAX_MODEL_REQUESTS` model requests at once across them (default 24; a build writes
  all its screens in parallel), retrying rate-limited requests `MODEL_MAX_RETRIES` times
  (default 4). Raise `MAX_MODEL_REQUESTS` only as far as your Anthropic rate-limit tier allows.
- **Free credits:** once real email is set up, a step that spends credits needs a verified
  email (one inbox, one set of free credits); `REQUIRE_VERIFIED_EMAIL_FOR_AI=1/0` forces it on
  or off.
- **Your funnel:** `/admin/funnel` (for `ADMIN_EMAILS`) shows, for people who signed up in a
  period, how many verified, started a project, got a plan, built, edited, opened it on a phone,
  shipped something and pay, plus daily sign-ups, return visits and time to the first app.
- **Limits:** credits, run concurrency, the per-user run and project limits and App Cloud's
  storage caps are enforced in the database, so they hold across instances. The sign-in,
  sign-up and new-device rate limits (Better Auth and App Cloud) are kept in memory per web
  instance.
- **Housekeeping:** the worker deletes expired App Cloud sessions and anonymous app users who
  never saved anything (after 30 days) once an hour.
- **Phone previews** run a Metro dev server per project on the worker (ports from 8100). Phones
  reach them through `DEVICE_PREVIEW_DOMAIN` (a wildcard domain routed to port 8090, as on
  Railway above) or directly at `DEVICE_PREVIEW_HOST`; the compose file leaves them off
  (`DEVICE_PREVIEW_ENABLED=0`) until you set one up. Workers report what they run every 30
  seconds (`worker_heartbeat`), so while no worker runs them "Open on your phone" says so and
  points to Export instead of waiting.
