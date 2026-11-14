# Evidence Board (`evidence-board`)

**Look.** An investigator's cork board on a dim office wall under a desk lamp: calm tan cork (low-contrast blotches,
granules, pits, old pin holes) in a bevelled dark-oak frame; a warm lamp pool from the upper left falling off to the
corners, a faint cool spill from the right. Pinned on it: ruled index cards with typewriter text (American Typewriter),
instant-photo prints whose pictures are drawn in code (a wilting fern, a window, a floor vent, a mug, a clock — objects,
places and diagrams only, never people), torn notebook scraps with pencil handwriting (Noteworthy), a torn floor-plan
fragment of an invented building, translucent sticky flags, glossy ball-head map pins in six colours — and RED STRING.
The beat label is a strip of masking tape with typed text, pinned to the screen (overlay: exact colours).

**Signature mechanic — connections made physical** (planned by `threads.js`, pure and Node-safe):
- *Pin-in:* an item flies in from in front of the board, tumbling and fluttering, holds just off the cork with a landing
  tilt, the pin drives home (accelerating) with a small decaying bounce, and the item swings about its pin into place.
- *String:* the free end is carried from pin to pin on an arc off the board; the drawn length grows with time and hangs
  as an **exact catenary** (solved per frame) between the first pin and the moving end; it wraps the far pin (a spiral
  under the head), pulls taut and twangs (short decaying transverse vibration).
- *Flags* pop onto items; a red *marker* loop is drawn stroke by stroke on the key item (a felt-tip ribbon, draw-range).
- *Camera:* square-on with a little parallax, following each new string across the board; computed shots
  (`boardShot`) and a build gate (`framingGate`) that keeps required regions inside the frame AND below the caption band.

## Good for / avoid for
- Good for: how ideas connect, root-cause hunts ("why does X keep happening?"), research summaries, "follow the thread",
  relationships between a handful (4–8) of things, a reveal of the one link that explains the rest.
- Avoid for: data and statistics (no charts here), long text (a card holds a title + 3–4 short lines), more than ~8
  items (the web becomes noise at 1080p), anything that would read as crime, real people or conspiracy — keep the
  mystery everyday and neutral.

## Prop factories (`style.props`)
| prop | what |
|---|---|
| `board({ W, H })` | cork plane (z = 0 surface) + bump from the same canvas, bevelled oak frame, backing, office wall. Factory `board`. |
| `card({ title, lines, pin, pinColor, seed })` | ruled index card, red title rule, glyph-by-glyph typewriter text (seeded ink weight, double strikes). Origin = pin. |
| `linkCard({ title = "THE LINK", lines, noPin })` | index card with a red stamped header; `noPin` = held by a pin already on the board (the hub). |
| `photo({ picture, caption, pin, pinColor, seed })` | glossy instant print: border, code-drawn picture (`PICTURES`: fern, window, vent, mug, clock), fade + warm cast, handwritten caption strip. |
| `scrap({ lines })` | torn notebook scrap (alpha-tested torn edges), blue rules, red margin, pencil handwriting. |
| `mapFragment({ title, labels })` | torn floor plan of an invented building (walls, door swing, windows, desks, vent symbol, typed labels). |
| `pin({ color })` | ball-head map pin (plastic head + collar + steel needle); the group's z is the lift above home. |
| `string()` | red string = kit `liveTube`, centreline from `threads.stringPoints`. |
| `flag({ color })` | translucent page flag with an arrow end (origin = the stuck end). |
| `markerCircle(plan.marker)`, `markerArrow(a, b)` | felt-tip ribbon with `userData.setProgress(p)` draw-on. |
| `lampSet()` | desk-lamp head at the `lamp` spot light, aimed at its target (normally out of shot). Factory `lampSet`. |
| `caption(texts)` | one masking-tape label per beat, each drawn + uploaded at build; `show(index, alpha)`. |
| `evidence(plan, content)` | builds every planned item / string / flag / marker; `update(t)` poses everything from the plan. |
| helpers | `paintCard`, `paintPhoto`, `paintScrap`, `paintMap`, `PICTURES`, `ribbon`, `FONT_FACES` (await them before createStyle). |

## Planner (`threads.js`; `style.plan` / `style.motion`)
`planBoard(S, { items, links, flags, marker })` → plan with per-item times (`land`, `pinT`, `home`), per-link times
(`arrive`, `wrapEnd`, `tautEnd`), and `events` (flutter, thunk, draw, wrap ×2, twang, flag, marker). It throws if a string
starts before both of its pins are home. `itemPose(plan, id, t)`, `stringState` / `stringPoints(plan, i, t)`,
`markerProgress`, `flagPose`, `catenary(P0, P1, L, m)`, `catenarySag`, `itemBox`, `linkBox`, `unionBox`,
`boardShot(box, { x, y, side, up })`, `framingGate(keys, regions, { x, y })` (asymmetric window, replays the kit rig via
`kit/framing.sampleCameraKeys`), `boxFill`, `threadVoices(S.sound)` for `kit/schedule.scoreFromEvents`.

## Sound palette
Fly-in = short `paper` flutter + soft `whoosh`; pin home = needle `click` (12 ms early) + small high `thud`; string draw =
quiet `rustle` for the whole draw; wraps = tiny `tick`; twang = pluck `click` + short gliding `servo` tone (pitch rises for
shorter strings); flag = `tick` + `paper`; marker = `penScratch`; reveal = soft 3-note `chime`; bed = warm low `pad`
(98 Hz, 700 Hz cutoff) + faint lamp `hum`. Demo levels (measured, not listened to) are in the demo report / `check-frames`.

## Knobs (spec.js)
`palette` (cork tones, pins, flags, string, marker), `board.cork` (blotch, grain, pits, bumpScale, pinholes — keep calm),
`paper` (pxPerM, curl, gloss, layer), `card` / `photo` / `scrap` / `map` (sizes, fonts, caps), `pin` (sizes, raise,
drive, bounce), `string` (radius, z, speed, slack, taut, lift, wraps, tighten, twang), `fly` (dur, z, hover, tilt,
landTilt, swing), `marker`, `flagPop`, `caption`, `sound`, the `lamp` / `spill` lights.

## Known limits
- Strings do not collide with paper: they run at a fixed height (z = 16 mm) over everything, so a strongly curled item
  under a string could poke through it (curl is kept at 5 mm and the link card at 2 mm for that reason).
- Steep (near-vertical) strings get less slack (`slack · (0.25 + 0.75·horiz²)`) — physically a slack string between
  vertically aligned pins would fold into a U; this is a deliberate cheat.
- The string's lamp shadow is a soft wide blur while the free end is lifted off the board; it reads as depth, but it
  is a shadow-map blob, not a contact shadow.
- Wraps around pins are ~3 mm loops: visible only in close shots; at the wide they read as the string touching the pin.
- A tall pair of items (one above the other) leaves empty cork beside them in a 16:9 shot — lay early items out
  side by side when the opening shot matters (the demo's first beat is weaker for this).
- Pins and strings never get pulled out or re-routed (no "unpin" / "cut string" move yet).
- Text is system fonts (American Typewriter, Marker Felt, Noteworthy): pixel-identical on this Mac only.
