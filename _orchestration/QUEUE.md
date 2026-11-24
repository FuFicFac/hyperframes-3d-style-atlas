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

## Run 4 started 2026-11-23 (styles 101–112) — orchestrated from the session in /Volumes/Panther/New horizons

Owner approved the storyboards (`STORYBOARDS-101-112.md`) and asked for all twelve. Briefs: `STYLE-BRIEFS-101-112.md`. Builders on Opus 5.5.
Nothing here is indexed, committed or published yet.

| # | id | signature mechanic | status |
|---|---|---|---|
| 101 | ripple-interference | two wave sources reinforce or cancel as timing slides | DONE — passed checks, stills reviewed by orchestrator (9.3 MB, CRF 22, audio mean −24.8 / max −6.0 dB; calm lines are soft rather than crisp, corks small in the wides, label gap at exactly 12.0 s, far water washes pale in low shots) |
| 102 | photoelastic-stress | stress shows as rainbow bands; support redistributes it | DONE — passed checks, stills reviewed by orchestrator (2.8 MB, CRF 22, audio mean −20.9 / max −1.1 dB; opening is a plain dark band by design, notch bands are simple rings, final pattern calmer but not even, approximate stress field) |
| 103 | percolation | one link joins top to bottom in a seeded grid | DONE — revised and re-reviewed (8.7 MB, CRF 22, audio mean −23.0 / max −1.9 dB; grid cut to 16 × 8 = 264 pipes, deciding valve ringed in magenta from beat 4 on, check still inside beat 4; valve hardware still busy, ~13 % plain enamel each side, new blue front only moderately distinct from settled blue) |
| 104 | chromatography | one black dot separates into its hidden colours | DONE — revised and re-reviewed (3.1 MB, CRF 22, audio mean −22.7 / max −5.1 dB; the three finished strips now carry three different inks, deeper tiles for contrast; soft airbrushed bands, the red reads salmon) |
| 105 | tensegrity | struts held only by cords; cut one and all shift | DONE — passed checks, stills reviewed by orchestrator (6.1 MB, CRF 22, audio mean −26.1 / max −1.6 dB; tower off-centre with empty left third in wides, cord glow under load is an art-directed pulse, slump has no inertia, top cord cut instead of a ring cord) |
| 106 | snap-through | load builds, then the arch flips and will not flip back | DONE — passed checks, stills reviewed by orchestrator (3.0 MB, CRF 22, audio mean −26.0 / max −1.6 dB; clean rather than gritty rig, empty wall above in wides, symmetric strip shape) |
| 107 | magnetic-memory | a passing magnet leaves a lasting track in latching tiles | DONE — revised and re-reviewed (10.0 MB, CRF 23, audio mean −24.7 / max −3.9 dB; second pass is the opposite pole and cuts a pale lane across both arms of the track, larger magnet, no handle in the final wide; the lane also wipes the speckle along it, right-hand cut fainter) |
| 108 | vortex-rings | one smoke ring threads another (leapfrog) | DONE — passed checks, stills reviewed by orchestrator (5.5 MB, CRF 22, audio mean −20.8 / max −1.1 dB; label still fading in at 8.0 s, drum large in beats 3–4, smoke glows rather than blocks light, ring sizes drift back after the pass so beat 5 shows the swapped order) |
| 109 | reaction-diffusion | seeds grow into spots, then stripes (stepped in the planner) | DONE — passed checks, stills reviewed by orchestrator (4.4 MB, CRF 22, audio mean −24.8 / max −1.9 dB; CPU Gray–Scott in the planner with states every 0.25 s and blending between them, feed/kill and time-lapse art-directed, muddy colour seams where territories meet, label dips at beat swaps, browser load time not measured) |
| 110 | differential-growth | a growing ribbon buckles into folds inside a hoop | DONE — passed checks, stills reviewed by orchestrator (5.0 MB, CRF 22, audio mean −22.6 / max −3.3 dB; hoop is round so early frames are ~40 % table, small empty patch at the centre at the end, brief crinkle at the glass near 6.3 s, planner uses exactly-rounded arithmetic only and checks a frame hash in Node and in the page) |
| 111 | granular-sorting | shaking brings the large beads to the top | DONE — passed checks, stills reviewed by orchestrator (9.6 MB, CRF 22, audio mean −23.3 / max −2.7 dB; a tap-and-settle Monte Carlo simulation replaced the force-based one, rest states simulated and hops drawn, Node/Chrome mismatch from Math.pow found and fixed with a recorded run hash, loose packing, caption dims at beat changes, flat cell rather than a round jar) |
| 112 | schlieren | a knife edge makes moving air visible | DONE — passed checks, stills reviewed by orchestrator (2.1 MB, CRF 22, audio mean −23.0 / max −12.9 dB (quiet peaks); dark set with the left third empty navy wall, plume reads as soft smoke near the flame, heavy blade stand in beat 2, label dim at 12.0 s, art-directed flow) |

