---
name: 3d-style-atlas
description: Make short (15–60 s) 3D animated explainers, title cards and channel graphics in a named visual style — Three.js scenes written in code, rendered to MP4 through HyperFrames with synthesized sound and optional voiceover sync. 100 styles (low-poly, paper pop-up, neon sign, soft clay, blueprint, split-flap board, voxel, marble run, studio product, liquid chrome, stained glass, subway map, circuit board, clockwork, weather map, domino run, conveyor factory, mixing console, city lights, ink wash, pin art, anamorphic, zoetrope, cymatics, ferrofluid, point cloud, thermal camera, murmuration, impossible geometry, light painting, microscope slide, ukiyo-e woodblock, cubism, kintsugi, impasto, op art, multiplane cel, mosaic, constructivist poster, flipbook, art deco, tiny planet, fireworks, UV reveal, tessellation morph, fogged glass, endless zoom, the Why AI Matters house style, and more). Use when asked for a "3D explainer", "3D animation", "style atlas", "animate how X works", "make a clip in the <style> style", a Why AI Matters ident / lower third / chapter card / key stat, or to add a new 3D style. NOT for editing footage (use claude-cuts-video), 2D HTML motion graphics (use hyperframes), or Remotion projects (use remotion).
---

# 3D Style Atlas

A library of 3D looks plus a shared kit. You write one scene (what happens, when, in which style); the kit and the style supply
the materials, lighting, camera, props, labels and sound. Everything is built in code — no model, image or audio files — and every
frame is a pure function of time, so renders are frame-accurate and repeatable.

All of it was written in-house. Do not copy from third-party prompt packs or templates.

## Where things are

`SK` = this folder: `<D Second Brain>/Skills/3d-style-atlas`. On the M1 MacBook Pro that is
`~/Library/CloudStorage/Dropbox/D Second Brain/Skills/3d-style-atlas`; on any other machine use that machine's
own D Second Brain path (if you reached this file through a symlink in `~/.claude/skills`, `~/.codex/skills` etc., resolve it
first). The scripts find the kit and the pilot folder relative to themselves, so only `SK` changes. Needs Node and
`npx hyperframes` (headless Chrome) on the machine doing the render.

| Path | What it is |
|---|---|
| `references/STYLES.md`, `references/style-index.json` | Every style: id, description, good-for, demo, props. **Start here to pick a style.** |
| `styles/<id>/STYLE.md` | One style's card: look, good for / avoid for, prop factories, sound palette, knobs, limits. |
| `styles/<id>/spec.js`, `style.js` | The style: plain-data spec + `createStyle(stage)`. Some have a fourth Node-safe planner module. |
| `kit/` | Shared code: stage, camera rig, lights, textures, text, overlay labels, motion, sound synthesis, post, and more. |
| `scripts/` | `new-scene`, `build`, `check-frames`, `export-blender`, `render-sfx`, `sync-kit`, `build-index`, `build-gallery`, `serve`. |
| `references/kit-api.md` | Kit API, the style contract, the scene contract, exact build commands. |
| `references/style-authoring.md` | How to write a new style, the done-checklist, lessons learned, determinism traps. |
| `references/blender-translation.md` | How a scene's exported data maps to Blender (unexecuted — see Limits). |
| Demos | `/Volumes/Panther/3D Style Atlas/NN-<id>/` (external Panther drive; moved 2026-11-15 from `D Second Brain/Builder/HyperFrames/3d-style-atlas-pilot/`, which other docs here still name; if Panther is not mounted, clone the GitHub repo) — one working 15 s project per style, with `gallery.html`. |

## Making a clip

