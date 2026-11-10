#!/usr/bin/env bash
# The fit cut: master picture in 9:16, VO re-placed on the master's beats, ducked music, captions.
set -euo pipefail
cd "$(dirname "$0")/.."
H=out/hero
GAIN_DB=${GAIN_DB:-3.3}
npx remotion render src/remotion/index.ts ProductFilmVerticalFit $H/.fit-video.mp4 --muted --image-format=png --codec=h264 --crf=18 --pixel-format=yuv420p --concurrency=3 --log=error
npx remotion render src/remotion/index.ts ProductFilmVerticalFit out/audio/fit-mix-raw.wav --codec=wav --log=error
ffmpeg -loglevel error -y -i out/audio/fit-mix-raw.wav -af "volume=${GAIN_DB}dB,alimiter=limit=0.8:attack=5:release=50:level=false" -ar 48000 out/audio/fit-mix-master.wav
ffmpeg -loglevel error -y -i $H/.fit-video.mp4 -i out/audio/fit-mix-master.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k -movflags +faststart -shortest $H/vertical-fit-9x16-30fps.mp4
ffmpeg -loglevel error -y -i $H/vertical-fit-9x16-30fps.mp4 -i out/audio/fit-mix-master.wav -map 0:v -map 1:a -vf scale=720:-2 -c:v libx264 -b:v 2M -maxrate 2.5M -bufsize 5M -pix_fmt yuv420p -af "alimiter=limit=0.72:attack=3:release=40:level=false" -c:a aac -b:a 192k -movflags +faststart -shortest $H/web-preview-fit-9x16.mp4
node scripts/srt-fit.mjs $H/vertical-fit-9x16.srt >/dev/null
rm -f $H/.fit-video.mp4
echo FIT-DONE
