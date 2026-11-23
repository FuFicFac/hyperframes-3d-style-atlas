# Zen Sand (`zen-sand`)

A raked dry garden seen close: a shallow wooden tray of pale fine sand on a dark table, one low raking morning sun
from the back-left, smooth dark stones, a sprig of moss, pale wooden tools. **All the drawing is done in the sand.**
The sand is a height field rebuilt from `t` every frame (`sandplan.js`). A rake, stylus, rolling ball or smoothing
board travels a planned path, and the groove (with soft raised ridges either side that catch the light) exists exactly
as far as the tool has gone. Normals and a short march toward the sun (self-shadow inside the grooves) come from that
field. They are uploaded as a tangent-space normal map plus an albedo map on a flat plane, and the scene's real sun lights
it, so stone shadows and groove shading agree. Rake corrugations follow any path, and a rake that circles a stone leaves
concentric rings that flow out of the straight lines. A flat board drags across and erases a region back to calm,
pushing a soft ridge ahead of it.
It is not embossed-letterpress (static relief baked once and pressed by a die), soft-clay or chalkboard (marks on a
surface). Here the marks are carved progressively by visible tools, and they can be erased.

**Good for:** calm explainers, focus/clarity/mindfulness-adjacent themes (secular), "clearing the noise", single words,
simple diagrams (arrows, circles, rings), paths and journeys, before/after with an erase beat.
**Avoid for:** dense text (one word or ~10 caps per beat), numbers-heavy content, fast cuts, lowercase, anything
needing colour coding (the palette is sand and stone), and religious imagery (keep it a garden, not a shrine).

## Planner (`sandplan.js`, Node-safe; `style.plan`)
`planSand(program, spec.plan) → { items, ops, events, byId, end, opts }`. Plan coordinates are metres on the sand, origin at
the tray centre, +y away from the camera (world z = −y). Items run one at a time (`at`, or `gap` after the previous one).
`pre: true` items are already in the sand at t = 0 and have no tool and no sound.

| item | fields | contacts |
|---|---|---|
| `rake` | `path` (points/arcs), `tines`=5, `spacing`=.07 | multi-tine corrugation along any path |
| `rings` | `c`, `r`, `tines`, `spacing`, `a0`=−90, `sweep`=380, `enter?` | rake circling a stone: concentric rings, optional straight lead-in |
| `line` | `path`, `tool`="stylus"\|"ball" | single groove |
| `circle` | `c`, `r`, `ry?`, `a0`, `sweep` | single groove ring |
| `arrow` | `a`, `b`, `head`, `bow`, `tool` | two contacts: shaft running into one barb, then the other barb |
| `text` | `text`, `x`, `y` (baseline), `cap`, `align`, `letterSpacing` | kit stroke font traced as grooves |
| `scribble` | `rect`, `n`, `len`, `seed` | messy crossing grooves ("noise") |
| `smooth` | `rect` | flat board dragged along +x erases the rect to flat |

- `toolPose(plan, tool, t)` returns `{x, y, z, heading, rest, dist, working}`. The tool arcs from its rest pose on the rail,
  hops between contacts, and arcs back. `dist` is the rolled distance, used for the ball's spin.
- `opProgress(op, t)` uses a trapezoid speed profile, closed form. `itemBox(plan, id)` gives framing bounds.
- `createSandField(plan, { ppm, stones, shade })` → `at(t)` returns `{ h, normal, color }`. The completed-op prefix cache is
  keyed only by op count (LRU 6). The in-progress op is applied to a copy, and only its bounding box (plus the shadow march) is re-shaded.
- Sound: `sandVoices(spec.sound)` for `kit/schedule.scoreFromEvents(plan.events, …)` gives a `paper` hiss per contact
  (pitch/density by tool, length = contact), a quiet `clack` tick on hops, a `clack` wooden knock when an item ends, and a soft
  `thud` on first landing. `bowlTone(t)` is a low struck-bowl tone (two detuned `chime`s pitched to about .25), one per BEATS entry.

