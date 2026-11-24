# Guilloche (`guilloche`)

A silver dial lying face-up on the brass chuck of a small rose engine, on a dark-teal bench, seen close. A steel graver
on a brass slide arm touches the turning disc and leaves one wavy groove per turn; ring after ring, each a little
phase-shifted, the grooves weave a rosette whose cut walls glint as the disc turns under a code-built studio light.
Two brass dials at the front right set the two numbers of the rule (lobes per turn, phase step per ring); turning one
re-forms every ring at once. At the end translucent deep-blue enamel floods across the pattern and a light bar glides
over the glossy finish. Silver, brass, teal, blue — never gold on gold.

Demo: `116-guilloche` — "Two dials, endless lace" (15 s, 5 beats: One wavy ring / Shift each ring a little / The waves
weave a rosette / Turn a dial: new pattern / Simple rule, rich pattern).

Motion type: analytical, with an art-directed dial morph and a strobed time-lapse. Every groove is the closed form
r_k(θ) = R_k + a·sin(n·θ + k·s) (36 rings, constant a), evaluated per pixel; nothing is simulated or stepped. The live
re-weave in beat 4 is art-directed — a real rose engine would have to re-cut the dial: while dial 1 clicks n → n+1 the
curve is a blend (1−b)·sin(nθ+ks) + b·sin((n+1)θ+ks), and dial 2 eases s per click. The graver rides the wave on its
slide (on a real rose engine the headstock rocks against a rosette cam and the tool stays put; here the disc stays put
so the framing is steady). Fast cutting is a strobed time-lapse (see below), stated honestly: whole 1/8 turns per video
frame are invisible because the 8-lobe pattern is exactly 8-fold symmetric. The V cross-section, groove width, depth,
enamel absorption and the light bar are art-directed shading, not measured optics. No claim of historical accuracy for
the machine's layout.

## Signature mechanic (`guilloche.js`, Node-safe; `style.plan` / `style.motion`)

- `ringLayout({ count, r0, r1, amp, ampPow, ampRef })` → radii R_k (even spacing) and amplitudes a_k (`ampPow` 0 = one
  fixed amplitude, as shipped). `wave(D, k, θ)`, `ringRadius(lay, D, k, θ)` — the same formula the disc shader runs.
- `createPlan(cfg)` → `{ Theta(t), cutAt(t), designAt(t), cutterAt(t), dials, enamelAt(t), sweepAt(t), ts[], te[], events }`.
  - Disc angle Θ(t) = A(t) + (2π / nGear)·G(t): A is the APPARENT rotation (integral of piecewise-linear speed keys,
    closed form); G counts hidden whole symmetry steps, `gear` m adding m per video frame (gear changes snap to frame
    boundaries, so G is a whole number on every rendered frame). Gear 2 cuts a ring in ~4 frames, gear 4 in ~2, yet the
    finished pattern only turns by A — exactly what a 30 fps camera with a short shutter sees of a fast spinning dial.
  - Rings are cut inside-out, one full turn of Θ each, start/end times by bisection on the monotonic Θ (only + − × /,
    so Node and Chrome agree to the bit; `fingerprint(plan)` is recorded in the demo and checked in both).
  - `cutAt(t)` → `{ done, cur, arc, seam }`: rings complete, the ring being cut, how much of it (rad) and where it began
    (disc-local) — four uniforms are the whole cut state, so the shader never needs per-ring data.
  - `cutterAt(t)` → graver radius on the current ring's wave, lift (approach, hop between rings, retract), arm swing.
  - Dials: `{ id: "n" | "s", t0, from, to, steps, every, dur }` → click times (ratchet sounds), `value(t)` (the pattern
    flows over `dur` per click) and `pointer(t)` (snaps a little faster, with an outBack overshoot).
  - `events`: one `cut` per ring (start, duration, index), `touch`, `step` (gaps), `spinup` (gear increases), `lift`,
    one `ratchet` per dial click, `pour`, `bell` — SCORE is built from these with `kit/schedule.scoreFromEvents`.

## The disc shader (the look)

One `MeshPhysicalMaterial` (metal 1, clear coat 1) with `onBeforeCompile`. Per pixel: polar angle in the disc's own frame
(θ − Θ), candidate rings from the radius (a fixed loop of `ceil(2(a+w)/dR)+2` rings), first-order perpendicular distance
d = (r − r_k(θ)) / √(1 + (r_k′/r)²) and its gradient, a V profile with a rounded tip, union of cuts = the deepest groove
wins, ridges between two grooves antialiased by blending the two wall gradients over ~1 px (`fwidth` of the disc
coordinate, computed outside every branch), relief faded to a rough satin when the groove is under ~1 px wide. The
partial ring exists only on the swept arc (round end caps). The normal tilt goes into three's `normal`, roughness drops
on the bright-cut walls, the groove bottom reflects less (occlusion, stronger when the groove is large on screen so a
close-up reads as a channel and a wide shot stays light). Enamel: a wavy front along a direction; behind it the metal
colour is multiplied by exp(−σ·(base + depth·groove)) (deeper blue in the grooves), the clear coat switches on and a
rolling bead tilts the clear-coat normal at the front. The beat-5 light bar is drawn by the same shader: a soft band
(`lightBar`) moving across the disc, a sheen on the enamel plus a brighter glint on the cut walls. It replaced the kit
studio sweep, whose per-frame PMREM re-bake relit the bench and every reflection each frame (bigger file, and the strip
needed a narrow arc and a tall room to show at all).

## Good for / avoid for

- Good for: "simple rule, rich pattern", parameters and their effect (two knobs → many designs), interference / moiré /
  phase, latent-space or hyper-parameter metaphors, craft and precision, luxury product beats, title cards on metal.
