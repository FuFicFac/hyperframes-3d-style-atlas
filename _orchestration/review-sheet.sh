#!/bin/zsh
# usage: review-sheet.sh NN-id [out-dir]  -> contact sheet of all check stills (sorted by time) + run summary + audio levels
P="${0:A:h:h}/$1"; S="${2:-${TMPDIR:-/tmp}}"; C="$P/renders/checks"; T="$S/tmp-$1"; rm -rf "$T"; mkdir -p "$T"
i=0; for t in $(ls "$C" | grep -E '^t[0-9.]+\.png$' | sed -E 's/^t(.*)\.png$/\1/' | sort -n); do
  ffmpeg -v error -y -i "$C/t$t.png" -vf "scale=960:540,drawtext=text='t=$t':x=12:y=h-40:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.6" "$T/$(printf %03d $i).png" 2>/dev/null; i=$((i+1)); done
rows=$(( (i+1)/2 ))
ffmpeg -v error -y -framerate 1 -i "$T/%03d.png" -vf "tile=2x$rows" -frames:v 1 -q:v 4 "$S/$1.jpg"; rm -rf "$T"
echo "sheet: $S/$1.jpg ($i stills)"
grep -E "newest code edit|mp4:|mp4-vs-code|determinism|deep self-check" "$C/RUN.txt"
M="$P/renders/$1.mp4"; ls -l "$M" | awk '{printf "size %.1f MB\n",$5/1048576}'
ffprobe -v error -show_entries format=duration -of csv=p=0 "$M"
ffmpeg -hide_banner -i "$M" -af volumedetect -vn -f null - 2>&1 | grep -E "mean_volume|max_volume" | sed 's/.*] //'
