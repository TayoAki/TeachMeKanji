#!/usr/bin/env bash
# Stage 4–5: masters, mastered audio for the vertical, web previews. Silent 16:9; 9:16 with VO + music.
set -euo pipefail
cd "$(dirname "$0")/.."
H=out/hero
GAIN_DB=${GAIN_DB:-2.7}
# 9:16: picture (muted) and the Remotion audio mix (VO at unity, music ducked), then the master gain.
npx remotion render src/remotion/index.ts ProductFilmVertical $H/.vertical-video.mp4 --muted --image-format=png --codec=h264 --crf=18 --pixel-format=yuv420p --concurrency=3 --log=error
npx remotion render src/remotion/index.ts ProductFilmVertical out/audio/mix-raw.wav --codec=wav --log=error
ffmpeg -loglevel error -y -i out/audio/mix-raw.wav -af "volume=${GAIN_DB}dB,alimiter=limit=0.8:attack=5:release=50:level=false" -ar 48000 out/audio/mix-master.wav
ffmpeg -loglevel error -y -i $H/.vertical-video.mp4 -i out/audio/mix-master.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k -movflags +faststart -shortest $H/vertical-9x16-30fps.mp4
node scripts/srt.mjs $H/vertical-9x16.srt
# 16:9 homepage hero: silent, 60 fps.
npx remotion render src/remotion/index.ts ProductFilm $H/master-16x9-60fps.mp4 --muted --image-format=png --codec=h264 --crf=16 --pixel-format=yuv420p --concurrency=3 --log=error
# Web previews (< 14 MB)
ffmpeg -loglevel error -y -i $H/master-16x9-60fps.mp4 -vf scale=1280:-2 -c:v libx264 -b:v 2M -maxrate 2.5M -bufsize 5M -pix_fmt yuv420p -movflags +faststart -an $H/web-preview-16x9.mp4
# Preview audio from the mastered WAV through a limiter: re-encoding the 320k AAC at 128k overshot to +0.5 dBTP.
ffmpeg -loglevel error -y -i $H/vertical-9x16-30fps.mp4 -i out/audio/mix-master.wav -map 0:v -map 1:a -vf scale=720:-2 -c:v libx264 -b:v 2M -maxrate 2.5M -bufsize 5M -pix_fmt yuv420p -af "alimiter=limit=0.72:attack=3:release=40:level=false" -c:a aac -b:a 192k -movflags +faststart -shortest $H/web-preview-9x16.mp4
rm -f $H/.vertical-video.mp4
echo RELEASE-DONE
