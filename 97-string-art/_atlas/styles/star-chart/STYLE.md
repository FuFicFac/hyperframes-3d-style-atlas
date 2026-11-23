# Star Chart (`star-chart`)

**Look.** A planetarium night. A deep blue-black dome of sky with a visible gradient (navy zenith to a lit blue horizon, a faint
warm afterglow low in the west), a procedural Milky-Way band with clumps, knots and dark lanes, and ~5 000 seeded stars with
size and colour variety (blue-white to orange) and a gentle deterministic twinkle that grows near the horizon. Below: a low dark
horizon of two hill layers, fir and round trees and an observatory with a warm open slit. Over the sky, antique celestial-atlas
graphics in fine gold line: a coordinate grid (hour circles + declination circles, brighter equator), a ticked ecliptic,
constellation stick figures with engraved rings round each star, engraved figure outlines, serif name plates and small italic star names.
The gold carries real brightness (line level > 1 = HDR, a little bloom).

**Signature mechanic.** An INVENTED sky as a pure function of time (`skyplan.js`). A seeded catalogue on the sphere (never the
real sky or real names); the whole sphere turns about a pole at altitude `sky.lat` with a closed-form spin (a time-lapse wheel at
the start in which bright stars trail, easing to a slow drift), so stars rise in the east (left) and set behind the hills in the
west (right). Constellations are authored in WORLD alt/az at their reveal time and converted to celestial coordinates, so they
turn with everything else. Chosen stars brighten one by one (flare + glass ping), a gold ring circles each, gold lines draw star to
star with the atlas gap at each end, an engraved figure draws/fades up around the stick figure, a name plate writes on left to
right with a bright pen edge, star names fade in. A presenter's arrow sweeps on great circles to each star as it is named (faint
beam back to the presenter, bottom right). A dashed gold line connects two constellations while the arrow glides along it.
Shooting stars are planned events. Each constellation = a concept, each star = a part.

**Good for:** big-picture overviews, how scattered points form a pattern, navigation / "find your north star", origin stories,
connecting ideas across distance, naming the parts of a whole (2–3 concepts with 4–7 parts each).
**Avoid for:** data with real numbers (no axes), step-by-step mechanisms, anything that needs the REAL sky (this is invented on
purpose), more than ~3 constellations in 15 s, long text (star names are one word; plates two words).

## Files
- `spec.js` — every look number (palette, sky radii, spin, catalogue, twinkle, Milky Way, trails, grid, ecliptic, hero stars,
  lines, figure, link, plate, names, pointer, shooting stars, horizon set, caption, sound).
- `skyplan.js` — PURE planner (no THREE): turning-sky maths (`spinAngle`, `toWorld`, `fromWorld`, `altAz`, `tangentBasis`,
  `greatCircle`), `catalogue(S)`, `FIGURES` (drum, lyre, compass — 2D polylines; add your own), `planSky(S, input)` → plan +
  `events`, queries `starHighlight`, `plotClock`, `figureState`, `plateState`, `pointerState`, `shootingState`, camera helpers
  `constellationPoints`, `linkPoints`, `fitShot` (gnomonic fit into an asymmetric NDC window), `framingGate` (camera replay with
  the caption band), and `skyVoices(sound)` for `scoreFromEvents`. `scene.config.js` imports it for camera keys, the framing gate and SCORE.
- `style.js` — `createStyle(stage)`; `FONT_FACES` to await before building.

