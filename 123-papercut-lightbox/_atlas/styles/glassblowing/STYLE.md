# Glassblowing (`glassblowing`)

**Look.** A daylit hot shop seen close: a cool slate-blue plaster wall with a bright window, an oak bench, two steel
rails, a dark graphite steel marver under the work, and a dark steel furnace whose round mouth glows orange-gold at the
back. A steel blowpipe (six dark marks so its turning reads, a darker heat-tinted tip and a steel collar) lies across
the rails with glass on its end. Hot glass is drawn as emission from a hot-body ramp (dull red → orange → gold →
white-gold) whose brightness follows the glass path along the view ray, so a solid gather glows evenly with darker
limbs and a blown bubble glows as a bright shell with a dimmer middle; two spiral canes show as darker streaks in the
glow and turn with the pipe. As it cools the glow drains from the far end inward, through amber, to clear aqua glass:
Beer-Lambert tint from the same path (thin wall pale, wall seen edge-on a dark teal line), fresnel reflections of a
procedural shop (sky, skylight strip, window, front softbox, furnace), a bright rim, and the two canes (cobalt,
saffron) now solid colour, cross-hatching through the vessel. The light through the clear glass lands on the marver as
aqua light with a dark outline, a bright lens line and coloured cane light. A soft heat halo surrounds the glass while
it glows. Neutral tone mapping, a tight bloom on the reheat flash and the furnace, an overlay caption top right (dark plate, warm white text, an accent bar that turns from molten orange to aqua
as the glass clears; the old text rolls up out of the plate as the new one rolls in).

Motion type: art-directed. The glass volume is held constant numerically (every key's cavity is scaled so its glass
volume equals the gather's; between keys the blended cavity is rescaled again by bisection), so the wall really thins
as the bubble grows; temperature is exponential cooling with two reheats and a final drain from the tip inward. There
is no fluid or heat simulation: shapes are hand-made keys blended point by point, the sag is a keyed droop, the swing
stretch is a keyed shape, the tools are keyed poses whose gap follows the profile at the contact. Glow colours are a
designed ramp, not a blackbody calculation. The order of operations (neck pinched near the pipe, lip opened at the
far end while still on the blowpipe) is staged for a 15 s read, not a faithful studio sequence.

**Good for:** "how a thing is made" process stories where one object transforms through a few clear stages; heat,
cooling and phase-change explainers; "shaped by breath / by hand" metaphors (a model being formed by training, a
draft being refined); craft and making channels; anything that ends in a satisfying reveal of a finished object.
**Avoid for:** numbers or text on the subject (the glass carries only two canes); many objects at once (one piece per
pipe); fast cutting (each shape change needs ~1 s to read); dark moody topics (the shop is daylit by design).
Differs from `pottery-wheel` (also a turned profile, but inflated from inside, horizontal axis, heat colour,
transparency), `lab-glassware` (finished clear vessels), `liquid-chrome` (raymarched metal blobs), `caustics` (light
through a slab is the subject there; here it is the coda).

## Planner (Node-safe): `gather.js`
- `createGatherPlan(STYLE_SPEC, cfg)` → `{ counts, V0, keys, stats, profileAt(t), radiiAt(prof, x), materialAt(prof, x),
  table(t, n), spinAt(t), spinRate(t), sagAt(t), swingAt(t), tempAt(t, m), baseTemp(t), clarityAt(t), pulseAt(t),
  flareAt(t), jacksAt(t), extent(t), events(), fingerprint() }` (details in the file header).
- Profile: ONE closed loop per key — outer (collar on the pipe → far end, 84 points) + rim (9; collapsed onto the axis
  for closed keys, a semicircle for the opened lip) + inner cavity (far end → bore, 64). Control points are splined
  (Catmull-Rom) and resampled by arc length so every key has the same point count; keys blend point by point.
- Volume: Pappus on the loop. Each key's cavity radii are scaled (bisection, 40 fixed steps) so its glass volume equals
  the gather's (`stats.cavityScale`, `stats.minWall_mm`: gather solid, bubble 19 mm, drop 15.5, necked 16.5, vase
  12.6 mm walls); between keys the blended cavity is rescaled again (also bisection), keeping 2 mm of wall.
