# Terrarium (`terrarium`)

A sealed glass bottle garden on a sunlit windowsill. A big, thick, clear apothecary jar with a rolled lip, rim
highlights and a cork stands in front of a painted window. A pale garden and sky sit outside. Through the glass you can
see **strata** (pebbles, charcoal, soil) as wavy bands, moss cushions, a fern, leafy stems, a small vine over a stone,
and condensation beads on the inner wall. Daylight comes through the window as a spot light with a leaf-shadow gobo,
and it can pass to a blue night and back to dawn. Labels are **hand-lettered paper tags on string**. The overlay tag
is the caption and drops in on its string, then swings to rest. A small 3D tag can be tied on the jar neck. Neutral
tone mapping keeps the paper and greens true. Bloom is light, with threshold 1.55.

**Signature mechanic:** a self-contained living system that builds itself and then cycles. The bands pour in and
settle one by one. Plants grow on a seeded plan: stems extend, fern croziers uncoil from base to tip, and leaves scale
in as the tip passes each node. Then the water cycle runs. Droplets condense, bead, and the biggest ones run down and
vanish into the soil, which darkens. Day and night pass across the window. Every step is a pure function of t, read
from one planner (`growth.js`) that the picture and the SCORE share.

**Good for:** ecosystems, closed loops, feedback cycles, "a small world that sustains itself", layered systems
(stacks, foundations, tech layers as strata), slow growth, compounding, patience, seasons and cycles.
**Avoid for:** fast or mechanical processes, lots of labels or numbers, dark or techy topics, anything needing people,
and wide panoramas (the jar is a tall subject: frame it large).

## Props (`style.props`)
| prop | returns |
|---|---|
| `jar({ kind: "bottle"\|"bowl"\|"cloche", R, H, neckR, neckH, shoulder, glass, bulge, heel })` | Group: outer glass (opaque refraction shader), far inner wall (pre-pass), rolled lip (bottle/bowl), or a knob and wooden plate (cloche). `userData.profile` = `growth.jarProfile` (`rOut(y)`, `rIn(y)`, `floor`, `top`, `mouth`) |
| `cork({ profile, h })` | tapered cork seated in the mouth; `update(t, { tIn, tSeat, lift })` (drops, seats, small bounce) |
| `strata(pours, { profile })` | one wavy side band + mounded top cap per layer (pebbles / charcoal / soil canvas textures, world-scaled UVs), plus an instanced grain stream per layer; `update(t, { wet })` |
| `rock({ base, size, seed })` | flat-shaded, partly buried stone; `update(t, dropTime)` (bounces in) |
| `moss(list)` | instanced vertex-coloured cushions; `update(t, surfaceY(x, z))` (spreads out from the seed points) |
| `fern(fronds)` | tapered frond stems + every pinna in one InstancedMesh; `update(t)` (stem grows, crozier uncoils, pinnae open) |
| `leafyPlant(stem)` | tapered stem + ovate leaves on petioles (phyllotaxis 2.4 rad); `update(t)` |
| `vine(v)` | tapered stem growing along a 3D path + heart leaves; `update(t)` |
| `droplets(drops, { profile })` | water beads on the inner wall (pre-pass, seen through the front glass): Fresnel rim + specular point, stretched while running; `update(t)` |
| `windowsill(o)` | painted sill, plaster wall with a deep window reveal, frame + glazing bars, garden backdrop outside |
| `tag(text, { tie, hang, height, yaw, stringAngle, angle })` | 3D hand-lettered paper tag on a sagging string; `update(t, { on })` (damped swing) |
| `overlayTag(text, { x, y, string, width, cap, stringAngle })` | **the readable caption**: an exact-colour paper tag on the overlay, hanging on a string from (x, y) px; `update(t, { on, off })` |
| `label(text, o)` | kit text label in the hand-lettered stack |

Style functions: `style.setDaylight(growth.dayCycle(keys, t))` (sun level/colour/azimuth, moonlight, room colour, sky
tint, glass reflections) and `style.setHaze(growth.haze(waves, t))` (condensation fog on the upper glass).
**Always end renderAt with `style.render(t)`**: it runs the refraction pre-pass and then calls `stage.render`.
Factories: `windowsill`, `jar`.

