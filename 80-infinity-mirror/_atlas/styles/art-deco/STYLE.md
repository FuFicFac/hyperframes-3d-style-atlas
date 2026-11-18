# Art Deco (`art-deco`)

**Look.** 1920s–30s machine-age ornament, all original designs: polished gold and brass, bronze, black lacquer, cream marble
and jade/teal under a lit sky gradient (teal zenith → pale jade → warm cream horizon). A marble wall with jade pilasters,
a stepped gold keystone frame and bronze-and-lacquer elevator doors whose inlaid gold fan is split down the seam; behind
them a giant sunburst of alternating gold and jade rays with stepped ends rising over a long stepped marble plinth; a
cream-marble ziggurat skyscraper (five setbacks with gold fluting, lacquer window bays with glowing frosted glass, gold
chevron parapets, jade ledge lines, a stepped entrance) flanked by mirrored wings, topped by a gold spire; crown ornaments
(finials, chevron fins, quarter sunray fans, scallop shells, a stepped keystone frame, a jade crest); two searchlight beams;
a jade title panel in a stepped gold frame. Lettering in Futura (system face) with wide tracking. Neutral tone mapping,
generous warm key + mirrored fill, bloom only on the sun, the glass and the ray tips.

**Signature mechanic: symmetric unfolding and stepped ascent.** Everything is mirrored about x = 0 and grows in terraces.
`deco.js` (THREE-free) plans every unfold from one list, and SCORE is built from the same plan:
- **doors** slide apart into their wall pockets (`doorOpen(t)`);
- **folding fan:** every ray starts stacked on the centre line; the fan's open angle `A(t)` sweeps out and ray pair j sits
  at 90° ± min(j·slot, A(t)) — the outermost blade leads, drags the others, and each ray stops in its slot, so the fan opens
  ray by ray outward from the centre. Outer blades sit slightly behind inner ones (a closed fan shows only its front blade).
  `settle_j` (when A reaches j·slot, solved by bisection on the ease) → one marimba note per pair, rising a pentatonic scale;