- Turning: piecewise-linear rate (rev/s) → closed-form angle. Heat: `start`, `floor`, `tau` exponential decay, reheats
  `{ t, dur, to, tau }`, final drain `T = Tc · exp(-(t - t0 - drain·(1 - m)) / coolTau)` (tip first).
- Sound reads only the config's cue table (plain numbers), never a threshold crossing, so Node (SCORE) and Chrome
  (picture) cannot disagree; `fingerprint()` hashes profiles/temperatures at 8 times if a later demo needs to compare.
- Runs in a few ms per frame (`profileAt` is memoised on the exact t).

## Props (`style.props`)
| prop | what |
|---|---|
| `hotShop(plan)` | everything below, added to the scene; `update(t, camera)` sets the swing (pivot on the near rail) and spin, rewrites the glass, poses the jacks, moves the breath pulse, flares the furnace, colours the glow light from the glass temperature and feeds the marver its light table |
| `glassPiece(plan)` | ONE dynamic surface-of-revolution geometry (157 profile points × 97 columns, rewritten from the plan each frame: positions, analytic profile normals, per-vertex outer/cavity radius, sag offset, temperature) drawn three times: heat halo (outer surface pushed out radially, back faces, additive), cavity pass, outer + rim pass |
| `glassMaterial(inner)` | the glass shader: glass path along the view ray from the radii (hot: emission from the ramp, thin = redder/dimmer; clear: Beer-Lambert aqua tint deepening to a dark teal edge line), fresnel env reflections, sun glint, bright rim, two spiral canes turning with the pipe (`fwidth`-antialiased, wrap-free chord distance), hot → amber → clear per vertex |
| `marverMaterial()` | dark steel marver; per pixel, the ray to the sun is intersected with the glass (closest approach to the pipe axis, 48-sample radius table): honey shadow when hot; aqua light, dark outline, bright lens line and cobalt/saffron cane light when clear |
| `blowpipe()` | steel tube with six dark marks, heat-tinted tip, wooden grip, steel collar; spins with `rotation.x` |
| `jacks()` | two tapered steel blades hinged at a U-spring bow, wooden grips; `userData.setGap(gap, s)` sets the gap measured `s` metres from the tips |
| `breathPulse()` | additive pale-cyan sleeve that slides down the pipe (`userData.set(x, level)`) |
| `room()`, `furnace()` | slate-blue plaster wall with a daylit window, concrete floor; dark steel furnace with a brick panel, steel ring and a flickering mouth (pure function of t) plus its warm point light |
| `bench(marverMat)`, `paddle()` | oak bench on legs, two steel rails on posts, the marver plate; a wooden paddle lying on the bench (dressing) |
| `caption()` | overlay chip top right: dark plate, warm white 72 px text, accent bar hot orange → aqua with clarity; at a beat change the old text rolls up out of the clipped plate while the new one rolls in (0.42 s) |
| `hotBody(T)` | CPU copy of the ramp (glow light colour) |

**Signature motion.** The glass never stops turning (except one planned pause, when it droops and then recentres): a
breath slides down the pipe as a pale pulse and the gather swells into a glowing shell; the pipe swings down and the
bubble stretches; the jacks drop in and pinch a neck while the turn grooves it; a reheat flashes the glass white-gold;
the jacks push into the end and spread it into a flared lip; then the glow drains from the lip back to the pipe,
orange → amber → clear aqua, and the canes and the light on the marver appear.

**Sound palette.** Furnace roar = overlapping `rumble` segments (louder while the furnace flares) over a low 55 Hz `pad`
drone; a soft `whoosh` when the turn pauses; the breath = a low, wide `whoosh` while the pulse travels, then a `servo`
glide 150 → 330 Hz as the bubble swells; `whoosh` down and up for the swing; metal `clack` taps when the jacks touch
(three, rising); a deep `whoosh` + `rumble` burst on the reheat; a slow `penScratch` scrape while the lip is spread;
four glassy `chime` pings during the cool-down, each a little higher (pitch × 1.00, 1.12, 1.24, 1.36). Every cue time is
a beat offset in the config's cue table. Measured, not listened to.

