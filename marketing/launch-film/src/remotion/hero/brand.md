# App Builder brand kit (films)

- **Tokens:** `brand.ts`, copied from `apps/web/src/app/globals.css` (`.dark`, the product default).
  Neutral shadcn palette: background oklch(0.145), card/sidebar oklch(0.205), muted oklch(0.269),
  muted text oklch(0.708), primary oklch(0.922) on primary-foreground oklch(0.205), borders white 10%.
  Radius 10px (`--radius: 0.625rem`).
- **Type:** Geist (sans) and Geist Mono, from the `geist` npm package (SIL OFL 1.1), as in
  `apps/web/src/app/layout.tsx`. Files in `video/public/fonts/`. The generated app's text is
  Inter Bold (system font stack on the capture machine; Inter is OFL).
- **Lockup:** the real one from the site header: a rounded square tile in `primary` with "AB" in
  bold `primary-foreground`, then "App Builder" in semibold. No other logo exists; don't invent one.
- **CTA that is true today:** "Start free with 100 credits" (pricing page: "100 credits to start
  (about one app)"; `PLANS.free.signupCredits = 100`). The site's own button says "Get started".
- **Product vs marketing surfaces:** the product is dark and neutral; colour comes from the
  generated apps (here Kanjiwa's Sumi Night gold). Films keep the chrome neutral and let the app
  carry the colour.
- **Motion feel:** calm, eased holds; no bouncy springs; the product uses tw-animate-css fades and
  96% zoom-ins for dialogs and menus.
