# Team memory: App Builder (TayoAki/TeachMeKanji)

Read this at the start of every job. Save every correction as a rule with its reason.

## Product and access
- Repo: TayoAki/TeachMeKanji (monorepo: apps/web Next.js 16, apps/preview, apps/worker,
  packages/contract, packages/core). Film project is NOT in the repo yet: it lives in
  scratchpad/video/ with its own package.json (Remotion 4.0.539, React 19.3.0, geist 1.8.2,
  lucide-react 0.550.0 — same React/lucide as apps/web).
- Product URLs: production web https://web-production-ea8f8.up.railway.app, preview runtime
  https://preview-production-a228.up.railway.app. No staging.
- Local build command: `npm run dev` in the repo (web :3000, preview :3001, worker); with
  `LLM_PROVIDER=fake` it builds offline template apps (less impressive than real Claude builds).
- Stored login to use: `scratchpad/smoke/live-v3-account.json` (project "Kanjiwa": has the store
  listing and screenshots) and `scratchpad/smoke/live-v2-account.json` (project "Kanjiro": has
  the Light/Night app appearance switch, no listing). Load inside the Playwright script; never
  print the values.
- Evidence scripts: scratchpad/video/scripts/evidence.cjs (read-only walk: workspace, 7 canvas
  captures at 3×, store listing + client-side screenshots), scripts/edit-evidence.cjs (blocks
  every non-GET to the app origin; changes text only in the headless page to capture an edit).

