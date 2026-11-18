# Overnight run queue (started 2026-11-17, orchestrated by Claude)

Goal: keep adding styles from 71 upward until the usage limit. Rolling pool of ~6 builder subagents, one style each.
Each builder follows `BUILDER-BRIEF.md` in this folder. Status below is updated by the orchestrator as builders report.
A style is only "done" when its builder reported a passing build AND the orchestrator looked at its stills.

| # | id | signature mechanic | status |
|---|---|---|---|
| 71 | galton-board | seeded ball plan builds a bell curve | DONE — passed checks, stills reviewed by orchestrator |
| 72 | typewriter | typing plan: one strike per letter, carriage, bell | DONE — passed checks, stills reviewed by orchestrator |
| 73 | music-box | one tune list -> cylinder pins, comb plucks, notes | DONE — passed checks, stills reviewed by orchestrator |
| 74 | layer-print | sliced toolpath plan, part grows layer by layer | DONE — passed checks, stills reviewed by orchestrator |
| 75 | paper-marbling | closed-form marbling deformations, print lifted off | DONE — passed checks, stills reviewed by orchestrator |
| 76 | bullet-time | world clock freezes/reverses while camera orbits | DONE — passed checks, stills reviewed by orchestrator |
| 77 | nesting-dolls | nested shells open in turn (layers, recursion) | DONE — passed checks, stills reviewed by orchestrator |
| 78 | mousetrap-chain | branching chain-reaction plan (exponential growth) | DONE — passed checks, stills reviewed by orchestrator |
| 79 | wind-walker | planar leg linkage walks (closed-form linkage solve) | DONE — passed checks, stills reviewed by orchestrator |
| 80 | infinity-mirror | recursive reflections tunnel (self-reference) | DONE — passed checks, stills reviewed by orchestrator |
| 81 | inkblot | symmetric blot folds/unfolds and morphs (ambiguity) | DONE — passed checks, stills reviewed by orchestrator |
| 82 | ship-in-bottle | built flat, slid through the neck, raised by a thread | DONE — passed checks, stills reviewed by orchestrator |
| 83 | slit-scan | time displacement: each column shows a different time | DONE — passed checks, stills reviewed by orchestrator |
| 84 | cloud-chamber | invisible particles leave condensation trails | DONE — passed checks, stills reviewed by orchestrator |
| 85 | tiny-planet | a whole world grows on a small rotating globe | not started (run stopped at 84 on the owner's instruction) |
| 86 | fireworks | ballistic shells burst into planned shapes | not started (run stopped at 84 on the owner's instruction) |
| 87 | cross-section | a slicing plane sweeps an object, showing the inside | not started (run stopped at 84 on the owner's instruction) |
| 88 | lichtenberg | branching discharge burns a tree into wood | not started (run stopped at 84 on the owner's instruction) |
| 89 | uv-reveal | hidden marks appear under a moving UV torch | not started (run stopped at 84 on the owner's instruction) |
| 90 | marionette | strings and control bar drive a puppet | not started (run stopped at 84 on the owner's instruction) |
| 91 | flip-dot | mechanical flip-disc display forms pictures | not started (run stopped at 84 on the owner's instruction) |
| 92 | laser-mirrors | a beam is routed mirror to mirror through haze | not started (run stopped at 84 on the owner's instruction) |
| 93 | tessellation-morph | interlocking tiles morph from one creature to another | not started (run stopped at 84 on the owner's instruction) |
| 94 | fogged-glass | a finger draws in condensation, drops run | not started (run stopped at 84 on the owner's instruction) |
| 95 | dollhouse-cutaway | cutaway building, rooms light up in turn | not started (run stopped at 84 on the owner's instruction) |
| 96 | pendulum-wave | pendulums drift in and out of phase | not started (run stopped at 84 on the owner's instruction) |
| 97 | string-art | straight threads on nails make curves | not started (run stopped at 84 on the owner's instruction) |
| 98 | loom-weave | warp and weft weave a pattern | not started (run stopped at 84 on the owner's instruction) |
| 99 | pottery-wheel | spinning clay raised and shaped by a profile | not started (run stopped at 84 on the owner's instruction) |
| 100 | kaleidoscope | few loose pieces, mirrored into a pattern | not started (run stopped at 84 on the owner's instruction) |

Reserve ideas: hourglass, jigsaw-puzzle, wooden-labyrinth, chess-board, switchboard, card-catalog, radar-scope,
chart-recorder, wind-tunnel, darkroom, sky-lanterns, mirror-ball, tree-rings, honeycomb, spectrogram-terrain, endless-zoom,
snow-globe, orrery, crystal-growth, block-tower, nixie-tubes, soap-bubbles.

After the run: `node scripts/build-index.mjs` and `node scripts/build-gallery.mjs` (skill folder), review stills, update
SKILL.md's style count and good-for table.

## Run closed 2026-11-18

14 styles added (71–84). Index (`references/style-index.json`, `STYLES.md`), `gallery.html` and `contact-sheet.jpg` rebuilt for 84 styles;
`SKILL.md` updated. Committed and pushed to GitHub as aa66aac (demos 71-84, refreshed `skill/` snapshot, gallery). The combined videos in
`_ALL VIDEOS` and the public site still stop at 70. Rows 85–100 and the reserve list are unbuilt ideas for a future run.