1. **Pick the style.** Read `references/STYLES.md` (all 100, with good-for / avoid-for). Match on "good for", not on taste alone.
   Rough map (one style can sit in several rows; read its `STYLE.md` before writing anything):

   | Good for | Styles |
   |---|---|
   | Mechanisms, "what's inside", how parts drive each other | exploded-view, blueprint-build, marble-run (queues, overflow), clockwork, toy-brick (assembly, stacks) |
   | Step-by-step processes and pipelines | low-poly, tiny-diorama, isometric-pastel, conveyor-factory (throughput, sorting), felt-stitch, soft-clay, cardboard-stop-motion |
   | Cause and effect, chains, root causes | domino-run, evidence-board, circuit-board (signal A → B), clockwork |
   | Routes, networks, branches, things spreading | subway-map, circuit-board, weather-map (fronts, waves), tiny-diorama, wireframe-hologram |
   | Software, AI and data flows | floating-screens, wireframe-hologram, crt-retro (terminals), glass-light (many ↔ one), liquid-chrome |
   | Numbers, amounts, scale, proportions | bead-abacus (one countable number), city-lights (totals, comparisons), lab-glassware (recipes, thresholds), inflatable (single numbers), split-flap-board (status, rankings), voxel |
   | Trade-offs, balance, tuning | hanging-mobile, mixing-console (settings, levels), card-table (options, pick one, odds) |
   | Planning, goals, checklists | sticky-notes (cluster → decide), pinball-table (targets, progress), chalkboard (worked examples) |
   | History, stories, news | paper-pop-up, spotlight-stage, film-projector, newspaper-press, shadow-puppets, crt-retro |
   | Big ideas, overviews, "parts of a whole" | stained-glass, star-chart, terrarium (closed loops), origami (same thing, new shape) |
   | Calm, reflective, minimal | zen-sand, ink-wash, origami, terrarium |
   | Titles, claims, lists, reveals | neon-sign, embossed-letterpress, split-flap-board, liquid-chrome, inflatable, pin-art (this becomes that) |
   | Product and hardware reveals | studio-product, exploded-view, toy-brick |
   | Science and physical phenomena, hidden patterns made visible | cymatics (sound → shape), ferrofluid (fields, forces), thermal-camera (where the heat/cost is), microscope-slide (growth, division), point-cloud (scanning, sensing), murmuration (many simple agents → one shape) |
   | Illusions, point of view, "it depends how you look" | anamorphic (clutter → message from one angle), impossible-geometry (loops, paradoxes), op-art (flat reads as depth), cubism (many views at once), zoetrope (stills → motion) |
   | Art and craft looks, build-up and making-of, repair | ukiyo-e (layer by layer), impasto (stroke by stroke), mosaic (piece by piece), kintsugi (break → mend, stronger after), multiplane-cel (layers and depth), flipbook (frames → life), light-painting (drawn in the air) |
   | Bold period design: posters, manifestos, grand reveals | constructivist-poster (forceful claims), art-deco (symmetric rise, premieres) |
   | Chance, compounding and runaway growth | galton-board (randomness adds up to a bell curve), mousetrap-chain (one becomes two becomes all), paper-marbling (simple passes compound) |
   | Made step by step, token by token, layer by layer | typewriter (one letter / one token at a time), layer-print (3D printer, built in layers), music-box (the pins are the program) |
   | Layers inside layers, recursion, bottlenecks | nesting-dolls (a smaller one inside; distillation), infinity-mirror (a copy of a copy; AI learning from AI), ship-in-bottle (fold, fit, unfold) |
   | Time, hidden activity and interpretation | bullet-time (freeze the world, keep the camera moving), slit-scan (every column a different moment), cloud-chamber (invisible traffic made visible), inkblot (same data, different story), wind-walker (rigid linkage that walks) |
   | Hidden things revealed, looking inside | uv-reveal (invisible marks, watermarks), cross-section (slice the black box open), dollhouse-cutaway (one request, room by room), fogged-glass (what fades from view; context window), endless-zoom (what is inside what, all the way down and back) |
   | Search, routing and control | lichtenberg (many paths tried, one connects), laser-mirrors (re-route with one small turn; tool use), marionette (who pulls which string) |
   | Sampling, noise and smooth change | fireworks (temperature: exact → loose → scatter), flip-dot (a picture settles out of noise; diffusion), tessellation-morph (one idea slides into another; latent space), pendulum-wave (many rhythms, one pattern per moment) |
   | Simple parts add up, shaped step by step | string-art (straight lines make curves), loom-weave (holes are a program), pottery-wheel (same clay, reshaped; fine-tuning), tiny-planet (a world grows from what it reads) |
   | Channel packaging (Why AI Matters) | wam-house (ident, lower third, chapter card, key stat, quote, end card) |

   Some demos are weaker than others — see "Known weaker demos" below before choosing one for an important clip.
2. **Storyboard first.** Write 3–6 beats: `{ id, t, dur }`, one short label each (≤ ~26 characters), and what moves. Show the user the
   beat list and get a yes before building. For anything longer than 20 s, render one still per beat first (`check-frames`) and show those.
3. **Scaffold.** Put the project inside the folder of whatever it belongs to (an episode folder, or `Builder/HyperFrames/` for standalone
   work) — never in a temp directory.
   ```bash
   SK="$HOME/Library/CloudStorage/Dropbox/D Second Brain/Skills/3d-style-atlas"
   node "$SK/scripts/new-scene.mjs" <project-dir> --style <id> --duration 15
   ```