## Brand kit
- Location: scratchpad/video/src/remotion/hero/brand.ts and brand.md.
- Fonts: Geist + Geist Mono woff2 from the `geist` npm package (OFL) in video/public/fonts;
  Inter Bold (OFL, /usr/share/fonts/opentype/inter) for text drawn inside generated-app captures
  (the capture machine renders the app's system font stack as Inter).
- Logo / lockup: "AB" rounded tile in primary (oklch 0.922) with bold primary-foreground text,
  then "App Builder" semibold. No other logo exists.
- CTA copy that is true today: "Start free with 100 credits" (PLANS.free.signupCredits = 100;
  pricing page "100 credits to start (about one app)"). Site button: "Get started".

## Recreated surfaces (reuse them)
| Surface | Component path | States built |
|---|---|---|
| Workspace shell (rail, sidebar, tabs, footer) | src/remotion/hero/ui/Workspace.tsx `Workspace` | plan, building (step text), ready, version N, dim focus |
| Chat panel + plan card + ready message | ui/Workspace.tsx `ChatPanel` | prompt bubble, plan (busy confirm), ready; auto-scroll to newest |
| Canvas frames row/grid + hint pill + toolbar | ui/Workspace.tsx `CanvasFrames`, `CanvasHint` | arrival per frame, Building… slot, label scale |
| Right panel (preview, App Cloud, Payments test mode) | ui/Workspace.tsx `RightPanel` | before/after build |
| Project menu | ui/Workspace.tsx `Menu` | open, hover Store listing |
| Sonner toast "Saved" | ui/Workspace.tsx `Toast` | in/out |
| Phone capture + in-place edit overlay | ui/Phone.tsx `Phone`, `HeadlineEdit` | selected (outline + selection), typing (reflowed), done |
| Prompt box | ui/PromptBox.tsx | empty, focused, typing, busy |
| Store listing dialog | ui/StoreListing.tsx | wide (2-col fields, 5 shots/row), narrow (1-col, 3 shots/row), busy, shots arriving |
| Kinetic type, lockup | ui/Type.tsx | — |
| Tall canvas (9:16 v1 recomposition) | ProductFilmVertical.tsx `TallCanvas` | chrome on/off |
| 4-column canvas world, window, captions, text hook, toast (9:16 v2) | ProductFilmVerticalV2.tsx | big single-phone shots, marquee grid, scrolled paywall capture |
| Soundtrack (VO + ducked music) | audio.tsx, vo.ts | ducking envelope, cues |
| Fit cut (master in 9:16) + FitSoundtrack | ProductFilmVerticalFit.tsx, fit.ts, audio.tsx | phrases on master beats, cues, lift/launchpad music |
| Music cue editor + SFX synth | scripts/lift_cue.py | beat-grid edits, ticks, whoosh, success, sparkle, chime |

## Taste (approved)
- 16:9 board approved as is (2026-11-10): calm eased holds, one marquee (pull back to the whole
  workspace while the screens arrive), dim 50% outside the subject, cursor 34 px; silent hero.
- Vertical: the user said "the tiktok video can be better". Rules from that note: bigger phones
  (one phone ≈ 70–80% of the width for hook, edit and payoff); tiny multi-column grids only for
  the one marquee; cut the slow wide shots; type fast (≈ 24 cps); frame 0 already moving.
- Vertical layout: text-hook band at the top, a rounded content window (x 30–970, y 310–1290),
  caption band below it (y 1316–1510, Geist SemiBold 52 px, ≤ 2 lines ≤ 32 chars). Captions never
  over the phone subject; bottom 20% and right 10% left empty.
- Voice: ElevenLabs v3, voice "Liam" (supplied by the user; 70 Hz HPF + two-pass loudnorm to
  −16 LUFS, then unity). Music: "Launchpad" (Suno, 112.35 BPM), drop on the marquee, hit on the
  lockup; ducking −11 / −5 / −2 dB.
- Runtime and aspect defaults: hero 40.5 s 16:9 @ 60 (silent); vertical ≈ 36 s @ 30 with sound,
  ending on the music's ring-out.

- TikTok cut = the master fit into 9:16 with hook band + captions (user preference over a
  recomposed vertical, 2026-11-10). The recomposed v2 vertical exists but is not the one to ship.
- Music for the fit cut and the 16:9-with-sound: "Final Lift" (Suno, 147.4 BPM, bar 3.256 s,
  key ≈ C), edited on its own beat grid into a 40.5 s cue (scripts/lift_cue.py): 808 on frame 0,
  sparse bars under the dense VO, the drop on the build pull-back, the outro bar on the lockup, beat
  out after the last word; synthesized SFX on real cursor presses and confirmations, a C chime
  under the CTA. "Launchpad" was the first choice and is superseded.
- The silent 16:9 master stays the homepage autoplay file; the with-sound copy is a stream copy.

## Rules (each with its reason)
- Keep production's truncated Google Play short description ("…and finish with a") out of frame,
  in every cut: it reads as a bug (it is one: the listing trim cuts mid-phrase).
- Captions use the words as spoken ("a hundred credits"), brand spelled "App Builder"; whisper
  writes "100" and mis-times words after pauses, so check word times against silencedetect.
- ElevenLabs and Suno output need the paid plans that grant commercial use; ask the user to confirm
  before anything is published.
- Never show a completed real purchase, TestFlight/Play upload, push or in-app AI answer:
  none of them has been verified with real accounts (as of 2026-11-10).
- Never show build or edit durations: builds take minutes and the film compresses them.
- Read-only on production: no runs, prompts, purchases, theme picks (theme picks write a
  version), Store listing "Write the listing" (a paid run). "Make screenshots" and the
  Light/Night switch are client-only and safe.
- Follow production's UI, not the working tree: features on unmerged branches (e.g. the
  Analytics tab) stay out until deployed.

## Films made
| Version | Date | Cuts | Notes |
|---|---|---|---|
| hero v1 (board) | 2026-11-10 | 16:9 animatic, 9:16 animatic | Kanjiwa; approved |
| hero v1.1 + vertical v2 | 2026-11-10 | 16:9 master 60 fps (silent), 9:16 30 fps with VO + music, SRT, web previews | listing camera keeps the Google Play field out; vertical re-cut to the VO |
| fit cut + 16:9 with sound | 2026-11-10 | vertical-fit-9x16-30fps.mp4, master-16x9-60fps-audio.mp4, SRTs, previews (Launchpad version kept as vertical-fit-launchpad) | VO re-placed on the master's beats; Final Lift cue + SFX |
