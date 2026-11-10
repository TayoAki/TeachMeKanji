# Release review: App Builder hero film (Kanjiwa)

All files in `scratchpad/video/out/hero/`. Recreations of production's UI from source and
production captures (2026-11-10); app screens and store screenshots are real captures.

| Cut | File | Spec | Status |
|---|---|---|---|
| 16:9 homepage hero (v1.1, silent) | `master-16x9-60fps.mp4` | 1920×1080, 60 fps, H.264 yuv420p, 40.5 s, no audio stream, 18 MB | pass |
| 16:9 web preview | `web-preview-16x9.mp4` | 1280×720, 60 fps, ~2 Mbit/s, faststart, 7.3 MB | pass |
| 9:16 TikTok/Reels (v2, VO + music) | `vertical-9x16-30fps.mp4` | 1080×1920, 30 fps, H.264 yuv420p + AAC 320k 48 kHz, 36.0 s, 7.0 MB | pass |
| 9:16 web preview | `web-preview-9x16.mp4` | 720×1280, 30 fps, ~2 Mbit/s, AAC 192k, faststart, 7.7 MB | pass |
| 9:16 captions | `vertical-9x16.srt` | 15 cues, ≤ 2 lines, ≤ 32 chars | pass (same cues as burned in) |
| **9:16 fit cut — ship this one** (master in 9:16, VO + Final Lift + SFX) | `vertical-fit-9x16-30fps.mp4` | 1080×1920, 30 fps, H.264 yuv420p + AAC 320k 48 kHz, 40.5 s, 7.5 MB | pass |
| 9:16 fit preview | `web-preview-fit-9x16.mp4` | 720×1280, AAC 192k, 7.1 MB | pass |
| 9:16 fit captions | `vertical-fit-9x16.srt` | 15 cues | pass |
| **16:9 with sound** (same mix) | `master-16x9-60fps-audio.mp4` | 1920×1080 60 fps video stream-copied from the silent master (bitstream MD5 identical) + AAC 320k, 40.5 s, 20 MB | pass |
| 16:9 with sound preview | `web-preview-16x9-audio.mp4` | 1280×720 60 fps, AAC 192k, 8.3 MB | pass |
| 16:9 captions (sidecar) | `master-16x9.srt` | same cues as the fit cut | pass |
| 9:16 fit cut, Launchpad (superseded) | `vertical-fit-launchpad-9x16-30fps.mp4` (+ preview, SRT) | −14.3 LUFS, −1.8 dBTP | kept for reference |

## Checks (on the encoded files)
| Check | Result |
|---|---|
| Container (ffprobe) | durations, fps, sizes, pixel format as above; A/V lengths equal (36.000 s) |
| Loudness, 9:16 master | −14.2 LUFS integrated, LRA 4.6 LU, true peak −1.8 dBTP (target −14 ±1, ≤ −1 dBTP): pass |
| Loudness, 9:16 preview | −14.5 LUFS, true peak −2.5 dBTP: pass (the first preview encode hit +0.5 dBTP after AAC 128k; re-encoded from the mastered WAV through a limiter) |
| 16:9 | silent by design: no audio stream |
| Sync (frame pulls at each VO phrase start + 0.2 s, `out/review/pulls-9x16.png`) | every visual is on its phrase: hook/paywall, prompt on "Describe", plan on "First", prices on "premium costs", build + pull-back on "Then it builds" / the drop, onboarding / paywall restore + renewal / settings on their words, edit on "Double-click it and type", "Saved" on "free", menu + dialog on "store listing", screenshots on "frames your screenshots", lockup on the hit and "App Builder", CTA on "Start free" |
| First and last frames | 9:16 frame 0 = paywall + text hook + first caption; 16:9 frame 0 = paywall push-out; both end on a clean lockup hold |
| Google Play short description ("…and finish with a") | out of frame in both cuts (16:9 frame pulls at 30.6/31.9/33.4 s; 9:16 dialog shots) |
| Determinism | 16:9 frames 300/1530/2100 and 9:16 frames 150/700/880 re-rendered out of order: byte-identical |
| 360 px legibility (`out/review/legibility-*-360.png`) | 9:16: text hook, captions, prices, the retyped headline, "Start free trial" / "Restore Purchases", store-shot captions and the lockup read; the renewal fine print and the listing field values are small. 16:9 (desktop hero): as at the board — store-shot captions and canvas labels don't read at 360 px |
| Truth pass | no durations; no completed purchase / TestFlight / Play upload / push / in-app AI; Payments "Test mode" and the paywall's "Test mode: purchases are simulated" are visible as-is; scenario data is production's Kanjiwa project |
| Playback | faststart on all four files |

## Checks for the fit cut and the 16:9 with sound
| Check | Result |
|---|---|
| Loudness, fit master and 16:9-with-sound | −14.3 LUFS integrated, LRA 4.1 LU, true peak −1.7 dBTP (both: same mix): pass |
| Loudness, both previews | −14.6 LUFS, true peak −1.3 dBTP: pass |
| Video identity | 16:9-with-sound vs silent master: video bitstream MD5 identical (stream copy) |
| VO sync (cross-correlation on the decoded files) | P1…P7 within −12…+15 ms of their targets (0.10, 5.60, 9.90, 14.75, 23.85, 31.11, 36.90) |
| SFX sync | every tick/success/chime within +5…+16 ms of its event (≤ 1 frame at 60 fps); frame pulls at 60 fps show the cursor press / state change on each (`out/review-lift/sfx-16x9.png`). The "Saved" chime (27.37) plays while the 16:9 camera is still pushed in; the toast enters frame during the pull-back (~27.6) |
| Phrase frame pulls (`out/review-lift/phr-9x16.png`) | each phrase's words over the picture they name; no captions over K1/K2 holds |
| Frame 0 (fit) | hook + master frame 0 + first caption |
| 360 px legibility (`out/review-lift/legibility-fit-360.png`) | hook and captions read; the master's UI at 1080 px wide is small: the prompt text, plan prices, paywall headline and store-screenshot captions do not read at 360 px (they read on a phone at full size). The lockup reads |
| Determinism | lift_cue.py twice: byte-identical cue and SFX (24-bit PCM); Remotion audio mix twice: byte-identical; fit frames 120/600/900 out of order: byte-identical |
| Music edits | cuts at film 13.024, 21.978, 36.630 on the track's beat grid, 20 ms equal-power crossfades; sample steps at the cuts within the range of uncut downbeats (no clicks) |

## Not checked
- Listening test on speakers/phones (levels measured only).
- Platform upload previews (TikTok/Reels crop and UI overlay).

## Licensing (the user must confirm before publishing)
- Voice: ElevenLabs v3 "Liam" — commercial use needs a paid ElevenLabs plan.
- Music: Suno "Final Lift" (the shipping track) and "Launchpad" (superseded) — commercial use of
  Suno output needs the user's paid Suno plan; free-plan tracks are not licensed for commercial use.
- SFX: synthesized in scripts/lift_cue.py (no samples, no third-party licence).
- Fonts Geist and Inter: SIL OFL. Remotion: free up to 3 people, company licence above.

## Editable source
`scratchpad/video/` — `src/remotion/hero/` (ProductFilm.tsx = 16:9, ProductFilmVerticalV2.tsx =
9:16, vo.ts + audio.tsx = narration/music/ducking/captions), `scripts/release.sh` (masters),
`scripts/review.sh` (this review), `evidence/` (production captures). Not committed anywhere.
