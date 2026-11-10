#!/usr/bin/env bash
# Release review on the encoded files (references/release-review.md).
set -uo pipefail
cd "$(dirname "$0")/.."
S=../sizzle-skill-src/sizzle/scripts
H=out/hero
R=out/review
mkdir -p $R
echo "== container"
for f in $H/master-16x9-60fps.mp4 $H/vertical-9x16-30fps.mp4 $H/web-preview-16x9.mp4 $H/web-preview-9x16.mp4; do
  echo "$f ($(du -h $f | cut -f1))"
  ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,r_frame_rate,pix_fmt,sample_rate,channels -of compact "$f"
done
echo "== loudness"
bash $S/loudness.sh $H/master-16x9-60fps.mp4 $H/vertical-9x16-30fps.mp4 $H/web-preview-9x16.mp4
echo "== frame pulls at VO phrase starts (+0.2 s)"
rm -rf $R/pulls-9x16 && bash $S/frame_pulls.sh $H/vertical-9x16-30fps.mp4 $R/pulls-9x16 0.0 0.2 4.47 6.35 9.75 11.58 12.59 14.54 15.6 16.36 17.2 19.5 21.16 22.36 23.4 24.41 26.18 27.2 28.19 28.6 29.2 30.7 31.46 32.48 35.9 >/dev/null
ffmpeg -loglevel error -y -pattern_type glob -i "$R/pulls-9x16/*.png" -vf "scale=216:384,tile=9x3:padding=4:color=0x444444" -frames:v 1 $R/pulls-9x16.png
rm -rf $R/pulls-16x9 && bash $S/frame_pulls.sh $H/master-16x9-60fps.mp4 $R/pulls-16x9 0 2.3 4.2 9.9 12.9 14.45 16.6 19.8 22.2 25.3 26.8 28.6 30.6 31.9 33.4 35.8 39.6 40.48 >/dev/null
ffmpeg -loglevel error -y -pattern_type glob -i "$R/pulls-16x9/*.png" -vf "scale=384:216,tile=6x3:padding=4:color=0x444444" -frames:v 1 $R/pulls-16x9.png
echo "== 360 px legibility"
for t in 0.2 11.58 12.59 17.2 23.4 26.9 28.6 32.48; do ffmpeg -loglevel error -y -ss $t -i $H/vertical-9x16-30fps.mp4 -frames:v 1 -vf scale=360:-2 $R/v360-$t.png; done
ffmpeg -loglevel error -y -pattern_type glob -i "$R/v360-*.png" -vf "tile=8x1:padding=4:color=0x444444" -frames:v 1 $R/legibility-9x16-360.png
for t in 0 12.9 26.8 31.9 35.8; do ffmpeg -loglevel error -y -ss $t -i $H/master-16x9-60fps.mp4 -frames:v 1 -vf scale=360:-2 $R/w360-$t.png; done
ffmpeg -loglevel error -y -pattern_type glob -i "$R/w360-*.png" -vf "tile=5x1:padding=4:color=0x444444" -frames:v 1 $R/legibility-16x9-360.png
echo REVIEW-DONE
