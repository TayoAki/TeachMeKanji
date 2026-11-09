# App Builder (working title)

A prompt-to-mobile-app platform. A user describes an app; an AI agent plans its screens,
generates an Expo / React Native app, and lets the user edit it by chat or by clicking
elements, preview it in the browser and on a phone, export it, build it for Android and iOS,
and publish it to the web.

**Status:** Phase 0 (foundations and spikes) is done. See the
[Phase 0 results](docs/04-phase-0-results.md).

## Docs

1. [Transcript review](docs/01-transcript-review.md): what the reference course builds, what
   it skips, vendor assessment, open decisions.
2. [Architecture](docs/02-architecture.md): system design, the generated-app contract, data
   model, agent pipeline, preview runtime.
3. [Build plan](docs/03-build-plan.md): phased milestones with acceptance criteria.
4. [Phase 0 results](docs/04-phase-0-results.md): what the spikes proved and what changed.

## Repository

| Path | What it is |
|------|------------|
| `apps/web` | Next.js app: product UI, auth, API |
| `apps/preview` | Preview runtime, served from its own origin; runs generated code in sandboxed iframes |
| `apps/worker` | Long-running jobs (agent runs, builds); Phase 0 spikes in `src/spikes/` |
| `packages/contract` | The generated-app contract: SDK pins, allowed imports, validator, route model |
| `packages/db` | Drizzle schema, migrations, client |
| `templates/expo-app` | Fixed files every generated app starts from |
| `fixtures/habit-tracker` | A hand-written "generated" app used by tests and spikes |

## Getting started

Requires Node 22 and **npm 11** (npm 10 can't install this dependency tree).

```bash
npm install -g npm@11
```

```bash
docker compose up -d
```

```bash
npm install
```

```bash
npm run db:migrate
```

```bash
cp .env.example apps/web/.env.local
```

```bash
npm run dev
```

The app runs on http://localhost:3000 and the preview runtime on http://localhost:3001. The
preview spike is at http://localhost:3000/spikes/preview.

| Command | What it does |
|---------|--------------|
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run typecheck` / `npm run lint` / `npm run format:check` | Static checks |
| `npm run spike:device` | Open the fixture app on your phone with Expo Go |
| `npm run spike:generate` | Generate a screen with Claude (needs `ANTHROPIC_API_KEY`) |
| `npm run spike:snack-check` | Show which Expo SDKs Snack supports |
