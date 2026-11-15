# Cymatics (`cymatics`)

**Look.** A Chladni plate on a clean, light lab bench: a dark anodised square plate (2.4 m, toy-scale exaggerated so one
grain still reads at 1080p) on a brass post over a speaker-driver can, dusted with ~42 000 bright warm-white sand grains
(one InstancedMesh of flat-shaded low-poly grains, seeded size/rotation/tint). A cream function-generator box with a
green display and a knob that turns up with each pitch step, a glass jar of the same sand and a brass scoop sit beside
it; a soft high key from front-left and a cool rim light. Strong contrast: pale sand on a near-black plate on a light
bench. A centred caption chip and a top-right frequency readout ("220 Hz") live on the overlay (exact colours).

**Signature mechanic.** Sound builds the picture (`chladni.js`, THREE-free):
- mode list `[{ id, m, n, sign, t, hz }]`; plate displacement `w = cos(n pi x)cos(m pi y) + sign cos(m pi x)cos(n pi y)`
  (x, y in [0, 1], free edges); nodal lines are `w = 0`;
- once, seeded: every grain's settled position per mode = a random start projected onto `w = 0` by damped,
  step-clamped Newton steps, then pushed a seeded gaussian distance across the line (line width = `sand.spread`);
- grain(t) = `lerp(start_k, settled_k, outCubic(u))` with a per-grain delay/duration, plus a perpendicular "dance"
  `* sin(pi u)`; `start_k` is the grain's position at the moment mode k starts (precomputed), so a pitch step re-targets
  continuously — the old figure shatters, the new one forms;
- hop = drive envelope x `|w_k(p)| / 2` x `|sin|` at a per-grain rate: antinodes bounce, nodes sit still;
- a seeded ~2 % of "stragglers" start late and walk slowly, so a locked figure still has a few grains moving in;
- the plate slab (segmented box) bends statically by the blended mode shape (`plate.flex`), which shows as a shifting
  reflection on the anodised top;
- SCORE from the same list: one sustained tone per mode at exactly its `hz`, a sand hiss over each gather, a tick and a
  soft chime (2 x hz) when the figure locks (`lockAt` = when `lockShare` of grains have arrived).

## Good for / avoid for
- Good for: "sound/vibration/frequency has structure", resonance, emergence and self-organisation, order from noise,
  "turn it up a notch" escalations, science-explainer openers, music/audio topics, calm hypnotic loops.
- Avoid for: anything needing text or numbers in the picture (only the overlay readout), exact physics (figures are the
  idealised square-plate formula; real plates differ by material and clamp), long holds on one figure (static once
  locked), fast camera moves (tens of thousands of grains cost bitrate).

## Planner (`chladni.js`, Node-safe; `style.plan` / `style.motion`)
| call | what |
|---|---|
| `displacement(mode, x, y)`, `gradient(mode, x, y)` | the plate shape and its gradient. |
| `settlePoint(mode, x, y, { iters, maxStep, margin })` | project a point onto the nodal set. |
| `createPlan({ grains, seed, spread, margin, modes, move, straggle, hop, lockShare, end })` | the plan (all settled positions + timings precomputed). |
| `plan.positionsAt(t, out)` | `[x, y, hop01]` per grain (closed form). |
| `plan.shapeAt(t)` | `[{ mode, weight }]` for the plate flex (crossfades after each step). |
| `plan.modeAt(t)`, `plan.toneEnv(t)`, `plan.stageAt(t)` | the sounding mode (for the readout), drive envelope, stage index. |
| `plan.modes[k]` | `{ ..., k, lockAt, off }`. |
| `plan.events()`, `chladniVoices(spec.sound)` | tone / hiss / lock events -> SCORE via kit `scoreFromEvents`. |

Good-looking modes (sign +1): (0,2) diamond, (2,4) diamond + ring, (2,8) flower lattice, (2,6), (4,6), (0,4), (4,8).
`sign -1` with m = n is identically zero — never use it. (1,3,-1) and similar have a star point where lines cross.

## Prop factories (`style.props`)
| prop | what |
|---|---|
| `chladniPlate(plan, { generator: [x,z], jar: [x,z], generatorRot })` | everything: bench, plate, driver, generator, jar, cable, sand; `update(t)`. |
| `sand(plan, { hop, seed })` | the InstancedMesh; `userData.update(t, shape)`. |
| `plate()` | anodised slab; `userData.update(shape)` bends it (redraws only when the shape changes). |
| `driver()`, `generator({ position, rotationY })` (`userData.setPitch(u)`), `jar()`, `cable(from, to)`, `bench()` | set pieces. |
| `caption()` | overlay chip, `userData.show(text, alpha)`; centred above the plate (`caption.align: "center"`). |
| `readout()` | overlay frequency chip, `userData.show(hz, alpha)` — pass the hz SCORE is playing. |

## Sound palette
`pad` on the sfx bus, `chord: [0]`, root = the mode's hz (a sustained tone with partials 1-3 and a gentle +/-0.4 %
chorus), gain tilted down with pitch (`tone.tilt`), overlapping release into the next tone; `rustle` + a soft `whoosh`
(out) sand hiss over each gather; `tick` + `chime` at 2 x hz when a figure locks. No other bed: before the first tone
the clip is silent. All times come from the plan.

## Knobs (spec.js)
- `plate`: size, thickness, height, `segments`, `flex` (bend at |w| = 2).
- `sand`: grain count, size range, `hop` height, `spread` (line width), tint; `move` (delay, duration, dance),
  `straggle` (share, delay, duration), `hopFeel` (rate, attack), `lockShare`.
- Lights `key`/`fill`/`rim`; materials `plate` (anodised colour/roughness/metalness), `bench`.
- `sound`: tone gain/tilt/attack/release/brightness, hiss gains, lock tick/chime gains.

## Known limits (seen while building the demo)
- Mid-transition frames read as an even haze of sand (every grain is travelling at once) for ~1 s before the new figure
  emerges; shorter `move.dur` makes the re-forming crisper but the "shatter" briefer.
- Grains thin out where nodal lines cross and at the plate margin (Newton steps avoid saddle points; `margin` keeps
  grains on the plate), so line crossings show small gaps.
- Physics is idealised: the figures are the textbook square-plate formula, not a simulation of a real plate; the tones
  are chosen musical fifths (220, 330, 495 Hz), not the plate's real resonances. Don't present them as measured.
- The tones use the kit `pad` voice (closest to a pure sustained tone); its +/-0.4 % chorus gives a slow beat. A pure
  sine/tone voice would be a kit promotion candidate.
- Grains don't cast shadows (too small for the shadow map); the plate and props do.
- The positions loop (~42k grains, a few trig calls each) runs on the CPU per frame; fine at this count.
- Audio levels were measured (fast-loop render: mean -21.2 dB, peak -4.0 dBFS), not listened to.
