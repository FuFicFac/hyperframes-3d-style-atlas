# Card Table (`card-table`)

**Look.** A card table under a low hanging lamp: a calm baize cloth (green by default; `baize: "blue" | "red" | "charcoal"`),
a bevelled dark wooden rail, a warm lamp pool falling off to the rail, and a deck of ORIGINAL information cards on thick
cream linen-finish stock with rounded corners. Faces carry a big code-drawn line icon in an accent medallion, a condensed
title, a one-line caption, an accent border and a corner index (number + mini icon, both corners). Backs are an oxblood
field with a diagonal studded lattice and a rosette medallion (point-symmetric, drawn in code). Clay-style chips with rim
inserts and a white dealer button act as counters and markers. The beat label is a small brushed-brass plaque pinned to
the screen (overlay: exact colours). No suits, casino marks or gambling framing.

**Signature mechanic.** Card handling as pure functions of time, planned by `dealer.js`: a cut + riffle (halves peel up at
their inner ends and drop alternately, one tick per card, then square up), cards dealt one by one along spinning arcs that
touch down short and slide the last few cm, flips about the long edge with a bend, a row turned over in a wave, fans,
ribbon spreads, stacks, and a chosen card sliding forward into the light while the others recede and dim; chips drop one
per clink into a stack, the dealer button slides in. The card is a column-grid mesh that follows the corner arcs exactly,
re-bent on the CPU from its base every frame (bend / curl / peel), so shadows and normals stay correct.

## Good for / avoid for
- Good for: options and trade-offs, "pick one", ranked lists, steps revealed one at a time, categories, game-like explanations.
- Avoid for: long text (a card holds a title + one caption line), data/statistics (chips are markers, not a chart),
  anything where a gambling reading would be wrong for the audience (keep copy neutral; no money, no odds).

## Prop factories (`style.props`)
| prop | what |
|---|---|
| `table({ W, D })` | rounded baize cloth (calm fbm tone, sheen), bevelled wooden rail ring, apron, floor. Factory `table`. |
| `lamp({ x, y, z })` | conical enamel shade, emissive bulb, brass cap, cord (the light itself is the spec's `lamp` spot). Factory `lamp`. |
| `card({ face, back, name })` | one card; `face = { icon, title, caption, accent, index, seed }` or null (blank stock); `back = { field, ink }` overrides. `userData.setPose(pose)`. |
| `deck({ n, faces: { [index]: face } })` | n cards (index = starting pile layer, 0 = bottom) → `{ group, cards }`. |
| `chip({ color })`, `chipStack({ count, colors })` | chips (`spec.chipColors`), each `userData.setPose(pose)`. |
| `dealerButton({ text })` | thick white puck, reads `spec.button.text`. |
| `plaque()` | brass label plate on the overlay; `userData.show(text, alpha)` (uploads its canvas immediately). |
| helpers | `paintFace`, `paintBack`, `drawIcon`, `ICON_NAMES` (book, gear, people, bulb, compass, leaf, clock, flag, key, bolt, check, star, pin, hammer), `cardGeometry`. |

## Planner (`dealer.js`, Node-safe; `style.plan` / `style.motion`)
- `track(initial, { id, kind })` → piecewise pose track: `add(seg)`, `poseAt(t)`, `events`. Segment builders with spec defaults:
  `dealSeg(S, at, to)`, `flipSeg(S, at, { to, dir })`, `slideSeg(S, at, to, { dur, ease, lift })`, `dropSeg(S, at, to, { layer })`.
- `planRiffle({ at, n, center, yaw, seed }, S)` → per-card tracks + `order` (merged layer → card) + events (split, riffle, riffleTick ×n, square, tap).
- Layouts: `rowPoses`, `fanPoses`, `spreadPoses`, `stackPoses`; `restY(S, layer)`, `chipY(S, layer)`; `wave(tracks, make, { at, step })`.
- Sound: `collectEvents(...)` + `dealerVoices(S.sound)` → `kit/schedule.scoreFromEvents`.
- Camera: `tableShot(box, { elev, azim, safe, yTop, shift })` fits a cloth region in the safe area; `framingReport(keys, mustSee)`
  replays the rig (eases + drift) and reports any must-see card corner outside |NDC| ≤ limit (the demo exports it in NOTES).

## Sound palette
Riffle = rustle bed + one high `tick` per released card; cut = `paper` + soft whoosh; square = `paper` + small `thud` tap;
deal = short `whoosh` + thumb `click`; landing = `paper` slide; flip = tiny whoosh + `click`/`paper` snap; card slide = `rustle`;
chip = high `clack` + `tick` (clink) per chip; button = `thud` + low `clack`; bed = warm `pad` (110 Hz, 800 Hz cutoff) + faint `hum`.
Demo levels (measured, not listened to): mean −20.5 dB, peak −1.1 dBFS.

## Knobs (spec.js)
`baizes` + `table.texture` (keep contrast low), `table.rail`, `lamp` and the `lamp` light, `card` (size, radius, thickness,
grid, linen, dim, fonts), `back`, `riffle` (split, gapX, mergeX, peel, pace, jitter, fall, square), `deal` (flight, slide,
height, turns, bend), `flip` (dur, clear, bend), `chip`, `button`, `chipColors`, `plaque`, `sound`.

## Known limits
- The rail's clearcoat still catches a thin grey env streak along the far rail in low shots (envMapIntensity is cut to .25).
- Riffle peel is a quadratic end-lift per card; cards in the held halves don't physically rest on each other (they ride the
  merged pile height), so a very close or low camera on the riffle can show small interpenetrations at the inner ends.
- Flip rotates about the card's centre line (lifted to clear the cloth), not about a resting edge; fine at table distance.
- Cards stacked in a pile get no individual shadows from each other beyond the shadow map; deck edges show a fine
  stripe moiré in mid shots (it reads as stacked stock).
- Text is a system font stack (Avenir Next / Copperplate): pixel-identical on this Mac only.
- The lamp prop sits above every demo shot; the light pool is visible, the fixture itself is not shown.
