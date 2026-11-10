# Storyboard: App Builder hero film "Kanjiwa" (v1)

**Runtime:** 40.5 s · **Master:** 1920×1080 @ 60 fps · **Vertical:** 1080×1920 @ 30 fps ·
**Sound plan:** silent (no bed, no narration) · Timing source: `script.ts` (all beats in seconds)

## Beat sheet

| # | Time | Beat | Lands on |
|---|---|---|---|
| F0 | 0:00 | Poster: the paywall of a finished app, already in a push-out | frame 0 |
| B1 | 0:00–0:03.2 | Hook: camera pulls back from the paywall to all 7 screens on the canvas | settle at 2.3 s |
| K1 | 0:03.2–0:04.6 | Type: "Describe your app idea." | 4 words, 1.1 s hold |
| B2 | 0:04.6–0:10.3 | Prompt box: click, the idea is typed (17 cps), send | send click 10.12 |
| B3 | 0:10.3–0:14.6 | Plan card in the chat; push to the paywall's prices; Confirm & build | click 14.45 |
| B4 | 0:14.6–0:20.8 | Pull back to the whole workspace as the 7 screens arrive (marquee); push to the canvas | ready 18.25 |
| K2 | 0:20.8–0:22.8 | Type: "Onboarding, paywall and settings, built in." | 7 words, 1.7 s |
| B5 | 0:22.8–0:29.0 | Read the canvas hint "(free)"; push to the paywall; double-click the headline, retype it, click away; "Saved", Version 2 | click away 27.25 |
| B6 | 0:29.0–0:36.8 | ⋯ → Store listing; hold on name/subtitle/promo with counts; Make screenshots; hold on the 5 store screenshots (payoff) | payoff hold 34.25–36.8 |
| B7 | 0:36.8–0:40.5 | Lockup + "Start free with 100 credits" | clean 2.9 s hold |

## Shot cards

### B1: Hook (poster)
- **Shot:** recreated workspace; canvas at 36% zoom so all 7 frames fit; frames are production captures.
- **Camera:** (paywall, scale 3.0) → 0:02.3 canvas framing (scale 1.58, canvas fills the frame); hold.
- **Cursor:** none (nobody is acting yet).
- **Evidence:** evidence/v3-screen-0…6.png, v3-workspace.png; canvas.tsx.
- **Hold:** 0.9 s on the full row; the part chips (ONBOARDING · PAYWALL · MAIN APP · SETTINGS) carry the read.

### K1: "Describe your app idea."
- Kinetic type on the product background with the canvas dot grid; words rise in 40 ms apart; 1.1 s hold.

### B2: Prompt
- **Shot:** PromptBox (prompt-box.tsx) with placeholder, Reference images, "iOS & Android", send, suggestion chips.
- **Camera:** 1.55 → 1.8 push, settled 0.1 s before the click; hold while typing.
- **Cursor:** enters bottom-right edge (4.65) → textarea (5.32), click 5.40 → moves aside below the box → send (10.08), click 10.12.
- **On-screen change:** focus ring + caret on click; 71 characters at 17 cps; send shows the spinner.
- **Evidence:** prompt-box.tsx (copy, controls, sizes).

### B3: Plan
- **Shot:** chat panel (chat-panel.tsx): the prompt bubble, then the plan card for "Kanjiwa · Plan 1"; the panel is scrolled to the newest message as the product does. Canvas empty state "Review the plan in the chat · Confirm it to build 7 screens".
- **Camera:** wide (scale 1.67) with the empty state readable → 11.9–12.6 push to the paywall line and prices (2.8, rest dimmed 50%) → 13.5–14.15 down to Confirm & build.
- **Cursor:** enters bottom-left (13.65) → Confirm & build (14.35), click 14.45 → exits bottom.
- **On-screen change:** button spinner; footer "Designing the theme, data and shared components".
- **Evidence:** v3-info.json (plan text), chat-panel.tsx, workspace.tsx empty states.

### B4: Build (marquee)
- **Shot:** whole workspace at scale 1.0, then the canvas.
- **Camera:** 14.6–15.9 pull back to the whole workspace (marquee); hold; 17.55–18.5 push to the canvas; hold to 20.8.
- **On-screen change:** frames arrive left to right every 0.38 s with a dashed "Building…" slot after the last; footer "Built N of 7 screens"; at 18.25 "Ready · Version 1" and the ready message.
- **Evidence:** agents.ts step labels ("Built N of 7 screens"), canvas.tsx building placeholder, READY text from v3-info.json.

### K2: "Onboarding, paywall and settings, built in."
- 7 words, 1.7 s hold. True of every generated app (the 4-part structure is the default).

