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
| worker | `npm run start -w @appbuilder/worker` | No domain; `DEVICE_PREVIEW_ENABLED=0` (Railway exposes HTTP domains, not the raw ports Metro needs) |

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
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | Sessions. The URL is the app's public `https://` origin; it is also the OAuth issuer, and AI assistants connect to `$BETTER_AUTH_URL/api/mcp` |
| `ENCRYPTION_KEY` | Encrypts users' GitHub and Expo tokens (no fallback in production) |
| `NEXT_PUBLIC_PREVIEW_ORIGIN` (build time), `PREVIEW_ALLOWED_PARENTS` | The preview origin, and the app origin it trusts |
| `APP_PUBLIC_URL` | The origin generated apps call for App Cloud; phones must be able to reach it |
| `ANTHROPIC_API_KEY` | The built-in agent (Free and Pro). Studio users bring their own AI over MCP; leave `LLM_PROVIDER` empty |
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
  two monthly prices, Studio ($49) and Pro ($99), in `STRIPE_PRICE_STUDIO` and
  `STRIPE_PRICE_PRO`. The plan always follows the price, so upgrades and downgrades in the
  customer portal just work.
- **AI assistants (MCP):** nothing to register. Assistants discover everything from
  `https://app.example.com/.well-known/oauth-protected-resource/api/mcp` and register
  themselves. Users find the URL in Settings → Build from your AI assistant.
- **Email:** verify the sending domain in Resend and use it in `EMAIL_FROM`.

## Operating it

- **Errors:** every server error (web requests and worker jobs) is one JSON line on stderr.
  Set `ERROR_WEBHOOK_URL` to also POST them to a Slack/Discord incoming webhook or a
  collector.
- **Backups:** everything, including generated apps' App Cloud data, is in Postgres (plus
  uploads in S3 or the `/data` volume). Back up both, for example a nightly `pg_dump`.
- **Limits:** credits, run concurrency, the per-user run and project limits and App Cloud's
  storage caps are enforced in the database, so they hold across instances. The sign-in,
  sign-up and new-device rate limits (Better Auth and App Cloud) are kept in memory per web
  instance.
- **Housekeeping:** the worker deletes expired App Cloud sessions and anonymous app users who
  never saved anything (after 30 days) once an hour.
- **Phone previews** run a Metro dev server per project on the worker (ports from 8100). Phones
  must reach those ports at `DEVICE_PREVIEW_HOST`; the compose file leaves them off
  (`DEVICE_PREVIEW_ENABLED=0`) until you expose them. Workers report what they run every 30
  seconds (`worker_heartbeat`), so while no worker runs them "Open on your phone" says so and
  points to Export instead of waiting.