4. **Write the scene.** Copy the structure of that style's demo project (`scene.config.js` = duration, BEATS, camera keys, SCORE;
   `scene.js` = build props from the style's factories, then `renderAt(t)`). Follow the scene contract in `kit-api.md` §4.
5. **Build and look.**
   ```bash
   node "$SK/scripts/build.mjs" <project-dir> --skip-render          # fast loop: sync, sound, spec, lint, check
   node "$SK/scripts/check-frames.mjs" <project-dir> --times 1,4,8,12,14.5
   ```
   Open every still. The first render is never right: fix the biggest problem, repeat. Then render:
   ```bash
   node "$SK/scripts/build.mjs" <project-dir> --checks 1,4,8,12,14.5   # writes renders/<name>.mp4
   node "$SK/scripts/check-frames.mjs" <project-dir> --times 1,4,8,12,14.5 --deep
   ```
6. **Report honestly.** Say what you looked at, the MP4 size, the audio levels, and what still looks weak. Audio levels are measured,
   not heard — say so.

## Rules that are not negotiable

- **Pure function of time.** `renderAt(t)` sets everything from `t`. No `requestAnimationFrame`, clocks, `Math.random`, or values
  carried between frames. Seeded RNG only (`rng(seed)`). Read §5 of `style-authoring.md` (determinism traps) before writing a scene.
