# Lab Glassware (`lab-glassware`)

A bright, clean laboratory bench in soft daylight. A white worktop stands in front of a pale square-tiled wall, with
window light from the left. On it is clear glassware: beakers, conical flasks, measuring cylinders, test tubes in an
enamel rack, a burette on a retort stand, and a funnel. The glassware holds saturated coloured liquids with a visible
meniscus, navy enamel graduations printed on the glass, small enamel label patches, bubbles and a foam head. Neutral
tone mapping keeps the whites white and the liquids saturated. The look is bright and colourful, never dark.

**Signature mechanic: liquids are quantities, each one a pure function of time.** Every level comes from a vessel's
volume-vs-height curve (`liquids.js`), so a cylinder reads like a bar in a bar chart against its own printed scale. To
pour, the source lifts and pivots about its lip. It tilts exactly as far as its remaining volume needs to reach the
lip (`tiltForLip`, found by bisection over the disc-slice volume integral of the tilted vessel). A parabolic stream
leaves the lip, and the target rises by the same volume in its own shape, one fall-time later. Mixing shows the
incoming colours swirling in spiral arms, which settle to a dye blend (Beer-Lambert, subtractive: blue + yellow gives
green). For the threshold beat, a burette releases counted drops. Each drop blooms briefly and fades, until the planned
drop spreads its colour through the whole vessel. Then bubbles fizz up the wall and a foam head rises and settles.
Layered liquids stack by density.