**Knobs (spec.js).** `gather.keys` (outer/inner control points per shape; add a key and list it in the scene's `shape`
keys), `gather.counts`, `heat.{start, floor, tau, tipCool, drain, coolTau, clearHi, clearLo, ramp}`, `look.{aqua, deep,
amber, sigma, alphaMin, edgePath, rimStrength, sunSpec, sunShine, throughGlow, hotSpec, hotPath, hotFloor, stripe,
innerAlpha, halo, env}`, `bench.*` (light through the glass), `jacks.*` (blade size, bow gap, `lipTilt`), `pulse`,
`glowLight`, `set.*` (pipe height, rails, marver, wall, window, furnace), `caption`, `sound`. Scene side: the timed
`PLAN_CFG` (shape keys, spin rate keys, sag, swing, flare, reheats, cool start, pulse, jacks windows, cue table).

**Limits (hit while building).**
- Saturated glow vs tone mapping: the neutral tone mapper mixes bright values toward white, so the first ramp (peaks
  2–5) rendered the hot glass salmon/peach. The ramp is now display-referred (orange peaks ≈ 1.0–1.25, only the
  reheat flash goes to 2.6 and blooms) and the glow beyond the silhouette comes from an additive halo shell, not bloom.
  Hot glass still reads a little "smooth orange" in a still; it relies on the halo, the darker limbs and the canes.
- The halo shell is the outer surface pushed out RADIALLY: pushing along the normal folded at the concave neck into a
  visible translucent disc. It fades out near the collar and the far end (open shells show a cut edge there) and where
  the glass radius is under ~5 cm (a thin neck seen through its own shell read as a glowing collar disc).
- The glow path is computed per pixel from the outer and cavity radii at that x assuming circular cross-sections and a
  ray perpendicular to the axis (divided by the ray's cross-section component); views far along the axis are wrong.
- Clear glass has no refraction of what is behind it (alpha-composited tint + reflections), so the background shows
  straight through; it reads as glass because of the dark edge line, the rim, the canes and the dark marver behind it.
  A row of small sun/env glints sits along the middle of the vase in the final shot (outer + far inner wall).
- The light on the marver comes from a table of 48 radii along the axis: the open lip ends in a straight cut (no rim
  ellipse) and the light ignores the sag, the swing and refraction; its brightness is art-directed (added light, not
  energy-conserving).
- The opening of the lip blends closed dome → small hole ("pierced" key) → flared lip; mid-blend the end looks like a
  short straight cylinder with a flat rim for ~0.3 s.
- One pipe height (0.32 m above the marver) is a compromise: the swing (−0.26 rad) must clear the marver, and the final
  three-quarter shot must hold both the vase and its light, so the bottom ~20 % of the last frame is dark marver.
- The wooden paddle is dressing only (never moves, rarely in frame). No people; the tools move by themselves.

## Demo: `122-glassblowing` — "Breath and fire" (15 s)
| beat | start | label | what happens |
|---|---|---|---|
| 1 | 0.0 | Molten glass on a pipe | close side-on on the glowing gather turning; at 0.85–1.85 s the turn pauses, the end sags 3 cm, then recentres |
| 2 | 2.8 | One breath: a bubble | a pale pulse slides down the pipe; the gather swells into a glowing shell (cavity visible as a dimmer middle) |
| 3 | 6.0 | Turn, swing, pinch | the pipe swings down 15° (the bubble stretches) and back; the camera turns to three-quarter; jacks drop in and pinch a neck |
| 4 | 9.0 | Reheat, then open the lip | furnace flare + white-gold flash; the jacks come in from the right, pierce the end and spread it into a flared lip |
| 5 | 12.0 | As it cools, it clears | camera rises to look down over the marver; the glow drains lip → pipe through amber to clear aqua; canes and the aqua light on the marver appear |
Wow: beat 5's continuous cool-down from glowing orange to clear striped glass, with its light landing on the marver.
Camera: side-on (az −0.1) for beats 1–2, a pull to show the pipe for the breath, az −0.3 for the swing, a three-quarter
(az −0.62, el 0.3) for the pinch, back to side-on for the lip, then up to az 0, el 0.75 over the marver for the cool-down.