- Avoid for: anything needing text or numbers in the scene, organic/natural subjects, fast cuts (the pattern needs a
  steady camera to read), very wide shots where the disc is small (ring spacing must stay ≥ ~8 px).

## Prop factories (`style.props`)

| prop | what it is |
|---|---|
| `roseEngine(plan)` | everything: bench, chuck, disc, cutter arm, dials; `update(t)` drives all of it from the plan (incl. the light bar) |
| `disc(plan)` | the hero shader mesh (a 256-segment circle); `userData.update({ theta, cut, design, enamel })` |
| `chuck()` | brass chuck, lip torus, silver disc rim, 8 slotted clamp screws + steel hub + brass dome (these turn with Θ; 8-fold so the strobe holds) |
| `cutterArm()` | brass post + foot, swinging slide rail, carriage, steel graver (pyramid tip), helical swarf curl (draw range grows) |
| `dialBox()` | two brass pedestal dials with canvas faces baked once (tick marks + icon: lobed ring / two shifted waves), red pointers, knobs |
| `bench()` | dark-teal painted bench plane (fine bump) |
| `caption()` | overlay chip at the bottom left (deep-teal plate, brass edge, wavy-ring icon, cream text), exact colours |

## Sound palette

- `hum` (50 Hz) lathe bed to the stop, a `servo` spin-down glide, `whir` per gear increase.
- `penScratch` per ring, duration = that ring's cut time, pitch .5 → 1.15 and gain rising with the ring index: one slow
  scratch, then a rising zipper as the rings speed up.
- `click` on first touch, `clack` for the step between rings and the lift; one `clack` per dial click (dial-specific pitch).
- `whoosh` (low, wide) + a quiet `rustle` for the enamel pour; `chime` (880 Hz partials) under the light sweep.
- `pad` bed (G2 root, open fifths, 650 Hz cutoff) sets the mean ≈ −24 dB.

## Knobs (spec.js)

- `rings`: count, r0/r1 (pattern extent), `amp` (wave height). `groove`: `width` (× ring spacing; > .5 = overlapping cuts
  with sharp ridges), `slope` (wall steepness → how far glints travel), `tip`, `occlusion`, `roughCut` / `roughFlat`,
  `detail` (px range where the relief fades to satin), `aaTip` / `aaRidge` (px over which the V bottom and the ridges
  between cuts are softened — the main file-size knob for this style after camera motion).
- `lightBar`: width (m), level, direction in disc coords, `gloss` (enamel sheen), `glint` (cut walls), colour.
- `enamel`: `sigma` (per-channel absorption), `base`, `grooveDepth`, `edge`, `bead`, `dir`, `wobble`, `clearcoatRoughness`.
- `studio`: the reflected world — the big top softbox makes flat silver bright, side strips and raised back panels feed
  the walls and grazing views. The env is baked once and never re-baked (`sweep` is unused but the kit requires it;
  if you use it: keep `soft` small, keep the arc inside the room, and expect every pixel to change while it moves).
- `cutter`: world angle `phi`, post radius, arm height, swing. `dials`: radius, positions, pointer sweep and ranges.
- Scene-side (scene.config.js): speed keys, gear keys, cut start + gaps, dial schedules (n 8 → 13, s .45 → 2.4), enamel
  and light-bar windows, camera shots (kit `fitShot`) and the framing gate.
- Demo choices that differ from the storyboard wording: the disc comes to rest at the start of beat 4 (not beat 5) so
  the dial re-weave is seen on a still dial (it also halves the encode cost of the morph); beat 3's "slow close pass" is
  the turning disc carrying the grooves under an almost-still oblique camera.

## Limitations (met while building)

- The first-order distance (d ≈ Δr / √(1+(r′/r)²)) bends where a ring's curvature radius nears the groove width: very
  high lobe counts at small radii (n ≳ 16 at r0 0.2) give pinched crests. Keep n·a / r0 ≲ 2.
- The strobe only holds for n-fold symmetric content: anything on the disc that is not n-fold (a logo, a 3- or 6-fold
  part) visibly jumps while gears are engaged. Gear 0 whenever the design is not the cutting design.
- The single isolated groove in a close-up (beat 1) can read as a raised wire rather than a cut: a V groove under a
  symmetric overhead softbox is shaded like a cylinder. It reads as a cut once neighbours exist.
- The beat-3 grazing close-up exaggerates the relief (slope .42 ≈ 23° walls; real guilloché is shallower) — chosen so the
  glints travel; at grazing angles the lands depend on the low back panels to stay bright.
- The light bar only shows where the disc mirrors the sweep arc toward the camera; `from/to` were set for a ~70°
  elevation finale. A different finale camera needs a different arc.
- Encoding is the real budget. A fine high-contrast pattern that moves changes every pixel: the first render was
  36.6 MB at CRF 22 (2.4 MB/s). What got it to ~12 MB at CRF 26, in order of effect: lock the camera from 9 s to the
  end (one head-on hold for the morphs, the enamel and the light bar), draw the light bar in the shader instead of
  re-baking the env, slow the apparent rotation (16–24°/s while cutting, 8°/s in beat 3, still from 8.9 s), hold the
  beat-3 camera, snappier dial morphs (each click 0.12 s, then still), soften ridge/valley antialiasing to ~2 px, no bump
  noise on the bench, slightly broader glints (roughCut .19). Camera flights between the wide and the oblique close-up
  still cost ~1.7–1.9 MB/s each.
- Not watched in motion at full speed: the strobed cutting was checked on consecutive frames (stable pattern, rings
  marching outward), not as video.
