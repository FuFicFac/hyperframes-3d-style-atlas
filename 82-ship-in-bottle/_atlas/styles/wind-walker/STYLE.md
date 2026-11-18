# Wind Walker (`wind-walker`)

**Look.** A bright, pale beach at low tide under a blue-white sky. A skeletal creature of pale yellow plastic tubing, black
cable ties and cloth sails walks across rippled sand on twelve legs, leaving footprints. Every leg is the same planar bar
linkage hung on ONE crankshaft, each station a sixth of a turn later, so rigid sticks step in a travelling wave. The opening
shows one leg as a diagram in sea mist (navy ink centre-lines, joint rings, ground-pivot marks, dashed crank circle, the
hip–tracer–foot ray, and the foot's flat-bottomed loop traced as a glowing path); the mist lifts and the whole creature is there.

**Good for:** simple rigid rules producing lifelike behaviour; emergence from mechanism; "it looks alive but it's geometry";
many dumb parts making one smart motion (neurons → behaviour); embodied AI / robotics; anything "one input, many outputs in phase".
**Avoid for:** dark or moody topics, dense text, data charts, anything needing more than one short caption at a time.

## The mechanism (`linkage.js`, pure / Node-safe)

One leg = seven sticks, solved in closed form from the crank angle by two circle–circle intersections:
1. Straight-line four-bar: crank O–A, coupler A–B extended to the tracer T, rocker P–B. `B = circle(A) ∩ circle(P)`.
2. Pantograph about the hip H with gain k = 3: `M = circle(H) ∩ circle(T)`, knee `K = H + k(M − H)`, foot `F = H + k(T − H)`
   (H, T, F stay collinear — the dashed ray in the diagram). The aft leg on the same crank pin is the same solve at π − θ, mirrored.

Bar lengths (m) were chosen by a numeric search over the four-bar's proportions with all 12 legs in the gait, minimising foot
slip — not a textbook set, not any existing creature's numbers: crank 0.12, ground O–P 0.2409, coupler A–B 0.3083 (+0.3236 to T,
T offset −0.026 square to it), rocker 0.2948, thigh 1.5, shin 1.68, parallelogram links 0.56 and 1.0, hip 1.2 above the crank axis.

Verified numerically in Node (`createGait(...).report`, also thrown on in the demo's scene.config.js if `ok` is false):
stance = 81.8° of crank within 6 mm of flat over 0.683 m; foot speed ripple along it 1.4 %; step height 0.36 m; stride
3.03 m per crank turn; body bob 1.6 mm; body speed ripple 0.7 %; worst travel of any planted foot over the sand 0.5 mm;
3 feet down at all times (12 handovers per turn).

Gait: at every crank angle the lowest foot carries the creature; body x = X_k − footX and body y = −min footY (closed form;
handover angles found once by bisection). `crankClock` = constant rates joined by smoothstep ramps (integrated analytically).
`createPlan(S, { end, past, clock })` → `pose(t)`, `leg(j, t)`, `prints` (touchdowns), `events()` (step / creak / turn),
`loop()` + `loopProgress()` for the traced path. `walkerVoices(sound, level)` maps events to voices for `scoreFromEvents`.

## Props

| prop | what | hooks |
|---|---|---|
| `beach()` | rippled sand (painted colour + bump), wet band, sea, surf lines, world-space sky dome + mist veil | — |
| `walker(plan)` | static tube frame, crankshaft, 12 legs (instanced tubes, pins, cable ties, feet), 7 cloth sails | `userData.update(t, pose)` |
| `diagram(plan, walker)` | hero leg as a diagram (screen-space ink lines, glowing foot loop + tracer loop, foot spark) | `update(t, { ink, glow, t0 })` |
| `footprints(plan)` | one soft dimple per touchdown (instanced, appears at its planned time) | `userData.update(t)` |
| `caption()` | overlay chip, bottom-left, exact colours | `userData.show(text, alpha)` |
| `helpers.setMist(clear, dist)` | fog near/far + veil: 0 = solid mist just behind a plane `dist` from the camera, 1 = normal haze | — |
| `helpers.follow(x, camera)` | moves the sun's shadow box with the creature, centres the sky on the camera | — |

## Signature motion
- Crank turns → every joint follows by geometry; legs along the shaft are 60° apart, so steps ripple along the body.
- Camera keys are relative to the walking body (the scene adds body x after `rig.update`), so the sand slides under planted feet.
- Reveal = fog lifting (not a cut): one leg clear, the rest ghosted in mist, then the arc out to the rear quarter.
- Sails belly out with the gust that speeds the crank (0.26 → 0.44 turns/s).

## Sound
Wind bed (long overlapping low `whoosh` sweeps + a quiet pad), a louder gust when the mist lifts, `paper` rustles as sails
fill, one soft `thud` (+ sand grit) per planned touchdown panned by station, a `servo` creak per half crank turn, a light
`clack` per turn, a three-note `marimba` on the last caption. Steps are quieter while the herd of legs is still in mist.

## Tuning knobs (spec.js)
`linkage.*` (re-run the Node verification after any change), `gait.stations / spacing / phaseStep / contact`, `clock`,
`build.*` (tube radii, layer spacing), `sails.*` (heights, yaw, billow, gust), `beach.*`, `mist`, `prints`, `diagram.*`, `caption`, `sound.*`.

## Known limitations
- Only 3 of 12 feet are planted at any moment (stance is 82° of the turn); it reads as a high-stepping gait, not a shuffle.
- The body stays level: no pitch/roll or compliance; sails are a vertex-displaced grid, not cloth simulation.
- The fore foot crosses the centreline by 0.13 m at the back of its swing (fore and aft feet are on different z layers).
- The diagram shot also shows the hero station's mirrored aft leg and the frame (un-inked); the mist only hides the stations behind.
- Screen-space ink widths are in pixels, so the glowing loop looks heavier as the camera pulls back before it fades.
- Sand tile repeats every 7 m; visible as soft banding in high wide shots. Pale tubes rely on shading + dark ties to separate from sand.
- A moving textured ground under a tracking camera is bitrate-heavy: the demo ships at CRF 24.