## Props (`style.props`) / factories (`garden`)
| prop | what |
|---|---|
| `garden({ plan, stones, moss, tools, ppm })` | everything wired: tray, sand, stones, moss, tools. `userData.update(t)`. Factory `garden` takes `dims: { program, stones, moss }` |
| `tray({ w, d, rail, railHeight, depth })` | wooden rails (kit wood texture) + dark table plane |
| `sandField(plan, { ppm, stones, shade })` | sand plane with per-frame DataTextures (normal + albedo). `userData.update(t)` uploads with `renderer.initTexture` |
| `stone({ rx, ry, h, seed, yaw })` | smooth dark pebble (noise-lumped ellipsoid, merged vertices), sunk ~25 %. Pass the same footprint to the field for AO |
| `moss({ r, seed, count })` | small moss cushion (merged blobs, vertex colours) |
| `rake({ tines, spacing })` · `stylus()` · `ball()` · `board({ len })` | tools. Origin = contact point, +x = travel. `userData.setPose(toolPose(...))` |
| `caption(labels)` | overlay wooden tag (exact colours, one fixed spot, top-left). `labels = [{ t0, t1, text }]`, `userData.update(t)` |
| `woodTag(text, { cap })` | small 3D stamped wooden tag to lie on the rail or sand |
Helper: `toWorld(x, y, h)`.

Recipe (35-zen-sand): config builds `PLAN = planSand(PROGRAM, STYLE_SPEC.plan)`. BEATS come from `PLAN.byId`. LABELS come
from BEATS. SCORE = pad bed + `bowlTone` per beat + `scoreFromEvents(PLAN.events, sandVoices())`. The config throws if the plan
overruns the duration. The scene calls `garden.update(t)`, then `caption.update(t)`, then `rig.update(t)`, then `stage.render(t)`.

## Signature motion
The groove grows exactly with the tool. The tool lifts off the rail, arcs in, draws, hops, and is set back down with a knock.
Rake lines bend into rings around a stone. The board erases before new content arrives.
Camera: high three-quarter view (~53–56° down, fov 30), gentle push-ins on what is being drawn, long holds, and it ends on the whole tray filling the frame.

## Sound palette
Sand hiss = kit `paper` voice pitched down (.24 board – .62 stylus, density .7–.95), one per contact.
Wood = `clack` pitch .42 (knock) / .62 (hop tick). Low bowl tone per beat. Bed: `pad` 55 Hz [0,7,12,19], brightness 520 Hz, gain .5.
Demo measured: mean −22.6 dB, peak −5.0 dBFS. These are measured levels; nobody has listened to them.

## Tuning knobs (`spec.js`)
- `sun {azimuth, elevation, intensity}` drives both the scene light AND the CPU self-shadow march. Change it in one place only.
- `sand.ppm` (resolution: 200 = 880×500 cells, about 4.5 mm), `sand.shade` (steps, soft, strength, grain, mottle, ao, grooveTone,
  slopeExag), `sand.normalScale`.
- `plan` sets speeds, hop, lift/land, approach/depart, `profile` (groove depth/sigma/ridge per tool, rake amp/edge, board pile),
  and tool `rest` poses. Defaults are in `sandplan.SAND_DEFAULTS`.
- `tools` (rake handle/pitch, stylus lean, ball r, board size/lean), `stones`, `caption` (size, position, fades), `sound`.

## Known limitations
- CPU field: about 20–110 ms per frame while a contact is drawing, longer on a cold seek (prefix rebuild). The 15 s demo renders in
  ~2.5 min. Very long programs or ppm > 300 get slow. The scrub player can hitch on backward seeks.
- The sand plane is flat: grooves are normal-map relief plus baked self-shadow, with no real displacement. Silhouettes at grazing
  camera angles stay flat, so keep the camera above ~40°.
- Tools are posed, not physically pushed. The tool's own sand displacement is the groove profile only: no spill or grains.
  The rake head reads as a plain bar from above. The board reads as a plank with a handle frame.
- Seams: a ring whose sweep overlaps its start shows two small cap marks at the seam (visible on the small stone's rings).
  The erase rect leaves a soft rectangular edge where it meets older lines.
- Stroke-font text only (uppercase). The `O` has the font's small gap at the top.
- Rings shots that centre the stone crop the start of a word placed far left. Plan the layout so the final wide shot carries everything.
- Stones are noise ellipsoids; a cluster of them looks generic. Vary `seed`/`yaw`/proportions.
