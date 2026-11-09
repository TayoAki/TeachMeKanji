# Working in this repo

AI mobile app builder. Read `docs/02-architecture.md` before changing how generated apps,
the preview, or the agent work; `docs/03-build-plan.md` says what each phase delivers.

## Commands
- Install: `npm install` (npm 11 required; npm 10 crashes on this tree). Config: one root `.env`.
- Run: `npm run dev` (web :3000, preview runtime :3001, worker). `LLM_PROVIDER=fake` runs without AI.
- Checks: `npm run format:check && npm run lint && npm run typecheck && npm test`
- E2E: `npm run test:e2e` (starts web, preview runtime and worker with the offline generator);
  `E2E_PROD=1` runs it against production builds
- Deploy: `Dockerfile` + `docker-compose.prod.yml`, see `docs/06-deploy.md`
- DB: edit `packages/db/src/schema/`, then `npm run db:generate`, then `npm run db:migrate`

## Rules that keep the system working
- **The contract is the source of truth.** Allowed imports, SDK pins and validation rules
  live in `packages/contract`. If you change what generated code may import, update
  `allowed.ts`, the preview's `apps/preview/src/vendor.ts` (a test enforces the match) and
  the template together.
- **Generated code never runs on the app origin.** Only the preview origin, in an iframe with
  `sandbox="allow-scripts"` and no `allow-same-origin`.
- **Browser code imports `@appbuilder/contract/protocol`**, not the package root, which pulls
  in Babel and Sucrase.
- `apps/web` uses Next.js 16 with Cache Components; read `apps/web/AGENTS.md` and the bundled
  docs in `node_modules/next/dist/docs/` before writing Next.js code.
- LLM calls go through `apps/worker/src/generation/client.ts` (Anthropic SDK, streaming,
  refusal fallback). Keep agent conversations append-only. The offline provider
  (`fake-provider.ts`) must keep answering in the same wire formats as the real model.
- Every API route goes through `route()` and `requireProject()`/`requireViewer()` in
  `apps/web/src/lib/server.ts`; permissions are decided only in `packages/core/src/authz.ts`.
  The exception is App Cloud (`/api/app/<projectId>/...`), the API generated apps call: it uses
  `appRoute()` in `apps/web/src/lib/app-cloud-http.ts`, bearer tokens only, never cookies.
- `data/backend.ts` in generated apps is written only by the platform
  (`packages/contract/src/platform-config.ts`), never by the model.
- Read env vars with `||`, not `??`: `.env` files set unused keys to empty strings.
- Long work runs in the worker as an `agent_run`; the web app only enqueues and streams events.
- One phase or feature per branch and PR.
