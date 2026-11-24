# Papercut Lightbox

A deep walnut shadow box hangs on a slate wall. Seven sheets of white card, each cut into one silhouette and set 14 mm
apart in routed slots, slide in from the right: a sky with a cut-out moon and pin-pricked stars, far mountains, near
mountains, a conifer forest, a hill with a small house (four-pane windows, door, round attic window) and two round
trees, tall foreground conifers on a grassy bank, and a border of pointed leaves. Under the room light (a low lamp at
the lower left) it is white on white: each cut edge throws a soft shadow band up onto the sheet behind, sharp near the
edge and softer the deeper the gap. Lit from behind, every sheet glows by how much light the sheets behind it have
already let through: the sky is near white, each sheet in front is darker and warmer, the moon and stars blaze through
their holes, and the whole stack becomes a misty valley. Moving the camera slides the sheets against each other; moving
the lamp sweeps every projected edge; warming the lamp turns a cool dawn into a sunset, and a lamp in the house lights
its windows.

Motion type: Art-directed. The slides, camera and light moves are planned for clarity. The backlit glow is a simple
layer-transmission approximation, not a scattering simulation: a sheet passes a fixed fraction tau per colour channel
(red passes best, so deeper sheets go darker AND warmer); the light reaching a point p on sheet k is the diffuser's
brightness at p times tau for every sheet j behind k whose blurred mask covers q_j, the point where the line from a
virtual lamp to p crosses sheet j (blur grows with the gap). The room-light shadows use the same masks along the key
light's direction. Paper "formation" (cloudiness) is seeded noise. No claim of physical accuracy beyond the principle
it shows: depth from how many sheets the light has crossed.

## Good for / avoid for

- Good for: depth, layers, "what is hidden until you light it", how stacked or filtered signals combine, before/after
  reveals, atmosphere and mood pieces, title cards with a landscape or skyline, seasons and times of day (lamp colour).
- Avoid for: fine detail or small text (cuts below ~3 mm vanish; text must be big cut-out letters), many colours (one
  tint per lamp, set by tau), fast action, anything that needs the sheets to bend or fold (use `paper-pop-up` or
  `origami`), close-ups of the cut edges at grazing angles (the extrusions are flat-sided).

## Props (style.props)

| prop | what it is |
|---|---|
| `lightbox(plan)` | everything below wired to one plan (`createLightboxPlan`); `update(t)` sets every slide offset, light level, lamp position, colour and the bloom from the plan. Adds itself to the scene |
| `frameBox(plan)` | walnut shadow box: four walls and a back board (metre UVs; grain along the slots on the side walls), a bevelled front lip with the 0.48 × 0.27 m opening, one dark slot groove per sheet on each inner wall, and the slate wall plane |
| sheets (inside `lightbox`) | each planner outline extruded 0.8 mm (`ExtrudeGeometry`), clipped at the box's right face so a sliding sheet emerges from its slot; ONE patched MeshStandardMaterial program for all seven (`throughStack` emission + `roomShadow` on the direct light) |
| diffuser (inside `lightbox`) | the backlight panel behind the sky sheet, seen only through the moon and stars: emits `panelGain` × the panel brightness (base + hot spot) |
| `caption()` | overlay plate (bottom left, exact colours, ~44 px cap height); `show(prev, text, u)` slides the new line in from the right like a sheet into its slot, pushing the old line out to the left — never two lines cross-faded |

Planner `layers.js` (Node-safe; `style.plan`): `makeDesign` (the seven outlines: mountain ranges, tiered conifers,
house + round-tree inserts, polar leaf border), `rasterize` (even-odd, exact spans), `blur`, `createLightboxPlan(cfg)`
→ `z`, `shapes`, `lamp`, `slideAt`, `roomAt`, `backAt`, `warmAt`, `lampAt`, `lightAt`, `bakeMasks(nx, ny)` (R sharp,
G/B/A blurred 3/10/24 px), `events()`, `fingerprint()`. The demo records `fingerprint()` and throws in Node or Chrome
if they differ (`PLAN_RECORD=1` to re-record after changing the design or timings).

## Signature motion

1. Oblique close-up: the sky sheet settles, then the far- and near-mountain sheets slide out of the right wall's slots;
   a soft shadow band lies above every ridge.
2. The camera swings to the front while the forest, hill-and-house, foreground and leaf-border sheets slide in one by
   one with a click: white on white, almost flat.
3. Room light fades, the backlight flickers on: the stack becomes a glowing dawn valley (cool sky, warm horizon glow,
   near sheets dark and warm), and the camera pushes in until the picture fills the frame.
4. A sideways track: the sheets slide against each other (parallax) while the lamp's hot spot sweeps left to right and
   every projected edge moves with it.
5. The lamp warms from dawn to sunset and sinks; the house window lights.

## Sound palette

Per sheet a `paper` slide + light `rustle` and a `click` + small wooden `thud` when it lands (pitch rising with the
sheet number); a `clack` switch; a five-note `pad` swell + faint `chime` as the backlight comes up; two slow low
`whoosh` gusts + a sparse `rustle` (wind) during the track; a warmer `pad` chord for the sunset; a four-note `pluck`
arpeggio + `chime` when the window lights; a quiet `pad` bed (98 Hz) throughout. Every cue comes from `plan.events()`.

## Tuning knobs (spec.js)

- `backlight`: `tau` (per channel; lower = more contrast between sheets), `gain`, `base` / `hot` / `hotSigma` (the
  diffuser's even level and hot spot), `soft` (how fast projected edges blur with depth), `panelGain` (moon/stars),
  dawn / sunset colours, window lamp gain and radii, `bloom` (strength at full backlight).
- `room`: key / fill levels, `shadow` (how much of the key a sheet blocks), `soft`, `frame` (lip shadow).
- `paper`: colour, `formation` (backlit cloudiness, also the dither against banding), `roomMottle`.
- `frame`: opening, lip depth, wall thickness, wood. `caption`: plate geometry, font, `roll` / `lead`.
- The `key` light must come from BELOW the ridges (lower left): a ridge has paper below it, so a light from above hides
  its own shadow behind the sheet and white-on-white reads as blank.
- Planner (`PLAN_DEFAULTS`, overridable per scene): box sizes, gap, slide windows, room fade, backlight flicker table,
  lamp keys, warm window, window-lamp flicker; `DESIGN_DEFAULTS` is the artwork.

## Known limitations (hit while building)

- Room-light shadows on the sheets are analytic (masks projected along the key direction), not shadow-mapped: they
  ignore the cut edges' thickness and anything that is not a sheet or the lip. The box and wall use a normal shadow map.
- Near the top, the leaf border and the tall foreground conifers have only the sky sheet behind them, so they glow
  lighter than the bottom of the same sheets (correct for the model, but it reads as mist rather than a dark frame).
- The beat-3 switch-on passes through ~0.2 s of a dull grey mix of both lights.
- With perspective, the box's inner side walls can show past the sheets' edges through the opening; the leaf border's
  opening is kept small enough to hide them in this demo's shots.
- The caption push takes 0.28 s; in that window the two lines are each partly visible (never overlapping).
- The masks are 1 mm per texel: projected edges are never sharper than ~1 mm (fine here; the room shadows are soft).
- Fonts: the caption uses the system stack (Avenir Next / Helvetica Neue).
