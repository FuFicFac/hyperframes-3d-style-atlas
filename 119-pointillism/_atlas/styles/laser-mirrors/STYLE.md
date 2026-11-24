# Laser & Mirrors (`laser-mirrors`)

**Look.** An optics bench seen from above at an angle: a mid-tone slate-blue anodised breadboard with a printed hole grid,
dark beam-stop rails, a cream laser head with a pink stripe, ROUND silvered mirrors in dark ring mounts on steel posts (the
router mirror in brass, on a turntable ring with a pointer and a busy lamp), drum-shaped sensor targets with name plates,
and a glass triangular splitter that rises out of a well. Light "haze" makes the beam a thick glowing line: a white-hot
core, a coloured halo, a slow shimmer along its length and a wide soft spill of the same colour on the bench beneath it.
Hit points flare, targets light in their own colour. Neutral tone mapping, bloom threshold 1.9 so only beams, glows and
lit targets bloom. A bottom-centre caption chip (dark plate, small beam mark) lives on the overlay in exact colours.

**Signature mechanic: an exact ray tracer drives everything** (`beamplan.js`, THREE-free, shared by picture and sound):
- the bench is 2D (top view): mirrors are two-sided segments, targets and blockers absorbing circles, walls the bench
  bounds. `trace()` reflects the ray segment to segment to get the beam polyline, branch by branch;
- each mirror's aim is SOLVED per route (`solveMirror(from, at, to)`); a `turn` eases one mirror between two solved aims
  (the short way round), and the beam is re-traced from scratch for whatever t is asked — turning one mirror re-routes the
  whole downstream beam live, sweeping it across the table (the demo's wow);
- the beam first arrives along its path at a planned speed (`speed` m/s); the splitter engages when its lift passes
  `engage`, ends the incoming beam and fans child beams at deflections solved so each lands on its target; all children
  grow together (`travel` s) and arrive at the same instant;
- one 240 Hz scan of that pure function gives rising-edge events (bounce, target, splitter), struck intervals per element
  (`glow`: fast attack, slow release) and arrival pulses (`flare`). Nothing is carried between frames;
- SCORE from the same events (`benchVoices` + `scoreFromEvents`): a click and riser at power-on, a whoosh + blip at launch,
  a marimba ping per bounce (rising scale), a chime + bell per target (pitch per target), a servo glide + tick per mirror
  turn, a whir as the splitter rises and a clack + whoosh + sparkle when it engages; a low pad bed and a 120 Hz hum.

## Good for / avoid for
- Good for: routing, decisions, "one small change re-routes everything downstream", agents choosing tools, pipelines and
  dispatch, fan-out / parallelism, signal paths, cause and effect, precision, lab / engineering tone.
- Avoid for: organic or emotional topics, text-heavy content (name plates are short words), more than ~6 mirrors and 4
  targets on one bench (the scene gets busy), real optics teaching (no refraction or diffraction; the splitter is a
  designed fan, not physics).

## Planner (`beamplan.js`, Node-safe; `style.plan` / `style.motion`)
| call | what |
|---|---|
| `createPlan(layout, timing)` | solves aims, splitter fan, scans events; returns the plan below |
| `plan.beam(t)` | `{ on, branches:[{id,color,pts}], hits, heads, lit, end }` — the beam as it stands at t |
| `plan.angleAt(id, t)` / `turning(id, t)` / `lift(t)` / `powerAt(t)` | mirror angle, router busy, splitter lift, laser power |
| `plan.glow(id, t)` / `plan.flare(id, t)` | struck level + colour / arrival pulse |
| `plan.events()` | `[{ t, kind: power|launch|bounce|target|turn|rise|engage|splitter, id, x, ... }]` |
| `plan.verify()` | each route held on its own ends on its target (the scene throws otherwise) |
| `trace`, `solveMirror`, `reflect`, `clipBranch`, `benchVoices(spec.sound)` | the pieces |

Layout: `{ bounds, source:{p,dir}, mirrors:[{id,p,half,router?}], targets:[{id,p,r,color}], blockers, splitter:{id,p,r,fan:[{to,color}]}, routes:{name:[mirror ids..., target]}, start }`.
Timing: `{ power, launch, speed, turns:[{t,dur,mirror,route,ease?}], split:{t,dur,engage,travel}, end }`. Bench coordinates are
2D (x right, y away from the viewer); world = `[x, beamY, -y]`.

## Props (`style.props`)
| prop | what |
|---|---|
| `opticsBench(plan)` | the whole set from a plan; `group.update(t)` poses and lights everything from `plan.*(t)` |
| `bench(bounds)` | breadboard top (hole-grid canvas), slab, beam-stop rails |
| `laser({p,dir})` | laser head at the nozzle tip; `userData.setPower(0..1)` |
| `mirror({p,half,router})` | round mirror (diameter = 2 × half = the planner segment) in a ring mount; `setAngle(a)`, `setBusy(k)` |
| `target({id,p,r,color})` | sensor drum + name plate; `setGlow(v, flare)` |
| `splitter({p,r})` | glass prism on a piston in a well; `setLift(0..1)`, `setGlow(v)` |
| `beams()` | pool of camera-facing additive ribbons + bench spill quads + glow sprites; `userData.set(plan.beam(t), t, plan)` |
| `caption()` | overlay chip; `userData.show(text, alpha)` (the plate stays, only the text fades) |

## Tuning knobs (spec.js)
`beamY` (beam height; mirror centres sit on it), `beam` (half-width, core sharpness/strength, halo, haze shimmer, spill
width/level, glow sizes), `beamColors`, `mirror.sheen` (painted sky gradient + glints that make the glass read as a mirror),
`target` (lit level, halo, pool, plate height/tilt), `splitter` (lift range, engage point, glow), `bench` (hole pitch,
rails), `post.bloom`, `sound.*` (bed gain sets the mean level).

## Known limitations
- Mirror glass is an emissive painted sheen, not a real reflection (a metal box reflected a flat grey room and read as a
  TV screen); framed rectangles on a foot read as monitors, hence the round ring mounts.
- The beam is planar (one height); mirrors only turn about the vertical. The splitter fan is solved, not refracted.
- Glow sprites are depth-test-free, so a hit glow can show through a part in front of it at low camera angles.
- The 240 Hz scan dedups re-hits within `minGap` (0.14 s); a beam sweeping across a mirror edge produces one ping per entry.
- Framing is gated in the demo's scene.config.js (beam points + parts replayed through the camera keys), not in the style.