### B5: Edit text yourself
- **Shot:** canvas hint pill "Click a screen to change it in the chat · Double-click text to edit it yourself (free)" + the paywall frame.
- **Camera:** scale 2.3 hold on pill + paywall (1.2 s) → push to the paywall headline (4.6), rest dimmed → 27.4–28.3 pull back to the whole workspace.
- **Cursor:** enters left (24.25) → headline (25.0), double-click 25.05/25.18 → aside into the gap between frames → click on the canvas 27.25 (click-away saves).
- **On-screen change:** #2563eb outline + whole text selected; first key reflows the headline from 3 lines to 1 (the real capture); "Go all the way to N1" typed at 15 cps; click-away → outline gone, "Saved" toast, footer "Version 2".
- **Evidence:** selection.ts (outline, select-all, Enter/click-away saves), workspace.tsx (toast "Saved"), evidence/v3-paywall-*.png and v3-paywall-headline.json (boxes, font 26/31 Inter Bold).
- **Hold:** 0.3 s after the last key, then the click.

### B6: Store listing (payoff)
- **Shot:** project menu (Rename, Duplicate, Store listing, Delete); Store listing dialog with production's copy; the 5 framed store screenshots.
- **Camera:** push to the sidebar header (2.4) → dialog fields (2.05, 1.2 s hold) → buttons (2.0) → screenshot row (2.4, 2.55 s hold).
- **Cursor:** ⋯ click 29.95 → Store listing 30.55 → rests outside the dialog → Make screenshots 33.35 → exits bottom.
- **On-screen change:** menu (fade + 95% zoom), dialog (overlay + blur, 96% zoom-in), button spinner, screenshots appear one by one 0.22 s apart.
- **Evidence:** v3-listing-dialog.png, v3-listing-shots.png, v3-store-0…4.png, store-listing-dialog.tsx.

### B7: Close
- Lockup from the site header ("AB" tile + "App Builder"), the landing badge line "Expo · React Native · iOS & Android", CTA "Start free with 100 credits". 2.9 s clean hold.

## Vertical (9:16) per-beat camera notes
- **F0/B1:** recomposed "tall canvas" (the same 7 captures wrapped into 3 columns, labels ×2): open on the paywall at 1.75, pull back to rows 1–2 at 1.0. Burned-in text hook "Your app idea, paywall included." from frame 0 in a band at y 96–240; canvas hint and status hidden under it.
- **K1/K2:** same type, 104/96 px, max 860 px wide so it stays left of the right 10%.
- **B2:** the prompt box at 480 px wide (no chips), camera 1.75 → 2.0; the idea wraps to two lines.
- **B3:** the real workspace world, camera 3.4–3.6 on the chat panel only (it fills the width); tilt from the plan to the prices to Confirm & build.
- **B4:** cut to the tall canvas: frames arrive in the grid at 1.0, then pull back to 0.76 to show all 7 (marquee). The footer status is shown under the canvas hint (recomposition).
- **B5:** tall canvas: hint pill (two lines, 22 px) + paywall at 1.25 → push to the headline at 3.3 → back to 1.25; "Saved" toast placed at y 1360, inside the safe area.
- **B6:** chat header at 3.6 for the menu, then the dialog at its narrow layout (460 px: fields stack, screenshots 3 per row, as the product's grids do below 640 px) at 2.0; the payoff grid sits between y 394 and 1528, clear of the bottom 20%.
- **B7:** lockup at 1.6×.

## Sound plan
- **Music:** none (silent by default; the film must read muted). If a licensed bed is supplied later, cut K1, the marquee settle (18.5 s), K2 and the lockup to its beats.
- **Narration:** none.
- **Mix targets:** n/a (no audio stream).

## Truth notes
- **Recreations:** every shot is a stylized recreation, in React, of production's workspace (rail, chat panel, plan card, canvas, preview panel, footer, project menu, Store listing dialog, sonner toast) from the component source and production captures of 2026-11-10. The phone screens inside the frames are real captures of the Kanjiwa app on production; the store screenshots are the real images production made for it.
- **Scenario data:** the Kanjiwa project (plan, prices $3.99 / $24.99 / $49.99, listing copy, screens) is real production data from a demo account. The prompt is shortened: production's prompt was "A Japanese kanji learning app: daily flashcards with the kanji, its readings and meaning, a quiz mode that tests meanings, and progress by JLPT level (N5 to N1)."; the film types "A kanji app: daily flashcards, a meaning quiz, progress from N5 to N1." The user initial "K" is the demo account's.
- **The edit:** the selected state and the "after" frame were rendered by production's own preview runtime in a headless browser, with the text changed only in that browser's page (nothing was saved). The typed characters are drawn on top in the same font (Inter Bold 26/31) at the measured box. The real edit saves a new version; that save is not shown as anything but the product's "Saved" toast.
- **Staged timing:** planning, building and screenshot capture are compressed (production builds take minutes); no durations or timers are shown. Frames arrive left to right; production builds screens in parallel and shows each as it finishes.
- **Simplifications:** canvas frame labels drop the file names; the canvas is shown at 36% zoom with a 28 px gap so all 7 frames fit; the description field is clamped to 2 lines so the screenshots sit in view without scrolling the dialog; the credits counter is left out of the footer; the preview panel shows App Cloud and Payments but not Themes; the plan card's "Data:" line and "Core loop" are left out; the canvas hint and status move above the grid in the vertical.
- **Differences from the live product:** production's Keywords field overflows into the Category field (long comma-separated keywords don't wrap); the film wraps them. Production's plan card is taller (the chat scrolls). The Analytics tab being built now is not in the film.

