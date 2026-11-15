# Studio apps

Apps built by hand, in the same format the factory generates: each folder holds only the app's own
files (`app/`, `components/`, `data/`, `theme/tokens.ts`, `app.json`), layered on
`templates/expo-app`, which brings the platform's files (navigation shell, theme, data layer,
purchases, analytics, notifications, photos, the motion kit). So a studio app gets every platform
fix, passes the same contract (`apps/preview/src/studio.test.ts` checks it), and can go through the
factory's preview, AI tester and App Store pipeline.

## Closetcast (`stylist/`)

Your closet, styled for today's weather: a daily outfit from what you own, with the AI or (when
it's unreachable) the app's own styling rules; shop any look you screenshot, starting with what you
already own; rate your fit with swaps from your closet.

Run it on its own:

```bash
npm run studio:export -- stylist ../closetcast
cd ../closetcast && npm install && npx expo start
```

The AI features (photo tagging, shop the look, fit rating and AI outfit picks) call App Cloud, which
the factory turns on when the app is registered there; without it they fall back to the styling
rules or ask the person to fill a piece in by hand.
