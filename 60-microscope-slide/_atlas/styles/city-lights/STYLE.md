# City Lights

**Look.** An invented harbour skyline at blue hour, seen across water. Four seeded rows of towers and mid-rise blocks in deep
indigo (front row crisp, back rows lifted into a violet haze), tens of thousands of warm and cool lit windows, blinking red
rooftop beacons and antenna masts, a deck-arch bridge with sodium lamps and streaming head/tail-light dashes, a lamplit quay
road, a dusk gradient sky (a last band of orange behind the city, mauve, then deep blue) with the first stars, and water that
re-renders the whole world mirrored and smears it into shimmering vertical streaks. It is a twilight scene but luminous: the sky,
the reflections and the windows carry the brightness. No real landmarks; every skyline is generated from a seed.

**Signature mechanic: windows as pixels, as a pure function of time.** The skyline is ONE `InstancedMesh` of boxes. Its facade
shader draws every window from a per-window state atlas (RGBA8 `DataTexture`, one texel per window: front columns then side
columns) that the THREE-free planner `cityplan.js` rewrites for time `t` every frame (`plan.fillWindows(t, data)`, ~8 ms for
78 k windows) and uploads before the frame renders. Window state:

- **natural** — each window has a seeded on-time (a west-to-east dusk wave + floor jitter; ~20 % already lit at t = 0), a
  per-building busy/asleep density, a warm or cool colour and level; a few flick off and back on later;
- **programs** take a building over window by window (a hashed takeover cascade, `windows.take.stagger`), so the skyline visibly
  *organises* instead of cross-fading: `bar` (lit floors = value / max × floors, eased; the LED roof sign counts up with it),
  `fill` (reading order, floor by floor, the head window flashing; sign shows %), `bitmap` (a 5×7 dot-matrix word or icon,
  optionally `scale`d so one font pixel = k×k windows, wiped on column by column), `countdown` (floors go dark from the top in
  steps while the roof sign shows the digit, then an optional relight);
- **pulse** — a lub-dub pair of light fronts runs across the whole skyline (lit windows flare and whiten, dark ones glimmer).

LED roof signs and the blimp banner are the same idea at small scale: a shared LED atlas filled each frame from
`kit/bitmapfont` cells (no font rasterisation, so they are bit-stable), drawn as round dots.

## Good for / avoid for

Good for: scale and totals ("every window is one person"), comparisons between a handful of values (bar row), growth / progress
(fill), adoption spreading (the dusk wave, a pulse), city / population / energy / night-shift / always-on topics, countdowns, and
big closing statements spelled across a block.

Avoid for: more than ~6 bars or values with more than 3 digits (signs get small), precise numbers (a bar resolves to whole floors),
daytime or cheerful-bright moods, close-ups of single objects, anything that needs real architecture or a recognisable city.

## Prop factories (`style.props`)

| prop | what it makes |
|---|---|
| `sky()` | gradient dome (early → late stops, deepening with `plan.duskAt`), horizon glow toward `sky.glowAzimuth`, hashed stars fading in; `update(t, plan)` |
| `skyline(plan)` | the whole city: one InstancedMesh + window atlas; `update(t)` fills and uploads the atlas |
| `beacons(plan)` | blinking red roof beacons (+ antenna masts on the tallest); `update(t)` |
| `leds(plan)` | the shared LED atlas: `panel(id, cols, rows, pitch, { color })`, `update(t)` (text from `plan.ledText`, scroll from `plan.bannerOffset`) |
| `ledSign(leds, lot, { id, cols, rows, pitch, legs })` | framed LED panel on a roof; `update(t, plan)` rises it in before its program |
| `bridge()` | deck-arch bridge (piers, two arch ribs per span, spandrel posts, railings, sodium lamp posts) |
| `quay()` | quay wall, street ground plane, quay lamps |
| `traffic(plan, lanes)` | soft additive head/tail-light dashes on planned lanes; `update(t)` |
| `water()` | the water plane + half-res HDR mirror target; `renderReflection(root)` before `stage.render`, `update(t)` |
| `blimp(leds, { id, len, banner })` | blimp with a scrolling LED banner (in-world label) and a blinking nav light |
| `ferry(leds, { len, banner })` | ferry with a lit cabin strip and an optional LED banner |
| `caption(stage, beats)` / `tag(stage, text, { from, to })` | overlay caption card (bottom-left, exact colours, 1:1 px) and the amber "SAMPLE DATA" tag above it |
| `lampDots(points, color, gain, r)` | instanced emissive lamp dots |