## Prop factories (`style.props`)
| prop | what |
|---|---|
| `skyDome()` | world gradient dome (zenith/mid/horizon + western afterglow) |
| `turningSphere()` | `{ outer (tilt to the pole), inner (spin -θ(t)), update(t) }` — everything celestial goes in `inner` |
| `milkyWay(pole)` | procedural band (fbm clumps, knots, dark lanes, horizon extinction), additive |
| `catalogue(cat)` | seeded star Points: size/flux from magnitude, colour, twinkle (stronger low down); `userData.update(t)` |
| `trails(cat)` | bright-star trails = θ(t) − θ(t − τ) arcs, 3 fading tiers, fade out as the spin slows |
| `grid()` / `ecliptic(pole)` | gold coordinate grid / ticked ecliptic; `userData.setDraw(p, level)` |
| `horizon()` | far + near hill bands, firs, round trees, observatory with lit slit and windows (spec.horizon) |
| `heroStars(plan)` | every constellation star; highlight from the plan (core + halo + faint engraved rays) |
| `constellation(plan, con)` | rings + stick lines (per-line draw windows) + engraved figure + plate + star names; `userData.update(t)` |
| `link(plan, lk)` | dashed gold great circle between two constellations |
| `pointer(plan)` | presenter's arrow spot on the dome + faint beam; sweeps between stops, hand-wobble |
| `shootingStar(plan, k)` | planned bright streak on a great circle |
| `skyLabel(text, o)` | text plane on the sphere facing the observer: `place(dir, up, anchor)`, `setReveal(u)`, `setLevel(k)` |
| `caption(texts)` | overlay atlas cartouche (dark panel, double gold rule, star ornament), bottom left |
| `starChart(plan)` | assembles all of the above from one plan; `update(t)` |

## Sound palette (from the same plan)
Soft glass pings per star (`chime`), pentatonic, brighter star = higher; a breath of air per line (`whoosh`, very soft); a shimmer
when a figure appears (`sparkle`); a low bell as a name writes (`chime` pitch 0.42); a soft swish per pointer sweep; a riser into
the link and a bell + shimmer when it lands; a bright streak for shooting stars. Bed: a bowed `pad` (root 110 Hz, brightness 850 Hz)
over a low dome pad (55 Hz, brightness 260 Hz) and a faint 60 Hz `hum`. Demo measured: mean −19.4 dB, peak −5.5 dBFS (not listened to).

## Knobs
`sky.spin` (w0/w1/tau: how much time-lapse), `sky.lat` (pole height: higher = more circular motion), `catalogue.count/intensity/sizeMin`
(star richness), `milkyWay.through/at/level` (where the band crosses the frame), `ecliptic.through`, `lines.level` (gold glow),
`plate.level` (keep < ~0.9 or the plate blooms soft), `hero.size/intensity`, `pointer.intensity` (> ~2 blooms the arrow into a blob),
`horizon.*` (ridge heights, trees, observatory position), `caption.*`.

## Authoring notes
- Author constellations where you want them ON SCREEN: `centre: [az, alt]` at `at` (az from south, + = right), `scale` deg per unit,
  star `xy` in about [-1, 1]. Keep centres at alt 25–40 so the horizon fits in the same shot; keep ~45° between two constellations.
- Fit shots with `fitShot([...constellationPoints(...), horizonAnchor])` and window `y: [-0.93, 0.82]`: the horizon sits at the
  bottom, the subject above the caption band. Gate with `framingGate(..., { y: [-0.6, 0.9] })` as the demo does.
- Fonts: macOS system serif faces (`"Hoefler Text"`, Baskerville, Georgia) in canvas only; nothing is fetched.

## Known limits
- Lines/labels are planes on a sphere seen through a perspective camera: at the frame edges of a wide (fov > 50) shot the plates
  and names tilt and the figures stretch (gnomonic distortion). Keep plates near the centre in the final wide or accept the tilt.
- A soft bloom hot spot sometimes appears where a gold stick line runs nearly parallel to another gold line (grid circle / figure
  stroke) for a stretch — not resolved; move the figure stroke or the star a little if it lands somewhere visible.
- The Milky Way is a smooth procedural band: at level ≥ 0.4 it reads as grey smoke; keep 0.25–0.35.
- Twinkling stars + a moving camera cost bitrate (demo: 7.2 MB at CRF 22 with no grain). Adding grain or doubling the catalogue will push it over.
- Trails are uniform-colour tiers (not per-star colour) and only show during fast spin.
- Star names are one line, placed right (or `side: "l"` left) of the star; they do not avoid each other automatically.
