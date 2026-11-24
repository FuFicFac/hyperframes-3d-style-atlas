# Pinball Table (`pinball-table`)

An electro-mechanical pinball machine seen from the player's end with the glass off. The playfield is glossy printed wood
with original art: a navy sun-ray zone at the flippers, a target-ring medallion under a progress ladder, a cream band, magenta
and a starry orbit top with an arched title. On it sit chrome rails and a steel ball, rubber-ringed posts, mushroom pop
bumpers with coloured caps, a drop-target bank, a rollover lane, slingshots, two flippers and a plastic ramp with a wire-form
return. Lit inserts sit under the field (arrows, chevrons, circles, stars, lettered and worded lamps). A backglass with six
mechanical score reels stands at the far end. Warm, saturated, 1970s-printed. Not marble-run (no wooden track or schedule of
many marbles), not neon-sign (no glass tubes on a wall), not crt-retro (no screen).

**Signature mechanic: a planned ball run.** The ball follows a contact schedule as a pure function of time (`pinplan.js`):
ballistic arcs on the tilted field between scheduled contacts, rolls around the orbit rail and up and down the ramp, and short
rides on the flipper face. Every contact is an event. Bumpers flash and drop their kick ring, slingshot rubbers bulge, drop
targets sink one by one, rollover stars dip, the lettered lamp behind each lights, and the score reels step pulse by pulse
like an EM score motor. The playfield is the diagram: named targets are the concepts, the ball is attention moving between
them, and lit inserts show progress.

## Good for / avoid for
- **Good for:** goals and progress, "hit all the targets", checklists (one word per drop bank or rollover lane), scoring,
  gamified explanations, combos and multipliers, step-by-step "shots" (one flipper shot per step).
- **Avoid for:** anything solemn; dense text (inserts hold one letter or one short word); exact quantities (the reels show
  made-up points, so mark them SAMPLE DATA); processes with no target/achievement framing.

## Files
| File | What |
|---|---|
| `spec.js` | All look and layout numbers in the field frame (x across, v up the table, h above the surface): table, flippers, bumpers, slings, orbit, shooter, lanes, bank, ramp centre line, posts, every lamp (shape, colour, position, letter/word), art, score awards, backglass, caption, sound. |
| `pinplan.js` | **THREE-free planner** (Node-safe; imported by style.js and by scene.config.js). `layout(S)`, `planBall(S, script)` -> `pos(t)`, `flipperAngle(side, t)`, `plungerOffset(t)`, `events`; `lampPlan(rules)` -> `level(id, t)`; `reelPlan(awards)` -> `roll(k, t)`, `value(t)`, `pulses`; `awardsFromEvents`; `pulse`, `dropFrac`; `clearance` (the ball never passes through a bumper/post off-schedule); `fieldToWorld`, `backglassFrame`, `fieldShot` (fit field regions in the safe area); `pinballVoices`, `rollScore` (sound). |
| `style.js` | Prop factories (below). |

## Contact schedule (planBall script)
Steps: `plunger {pull:[t0,t1], release}`, `fly {to, dur, end?, marks?}` (ballistic, constant down-table pull `table.G`),
`orbit {to (deg), dur, k}`, `ramp {from, to ("top"/"wire"/0..1), dur, k, marks}`, `flip {side, ride, hold}` (the flipper fires
now, the ball rides its face), `raise {side, hold}` (a flipper action not touching the ball: cradle catches, hold to the end),
`ride {side, dur}` (sit on the flipper face and follow it), `hold`. Targets: `{orbit: deg}`, `{bumper: id, ang}`, `{sling, u}`,
`{bank: k}` (float target index; 0.5 hits between targets 0 and 1), `{flipper: side, d}` (on the face at its angle on arrival),
`{lane: v}`, `{inlane: side, v}`, `{ramp: 0|1}`, `{pt}`. Speed profiles use `f(u) = u + k u(1-u)` (constant acceleration).
Only durations are typed: every absolute time (beats, lamp rules, camera keys, SCORE) is derived from the plan's events.
Choose bumper contact angles so each rebound reads as reflection + kick (the demo's angles came from a small offline beam
search over reflection deviation and clearance), then let `clearance()` prove the ball never passes through anything.

