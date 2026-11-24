# Cyanotype (`cyanotype`)

A sun print. A sheet of sensitised paper — pale yellow-green coating brushed onto white paper, ragged brush ends —
pinned with red push pins to a pale wooden drawing board, filling the frame, seen from high in front. A green fern
frond, a brass key, a grey-blue feather and a strip of white lace are tossed onto it; the sun comes out and every
uncovered point darkens, yellow-green → sage → bronze-grey. Lifted, the objects leave pale silhouettes (the feather,
lifted early, a half-dark ghost). The sheet slides into a white enamel tray with a blue rim, a water front with a
bright crest sweeps across, and behind it the exposed paper floods to deep Prussian blue while the shapes turn
paper-white. Bright throughout: sunlit lime coating, green, brass, red pins; the finale is blue and white.

Demo: `120-cyanotype` — "Sunlight makes the print" (15 s, 5 beats: Lay things on the paper / Sunlight changes the
paper / Less time: a paler mark / Lift them: shadows stay / Rinse: it turns deep blue).

Motion type: analytical dose; the colour response and all object motion are art-directed. The dose at every point of
the paper is the exact time integral of a piecewise-linear sun level over the time that point was uncovered
(closed form, no stepping); the print value k = (1 − e^(−dose/τ)) / norm and the colour table (dose, washed) → colour
are hand-tuned to look right — no chemistry is simulated, and nothing about real exposure times is claimed. Shadow
softness per object is a fixed blur of its silhouette (a stand-in for its height), not a traced penumbra. The sun
goes in at the start of beat 4 so the lifted silhouettes stay unexposed (a real printer would take the frame indoors).
Drops, lifts, the slide and the water front are eased closed-form curves, not physics.

## Signature mechanic (`exposure.js`, Node-safe; `style.plan` / `style.motion`)

- `sunLevel(keys, t)` / `sunDose(keys, t)`: piecewise-linear level and its integral S(t) (trapezoids + one partial
  segment). S is the dose of an uncovered point.
- `createPlan(cfg)` → `{ sunAt, doseAt, coverAt, covered, response, kAt, objectAt, pinAt, sheetAt, washAt, events,
  Sfull, tau, kNorm }`.
  - Each object: `{ id, ch (mask channel), pos, rot, drop: { t0, dur, from, spin, kind: "toss"|"glide", ... },
    lift: { t0, dur, to, spin, kind, leave } }`. It covers the paper from landing (`on`) to `off` = lift start +
    `leave` × lift duration. covered_i(t) = S(min(t, off_i)) − S(min(t, on_i)).
  - dose(p, t) = S(t) − Σ mask_i(p) · covered_i(t): the scene passes S and the four covered integrals (a vec4) to the
    paper shader each frame; the masks are baked once.
  - k(d) = (1 − exp(−d/τ)) / (1 − exp(−Sfull/τ)), τ = `tau` × Sfull, so the open paper reaches k = 1 exactly when the
    sun goes in. `kAt(id, t)` gives the value under an object (the demo prints it: feather ghost k ≈ 0.46).
  - `objectAt(i, t)`: toss (outQuad slide + falling arc + spin), glide (outSine drift, rocking, for the feather),
    settle hop, lift (rise, accelerating fly-off, flutter for the feather). `pinAt`, `sheetAt` (hump over the tray
    wall, eased down to the tray floor), `washAt` (front position along the sheet, ±∞ outside the wash).
  - `events`: land, settle, lift, sunOn, sunOff, pin ×4, slide, tray, wash, chime — SCORE is built from these with
    `kit/schedule.scoreFromEvents`. `fingerprint(plan)` hashes every event time + Sfull; the demo records it and checks
    it in Node and in the page.
- Silhouettes as plain data (metres, object-local, y up): `fernFrond` (alternate lobed pinnae angled to the tip on a
  bowed, tapering rachis + stipe), `keyOutline` (quatrefoil bow with a hole, collar, shaft, a bit with two wards),
  `featherOutline` (curved rachis, narrow leading and wide trailing vane, splits running along the barbs),
  `laceLayout` (scalloped edge with picots, flower motifs of 6 petal holes, net diamonds, eyelet row). `placeLocal`
  maps object-local points to the sheet. The same data builds the meshes AND the print masks, so a print always
  matches its object.

## The sheet shader (the look)

One `MeshStandardMaterial` (`onBeforeCompile`). Per pixel: mask = RGBA DataTexture (fern, key, feather, lace coverage,
each blurred by the object's `soft` width; the feather's vane covers 0.86 and its down 0.5, so its print has
gradation); dose = S − dot(mask, covered); k from the response; unwashed colour = 3-stop table (coat → sage → bronze);
washed colour = 3-stop table on k^washGamma (paper white → mid blue → Prussian); the water front (a wavy line along
x) mixes unwashed → washed, with a short development band behind it where the blue deepens; outside the brushed
coating (second DataTexture: R = coating with ragged, streaky brush ends, G = paper tooth) it is plain white paper.
Wet paper gets a little darker and glossier. The water is a separate transparent plane in the tray: faint tint, a
white crest just behind the front, the crest's slope and slow ripples tilting its normal for reflections, and a broad
soft sheen band that drifts diagonally over the wet print after the front has passed (keeps the final hold alive).

## Good for / avoid for

- Good for: "exposure builds up", time-integration / accumulation, "what blocks the signal leaves a mark", masking,
  photography and printing history, before/after reveals with a colour flood, botanical or object portraits, title
  cards on a blue print, anything that should end blue-and-white.
