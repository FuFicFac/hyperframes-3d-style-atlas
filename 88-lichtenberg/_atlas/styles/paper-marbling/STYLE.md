# Paper Marbling (`paper-marbling`)

**Look.** Paper marbling (ebru / suminagashi method) in a shallow navy-rimmed enamel tray of thickened water on a pale
wood studio table, seen from above with a slight tilt, in soft daylight. A glass pipette lets drops of ink fall; each
spreads into a flat disc and pushes every earlier colour outward into concentric rings. A stylus is drawn back and forth
and a comb is pulled across; the rings stretch into hearts, feathers and chevrons. A sheet of paper is rolled onto the
bath, peeled back over itself carrying the pattern (the bath is left almost clean), then lifted and turned to the camera
as a finished print. Flat saturated inks: indigo, vermilion, ochre, teal, cream.

**Signature mechanic.** The pattern is not simulated. `marbleplan.js` lists closed-form marbling operations with start and
end times; the fragment shader (and `plan.sample()`, the same loop in JS) inverse-maps each pixel through the operations
started so far, newest first, the running one applied by its progress:

| operation | forward map | inverse used per pixel |
|---|---|---|
| ink drop (centre C, radius r) | `P' = C + (P-C)·sqrt(1 + r²/|P-C|²)` | `P = C + (P'-C)·sqrt(1 - r²/|P'-C|²)`; inside r = the new ink |
| tine line (point A, unit dir M) | `P' = P + M·α·λ/(d+λ)`, d = distance from the line | `P = P' - M·(same shift)` (exact: d does not change along M) |
| comb | the same, d = distance to the nearest of many parallel tines | same |

A drop's radius grows as `r·sqrt(ease(u))` (area eases in). A stroke only displaces ink where the tool tip has already
passed (`g = smoothstep((tip - s)/soft)`), and is the exact closed form when the stroke ends. So any frame is a pure
function of t, seeking in any order.

**Good for.** "Small simple moves compound into complexity"; transformations applied in sequence (layers of a network
transforming an input, a data pipeline, function composition); mixing; irreversible processes; "the output records every
step". **Avoid for** anything needing numbers, text inside the picture, precise diagrams, or dark/moody looks.

## Files
- `spec.js` — palette, materials, lights, tray, inks, look (rim, mottle, residue, ghost), operation defaults, tools, paper, caption, sound.
- `marbleplan.js` — **pure planner, Node-safe** (imports only `kit/time.js`): `ringDrops`, `createPlan`, `marbleVoices`.
- `style.js` — `createStyle(stage)`: materials with the marbling function injected, props, `style.plan` / `style.motion` = the planner.

## Planner (`marbleplan.js`)
- `ringDrops({ start, cadence, hop, groups: [{ c, inks, r }] })` → drop list (several drops per centre = rings).
- `createPlan({ tray, inks, maxOps, defaults, drops, strokes, tools, paper: {...spec.paper, t}, end })` → plan:
  - `ops` (start order), `stateAt(t)` (three `Float32Array(maxOps·4)` shader uniforms), `sample([x, y], t)` → `{ ink, op, q, p }`,
    `coverage(t)` (share of the bath inked).
  - `pipetteAt(t)` → `{ tip, ink, visible, beads }`, `stylusAt(t)`, `combAt(t)`, `combShape`.
  - `paper.pointAt(x, z, t)`, `paper.cornersAt(t)`, `paper.state(t)` → `{ visible, covered, ghost }`.
  - `events()` → `plip` per drop, `drag` per stylus stroke, `comb`, `lay`, `peel`, `present` (same times as the picture).
- `marbleVoices(spec.sound)` → voices for `kit/schedule.scoreFromEvents`.

## Props (`style.props`)
| prop | what |
|---|---|
| `marbling(plan, { jars })` | everything for one plan (adds itself): table, tray, bath, tools, sheet; `update(t)` |
| `bath()` | the liquid plane; colour = marbling function (4 rotated-grid taps per pixel) on a lit physical material |
| `sheet(plan)` | paper strip mesh, vertices rewritten from `plan.paper.pointAt`; top = white with wet show-through, underside = the print (mirror image, as in the craft) |
| `tray()`, `table()`, `jars(list)` | set |
| `pipette()`, `stylus()`, `comb(shape)` | tools, origin at the tip; posed by the plan's tracks |
| `caption()` | overlay chip (top centre), `userData.show(text, alpha)` |
| `helpers.marbled(material, { base, paper })` | inject the marbling function into any standard/physical material with an `aMarble` vec2 attribute |

## Signature motion
- Drops fall from the pipette in quick threes; rings push their neighbours aside.
- Stylus strokes alternate direction (hearts and teardrops); the comb crosses them (feathers / chevrons).
- Sheet: carried in from the side, rolled down from the far edge, rests (ink soaks through faintly), peeled from the near
  edge back over itself while it is drawn toward the viewer (the fold stays at the near edge and the print emerges face
  up), then moves rigidly up to face the camera while the camera lowers. One camera move in the whole piece.

## Sound palette
`bubble` ×2 per drop (pitch by drop size), low `whoosh` + `bubble` per stylus drag, `whoosh` + `rustle` for the comb,
`paper` for laying, `paper` + `whoosh` for the peel, `whoosh` + `chime` for the presentation, a quiet `pad` bed.

## Tuning knobs (spec)
- `tine.alpha / lambda` — how far and how sharply a stroke drags (larger λ = rounder, smaller = cusped). `comb.spacing`.
- `drop.spread`, radii in the recipe — ring widths; total drop area ≈ tray area gives ~80 % ink coverage.
- `look.rim / mottle` — hand-made feel; `look.residue` — how clean the bath is left; `look.ghost` — show-through.
- `paper.peel.angle / radius / pull` — fold-back shape and how far the sheet is drawn toward the viewer.
- `paper.present.centre / elevation` — final pose (the scene fits the final camera to it with `kit/framing.fitShot`).
- `maxOps` — shader array size (drops + strokes must fit).

## Known limitations
- The stroke "follow the tip" window is an inverse-space blend: mid-stroke it is not exactly area-preserving (it is at the
  end of each stroke). With `soft` smaller than about 1.5 × `alpha` the map can fold near the tine.
- Edges are anti-aliased by 4 sub-samples; hair-thin filaments (after several combs) shimmer or break up. Keep to
  one or two comb passes at this scale.
- Operations overlapping in time are composed in start order, each by its own progress; that is a consistent picture but
  not what simultaneous real strokes would do.
- The sheet is a zero-thickness strip (no paper edge); the peel slides the unpeeled part across the bath (in the real craft
  the sheet is lifted or dragged over the tray edge); the lay/peel curl is a fixed-radius cylinder, not cloth.
- The bath has no ripples or refraction; ink is flat colour with a rim and mottle (no pigment granulation, no ox-gall veins).
- The mottle uses a `fract(sin)`-free hash but is still GPU-arithmetic dependent: pixel-identical on this Mac only.
- Tools enter from off-frame; ink cups (`jars`) exist but the demo omits them because the tray fills the frame.
- Print orientation: the underside print is the bath's mirror image and ends upside-down relative to the bath view.