- **Sound comes from the same plan as the picture.** Derive SCORE times from BEATS (or a style's planner module); never hand-type
  a time twice. The pad voice's `brightness` is a cutoff in Hz.
- **Labels:** large, inside the safe area (nothing important in the outer 5 %), on screen ≥ 1.5 s, one at a time. For exact-colour
  UI text use the overlay (`pinToScreen`).
- **Don't edit `kit/` from a style or scene.** Work around locally and note a "kit promotion candidate".
- **Numbers and claims on screen are the user's.** Never invent statistics; mark placeholders visibly ("SAMPLE DATA").
- **Don't install or download anything** without asking. Note: naming a web font in a composition makes the HyperFrames compiler
  fetch it into `~/.cache/hyperframes/fonts` on its own — check what a style's font stack names before building.
- Keep intermediate frames and caches out of Dropbox; source, final MP4, WAV, spec JSON and a few check stills stay in the project.

## Voiceover

The kit has the pieces — `beatsFromSrt(text)`, `beatsFromWords(words)`, `duckFromBeats(beats)` in `kit/time.js`, and a ducking
music bus in `renderScore`. Narration and timestamps come from the HyperFrames CLI (`npx hyperframes tts`, `npx hyperframes
transcribe`). **No demo has exercised this path end to end yet**: the first time you use it, verify sync by looking at frames
at the cue times, and report it as newly tested.

## Why AI Matters house style

`styles/wam-house/` is the channel's own look: ident, lower third, chapter card, key stat, quote card, end card, and a four-note
sonic logo, each taking copy as parameters. Read its `STYLE.md` for the design rules (the green "rule" bar draws on first; green
≤ ~10 % of the frame; red at most once). The lower third currently renders on its own background — it cannot be laid over footage
until a transparent overlay render is added.

## Adding a style

Follow `references/style-authoring.md`: three files (plus an optional planner module), one 15 s demo, the done-checklist, and
`check-frames --deep` last. Check `style-index.json` first so the new look isn't a near-duplicate — a style earns its place with a
signature mechanic (a hinge fold, a flap flip, a marble schedule), not a new palette. Afterwards run `scripts/build-index.mjs`
and `scripts/build-gallery.mjs`.

## Blender

`node "$SK/scripts/export-blender.mjs" <project-dir>` writes `export/`: a per-frame bake of camera/objects/lights, geometry as
`.glb`, textures as PNGs, reference frames and a manifest. `references/blender-translation.md` explains the mapping and
`references/blender/build_scene_skeleton.py` is the starting script.

## Known weaker demos

Every demo passes its checks, but these read worse than the rest (review notes, 2026-11-13). Their `STYLE.md` files describe the look
and the knobs (lighting, camera, palette) but do not all flag these problems yet — read the card before reusing the demo as a template:
clockwork (dim, cluttered) · pin-art (too dark, low contrast) · bead-abacus (abacus small in frame, the percent beat is confusing) ·
pinball-table (narrow table in a dark frame) · stained-glass (small window in a dark room) · cardboard-stop-motion (dark and orange) ·
evidence-board (small items on empty cork; weak first beat) · subway-map (sparse glide shots). For the older styles there is no
separate list — their `STYLE.md` "limits" sections carry the known weak spots (e.g. crt-retro inverse-video glyphs, newspaper-press's
develop beat on light scenes).

Styles 51–70 (added 2026-11-14/15, frames reviewed, never watched in motion): murmuration (thin flock; 13.6 MB, over the 12 MB
target) · point-cloud (coarse dots; 12.3 MB) · thermal-camera (dark, low-contrast opening and closing wides) · light-painting and
impossible-geometry (subject small in a mostly dark frame) · microscope-slide (eyepiece circle left of centre) · ukiyo-e (the plain
block back fills the screen during each pass) · impasto (first ~4 s mostly blank canvas) · multiplane-cel (paintings small inside
the rig) · art-deco (tower small in the final wide). Strongest of the twenty: cymatics, microscope-slide, kintsugi, impasto, mosaic.

Styles 71–84 (added 2026-11-17/18 in one overnight run, stills reviewed, never watched in motion, audio never heard): galton-board
(whole-board shot fills about half the width; quiet audio) · music-box (gold on gold, plucked-tooth tint faint) · mousetrap-chain (balls
are specks in the wide eruption; CRF 24) · wind-walker (leg tangle hard to read in wides, creature small in the final shot; CRF 24;
audio mean −19 dB) · infinity-mirror (the bias beat is dark; ~0.3 s near-black around 12.5 s) · cloud-chamber (the "empty" opening
already shows trails; small corner captions) · ship-in-bottle (ship small in the bottle, no label around 7.5–8 s) · nesting-dolls
(opening doll small) · slit-scan (641 slice renders per frame — may exceed weaker GPUs). Strongest of the fourteen: paper-marbling,
inkblot, slit-scan, typewriter, layer-print, bullet-time.

Styles 85–100 (added 2026-11-22/23, stills reviewed, never watched in motion, audio never heard; 85–90 built by Fable builders, 91–96
started on Fable and finished on Opus 5.5, 97–100 built on Opus 5.5): string-art (first two beats sparse, heavy wood grain, upper left of
the final wide empty) · pendulum-wave (the link to word order is thin; the return is a tightening, not a snap) · marionette (puppet about
half the frame height in the final wide; knee strings cross the face) · fireworks (small caption, dim beat changes at ~3.4 s and ~6.7 s) ·
flip-dot (small caption, camera static for the last 4.7 s; 10.4 MB) · loom-weave (the card shows the robot before the cloth does; 10.8 MB) ·
dollhouse-cutaway (courier small against the whole house) · pottery-wheel (tool reads like a spoon, no hands) · laser-mirrors (splitter is a
white glow) · lichtenberg (board mostly empty until ~4 s) · uv-reveal (torch floats with no hand) · endless-zoom (caption text jumps at the
loop seam) · tiny-planet and fireworks audio mean about −19.4 dB, slightly louder than the −20 target. Small captions are common in this
batch (fireworks, flip-dot, laser-mirrors, loom-weave, pottery-wheel). Strongest of the sixteen: uv-reveal, fogged-glass, lichtenberg,
tessellation-morph, endless-zoom, tiny-planet.

## Limits (true as of 2026-11-13, kit pass 7; styles 51–70 added 2026-11-15, 71–84 added 2026-11-18 and 85–100 added 2026-11-23 on the same kit)

- The Blender side has never been run — Blender isn't installed on the machine this was built on. The export and the conversion
  maths were checked; the bpy script was not executed.
- Nobody has listened to any of the audio, including the pass-7 `pluck` and `marimba` voices. Levels (and pitch/partials for the new
  voices) were measured only.
- The voiceover sync path (`beatsFromSrt` / `beatsFromWords` / ducking with real narration) is still untested end to end.
- Text uses macOS system fonts in most styles: pixel-identical on this Mac, slightly different elsewhere.
- The wam-house lower third renders on its own background; it cannot be overlaid on footage yet (no transparent render).
- Vertex-level motion (water, cloth, page curl, liquid chrome, fold meshes) is not captured by the Blender bake.
- `check-frames --deep` proves determinism within one page load and scans every HDR pixel for NaN/Inf; it cannot see NaN born inside a
  post pass except through the black-block warning. 29-newspaper-press used to change a few pixels between page loads
  (pass 6); after its willReadFrequently fix it gave identical hashes in all three pass-7 runs (`pass7.md`). Three runs is not proof —
  keep comparing it with the ±1 tolerance. Pass 7 changed ~40 demos' pixels slightly (CPU-rasterised kit canvases); every MP4 still
  matches its code (worst PSNR 27.7 dB, pin-art, unchanged; biggest drop inflatable 37.5 → 31.2 dB), but the MP4s were rendered with the
  old canvases and were not re-rendered.
- Each style's `STYLE.md` lists its own known weak spots; read them before promising a result.
