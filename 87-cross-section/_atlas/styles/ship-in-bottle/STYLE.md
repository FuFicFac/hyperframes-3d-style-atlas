# Ship in a Bottle (`ship-in-bottle`)

**Look.** A bright modeller's bench in daylight: pale wood, a sage cutting mat with a grid, a near-white wall. A large
clear bottle lies on a wooden cradle, neck to the right, with a blue putty sea pressed into its lower third. A small
wooden ship (walnut hull, red boot, cream strake, three masts, pleated paper sails with two red bands, cream thread
rigging, brass eyes) is built outside on a slip, folded flat, slid through the neck on a steel wire, and raised inside
by pulling one thread. Tone mapping `neutral`, no grain, light vignette; captions on a cream overlay plate with a blue edge.

**Good for.** "It has to fit through the bottleneck": compress then expand, encode then decode, deploying a large thing
into a constrained place (a big model on a small device), prepare outside then assemble inside, context limits.

**Avoid for.** Anything dark or moody; subjects with no narrow passage in the story; data charts; long text.

## Files
- `spec.js` — palette, materials, lights, plus the blocks the planner reads: `bottle`, `glass`, `cradle`, `sea`, `ship`
  (hull lines, masts with fold/up angles and stay eyelets, sail, shroud, thread, wire), `route`, `slip`, `cork`,
  `timing`, `caption`, `sound`.
- `rigging.js` — **the planner (Node-safe, no THREE).** `createPlan({ spec, end })`. Exposed as `style.plan` / `style.motion`.
- `style.js` — `createStyle(stage)`; turns a plan into pictures.

## The plan (`rigging.js`)
- **One number drives the rigging: `c`, the thread length pulled.** Each mast is a hinge raised by its own stay (mast top
  to an eyelet forward of it). Shortening that stay by `ci` gives the hinge angle in closed form (law of cosines):
  `phi = beta + acos((len² + |e|² − d²) / (2 · len · e2))`, `d = dFold − ci`.
- **Sequence fore → main → mizzen** comes from slack: stay *i* carries exactly the pull of the masts before it
  (`cum[i]`), so it only goes taut when they are up. Folding is the same plan run backwards (mizzen first, fore last,
  which is also the only order the folded stack allows).
- `state(c)` → `{ phi[], raise[], open[], slack[] }`; `pull(t)`; `pose(t)` (slide along the bottle axis, then lower onto
  the sea); `threads(t)` → world polylines (stays, deck runs, shrouds): straight when taut, a parabola whose depth matches
  the slack when not, resting on the deck; `tail(t)` (the one thread leaving the neck, its ring and knots), `wire(t)`, `cork(t)`.
- **Clearance proof, asserted in Node** (`createPlan` throws): the folded bundle's radius about the axis is below the
  neck's inner radius by `route.margin`; every bounding point (hull, bowsprit, mast tips, sail corners) stays inside the
  glass profile at every 1/60 s of the route; and at 161 pull steps of the raise. Result in `plan.clearance`
  (demo: bundle 0.255 m in a 0.320 m neck; raised ship 0.070 m from the glass).
- `events()` + `rigVoices(spec.sound)` + `panOf(spec)` → SCORE through `kit/schedule.scoreFromEvents`.

## Props (`style.props`)
| prop | what |
|---|---|
| `workshop(plan)` | everything, added to the scene; `update(t)` poses it all from the plan |
| `bottle()` | thin fresnel glass (kit `fresnelGlass`), outer + inner wall as one lathe, thicker base ring and lip, painted soft streaks |
| `cradle()` | two notched wooden saddles + dowel rails |
| `sea()` | blue putty filling the bottom of the bottle, sculpted waves, lighter crests (vertex colours) |
| `ship(plan)` | lofted waterline hull, bowsprit, hinge pivots, masts, pleated sails; `userData.set(state)` |
| `bench()` | wood top, cutting mat, wall, spool, pencil |
| `slip(plan)` | the plank outside the mouth at slide height |
| `caption()` | overlay plate; `userData.show(text, alpha)` |

## Signature motion
- Masts fall flat aft one by one, sails closing like fans; the bundle slides through the neck; one thread is pulled and
  the masts swing up fore to aft, sails fanning open and bracing round, rigging going from sag to straight; cork in.
- Camera: one move per beat, locked during holds; once the ship is inside, the bottle fills the frame.

## Sound palette
Wood tap per mast landing (short `marimba` + `tick`), paper rustle per sail, soft `whoosh` for the slide, two glass
clinks (stern enters the mouth, bowsprit clears it — times solved from the route), `squish` on the putty, `servo` creak
per pull, tick + rising bar note per mast lock (C5, E5, G5), `clack` snip, `pop` cork, quiet chime, warm `pad` bed.

## Tuning knobs
- `ship.masts[].len / fold / up / eyelet`, `ship.sail.{foot, head, pleats, closed, open, brace}`; `bottle.neckR`, `route.margin`
  (the planner tells you when a change no longer fits).
- `glass.{alphaFace, alphaRim, fresnelPower, specular}`; `timing.*` retimes picture and sound together.

## Decisions and known limitations
- **Kit fresnel glass, not the pre-render refraction trick**: no bending of what is behind the glass. Chosen to keep the
  ship fully legible. Glass specular is cut to 0.22 because the key light made a broad milky band across the ship; the
  bottle now reads mainly by its tinted rim, so on the near-white wall the top outline is soft.
- Sails are pleated paper set straight on the mast (no yards): a rigid yard could not pass the neck. Pleat width is a
  designed mapping from mast raise, not a simulation; the sheets that would pull the fans open are not modelled.
- Slack threads are parabolas clamped to the deck (length is not conserved once they rest on it); threads never collide
  with masts or sails. The folded masts and closed sails overlap slightly in the stack.
- The ship never pitches: the route is slide then straight lower. A steeper drop-in is not planned.
- No hands: the wire, the pull ring and the cork move on their own. The thread tail is "cut" by sliding out of the neck.
- The ship is small relative to the bottle (limited by the neck); toy scale throughout (bottle 5.15 m long).
- Thread tubes are ~3 px at the wide shot; they do not cast shadows.
