# Builder brief — one new 3D Style Atlas style per agent (overnight run started 2026-11-17)

You are adding ONE new style to the 3D Style Atlas (Three.js scenes rendered to MP4 through HyperFrames). Your number, id,
concept and signature mechanic are in the message that sent you here. The owner is asleep: work autonomously to a finished,
rendered, checked demo. Do not ask questions; make sensible choices and record them in your STYLE.md.

The owner's challenge for this run: **be more creative, take it to the next level, surprise me.** So: aim for one genuine
"wow" moment in the 15 seconds — a reveal, a transformation, a camera move that changes what the viewer thought they were
looking at. Ambition in the idea, discipline in the execution. A clean, bright, readable demo of a bold idea beats a murky
demo of a huge one; if the full idea won't land, ship the strongest readable version and say what you cut.

## Paths
- SK (skill, working copy) = `~/Library/CloudStorage/Dropbox/D Second Brain/Skills/3d-style-atlas`
- PILOT (demo projects) = `/Volumes/Panther/3D Style Atlas`
- You create exactly: `SK/styles/<id>/` (spec.js, style.js, STYLE.md + a Node-safe planner module) and `PILOT/<NN>-<id>/`
  (one 15 s demo project). Quote paths — they contain spaces.

## Read first, in this order
1. `SK/references/style-authoring.md` — contract, workflow, done-checklist, hard-won lessons, determinism traps. Follow it exactly.
2. `SK/references/kit-api.md` — kit API, style contract, scene contract, build commands.
3. One or two strong recent styles as STRUCTURAL templates (style folder + demo project): `kintsugi` / `PILOT/63-kintsugi`,
   `mosaic` / `PILOT/67-mosaic`, `cymatics` / `PILOT/53-cymatics`, plus any named in your message. Copy structure, not look.

## Workflow (style-authoring.md §2)
`cp -R SK/styles/neutral SK/styles/<id>` and rename → `node SK/scripts/new-scene.mjs PILOT/<NN>-<id> --style <id> --duration 15`
→ iterate: `node SK/scripts/build.mjs <proj> --skip-render` and `node SK/scripts/check-frames.mjs <proj> --times 1,4,8,12,14.5`
→ LOOK at every still with the Read tool (at least one at full size), fix the biggest problem, repeat several times
→ final `node SK/scripts/build.mjs <proj> --checks 1,4,8,12,14.5` (writes `renders/<NN>-<id>.mp4`)
→ `check-frames ... --deep` LAST, after your final code edit.

## Demo
15 s, 3–6 beats, one short label per beat (≤ ~26 characters). Prefer a topic that explains something about AI or how
things work (the channel is "Why AI Matters"), told through the style's mechanic. Numbers on screen: avoid, or mark SAMPLE DATA.

## Quality bar (commonest failures in styles 51–70 — avoid them)
- Subject LARGE in every shot; the final wide FILLS the frame; bright, good contrast (no small subject in a dark frame).
  Dark looks are allowed only when the subject itself glows and still fills the frame. `kit/framing.framingReport` helps.
- Labels big, inside the safe area, one at a time, on screen ≥ 1.5 s, readable at 1080p. Check the MIDDLE of camera moves.
- Something visibly happening from the first second (no ~4 s near-blank opening).
- Every frame a pure function of t: no Math.random, clocks, rAF, accumulation, physics stepping (precompute a plan instead).
  Sound cues derive from the same BEATS / plan as the picture.
- Done-checklist §3 all true: build exits 0 with lint 0 errors AND 0 warnings, `determinism: OK`, `deep self-check: OK`,
  audio max ≤ −1 dBFS and mean about −20 to −28 dB, MP4 ≤ ~12 MB (file-size levers in the guide; `--crf` 26 at most).

## Hard rules
- Do NOT edit anything under `SK/kit/`, `SK/scripts/`, `SK/references/`, any other style's folder or any other demo project.
  Other agents are building other styles in parallel: touch only your two folders. If a build complains about a file inside
  `_atlas/styles/<some other id>`, that is another agent's half-written style being synced — wait a minute and re-run.
- Do NOT run `build-index.mjs` / `build-gallery.mjs`; do not git add/commit/push. The orchestrator does that.
- Do NOT install or download anything (no npm install, no new hyperframes version, no web fonts — system font stacks only).
  If `npx hyperframes` wants to download something, stop and report.
- Never kill processes you did not start (other agents have headless Chrome / hyperframes renders running). Only delete a
  stale `renders/.<name>.hf-transaction-*` folder inside YOUR project, and only after your own render has exited.
- Keep intermediate frames/caches out of Dropbox; remove temp files you create under /tmp when done.
- All original work: nothing copied from third-party templates, no brand names, logos, existing artworks, songs or characters.
- The machine is shared by several builders; builds and renders can take minutes. Use generous timeouts / background runs.

## Final report (under 250 words, facts only)
- Files created; the beat list; planner module name; the "wow" moment and whether it landed.
- Measured results from the LAST run: build exit code, lint counts, determinism + deep self-check lines, audio max/mean,
  MP4 path and size, CRF used.
- Which stills you looked at; what still looks weak (be honest — "never watched in motion", "audio measured, not heard").
- Kit promotion candidates or problems the orchestrator should know about.