- Avoid for: overlapping objects (masks are summed per channel, one object per channel, max four), objects that move
  while exposed (the mask is baked at the resting pose), fast cuts, scenes that need a dark look.

## Prop factories (`style.props`)

| prop | what it is |
|---|---|
| `sunPrint(plan)` | everything: table, board, sheet, the four objects, pins, tray, water; `update(t)` drives all of it from the plan (sun level, poses, dose uniforms, slide, water front; the shade light follows the sheet) |
| `sheet(plan)` | paper plane with the print shader + a thin edge slab; bakes the masks and the coating; `userData.update({ S, cov, front })` |
| `fern()` | extruded lobed pinnae + rachis merged into one mesh, tips curled up, vertex-colour greens |
| `key()` | bevelled brass extrusion of `keyOutline` (bow hole, collar, wards) |
| `feather()` / `lace()` | alpha cards: baked colour canvas + alpha canvas on a gently curved plane, alpha-tested shadows |
| `pin()` | red push pin (head, neck, cap, steel washer) |
| `board()` / `table()` | pale wooden drawing board (kit `woodTexture`), sage-blue table |
| `tray()` / `water()` | white enamel tray with blue rim strips; transparent water plane with the front + crest shader |
| `caption()` | overlay chip at the bottom left, inside the 5 % safe area (plate x 110.., y 818–1010): Prussian-blue plate, pale-lime edge, sun icon, cream bold text with a 54 px cap height (5 % of frame) on two balanced lines (a break after a colon preferred). Labels roll: the old one slides up and out of the plate as the new one comes in, so they never overlap |

## Sound palette

- `pad` bed (A2, open fifth + tenth, 600 Hz cutoff) the whole time; a second, brighter pad (A3 maj9, 2.4 kHz) swells in
  while the sun is out — "the pad brightens with the dose".
- `thud` + a short paper `rustle` per landing (pitch per object; the key adds a metal `clack`, the feather is only a
  soft rustle), a `tick` as each settles; a low `whoosh` as the sun comes out and goes in.
- `whoosh` out per lift (higher for the feather); `click` ×4 as the pins pop; `paper` slide + `whoosh` into the tray,
  a soft `thud` as it lands.
- Water: a long low `whoosh` (in) + `rustle` + five `bubble`s along the front; two `chime`s (root, then a fifth up)
  as the blue floods in.

## Knobs (spec.js)

- `print`: `tau` (how fast the paper saturates, as a fraction of the full dose), the two colour tables (stop colour,
  k position), `washGamma`, `front` (`width`, `develop` = how far behind the front the blue reaches full depth,
  `wobble`), `wetDarken`.
- `objects.<id>`: `pos`, `rot`, size/shape parameters, `soft` (print edge blur in metres), feather `cover` / `down`
  (how much light the vane / the down let through), fern `curl`, key `thick` / `bevel`.
- `sheet`: size, `coat.inset` / `rag` / `streak` (brushed coating), `maskPx` (mask resolution), `fibre`.
- `tray`, `water` (tint, alpha, crest strength and width, ripple, `sheen` strength / width / direction / travel and
  timing after the wash starts), `brassEnv` (env reflection boost on the key), `board.wood`.
- Scene-side (scene.config.js): the sun keys, each object's drop and lift, pins, slide, wash window, chimes, the
  camera shots (kit `fitShot`) and the framing gate.

## Limitations (met while building)

- A transparent alpha card casts its whole rectangle as a shadow unless the MAIN material has an `alphaTest`: three r181
  copies the material's `alphaTest` into the depth material (a `customDepthMaterial`'s own `alphaTest` is overwritten).
  The cards use `alphaTest: 0.06`.
- The print masks are baked at each object's resting pose. An object that moved while exposed would need a mask per
  pose (or a shadow-map accumulation, which is not seek-safe).
- One object per mask channel and four channels: more objects need a second mask texture.
- The sun has to go in before the lifts, or the silhouettes keep exposing; the demo dims to bright open shade, which
  keeps beat 4 bright but is a staging choice, not something the viewer is told.
- Close push-ins magnify the mask: at ~2× the wide the silhouettes soften; the mask is 1300 px/m.
- A lifted object near a close camera grows fast (perspective): the feather's lift path is kept low (0.2 m) and sideways
  so it exits the push-in shot to the right instead of looming at the lens.
- The unwashed exposed colour is a warm grey-brown (`#766a57`): a cooler slate read as drab olive under the warm sun,
  and the warmer bronze makes the flip to Prussian blue stronger. Brush streaks in the coating (5 % density) show in
  both the bronze and the blue; they are static, so they cost little bitrate.
- Demo choices beyond the storyboard: the sun goes in at 8.45–8.8 s (see Motion type); beat 5 pulls back to show board
  and tray together while the sheet slides (the tray is otherwise never seen), then pushes in; the wash starts at 13.0 s.
- The big two-line caption needs the open paper at the bottom left, and the lace starts only ~25 px right of it in the
  wide. So the beat-3 push-in stops at ~1.5× with the feather right of centre (a tighter push puts the lace's left end
  under the caption), and the beat-5 pull-back starts only once the sheet is moving (a camera that leads the sheet
  slides the lace under the caption). The demo's framing gate checks key, feather and lace against the caption box in
  every shot and move; the fern's stem end may pass under it in the wides.
- A spec key used twice silently wins last (`caption.icon` was both a size and a colour: the plate width became NaN
  and the caption vanished without an error). The size is `iconSize`.
- Measured, not heard: audio levels come from `check-frames` (mean ≈ −23 dB, peak ≈ −2.4 dBFS).
