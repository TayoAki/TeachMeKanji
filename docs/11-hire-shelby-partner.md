# Hire Shelby in every app (partner API)

App Builder includes [Hire Shelby](https://hireshelby.com) (our in-app support chat, repo
`TayoAki/HShelby`) on the Builder and Pro plans:

- **On by default, per app, with a switch.** For a paying owner, App Builder creates their Hire
  Shelby workspace and one Hire Shelby app per project, and writes the app's ID into the
  generated app (`data/support-chat.ts`). The owner can switch it off per app. Free accounts keep
  the email fallback (or paste the App ID of a Hire Shelby account they pay for themselves).
- **No separate bill.** Partner workspaces count as subscribed in Hire Shelby while the owner's
  App Builder plan is paid.
- **AI replies cost credits.** Hire Shelby reports each AI reply's model cost; App Builder adds
  it up per app per day and charges the owner whole credits as it crosses each one (like in-app
  AI). When the owner runs out of credits, App Builder turns AI replies off for their workspace
  (the team still gets every message); they come back on when credits do.
- **The owner answers in Hire Shelby's dashboard.** App Builder's "Open support inbox" gives a
  one-time claim link the first time (sign up or sign in as the owner's email, join the workspace
  as owner), then the dashboard itself.

Hire Shelby never sends App Builder message content: only workspace and app state, and the cost
of AI replies.

## The API (implemented in HShelby, called by App Builder)

Base: `HIRESHELBY_API_URL` (e.g. `https://api.hireshelby.com`), prefix `/partner/v1`.
Auth: `Authorization: Bearer <HIRESHELBY_PARTNER_KEY>` (Hire Shelby: `PARTNER_API_KEY`).
Bodies and answers are JSON; errors use Hire Shelby's envelope
`{ "error": { "code", "message" } }`. `:externalId` is App Builder's user id for a workspace and
its project id for an app; every call is idempotent on them.

| Call | Body | Answer |
|---|---|---|
| `PUT /workspaces/:externalId` | `{ name, ownerEmail }` | `{ workspace }` |
| `PATCH /workspaces/:externalId` | `{ active?, aiAllowed?, ownerEmail? }` | `{ workspace }` |
| `POST /workspaces/:externalId/claim-link` | none | `{ url }` |
| `PUT /workspaces/:externalId/apps/:appExternalId` | `{ name, bundleId? }` | `{ app }` |
| `DELETE /workspaces/:externalId/apps/:appExternalId` | none | 204 |
| `GET /usage?after=<id>&limit=<n ≤ 500>` | none | `{ items, next }` |

- `workspace`: `{ externalId, active, aiAllowed, claimed, dashboardUrl }`. `claimed` is true once
  someone joined it. A new workspace starts `active: true, aiAllowed: true`.
- `app`: `{ externalId, appId, name }`, where `appId` is the public `app_…` ID the SDK takes.
- `items`: `{ id, workspaceExternalId, appExternalId, costUsd, createdAt }`, one per AI run on
  a partner app that called the model, oldest first; `id` is the run's (time-ordered) id and
  `next` the last one returned (pass it as `after`), or `null` when there's nothing new.
- `claim-link`: a one-time link for the workspace's `ownerEmail`, valid 7 days; once the
  workspace is claimed by that email, the dashboard URL.

## Instructions for the HShelby repo

Paste this into a Claude Code session on `TayoAki/HShelby` (or follow it by hand):