## Checkpoint tests (animatic)
- **Frame 0 as poster:** 16:9 opens on the Kanjiwa paywall (prices, "Start free trial") with
  Onboarding and Home either side, already pulling back; 9:16 adds the text hook. Both read as
  "an app with a paywall", no logo, no empty state. Pass.
- **Muted comprehension:** the story reads without sound: idea typed → plan with prices →
  7 screens arrive → "Onboarding, paywall and settings, built in." → headline retyped, "Saved"
  → store listing + screenshots → lockup and CTA. Pass (judged by me, not yet by a viewer).
- **360 px legibility (out/legibility/):** 9:16 — the text hook, plan prices, the retyped
  headline and the store-shot captions read; the listing field values are small but readable.
  16:9 (site hero, judged at 360 px as the skill asks) — the retyped headline and kinetic type
  read; plan prices are marginal; the store-shot captions and canvas labels do not. The 16:9 is
  for desktop, where they read at 1920 px.
- **Every shot earns its time:** the plan wide shot (10.3–11.9 s) is the weakest: two thirds of
  the frame is the empty canvas. It stays because "Confirm it to build 7 screens" sets up the
  build. Candidate cut if the team wants 37 s: start B3 on the prices push.
- **Determinism:** frames 300, 1530, 2100 of ProductFilm re-rendered out of order: byte-identical.

## Open choices for the team
1. CTA wording and whether to burn in a URL (needs the real domain).
2. Hero copy in the kinetic type: K2 could carry the CMBA line instead ("Onboarding, paywall and settings, built in" is safe and true today).
3. A licensed music bed for the vertical (TikTok/Reels usually expect sound); the 16:9 site hero stays silent.
4. Whether to show Light/Night: Kanjiwa predates the app appearance switch; showing it needs a newer project (e.g. Kanjiro) and a different payoff app.

---

# v2 (approved board → release): 9:16 re-cut to the narration, 16:9 v1.1

**Approval:** board approved by the user ("the tiktok video can be better but overall looks good").
The 16:9 is v1 plus one change (v1.1): the store-listing camera now goes down the left column and
holds below the Google Play short description, so production's truncated value ("…and finish
with a") never enters the frame. The v1 vertical stays as composition `ProductFilmVerticalV1`.

**9:16 v2:** 1080×1920 @ 30 fps, 36.0 s, sound on. Composition `ProductFilmVertical`
(`ProductFilmVerticalV2.tsx`), timing in `V` (that file) and `vo.ts`.

**Sound plan (v2):**
- **Narration:** `audio/vo.mp3` (ElevenLabs v3, voice "Liam", 33.88 s) → `vo_master.wav`:
  70 Hz high-pass + two-pass loudnorm to −16 LUFS (measured −16.4 LUFS, −1.5 dBTP), at unity.
- **Music:** `audio/music.mp3` ("Launchpad", Suno, 124.8 s, 112.35 BPM, beat 0.5341 s), file offset
  88.45 s: the drop at 102.98 s lands on the build pull-back (14.53 s); the hit at 119.676 s lands
  at 31.226 s, on "App Builder" (31.26 s); the ring-out is inaudible by ~124.3 s, so the film ends
  at 36.0 s.
- **Ducking (vo.ts `musicDb`):** −11 dB under speech (120 ms attack, 400 ms release), −5 dB in
  gaps > 0.6 s, −2 dB after the last word (33.64 s).
