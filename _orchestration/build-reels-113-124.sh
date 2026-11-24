#!/bin/zsh
# Adds styles 113–124 to _ALL VIDEOS: flat copies, "Breakout 113-124" (plain + numbered) and "Master Video 01-124" (plain + numbered).
# Same method as build-reels-101-112.sh: plain reels are stream copies; numbered reels burn in the same top-left badge
# (black 56 % box at 22,22, white Arial Bold 54 px) and are joined to the existing 01-112 masters without re-encoding them.
set -e
R="${0:A:h:h}"; A="$R/_ALL VIDEOS"; T="$A/.tmp-reels"; FONT="/System/Library/Fonts/Supplemental/Arial Bold.ttf"
rm -rf "$T"; mkdir -p "$T"; cd "$R"
: > "$T/plain.txt"; : > "$T/num.txt"
for d in 11[3-9]-* 12[0-4]-*; do
  n="${d%%-*}"; src="$R/$d/renders/$d.mp4"
  cp "$src" "$A/$d.mp4"
  echo "file '$A/$d.mp4'" >> "$T/plain.txt"
  w=122
  ffmpeg -v error -y -i "$src" -vf "drawbox=x=22:y=22:w=${w}:h=69:color=black@0.56:t=fill,drawtext=fontfile='$FONT':text='$n':fontsize=54:fontcolor=white:x=22+(${w}-text_w)/2:y=37" \
    -c:v libx264 -preset medium -crf 18 -profile:v high -level 4.0 -pix_fmt yuv420p -r 30 -video_track_timescale 15360 \
    -colorspace bt709 -color_primaries bt709 -color_trc bt709 -c:a aac -b:a 256k -ar 48000 -ac 2 -movflags +faststart "$T/num-$d.mp4"
  echo "file '$T/num-$d.mp4'" >> "$T/num.txt"
done
ffmpeg -v error -y -f concat -safe 0 -i "$T/plain.txt" -c copy -movflags +faststart "$A/Breakout 113-124.mp4"
ffmpeg -v error -y -f concat -safe 0 -i "$T/num.txt"   -c copy -movflags +faststart "$A/Breakout 113-124 - Numbered.mp4"
{ echo "file '$A/Master Video 01-112 - Numbered.mp4'"; cat "$T/num.txt"; } > "$T/master-num.txt"
ffmpeg -v error -y -f concat -safe 0 -i "$T/master-num.txt" -c copy -movflags +faststart "$A/Master Video 01-124 - Numbered.mp4"
{ echo "file '$A/Master Video 01-112.mp4'"; cat "$T/plain.txt"; } > "$T/master-plain.txt"
ffmpeg -v error -y -f concat -safe 0 -i "$T/master-plain.txt" -c copy -movflags +faststart "$A/Master Video 01-124.mp4"
rm -rf "$T"