`style.root` is the mirrored world: add everything that should reflect to it (not the water).

## Planner — `cityplan.js` (Node-safe; `style.motion`, `style.plan(opts)`)

- `layoutCity(spec, features, { seed })` → lots (seeded rows + hand-placed feature buildings; fillers never overlap a feature).
- `planCity(spec, { features, programs, pulses, lanes, banners, duration, seed })` → `{ lots, byId, atlas, fillWindows(t, data),
  ledText(id, t), signOn(id, t), bannerOffset(id, t), carsAt(lane, t), beaconLevel(i, t), duskAt(t), starsAt(t), pulseAt(x, t), events }`.
- `fitShot(box, { fov, y, x, elev, az, pad })` → a camera key that frames a world box (the demo fits every shot with it and gates
  the build on `kit/framing.framingReport`). `lotBox(lot, spec)`, `bitmapGrid(text, cols, floors, { scale, row0 })`, `keyed`, `ih`.
- `cityVoices(spec.sound)` + `kit/schedule.scoreFromEvents(plan.events, voices)`; `cityBed(duration, spec.sound, { swellAt, hornAt })`.

## Sound palette (all from the plan)

- **city hush**: overlapping low `rumble` swells; a warm `pad` in slow chords (brightness 760 Hz — a cutoff in Hz).
- **dusk wave**: soft `tick`s binned from the planned window on-times (density → gain).
- **floors**: one `tick` per floor lit by a bar or fill (pitch rises with the floor); a two-note `blip` when a bar tops out.
- **word**: a `blip` per letter as the wipe passes it. **pulse**: a low `thud` per front (lub-dub).
- **countdown**: a `clack` per step, tiny ticks per floor going dark, a `chime` on the relight.
- **warm synth swell** (`pad` + quiet `riser`) into the close; a **distant horn** (two low flicker-free `buzz` notes + a soft pad, panned left).
- Demo measured mean −18.8 dB, peak −4.1 dBFS (measured, not listened to).

## Knobs

`city.rows` (z, x range, floors, cols, cell width, depth, gaps, haze, types), `city.floorH`, `city.xCenter` / `profileWidth`
(skyline peak), `windowTypes` (margins, density, cool share, mullions), `windows.natural` (wave timing), `windows.lotDensity`,
`windows.gain` / `programGain`, `windows.take`, `windows.pulse`, `programs.*` colours, `facade.*` (indigo tones, haze), `sky.*`
(stops early/late, glow, stars), `water.*` (distort, smear, fresnel, waves, rtScale), `bridge.*`, `traffic.*`, `beacon.*`, `led.*`.

## Known limits (seen while building the demo)

- Windows are a shader grid on plain boxes: no setbacks, crowns or curved towers — the skyline reads as blocks. Rooftops are flat
  (only masts, beacons and signs break them).
- The reflection is a planar mirror re-render at half resolution: no depth-correct ripple occlusion, and the bridge deck/arches
  reflect without perspective-correct distortion. Reflections of very fine detail (masts) shimmer.
- Thin features (masts, far window edges) crawl slightly under a moving camera; the box-filtered window mask softens far windows
  into a uniform glow rather than aliasing.
- A bar resolves to whole floors (plus one partial floor on the front face); values are approximate by construction.
- The bridge sits close to the camera in tight shots and can crowd the caption corner; keep tight shots behind it (z ≥ ~110).
- The facade shader must stay free of branches around `fwidth`/`texelFetch`: a version with an `if` per face produced edge pixels
  that changed between page loads (undefined derivatives in divergent quads). Keep it arithmetic.
- Text on the caption uses the macOS system face Avenir Next: pixel-identical on this Mac, different elsewhere. LED text uses the
  kit 5×7 bitmap font and is font-independent.