**Good for:** proportions and recipes, inputs combining into an output, thresholds and tipping points ("one more
drop"), measuring, comparing amounts, before/after, conservation ("nothing lost, just moved").
**Avoid for:** dark or dramatic moods, many labels, people or places, anything that needs real chemistry. Liquids are
only "A", "B", "C" and colour names: no chemicals, formulas or hazard content. Any number shown is SAMPLE DATA.

## Props (`style.props`)
| prop | returns |
|---|---|
| `vessel(kind, { color, foam, bubbles: n, marks, dims })` | Group (origin = centre of the base). `userData`: `profile`, `glass`, `liquid`, `foam?`, `bubbles?`, `marks?`, `ground` (**add it to the scene yourself**), `setPose({ origin, rotZ })` |
| `beaker` `flask` `cylinder` (hex foot) `testTube` `funnel` | `vessel(kind)` shortcuts |
| `burette(o)` | vessel + PTFE stopcock barrel, blue key, and a liquid thread that keeps the tip full; origin = the tip |
| `liquid(prof, { color, foam, layers })` | the liquid body (vessel-local lathe, world-horizontal clip). `userData.set({ level (WORLD y), men, low, color, colA, colB, swirl, phase, reactR, reactPos, reactCol, dropK, dropR, dropPos, dropCol, layers:[{y,color}], rip:[[x,z,time,amp]×3], visible })` |
| `marks(prof, { yA, yB, span, ppm, ticks, patch, x0, lenK, cap })` | printed graduations + an enamel label patch on a front arc of the glass (decal, hidden in the pre-pass). `helpers.unitTicks(prof, { max, minor, mid, major, reading })` builds ticks at `heightFor(volume)`, which is the exact volume curve |
| `stream({ color })` | world-space tapered tube; `userData.set(liquids.streamPoints(...) \| null, color)` |
| `drops({ color, r })` | instanced drops; `userData.set(liquids.dropState(plan, t))` (pendant swell, then a stretched fall) |
| `bubbles(n, { color })` | vessel-local bubbles pressed on the inner front wall; `userData.set(list, rIn, color)` |
| `ground(prof, color)` | contact shadow + an additive coloured light pool on the bench (shadow side); `userData.set({ x, z, y, lift, fill, color })` |
| `bench(o)` | worktop slab, nosing, front panel, tiled wall (seeded canvas tiles) |
| `stand(o)` | enamel base plate, steel rod set off to the side and behind, boss, angled clamp arm, jaws; `userData.holdAt` |
| `rack(o)` | enamel test-tube rack; `userData.slots` |
| `caption(text)` | overlay enamel plate, pre-drawn once; `userData.show(alpha)`. One fixed corner per scene |
| `stamp()` | overlay "SAMPLE DATA" rubber stamp, always on |
| `readout(text, { side, color })` | overlay reading tag whose pointer sits on a world anchor (e.g. the meniscus); `userData.update({ at, alpha })` |

Factories: `bench`, `stand`, `rack`. **Always end renderAt with `style.render(t)`.** It refreshes the matrices and each
liquid's inverse frame, runs the refraction pre-pass (glass and marks hidden), then calls `stage.render`.

**Planner `liquids.js` (THREE-free, Node-safe; `style.plan`):** `vesselProfile`, `volumeAt` / `heightFor`,
`volumeBelow` / `planeFor` / `lipC` / `tiltForLip`, `planFill` / `fillVolume` / `fillWobble`, `planPour` / `pourPose` /
`transferred` / `pourRate` / `received` / `streamPoints`, `planDrops` / `dropState` / `dropsReleased` / `dropsLanded` /
`lastDrop` / `reactFront`, `mixDyes` / `hexToLin` / `linToHex`, `swirlState`, `planBubbles` / `bubbleAt` /
`foamHeight`, `heightFrac`, `malletPitch`, `units` / `fromUnits` (one shared unit, so volume is conserved across
vessels), `events(...)`, and `labVoices(S.sound)` for `kit/schedule.scoreFromEvents`.

## How it is drawn
- **Glass:** after glass-light and terrarium. Each vessel is one closed lathe shell (outer wall up, rounded rim, inner
  wall down, thick base) in an opaque shader. It samples a same-frame half-float pre-render without glass at a
  refracted screen offset (per-channel IOR, capped offset). On top it adds Fresnel reflection of an analytic lab
  (window, ceiling strip), blue-grey edge darkening and a rim line. Glass writes depth, so liquids inside never sort
  wrong.
- **Liquid:** a lathe of the inner profile, clipped by a world-horizontal plane, so tilted liquid stays level. The
  front faces are the wall, with a dark meniscus band, back-lit middle and floor caustic. Back faces are re-projected
  onto the plane (ray-plane hit + `gl_FragDepth`) and shaded as the surface: lab reflection, meniscus ring, ripples.
  The colour stack runs base → density layers → swirl arms → reaction front → drop bloom. `FOAM` (a define) is the
  same body with cellular foam shading.

## Sound palette
- **Bed:** `pad` at 196 Hz, chord [0, 4, 7, 11, 14], brightness 1500 **Hz**, gain 0.85 (mean about −21.5 dB).
- **Pour trickle:** dense short `bubble` chirps whose pitch rises as the receiving vessel fills.
- **Glassware:** `chime` (high, short) clinks when a cylinder lifts; `clack` + clink when it is set down.
- **Drops and fizz:** a `bubble` + `click` plink for each drop. At the flip, a mallet chord plus `sparkle`. Fizz is a
  high, dense `paper` crackle with tiny pops; foam is a soft `riser`.
- **Theme:** a clean mallet theme (`chime` on a pentatonic scale from `malletPitch`), one figure per beat, resolving on
  the last beat.

Every cue comes from `events()` or from BEATS.

## Tuning knobs (`spec.js`)
- `glass`: refraction, IOR and dispersion, cap, edge tint, rim, panels.
- `liquid`: meniscus, dark band, wall shading, caustic, cap Fresnel, `swirl` (arms, twist, wind, omega, tau, settle),
  `bubble`, `foam` (cell, edge), `pool`.
- `vessels`: every dimension. `units.per` (m³ per printed unit).
- `gradu` / `enamel` (fonts, ink), `bench`, `stand` (`rodX` / `rodZ`), `rack`, `caption`, `stamp`, `readout`, `sound`.

## Known limitations
- Refraction is screen-space. Glass never shows other glass through it, so a tube behind a beaker loses its glass and
  keeps only its liquid. Anything off-screen cannot be refracted in.
- Liquids are opaque bodies with fake transmission (lighter centre, darker edges). Bubbles are therefore drawn only
  where the liquid meets the front wall. The stream does not refract what is behind it.
- Ripples and the swirl are shading only. The surface geometry stays flat, and there is no slosh when a vessel tilts:
  the level re-solves instantly.
- The tilted volume integral assumes an axisymmetric inner profile. Cylinders tilt about 76–94° to empty, which is
  correct for narrow vessels, so plan for the long horizontal pose; the foot can graze the bench for a frame or two
  as the vessel is set down.
- The stream lands with a constant fall delay. In-flight volume is not shown in the target, so conservation holds
  once the stream lands.
- The drop-beat shot keeps the stand rod beside the beaker. Keep the stand's `rodX`/`rodZ` out of a pour's path; an
  early layout put it in front of a cylinder.
- Graduation numbers are about 20 px tall in wide shots. They are readable close up, decorative in the final wide.
- Text uses macOS system fonts (Avenir Next family) in canvas only, never named in the HTML/CSS.
- Nobody has listened to the audio. Levels were measured.
