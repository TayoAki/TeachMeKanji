# App Builder launch film

The product film for App Builder, made with the Sizzle method: the workspace is recreated in
React and rendered with [Remotion](https://www.remotion.dev), frame by frame, so any frame can be
re-rendered when the UI changes. The phone screens and store screenshots in `video/public/app/`
are captures of the real Kanjiwa demo app on production.

It's a separate project (its own `package.json`), not part of the monorepo's workspaces.

## Cuts

| Composition | Use | Size |
|---|---|---|
| `ProductFilm` | Homepage hero and X / YouTube master | 1920×1080, 60 fps, 40.5 s |
| `ProductFilmVerticalFit` | TikTok / Reels: the master fit into 9:16, hook band, burned-in captions | 1080×1920, 30 fps |
| `ProductFilmVertical` | Earlier recomposed vertical (not used) | 1080×1920, 30 fps |
| `MasterSoundtrack` | The master's audio mix on its own | 40.5 s |

Beats, shot cards and truth notes: `src/remotion/hero/STORYBOARD.md`. Brief: `brief.md`.
Voiceover scripts and music direction: `audio-brief.md`. Taste and past corrections:
`SIZZLE-MEMORY.md`.

## Render

```bash
npm install
npx remotion studio src/remotion/index.ts
npx remotion render src/remotion/index.ts ProductFilm out/hero/master-16x9-60fps.mp4 --codec=h264 --crf=16 --pixel-format=yuv420p --image-format=png --muted
```

`scripts/release-lift.sh` renders the TikTok cut with the "Final Lift" mix, puts the same mix on
the 16:9 master (a stream copy of the video) and makes web previews; the mix is mastered to
−14 LUFS, ≤ −1 dBTP. `scripts/review.sh` runs the release review; the last results are in
`REVIEW.md`.
Remotion needs a Chrome binary; point it at one with `--browser-executable` if it can't download
its own.

## Audio (not in the repo)

The repo is public, so the licensed audio isn't committed. Put these in `video/public/audio/`:

| File | What |
|---|---|
| `vo_master.wav` | The ElevenLabs voiceover (Liam, Eleven v3), loudness-normalized to −16 LUFS |
| `music.mp3` | The Suno track ("Final Lift") |
| `lift-cue.wav`, `fit-sfx.wav` | The edited music cue and the sound effects: `python scripts/lift_cue.py music.mp3 video/public/audio` |

Commercial use of the voiceover and music needs paid ElevenLabs and Suno plans.

## Licences

- Remotion is free for individuals and companies of up to 3 people; larger teams need a company
  licence (remotion.dev/license).
- Fonts: Geist and Inter, SIL Open Font License (`video/public/fonts/LICENSE.txt`).
