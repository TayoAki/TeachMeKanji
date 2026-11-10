#!/usr/bin/env bash
# Styleframes, contact sheets and animatics for the storyboard checkpoint.
set -euo pipefail
cd "$(dirname "$0")/.."
SKILL=../sizzle-skill-src/sizzle/scripts
FRAMES="00_poster_frame0=0 01_hook=2.8 02_type_describe=4.2 03_prompt=9.85 04_plan_prices=12.95 05_build=16.6 06_marquee_canvas=19.8 07_type_builtin=22.2 08_edit_text=26.8 09_store_listing=31.9 10_payoff_screenshots=35.8 11_close=39.6"
node scripts/stills.mjs ProductFilm out/hero/styleframes-16x9 1 $FRAMES
node scripts/stills.mjs ProductFilmVertical out/hero/styleframes-9x16 1 $FRAMES
bash $SKILL/contact_sheet.sh out/hero/styleframes-16x9 out/hero/contact-16x9.png 4 640 0x1a1a1a
bash $SKILL/contact_sheet.sh out/hero/styleframes-9x16 out/hero/contact-9x16.png 6 640 0x1a1a1a
npx remotion render src/remotion/index.ts ProductFilmAnimatic out/hero/animatic-16x9.mp4 --scale=0.5 --concurrency=2 --codec=h264 --crf=23 --log=error
npx remotion render src/remotion/index.ts ProductFilmVertical out/hero/animatic-9x16.mp4 --scale=0.5 --concurrency=2 --codec=h264 --crf=23 --log=error
echo DONE
