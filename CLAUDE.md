# Working in this repo

AI mobile app builder. Read `docs/02-architecture.md` before changing how generated apps,
the preview, or the agent work; `docs/03-build-plan.md` says what each phase delivers.

## Commands
- Install: `npm install` (npm 11 required; npm 10 crashes on this tree)
- Checks: `npm run format:check && npm run lint && npm run typecheck && npm test`
- E2E: `npm run test:e2e` (starts the web app on :3000 and the preview runtime on :3001)
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
  refusal fallback). Keep agent conversations append-only.
- One phase or feature per branch and PR.