All twelve built and reviewed 2026-11-23. Not yet done: build-index, build-gallery, SKILL.md count, skill snapshot, git, reels, site. Waiting for the owner's yes.

Index and gallery rebuilt 2026-11-23 on the owner's yes: `references/style-index.json` and `STYLES.md` (113 entries = 112 styles + neutral),
`gallery.html` (112 styles, 0 without MP4; the hand-added links line under the subtitle was put back) and `contact-sheet.jpg` (6 × 19).
The keyword-guessed category is wrong for two new styles: photoelastic-stress ("pixel / voxel") and magnetic-memory ("reference / neutral").
Still not done: SKILL.md (count 100 → 112, good-for rows, weaker-demos paragraph), rsync of the skill into `skill/`, git, reels, site.

## Run 4 closed 2026-11-23 — the atlas is at 112

12 styles added (101–112), all DONE above; 103, 104 and 107 were sent back once on the owner's instruction to fix the weak ones.
Index (`references/style-index.json`, `STYLES.md`), `gallery.html` (links line kept) and `contact-sheet.jpg` rebuilt for 112 styles.
`scripts/build-index.mjs` got one category rule so photoelastic-stress and magnetic-memory file under "material / abstract".
`SKILL.md` (count, three good-for rows, a 101–112 paragraph) was updated by another session; this run only corrected the notes for
103, 104 and 107 after their revisions. Skill copied into `skill/`. Not watched in motion; audio measured, not heard.
`_ALL VIDEOS/`, the numbered reels and the website still stop at 84. Other uncommitted changes in this repository (Site/, README.md,
.gitignore, the model-comparison render folders) belong to other sessions and were left alone.

Committed and pushed to GitHub as aa9cc66 (demos 101-112, refreshed `skill/` snapshot, index, gallery, briefs and storyboards).

## After the run, 2026-11-23 (same session)

- 108 vortex-rings and 109 reaction-diffusion now carry the same Node-versus-Chrome run fingerprint check as 110 and 111. 108's table
  really did differ between the two (Math.log) and was fixed; 109 already matched. All four planner-simulated styles are verified.
- Label changeovers at beat boundaries (101, 108, 109, 112) checked in frames from the MP4s: short cross-fades, no missing label.
- `_orchestration/build-reels-101-112.sh` run: `_ALL VIDEOS/` now has flat copies of 101–112, "Breakout 101-112" (plain and numbered,
  3:00) and "Master Video 01-112" (plain and numbered, 28:05). Like the 85–100 files they are not in git (the masters exceed GitHub's
  file limit). The numbered badge slightly overlaps top-left captions on a few styles (112 for one).
- A 112-style version of the website exists only as a local preview in `/Volumes/Panther/New horizons/site-preview` (homepage hero,
  film dialog, chapter links, media for 85–112). `Site/` and the live site were not touched and still show 84.

## Run 5 started 2026-11-23 (styles 113–124)

Twelve art-and-craft styles, planned in `STYLE-PLANS-113-124.md` (storyboards, engineering notes, run rules). Builders: Opus 5.5 at extra-high effort, four at a time. No separate storyboard approval (owner asked to plan and build).