- **tiers** telescope up out of the tier below (gentle outBack clamped at 1 = a hard stop), wings rise with tiers 0 and 1;
  one chord per tier (demo: D, Em, F#m, G, A) + a thud at the landing + a marimba arpeggio;
- **spire** extends last (riser ending in a chime);
- **crown ornaments** arrive in mirrored pairs (slide in, drop, swing or grow toward their slots) and click in at their
  landing time (`clack` + `tick`);
- **title panel**: the stepped frame and field scale out from the centre line, the lettering fades in after (big chord + chime);
- **searchlights** sweep in exact mirror image (`lightAngle(t)`, left = −right).

## Good for / avoid for
- Good for: title cards and openers with ceremony, "built step by step" / growth / levels / tiers, reveals ("behind the
  doors"), premium or vintage framing, cinema/theatre/hotel/travel themes, chapter cards (the panel takes any title).
- Avoid for: asymmetric stories (one side vs the other — the look insists on a mirror), data or numbers (no charting
  props), dark/moody pieces (the style is lit bright on purpose), anything needing many words on screen.

## Planner (`deco.js`, Node-safe; `style.plan` / `style.motion`)
| call | what |
|---|---|
| `createPlan({ doors, fan, tiers, spire, ornaments, panel, lights, end })` | the plan (times, ray slots and settle times, tier roots/chords). |
| `plan.doorOpen(t)`, `plan.rayAngle(i, t)`, `plan.fanOpen(t)`, `plan.openAngle(t)` | doors and folding fan. |
| `plan.tierRise(k, t)`, `plan.tierOn(k, t)`, `plan.spireU(t)` | telescoping tiers and spire. |
| `plan.ornamentU(id, t)`, `plan.ornamentOn(id, t)` | crown ornament arrival (ids: finials, chevrons, sunfans, scallops, keystone, crest). |
| `plan.panelFrame(t)`, `plan.panelText(t)`, `plan.lightLevel(t)`, `plan.lightAngle(t)` | title panel and searchlights. |
| `plan.events()`, `decoVoices(spec.sound)` | open / ray / tier / spire / click / title events → SCORE via kit `scoreFromEvents`. |
| `settleEase(u, s)` | outBack with a tunable overshoot; first reaches 1 at u = 1/(1+s) (used for landing sounds). |

## Prop factories (`style.props`)
| prop | what |
|---|---|
| `floor()` | cream marble plaza, gold inlay lines, jade lozenges (canvas tile, 4 m). |
| `plinth()` | long stepped marble band with gold trims behind the tower (the sun's horizon). |
| `sunburst(plan)` | folding-fan rays + glowing sun disc + stepped gold rings; `userData.update(t)`. |
| `doorway(plan)` | wall, jade pilasters, stepped keystone frame, transom fan, two door leaves; `userData.update(t, visible)`. |
| `tower(plan)` | five telescoping tiers (static detail merged per material), mirrored wings, spire; `update(t)`. |
| `tier({ w, h, d, bays }, { entrance, chevrons })`, `spire()` | building blocks (base at y = 0). |
| `crown(plan)` | the six mirrored ornament pairs; `update(t)`. |
| `searchlights(plan)` | two additive cone beams (custom shader, fades along the beam and at grazing angles); `update(t)`. |
| `panel(plan, { title, sub })` | jade title panel, stepped gold frame + crest, marble pedestal; `update(t)`. |
| `caption()` | overlay chip: lacquer plate, notched gold double border, mirrored fan icons, tracked Futura; `userData.show(text, a)`. |

## Sound palette
A low open pad bed (D, fifths and a third, cutoff 700 Hz) for the mean level; door opening = `rumble` + `whoosh` in + a soft
low chord at the first door movement (t = 0.2 s, so something is heard in the first second); one `marimba` note per fan ray
pair (D5 pentatonic, rising); per tier a bright short `pad` chord + `thud` at the landing + a `marimba` arpeggio; `riser` +
`chime` for the spire; `clack` + `tick` per ornament landing (pitch rising); a big D major `pad` + `chime` for the title.

## Knobs (spec.js)
- `world.sky.stops`, `exposure`, lights `key`/`fillR`/`fill`/`rim`, `post.bloom` (threshold 2.6: only the sun, glass and ray tips bloom).
- Materials: `gold`, `goldRay`, `rayCream` (the jade rays), `bronze`, `lacquer`, `marble`, `jade`, `glass`, `sun`.
- `sunburst` (rays — odd count, radii, depth), `tower.tiers` (w, h, d, bays), `tower.wings`, `tower.spire`, `doors`,
  `plinth`, `searchlight` (position, length, tilt, sweep, hz, opacity), `panel` (size, position, frame steps), `caption`, `type` (faces, tracking).
- `sound` gains (bed, open, ray, tier, spire, click, title).

## Known limits (seen while building the demo)
- First pass was badly overexposed (bloom threshold 1.25 + emissive gold/marble washed every frame to cream). Light surfaces
  here are well above 1.0 linear: keep bloom threshold ≥ 2.5 and emission small on large areas (gold ≤ 0.2, no marble emission).
- Black lacquer barely appears: the brief asked for bright frames, so the tower body is cream marble and lacquer is limited
  to window bays, door fields and the dado. A darker, more lacquered variant would need its own lighting pass.
- The glass windows read as warm cream panes rather than visibly lit from inside in daylight framing; their glow only shows
  against shadowed faces.
- The tower is tall and narrow: in the final wide it fills ~35 % of the frame width; the sunburst, wings and title panel
  carry the width. Scallop shells were first solid gold and read as brownish blobs (the curved metal mirrors the room env); they are now jade with gold ribs.
- The doorway wall is simply hidden (from t) once the camera has passed through it; a later pull-back does not see it.
- Searchlight beams are additive: crossing the gold rays they wash toward white (kept behind the tower, never in front of the caption).
- Fonts: Futura is a macOS system face (fallback Avenir Next / Helvetica Neue); pixel-identical on this Mac only.
- Audio levels were measured, not listened to.