**Planner `growth.js` (THREE-free, Node-safe; `style.plan`):** `jarProfile`, `planPours` / `pourLevel` / `pourMound`
/ `surfaceY` / `grainAt`, `planGrowth` / `frondShape` / `stemShape` / `vineShape` / `mossScale`, `planDroplets` /
`dropletAt` / `wetness` / `haze`, `dayCycle`, `corkAt`, and `events(...)`, which lists every pour, grain landing,
settle, rock, sprout, unfurl, leaf, moss, cork, bead, run, drip, dusk, night and dawn event, ready for
`kit/schedule.scoreFromEvents`. The demo's `scene.config.js` builds the whole plan there and imports it into
`scene.js`.

## Signature motion
Grains fall through the neck (closed-form ballistic) and vanish into a surface that rises with an eased fill. A
mound builds under the stream, then slumps with a damped wobble. The band compacts slightly as it settles. The fern
frond centreline is integrated from curvature each frame: a gentle arch plus a coil whose curvature fades as `u` goes
from 0 to 1. Leaves pop with outBack as the stem tip passes them. Moss spreads outward from seed points. Droplets
condense with outCubic growth, then the largest run down under constant acceleration, stretching, until they reach the
soil. The camera makes slow push-ins and keeps the jar big. The overlay tag drops in on its string and swings to rest.

## Sound palette
Bed: `pad` at 110 Hz, chord [0, 7, 12, 16, 19], brightness 850 **Hz**, gain 0.8 (sets the mean, about −22 dB).
Pours: `rustle` (its pitch and density are set per layer). Pebble landings use `click` and charcoal uses `clack`
(every third grain). A soft `thud` plays when a layer settles and when the rock lands. Growth uses `pop` for sprouts,
quiet `paper` for unfurling, high soft `pop` for leaves and short `rustle` for moss. The cork gets `squish` + `thud`.
Water: a faint `blip` when a droplet beads, a faint high `whoosh` when it runs, and `bubble` as each drip lands. Dusk
and night add minor `pad` swells; dawn adds `chime` + `sparkle`. The tag gets `paper` + `tick`.

## Tuning knobs (`spec.js`)
- `jar`: shape and thickness.
- `glass`: `refract`, `ior`, `dispersion`, `tint` / `edgeTint` / `edgeDark` (thick-wall look), `rimLine` / `rimAt`
  (inner-wall line), `panels` (reflection streaks), `haze*`, `back` (far-wall level).
- `layers`: depth, grains, mound, residual, wave and texture scale for each layer.
- `plants` colours and radii; `droplets` (flatten, spec, rim); `sun` (day intensity, dusk colour, gobo); `sky`; `set`;
  `tag` (font stack, paper, swing).

## Known limitations
- Refraction is screen-space, after glass-light. Anything off-screen cannot be refracted in. The heel and shoulder
  bend only as far as a capped offset allows (0.035 of the frame), so it is not optical truth.
- The far wall and droplets are only seen through the front glass. The glass has no back-face refraction of its own.
- The tags use macOS system hand fonts (Noteworthy → Marker Felt → Chalkboard SE). They are named only in canvas JS,
  never in index.html CSS, so the HyperFrames compiler does not try to fetch them. They will differ on other systems.
- Broad leaves are flat, V-folded instanced cards. Lit from behind, they read as dark silhouettes from the camera side.
  The moss cushions are smooth, saturated lumps rather than fine fuzz, which was a deliberate choice to keep the bitrate
  down.
- The neck tag and the caption tag are both on screen in the last two beats. Keep the neck tag's text short and
  secondary, or leave it out when "one label at a time" must be strict.
- Strata walls take their radius from the jar profile ring by ring, so they hug curved bowls. They are not true
  volumes: the top cap of a lower layer is still drawn under the next one.
- Night is a fast lighting blend. There is no moon or star detail in the window.
