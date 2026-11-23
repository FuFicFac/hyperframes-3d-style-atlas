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
| 85 | tiny-planet | a whole world grows on a small rotating globe | DONE — passed checks, stills reviewed by orchestrator (8.2 MB, CRF 22, audio mean −19.4 / max −1.1 dB) |
| 86 | fireworks | ballistic shells burst into planned shapes | DONE — passed checks, stills reviewed by orchestrator (8.6 MB, CRF 22, audio mean −19.3 / max −3.0 dB; caption small, dim beat changes) |
| 87 | cross-section | a slicing plane sweeps an object, showing the inside | DONE — passed checks, stills reviewed by orchestrator (5.0 MB, CRF 22, audio mean −23.4 / max −5.1 dB; ~0.2 s label gaps, sparse wiring) |
| 88 | lichtenberg | branching discharge burns a tree into wood | DONE — passed checks, stills reviewed by orchestrator (5.4 MB, CRF 22, audio mean −20.9 / max −1.1 dB; opening shot leaves the board mostly empty until ~4 s) |
| 89 | uv-reveal | hidden marks appear under a moving UV torch | DONE — passed checks, stills reviewed by orchestrator (6.2 MB, CRF 22, audio mean −22.5 / max −1.3 dB; torch floats with no hand) |
| 90 | marionette | strings and control bar drive a puppet | DONE — passed checks, stills reviewed by orchestrator (5.2 MB, CRF 22, audio mean −25.5 / max −1.2 dB; puppet ~half frame height in the final wide, knee strings cross the face) |
| 91 | flip-dot | mechanical flip-disc display forms pictures | DONE — passed checks, stills reviewed by orchestrator (10.4 MB, CRF 22, audio mean −24.1 / max −2.6 dB; started on Fable, finished on Opus 5.5; small caption, static last 4.7 s) |
| 92 | laser-mirrors | a beam is routed mirror to mirror through haze | DONE — passed checks, stills reviewed by orchestrator (3.3 MB, CRF 22, audio mean −21.9 / max −1.2 dB; started on Fable, finished on Opus 5.5; small caption, splitter reads as a white glow) |
| 93 | tessellation-morph | interlocking tiles morph from one creature to another | DONE — passed checks, stills reviewed by orchestrator (9.1 MB, CRF 22, audio mean −20.3 / max −3.6 dB; started on Fable, finished on Opus 5.5; chunky bird, ~0.25 s blank caption at label changes) |
| 94 | fogged-glass | a finger draws in condensation, drops run | DONE — passed checks, stills reviewed by orchestrator (4.0 MB, CRF 22, audio mean −24.3 / max −1.2 dB; started on Fable, finished on Opus 5.5; ~0.2 s label cross-fade gaps) |
| 95 | dollhouse-cutaway | cutaway building, rooms light up in turn | DONE — passed checks, stills reviewed by orchestrator (3.5 MB, CRF 22, audio mean −23.4 / max −2.6 dB; started on Fable, finished on Opus 5.5; courier small against the whole house) |
| 96 | pendulum-wave | pendulums drift in and out of phase | DONE — passed checks, stills reviewed by orchestrator (9.7 MB, CRF 22, audio mean −25.9 / max −1.6 dB; started on Fable, finished on Opus 5.5; the positional-encoding link is thin, the return is a tightening not a snap) |
| 97 | string-art | straight threads on nails make curves | DONE — passed checks, stills reviewed by orchestrator after one fix round (7.3 MB, CRF 22, audio mean −22.9 / max −1.0 dB; Opus 5.5; early beats still sparse, strong wood grain, final wide leaves the upper left empty) |
| 98 | loom-weave | warp and weft weave a pattern | DONE — passed checks (lint re-run by orchestrator: 0/0), stills reviewed by orchestrator (10.8 MB, CRF 22, audio mean −20.6 / max −5.9 dB; Opus 5.5; small caption, the card shows the robot before the cloth does) |
| 99 | pottery-wheel | spinning clay raised and shaped by a profile | DONE — passed checks, stills reviewed by orchestrator (4.8 MB, CRF 22, audio mean −20.9 / max −5.3 dB; Opus 5.5; small caption, tool reads like a spoon, no hands) |
| 100 | endless-zoom | one continuous zoom through nested scales that lands back where it began (replaces kaleidoscope: too close to inkblot / infinity-mirror) | DONE — passed checks, stills reviewed by orchestrator after one polish round (7.6 MB, CRF 22, audio mean −20.6 / max −2.1 dB; Opus 5.5; caption text jumps at the loop seam, a mid-swap still shows two half-clipped labels) |

Reserve ideas: hourglass, jigsaw-puzzle, wooden-labyrinth, chess-board, switchboard, card-catalog, radar-scope,
chart-recorder, wind-tunnel, darkroom, sky-lanterns, mirror-ball, tree-rings, honeycomb, spectrogram-terrain, endless-zoom,
snow-globe, orrery, crystal-growth, block-tower, nixie-tubes, soap-bubbles.

After the run: `node scripts/build-index.mjs` and `node scripts/build-gallery.mjs` (skill folder), review stills, update
SKILL.md's style count and good-for table.

## Run closed 2026-11-18

14 styles added (71–84). Index (`references/style-index.json`, `STYLES.md`), `gallery.html` and `contact-sheet.jpg` rebuilt for 84 styles;
`SKILL.md` updated. Committed and pushed to GitHub as aa66aac (demos 71-84, refreshed `skill/` snapshot, gallery). The combined videos in
`_ALL VIDEOS` and the public site still stop at 70. Rows 85–100 and the reserve list are unbuilt ideas for a future run.

## Run 3 started 2026-11-22 (styles 85–100)

Same method: rolling pool of ~6 builders. #100 changed from kaleidoscope to endless-zoom (stronger closer; kaleidoscope's mirror symmetry overlaps inkblot and infinity-mirror).

From 91 on, builders run on Opus 5.5 (high effort) to save the owner's Fable usage. Builder instructions and per-style briefs: `STYLE-BRIEFS-91-100.md` (self-contained; any model can run a builder from it).

## Run 3 closed 2026-11-23 — the atlas is at 100

16 styles added (85–100), all DONE above. Index (`references/style-index.json`, `STYLES.md`), `gallery.html` and `contact-sheet.jpg`
rebuilt for 100 styles; `SKILL.md` updated (count, four good-for rows, weaker-demos paragraph, Limits heading). `gallery.html` keeps the
one line of links another agent added under the subtitle. Committed and pushed to GitHub as 233f334 (demos 85-100, refreshed `skill/` snapshot, gallery, briefs). `_ALL VIDEOS/`, the
numbered reels and the website still stop at 84. Kit promotion candidates reported by builders are listed in each style's STYLE.md.
