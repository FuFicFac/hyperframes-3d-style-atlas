#!/bin/zsh
# run-all.sh <skillRoot> <label> [projects...]  — sequential check-frames --deep over the pilot demos
SKR="$1"; LABEL="$2"; shift 2
PILOT="/Users/user/Library/CloudStorage/Dropbox/D Second Brain/Builder/HyperFrames/3d-style-atlas-pilot"
RAW="$PILOT/_kit-regression-2026-11-13/pass7-raw"
OUT="$RAW/$LABEL"; mkdir -p "$OUT"
SUM="$OUT/summary.log"
PROJS=("$@"); [ ${#PROJS} -eq 0 ] && PROJS=($(awk '{print $1}' "$RAW/times.txt"))
echo "START $(date -u +%FT%TZ) $LABEL ${#PROJS} projects" >> "$SUM"
for p in $PROJS; do
  T=$(awk -v p="$p" '$1==p{print $2}' "$RAW/times.txt")
  node "$SKR/scripts/check-frames.mjs" "$PILOT/$p" --times "$T" --deep > "$OUT/$p.log" 2>&1
  rc=$?
  echo "DONE $p rc=$rc | $(grep -a '^determinism' "$OUT/$p.log" | cut -c1-40) | $(grep -a '^mp4-vs-code' "$OUT/$p.log") | $(grep -a '^deep self-check' "$OUT/$p.log")" >> "$SUM"
  sleep 10
done
echo "END $(date -u +%FT%TZ)" >> "$SUM"
