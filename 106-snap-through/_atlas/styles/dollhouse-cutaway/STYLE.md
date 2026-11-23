# Dollhouse Cutaway (`dollhouse-cutaway`)

## Look
A toy house seen straight on. Its front is two wallpapered half-fronts on side hinges that swing toward the camera, opening
onto a 3 × 2 grid of small furnished rooms, each in its own strong colour (blue mail room, red chopping room, green
library, yellow workshop, purple checking room, pink answer room), framed by cream plywood edges, with a slate roof, a
brick chimney and a navy flip sign with marquee bulbs carrying the caption. Rooms start dim (their own colours, greyer,
cooler, never black) and switch on warmly one by one as a glowing courier travels through them. Finale: every room
lights in a ripple, the dusk sky deepens to a starry night, and the answer pops out of the chimney as a speech bubble
with a tick. Everything is unlit and flat-toned. No lights, shadows or post stack; tone mapping `none`.

## Good for / avoid for
- Good for: pipelines and "what happens inside" stories with 4–7 stations (a request through a system, a letter
  through a sorting office, data through a model, a factory process), where each station gets its own room and mini-machine.
- Avoid for: more than about 8 stations (rooms get too small at 1080p), continuous processes with no stops,
  anything that needs a moving or orbiting camera (the cutaway only reads from the front, within about ±10°).

## Modules
- `spec.js`: palette, light model, house grid + furniture anchors, route times, courier sizes, sound gains.
- `rooms.js`: **the planner** (Node-safe; imports only `kit/time.js` + `kit/pathmath.js`). `plan(spec)` →
  `{ layout, plan }`; `houseLayout(house)`, `planRoute(layout, route, courier)`, `pulse`, `loopPulse`, `hexRgb`.
  The plan gives `lightAt(i,t)`, `exteriorAt`, `nightAt`, `frontAt`, `doorAt`, `actionsAt`, `courierAt`, `labelAt`,
  `orbAt` and `events` (→ SCORE via `scoreFromEvents`). Exposed as `style.plan`.
- `style.js`: `createStyle(stage)` → props below.

## Props
| prop | what | per-frame hook |
|---|---|---|
| `house(layout)` | shell, liners, all furniture (one merged mesh), swinging fronts with windows + door, moving parts (stamp, blade, 4 books, 4 presses, 2 gears, magnifier arm, tick, bellows), room glows | `userData.update(t, plan)` |
| `courier(layout)` | 4 pieces (parcel quarters → tokens), parcel tape, answer orb → speech bubble + tick, halo | `userData.update(plan.courierAt(t))` |
| `caption(layout, labels)` | pre-built labels on the roof sign | `userData.show(index, flip)` |
| `backdrop(layout)` | dusk→night sky gradient with stars, ground with contact shadow | `userData.update(night)` |

Technique: ONE `ShaderMaterial` for the whole house. Each vertex has sRGB colour, room index (0–5 = room, 6 = outside)
and an emit flag. Uniform arrays `uLevel[7]` / `uLamp[7]` hold the light level and lamp point for each room. Moving parts
share that material, so the swinging fronts' inside wallpaper lights up with its own room. A `Geo` helper builds
flat-shaded boxes, prisms, discs and rings with those attributes.

## Signature motion
Front halves swing open on hinges (inOutCubic + small settle wobble). The courier hops in as a parcel, gets stamped,
rides a belt, is chopped into four tokens, travels as a spaced train along rails, a high shelf and a lift, is stamped
by four colour "layer" presses, fuses into an orb, gets checked under a swinging magnifier, hops down steps, is pumped,
shoots up the chimney tube and becomes the answer bubble. Each room switches on with a short flicker and dims to
"visited" when the courier leaves. The sign flips its card at each beat.

## Sound palette
The SCORE comes entirely from `plan.events`: pops for hops, click + creak / thud for the door, a whoosh + servo for the
front, a thud + clack when it stops, a servo for each leg, a switch click + rising marimba note for each room (steps
0 2 4 7 9 12), clacks for stamp, chop and press, blips for book look-ups and the tick, a squish for the pump, a riser up
the chimney, a pop at the top, a sparkle chime for the bubble, ripple clicks and a high pad for the finale. The bed is a
warm pad (110 Hz, 900 Hz cutoff). Measured: mean −23.3 dB, max −2.6 dBFS.

## Tuning knobs
- `light.dim / dimSat / cool`: how dark an unlit room is (keep dim ≥ 0.5 so it stays readable). `bounce / direct / falloff`: lit warmth and lamp hot spot.
- `levels.visited / finale`; `light.glow / glowFinale / halo`: additive haze strengths (above about 0.2 it washes out colour).
- `house.*`: grid, room size, rooms[] with `spot` (dx, surface height), stations, pipe/lift/riser positions, `hover` for the bubble.
- `route.*`: every time in the demo (stops, actions, front swing, exit, finale ripple step, label lead and flip).
- `courier.token / gap / orb / bubble`: courier sizes (tokens below about 0.42 m read small at 1080p).

## Known limitations
- The cutaway reads only from the front. Past about 10° of azimuth the side walls and the wall cut edges flatten it.
- Open fronts stay in frame at the sides as two angled wallpapered panels. This is deliberate; there is no geometry
  for folding them flat.
- The courier is about 50 px at 1080p in a full-house shot. A 3 × 2 grid is close to the limit. More rooms need
  push-ins, which would move the roof sign out of frame (the caption lives on the roof).
- The magnifier arm and press heads pass in front of or behind things without collision checks. Positions were tuned by eye.
- The train follows its rail by arc length, so tokens can overlap for a frame inside the lift.
- Not watched in motion at full speed. Judged from stills and audio levels only (audio measured, not listened to).
