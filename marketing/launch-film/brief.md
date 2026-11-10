# Brief: App Builder hero film ("Kanjiwa")

- **Format:** Product Film. No footage was supplied; the product carries the story.
- **Story:** hero film. One idea becomes a subscription app with onboarding, a paywall and
  settings; the founder retypes the paywall headline themselves; the store listing is written
  and the store screenshots are made.
- **Audience:** first-time founders with a subscription app idea (habit, learning, wellness), from
  the CMBA UVP. Not developers.
- **Destinations:** site hero (16:9, autoplays muted) and Reels / Shorts / TikTok (9:16).
- **Runtime:** 40.5 s (the shortest that lands idea → plan → build → edit → listing → close).
- **Masters and cutdowns:** 16:9 1920×1080 @ 60 fps (master); 9:16 1080×1920 @ 30 fps,
  recomposed shot by shot. LinkedIn 30 fps and 1:1 / 4:5 not requested.
- **Sound:** silent (must read muted). No music bed or narration supplied.
- **Captions:** none on the 16:9 (no narration). 9:16: burned-in text hook from frame 0
  ("Your app idea, paywall included."), clear of the bottom 20% and right 10%.
- **Product evidence:** production https://web-production-ea8f8.up.railway.app, project
  "Kanjiwa" (a real app Claude built there), walked read-only with Playwright; login from
  `scratchpad/smoke/live-v3-account.json` (values never printed). Captures in `evidence/`.
  Component source in the repo (apps/web/src/components/workspace/*, shell/*, prompt-box.tsx,
  apps/preview/src/selection.ts). Older screenshots in `scratchpad/smoke/` and `scratchpad/shots/`.
- **Brand:** built here: `src/remotion/hero/brand.ts` + `brand.md` (tokens from globals.css .dark,
  Geist fonts from the `geist` package, OFL).
- **Truth boundary:**
  - may show: prompt → plan → build → canvas of 7 real screens (onboarding, paywall, main,
    settings); the in-place text edit (free, per the pricing page and the canvas hint); the
    "Saved" toast and version bump; the Store listing dialog with the copy production wrote;
    the 5 store screenshots production made; the Payments panel's "Test mode" note.
  - must not show or claim: a completed real purchase, a TestFlight or Google Play upload,
    a push notification arriving, in-app AI answering (none verified with real accounts); build
    or edit durations ("took 2 min"); user counts, ratings, testimonials, revenue.
  - naming rules: none recorded yet. No vendor logos added; RevenueCat appears only as the
    product's own panel copy ("Connect RevenueCat to sell in store builds").
  - pre-release features: none shown. (The Analytics tab being built today is not shown; the
    film follows production's tabs: Canvas, Data, Code, History.)
- **CTA and URL:** "Start free with 100 credits" (pricing page: "100 credits to start (about one
  app)"). No URL burned in: the production domain is a railway.app subdomain; add the real
  domain when there is one.
- **Licences:** Geist and Inter are SIL OFL. Remotion 4.0.539 is free for individuals and
  companies of up to 3 people; a larger team needs a Remotion company licence.
- **Blocking question:** none.