- **Master:** the Remotion mix measured −16.7 LUFS / −3.1 dBTP; +2.7 dB gain and a limiter at
  −1.9 dBFS sample peak (ffmpeg, `scripts/release.sh`). Measured on the encoded master:
  −14.2 LUFS integrated, LRA 4.6 LU, true peak −1.8 dBTP.
- **Analysis path:** `analyze_audio.py` with faster-whisper small.en (the model downloaded through
  the proxy) and librosa. Whisper's word times were corrected against silencedetect on the original
  file (−35 dB, 0.15 s): "already" starts at 4.27 s, not 3.50 s.

**Layout:** text-hook band (y 110–290, hook only), a rounded content window (x 30–970,
y 310–1290) the camera works inside, a caption band (y 1316–1510). Bottom 20% and right 10% clear.
K1/K2 kinetic type dropped: the captions carry the words.

## v2 beat sheet (lands on)

| # | Time | Shot | Lands on |
|---|---|---|---|
| V1 | 0.00–5.98 | Hook: Kanjiwa paywall, phone 78% of the width, already tilting from the headline to the offers; text hook "Your app idea, paywall included." | VO 0.00 "What if…"; "paywall" 2.82; "already built?" 4.27 |
| V2 | 5.98–9.55 | Prompt box (480 px, ×1.95): click 6.20, idea typed at 24 cps (6.32–9.28), send 9.42 | cut on the beat 5.98; "Describe" 6.15 |
| V3a | 9.55–12.39 | Plan card arrives (9.60); list from item 1, tilt to item 7 on "every screen" | "First, you get a plan" 9.55; "every screen" 11.38 |
| V3b | 12.39–13.86 | Close on the paywall line and prices ($3.99 / $24.99 / $49.99) | "and what premium costs" 12.39 |
| V3c | 13.86–14.34 | Confirm & build, clicked 14.05 | gap 13.85–14.34 |
| V4 | 14.34–16.13 | Frames arrive (14.36 + 0.12 s each); pull back on the drop (14.53) to all 7 in a 4+3 grid (the one marquee) | "Then it builds the real app" 14.34; drop 14.53 |
| V5 | 16.13–17.00 | Onboarding, full width | "onboarding" 16.16 (cut on beat 16.13) |
| V6 | 17.00–19.34 | Paywall, lower half (scrolled capture): Start free trial, renewal line, Restore Purchases, renewal terms, test-mode note | "a paywall with restore and renewal terms" 17.00 |
| V7 | 19.34–20.94 | Settings: Subscription, Restore Purchases | "and settings" (cut on beat 19.34) |
| V8 | 20.94–25.75 | Paywall headline, full width; double-click 22.18/22.30; selected; typed "Go all the way to N1" 22.95–23.95; click away 24.25; "Saved" toast | "Don't like a headline?" 20.96; "Double-click" 22.16; "and type" 22.95; "Your own edits are free" 24.21 |
| V9 | 25.75–26.60 | Project menu: ⋯ 25.98, Store listing 26.45 | cut on beat 25.75; "It even writes" 25.98 |
| V10 | 26.60–27.88 | Store listing dialog (narrow): title, Name, Subtitle, Promotional text. The Google Play field below stays out of frame | "store listing" 26.96 |
| V11 | 27.88–28.42 | Description + buttons; Make screenshots 27.99; screenshots fill in | "and frames your screenshots" 27.99 (cut on beat 27.88) |
| V12 | 28.42–31.23 | The 5 store screenshots one at a time, each 68% of the width, cut on beats 28.42 / 28.95 / 29.49 / 30.02 / 30.55 | "screenshots" 28.90; "for both stores" 29.40 |
| V13 | 31.23–36.00 | Lockup on the hit; CTA "Start free with 100 credits" | hit 31.226 = "App Builder" 31.26; "Start free" 32.28; ring-out to 36.0 |

## v2 truth notes (in addition to v1's)
- V6 uses a second production capture of the paywall, scrolled inside the app's own scroll view in
  a headless browser (writes blocked); the film cuts to it rather than showing the scroll.
- The canvas in the vertical is the same 7 captures in 4 columns (recomposition, not the product's
  row); the canvas hint pill and status line are not shown in the vertical.
- The narrow Store listing dialog keeps every field in the product's order; the camera frames out
  the Google Play short description.
- Captions are the script as spoken ("a hundred credits"); the on-screen CTA keeps the site's "100".
- Staged timing as before: the build, the screenshot capture and the edit are compressed; nothing
  shows a duration.
- Licensing: ElevenLabs (voice) and Suno (music) need the paid plans that grant commercial use;
  the user must confirm both before publishing. Geist and Inter are OFL; Remotion needs a company
  licence above 3 people.
