# App evaluations

Reports from `npm run eval -w @appbuilder/worker` (see
[08-app-quality-rubric.md](../08-app-quality-rubric.md)). Each was run live on the deployed
builder with two independent judges (Claude Opus 5.5) after the deterministic checks.

## The kanji app, three generator versions (2026-11-10)

Same prompt each time: *"A Japanese kanji learning app: daily flashcards with the kanji, its
readings and meaning, a quiz mode that tests meanings, and progress by JLPT level (N5 to N1)."*

| | [Before](kanji-v1-baseline.md) | [Four parts](kanji-v2-four-parts.md) | [Round 2](kanji-v3-round2.md) |
|---|---:|---:|---:|
| Onboarding / 15 | 0 | 15 | 15 |
| Paywall / 20 | 0 | 17.4 | 19.3 |
| Main app / 35 | 18.7 | 25.7 | 31.5 |
| Settings / 10 | 0 | 9 | 10 |
| Craft / 20 | 13.8 | 17.5 | 17.5 |
| **Total / 100** | **32.5** | **84.6** | **93.3** |
| Build time | 3m14s | 9m54s | 7m32s |
| Build cost | 30 credits ($1.50) | 60 credits (~$3.00, at the cap) | 67 credits ($3.35) |
| Review cost | $0.40 | $0.70 | $0.70 |

- **Before**: no onboarding, paywall or settings; ~8 kanji; hand-rolled headers; no shareable
  moment.
- **Four parts** (the four-part structure, plan product fields, role prompts, validator
  checks): every part present and wired. Judges' remaining points: ~7 kanji, a reminder step
  that scheduled nothing, offers below the paywall's fold, a text-only share.
- **Round 2** (30–60 entries of reference content, plan only what the app can build, offers in
  the first screenful, screenshot-worthy share card, one generation wave): ~47 kanji, every
  control works, settings complete.

## What the judges still ask for (next steps)

- **More content than one generation can write**: grown step by step instead. Select a screen
  on the canvas and ask in the chat ("add 30 more N4 kanji"); edits add new
  `data/content/<name>.ts` files that `data/seed.ts` merges, rather than rewriting one big file.
- **Image sharing and daily reminders**: added (`useShareImage()` and `useReminder()`, built on
  react-native-view-shot, expo-sharing and expo-notifications, all in Expo Go).
- **Template API**: `restorePurchases()` should return its error, not only a boolean.
- **Cost**: a seven-screen build is ~$3.35 at high effort. Candidates to A/B with this
  harness: medium effort for the structure screens, Sonnet 5.5 for builds.
