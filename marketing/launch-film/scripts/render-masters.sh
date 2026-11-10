#!/usr/bin/env bash
# Run only after the storyboard is approved. Masters: 16:9 @ 60 fps and 9:16 @ 30 fps, silent.
set -euo pipefail
cd "$(dirname "$0")/.."
npx remotion render src/remotion/index.ts ProductFilm out/hero/master-16x9-60fps.mp4 \
  --codec=h264 --crf=16 --pixel-format=yuv420p --muted --concurrency=2
npx remotion render src/remotion/index.ts ProductFilmVertical out/hero/vertical-9x16-30fps.mp4 \
  --codec=h264 --crf=18 --pixel-format=yuv420p --muted --concurrency=2
# Web preview for the review page (about 2 Mbit/s)
ffmpeg -y -i out/hero/master-16x9-60fps.mp4 -vf scale=1280:-2 -c:v libx264 -b:v 2M -maxrate 2.5M \
  -bufsize 5M -pix_fmt yuv420p -movflags +faststart -an out/hero/web-preview.mp4