| # | id | signature mechanic | status |
|---|---|---|---|
| 113 | fourier-epicycles | a chain of spinning circles whose tip draws a picture | DONE — passed checks, stills reviewed by orchestrator (3.9 MB, CRF 22, audio mean −23.6 / max −1.4 dB; thin outline on a plain beige page, tiny outer arms only read in the close-up) |
| 114 | barrier-grid | a striped sheet slides over a scrambled print and the picture moves | DONE — passed checks, stills reviewed by orchestrator after one fix round (3.5 MB, CRF 22, audio mean −21.1 / max −1.2 dB; bird is slivers in a still and reads best in motion; dark mass in the top-left corner during beat 1) |
| 115 | caustics | light through a lumpy glass slab gathers into a picture at one height | DONE — passed checks, stills reviewed by orchestrator after one fix round (5.4 MB, CRF 22, audio mean −22.2 / max −1.1 dB; caption covers part of the slab in the final wide, final picture about half frame width, glass could not exist physically) |
| 116 | guilloche | a lathe engraves phase-shifted wavy rings that weave rosettes | DONE — passed checks, stills reviewed by orchestrator (11.6 MB at CRF 26, audio mean −24.3 / max −2.5 dB; caption on the small side, beat-1 groove reads like a raised wire, file at the size limit) |
| 117 | risograph | three ink layers print off-register, then snap into register | DONE — passed checks, stills reviewed by orchestrator (10.7 MB at CRF 25, audio mean −22.5 / max −2.4 dB; blank paper for the first half second, beat-5 label arrives a little late, busy sea) |
| 118 | linocut | carve, ink the raised part, press, peel: a mirrored print | DONE — passed checks, stills reviewed by orchestrator (6.6 MB, CRF 22, audio mean −21.0 / max −1.2 dB; caption on the small side, time-lapse carving jumps, finished print hangs unsupported) |
| 119 | pointillism | pure-colour dots that mix only in the eye | DONE — passed checks, stills reviewed by orchestrator (10.0 MB at CRF 24, audio mean −23.1 / max −2.8 dB; first second is mostly bare canvas, the tree reads blue-and-yellow rather than green until the squint) |
| 120 | cyanotype | exposure dose builds a print around objects; rinse turns it blue | DONE — passed checks, stills reviewed by orchestrator after a caption fix (4.4 MB, CRF 22, audio mean −23.1 / max −2.4 dB; two-line caption covers the tip of the fern stem, beats 3–4 are drab bronze by nature) |
| 121 | strange-attractor | two almost identical starts stay together, then part for good | DONE — passed checks, stills reviewed by orchestrator (7.7 MB, CRF 22, audio mean −21.7 / max −3.2 dB; Node/Chrome fingerprints match; final butterfly about half the frame width, caption text small inside its plate) |
| 122 | glassblowing | a glowing gather inflated, shaped and cooled to clear glass | DONE — passed checks, stills reviewed by orchestrator (4.3 MB, CRF 22, audio mean −20.9 / max −1.1 dB; hot glass is flat orange in stills, caption is clipped mid-roll for ~0.3 s at each beat change, step order staged not faithful) |
| 123 | papercut-lightbox | white paper layers that gain depth only when lit from behind | DONE — passed checks, stills reviewed by orchestrator (4.9 MB, CRF 22, audio mean −22.6 / max −1.1 dB; backlit beats 3–4 are muddy brown before the sunset colour arrives, foreground layers glow lighter at the top than expected) |
| 124 | ct-scan | thin slices of a sealed box stack into the hidden object | DONE — passed checks, stills reviewed by orchestrator after one fix round (4.5 MB, CRF 22, audio mean −23.6 / max −2.6 dB; later slices flash past in the hero view, gear teeth slightly jagged in the final close-up) |

## Run 5 closed 2026-11-24 — the atlas is at 124

12 styles added (113–124), all DONE above; 114, 115 and 124 were sent back once for a fix round, 120 for a caption-only fix.
Index (`references/style-index.json`, `STYLES.md`), `gallery.html` (links line kept) and `contact-sheet.jpg` rebuilt for 124 styles.
`scripts/build-index.mjs` got three category rules (guilloche, ct-scan + strange-attractor, pointillism). `SKILL.md` updated (count,
three good-for rows, a 113–124 paragraph, Limits heading). Skill copied into `skill/`. Not watched in motion; audio measured, not heard.
Committed and pushed 2026-11-24 as `186df2e` on the owner's yes. `_ALL VIDEOS/` has flat copies, `Breakout 113-124` and `Master Video 01-124` (plain + numbered; built by `build-reels-113-124.sh`); the website still shows 84.
Lessons for the next run are in "Rules for this run" of `STYLE-PLANS-113-124.md`, plus: keep builder temp files inside the project
folder (two builders deleted or overwrote each other's files in a shared scratch folder), and give the caption-size rule in the launch
prompt itself (builders that only read it in the plan still shipped small captions).