## Prop factories (`style.props`)
| Prop | What / update |
|---|---|
| `field()` | The tilted root group (field-local frame: X = x, Y = h, Z = -v). |
| `playfield(lay)` | Printed art layer (`paintPlayfield`, CPU canvas, wood grain under ~94 % paint, insert hole rings) + board. |
| `insertLamp(def)` | Insert lamp: circle, roundRect, chevron, arrow, triangle, star; letter/word printed on it; `set(level)`. |
| `ball()` | Steel ball + contact shadow; `set([x, v, h])`. |
| `flipper(side)` | Hull-outline flipper, white body, red rubber, chrome cap; `setAngle(a)` from the plan. |
| `popBumper(b)` | Skirt, body, chrome kick ring, coloured cap with printed star top; `update({ level, kick })`. |
| `slingshot(s)` | Body, lit plastic, three posts, rubber band whose face bulges; `update({ level, kick })`. |
| `post(at, o)` | Chrome stem, rubber ring, plastic star cap. |
| `dropBank(bank)` | Housing + lettered targets that sink below the field; `update(downs[])`. |
| `rollover(at)`, `rolloverLane(lane)` | Chrome star rollover (`update(dip)`); lane guide wall + rollovers (`update(dips[])`). |
| `ramp(rampPlan)` | Translucent plastic up-ramp and hairpin, chrome edge trims, wire-form return with hoops, supports, entrance lip. |
| `orbitRail(orbit)`, `guides()`, `apron()` | Chrome orbit rail + painted inner wall; shooter wall, inlane guides, posts; printed apron. |
| `plunger()` | Rod, spring, tip, red knob; `update(offset)`. |
| `scoreReels(n)`, `backglass(frame)` | Digit drums (u = 0 faces the viewer; roll in digit steps); lit printed glass with a reel window, head box, SAMPLE DATA mark; `update({ glow, rolls })`. |
| `cabinet()`, `room()` | Walls, rounded chrome side rails, lockdown bar; floor and legs. |
| `caption(beats)` | Apron instruction card on the overlay (exact colours), one beat label at a time; `update(t)`. |
| `table(plan)` | Everything above assembled from `plan.lay`; one `update(state)` per frame. |

Lamp-sequence helpers live in the planner (`lampPlan` rules): `base`, `on`/`off` (latched), `blink` (next-shot arrows,
completion blinks), `chase` (running lights along an ordered id list, optional `keep`), `flash` (contacts, added on top).

## Sound palette (all from the plan)
Flipper clack + solenoid thud; bumper thwack (high thud + clack + pop); sling clack; drop-target clack; rollover double click;
plunger spring creak (servo) and launch thud + whoosh; ramp whoosh, wire clack and landing thud; rolling rumble during every
field roll longer than 0.3 s; **every reel pulse = a reel click + a chime pitched by its reel** (10s high to 100,000s low,
like EM chime units); a **bell** (two detuned low chimes) on each completed word, the ramp and the finale; a warm low pad bed and a
60 Hz transformer hum.

## Knobs
`table.tiltDeg`, `table.G` (how strongly arcs curve down-table), `lampGain` / `lampOff` (lit vs unlit insert), `post.bloom`
(threshold 2.3: only lit lamps and flashes bloom), `score.gap` (score-motor pulse spacing) and `score.awards`, `bumpers.list`
(positions, cap colours, cap word), `bank.letters`, `lamps` (add or move inserts freely; hole rings follow automatically),
`art` (title, words, zone colours), `backglass.art`, `caption`.

## Known limits (seen while building the demo)
- The ball path is choreography, not physics. Bumper rebounds were chosen to look like reflection + kick, but a sharp eye
  can find a rebound that is ~20-30 deg off a true reflection. Spin is not modelled: the ball's reflections stay fixed as it moves.
- Every chrome highlight blooms if the bloom threshold drops below ~2: a threshold of 1.0 washed the whole frame. Lit inserts
  therefore get little halo. They read by colour and brightness more than by glow.
- A whole table from the player's end is tall and narrow in 16:9. Mid shots crop to the area of play, and the final wide uses a
  three-quarter view from the left (azim -0.82) to fill the frame. A straight-on wide leaves dark floor at both sides.
- The ramp plastic is plain transparency (no refraction) and reads as a pale strip; the wire form is thin at wide shots.
- Drop targets sink into the board by depth occlusion (no slot is cut in the playfield).
- Insert letters, the caption and the backglass use macOS system fonts (Futura first): pixel-identical on this Mac only.
- The floor's horizon shows as a faint edge in the final wide.
