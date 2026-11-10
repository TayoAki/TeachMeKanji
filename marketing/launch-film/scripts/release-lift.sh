#!/usr/bin/env bash
# Final Lift mix (VO on the master's beats + edited Final Lift + SFX) on the 9:16 fit cut and the
# 16:9 master. The picture is stream-copied: the fit cut from its own PNG render (.fit-video.mp4),
# the 16:9 from master-16x9-60fps.mp4.
set -euo pipefail
cd "$(dirname "$0")/.."
H=out/hero
GAIN_DB=${GAIN_DB:-2.8}
.sizzle-venv/bin/python -I scripts/lift_cue.py video/public/audio/final-lift.mp3 video/public/audio > /dev/null
npx remotion render src/remotion/index.ts ProductFilmVerticalFit out/audio/lift-mix-raw.wav --codec=wav --log=error
ffmpeg -loglevel error -y -i out/audio/lift-mix-raw.wav -af "volume=${GAIN_DB}dB,alimiter=limit=0.8:attack=5:release=50:level=false" -ar 48000 out/audio/lift-mix-master.wav
ffmpeg -loglevel error -y -i out/audio/lift-mix-master.wav -c:a aac -b:a 320k -ar 48000 out/audio/lift-mix-master.m4a
# 9:16 fit cut: picture rendered once (PNG frames → yuv420p), then muxed with the mix
if [ ! -f $H/.fit-video.mp4 ] || [ "${RENDER_VIDEO:-0}" = 1 ]; then
  npx remotion render src/remotion/index.ts ProductFilmVerticalFit $H/.fit-video.mp4 --muted --image-format=png --codec=h264 --crf=18 --pixel-format=yuv420p --concurrency=3 --log=error
fi
ffmpeg -loglevel error -y -i $H/.fit-video.mp4 -i out/audio/lift-mix-master.m4a -map 0:v -map 1:a -c copy -movflags +faststart $H/vertical-fit-9x16-30fps.mp4
# 16:9 master with sound (the silent one stays as the homepage autoplay version)
ffmpeg -loglevel error -y -i $H/master-16x9-60fps.mp4 -i out/audio/lift-mix-master.m4a -map 0:v -map 1:a -c copy -movflags +faststart $H/master-16x9-60fps-audio.mp4
node scripts/srt-fit.mjs $H/vertical-fit-9x16.srt > /dev/null
cp $H/vertical-fit-9x16.srt $H/master-16x9.srt
# Web previews: audio from the mastered WAV through a limiter (AAC at lower rates overshoots).
ffmpeg -loglevel error -y -i $H/vertical-fit-9x16-30fps.mp4 -i out/audio/lift-mix-master.wav -map 0:v -map 1:a -vf scale=720:-2 -c:v libx264 -b:v 2M -maxrate 2.5M -bufsize 5M -pix_fmt yuv420p -af "alimiter=limit=0.72:attack=3:release=40:level=false" -c:a aac -b:a 192k -movflags +faststart -shortest $H/web-preview-fit-9x16.mp4
ffmpeg -loglevel error -y -i $H/master-16x9-60fps.mp4 -i out/audio/lift-mix-master.wav -map 0:v -map 1:a -vf scale=1280:-2 -c:v libx264 -b:v 2M -maxrate 2.5M -bufsize 5M -pix_fmt yuv420p -af "alimiter=limit=0.72:attack=3:release=40:level=false" -c:a aac -b:a 192k -movflags +faststart -shortest $H/web-preview-16x9-audio.mp4
echo LIFT-DONE