```text
Add a partner API so App Builder (our AI app builder) can include Hire Shelby in every app it
builds. Follow AGENTS.md, keep the style of apps/api, and run the checks before pushing.

1. Config. apps/api/src/env.ts: PARTNER_API_KEY (optional; at least 32 characters; when unset the
   partner routes answer 404) and PARTNER_NAME (default "appbuilder"). Add both to
   apps/api/.env.example and the Railway variables table in docs/BACKEND_PLAN.md.

2. Schema (packages/db, then npm run db:generate):
   - partner_workspaces: organization_id (pk, fk organizations, cascade), partner, external_id,
     owner_email, active (default true), ai_allowed (default true), created_at, updated_at;
     unique (partner, external_id).
   - partner_apps: app_id (pk, fk apps, cascade), partner, external_id; unique (partner,
     external_id).
   - partner_claims: token_hash (pk, sha256 of a random 32-byte token), organization_id (fk,
     cascade), email, expires_at, used_at.

3. Routes: apps/api/src/routes/partner.ts mounted at /partner/v1 in app.ts, behind a middleware
   that compares the bearer token with PARTNER_API_KEY in constant time (401 otherwise) and a
   per-key rate limit. Zod schemas in packages/contracts. Implement exactly the table in
   docs/11-hire-shelby-partner.md of the App Builder repo (TayoAki/TeachMeKanji), copied here:
   - PUT /workspaces/:externalId {name, ownerEmail}: create (or rename) an organization with a
     unique slug and its partner_workspaces row, no members yet. Answer
     {workspace: {externalId, active, aiAllowed, claimed, dashboardUrl}} where claimed = the org
     has at least one member and dashboardUrl is the dashboard's origin.
   - PATCH /workspaces/:externalId {active?, aiAllowed?, ownerEmail?}: update; same answer.
   - POST /workspaces/:externalId/claim-link: if a member with owner_email exists, answer
     {url: dashboardUrl}; else insert a partner_claims row (7 days) and answer
     {url: `${dashboard}/claim/${token}`}.
   - PUT /workspaces/:externalId/apps/:appExternalId {name, bundleId?}: create the app the way
     POST /api/apps does for {name} (public app_ ID, identity secret, setup conversation, audit
     event) without requireCanAddApp, plus its partner_apps row; on repeat, rename it. Answer
     {app: {externalId, appId: <publicId>, name}}.
   - DELETE /workspaces/:externalId/apps/:appExternalId: soft-delete like the dashboard's delete.
   - GET /usage?after&limit: ai_runs of partner apps that called the model (any non-zero
     tokens), ordered by id, after the cursor, at most limit (default 200, max 500). Each item
     {id, workspaceExternalId, appExternalId, costUsd, createdAt}; costUsd from the run's input,
     output, cache-read and cache-write tokens and a per-model price table you add to
     packages/core (claude-opus-5-5: $4 / $20 / $0.20 / $5 per million; the model the run used,
     AI_MODEL's default otherwise). Answer {items, next}.
   Every route only touches workspaces of PARTNER_NAME. Record audit events
   (partner.workspace.created, partner.app.created...).

4. Billing (apps/api/src/billing.ts): isActive(organizationId) is true when the org has an
   active partner_workspaces row (check it first, before Stripe and beta access). state() for
   such an org answers active: true with a "partner" marker, and the dashboard's Billing page and
   banners say "Included with App Builder" instead of offering Checkout.

5. AI (apps/api/src/ai/consider.ts): right after the settings.enabled check, return "disabled"
   when the conversation's org has a partner_workspaces row with ai_allowed = false. The team
   still gets the message as usual.

6. Claiming (sign-up and joining):
   - auth.ts user.create.before: while SIGNUPS=invite, also allow an email with an unused,
     unexpired partner_claims row.
   - user.create.after: don't create the personal workspace when the email has such a claim.
   - POST /api/partner-claims/:token/accept (session required): the token must be unused,
     unexpired and for the session user's email (403 otherwise); add the user as owner of the
     claim's organization (if not already a member), set the session's active organization,
     mark the claim used. Answer {organizationId}.
   - Dashboard page /claim/[token]: signed out, show sign-up / sign-in with the email prefilled
     and come back here after; signed in, call accept and go to the inbox; explain an expired or
     used link and offer the sign-in page.

7. Docs: docs/BACKEND_PLAN.md (a "Partner API" status entry), docs/SUBPROCESSORS.md (App Builder
   receives workspace and app state and AI reply costs, never message content) and the DPA draft
   in docs/legal if it lists recipients.

8. Tests (apps/api/test, against Postgres like the others): bad and missing key (401), no key
   configured (404); workspace and app upserts are idempotent; a partner workspace can add apps
   and reply without Stripe; PATCH active=false locks replies like an unpaid workspace;
   ai_allowed=false makes consider return "disabled"; usage paginates with the cursor and prices
   tokens; the claim flow: sign-up allowed by a claim while SIGNUPS=invite, no personal
   workspace, accept joins as owner, wrong email 403, used link refused; one partner can't touch
   another partner's workspaces.
```

## App Builder's side (this repo)

- `packages/core/src/hire-shelby.ts`: the client (`HIRESHELBY_API_URL`, `HIRESHELBY_PARTNER_KEY`
  on web and worker; without them, the manual App ID mode stays), workspace and app provisioning,
  the claim link, and two syncs the worker runs hourly: AI reply usage into credits
  (`support_ai_usage`, ledger reason `support_ai`) and each owner's workspace state
  (`active` = paid plan, `aiAllowed` = at least one credit).
- Provisioning happens when a paying owner's app is built, before a store build, and when the
  owner switches the chat on (Publish → In-app support chat). A free owner's app keeps the email
  fallback; after a downgrade, the next build switches its chat back to email.
