# Music Box (`music-box`)

**Look.** The open movement of a music box, shot macro in warm bright light on pale wood (toy-scale: the cylinder is
2.6 m long so one pin reads at 1080p). A lathe-turned brass cylinder (canvas map: turning marks, one engraved ring per
tooth, one engraved line along the axis per bar — a staff wrapped round a drum) studded with polished steel pins turns
toward a steel comb of 12 teeth, long low teeth on the left, short high teeth on the right, screwed to a brass block
with four blued screws. Right end: a brass wheel, a pinion, a crank with a wooden knob. Left end: a second wheel, a
worm and a two-vane governor. Brass bedplate, brass brackets, steel arbor. Room environment for the metal, a warm key
from front-left, a cool rim, neutral tone mapping, light vignette, no grain, no bloom. Captions sit on one ivory
overlay plate with a brass edge, top centre (exact colours).

**Signature mechanic.** The pins are the program (`tune.js`, THREE-free). One note list `[step, tooth]` gives:
- **pins**: a note at time T on tooth i is a pin at `x = tooth x`, angle `psi = PI/2 + aRel - omega * T` (angles from +Y
  toward +Z; tooth tips sit at PI/2). Around the cylinder = when, along the axis = which note;
- **teeth**: `deflection(i, t) = min(free, held)`; `free = -A exp(-s/tau) cos(2 pi f s)` after the last pluck
  (`s = t - T`), `held = -Rp (sin a + sin aPre)` while the next pin sits on the tip (`a` from `-aPre` to `aRel`);
  `A = Rp (sin aRel + sin aPre)` so both agree at the release. The tooth mesh pivots at its root by `asin(d / length)`;
- **tint**: `energy(i, t)` (1 at the pluck, fast decay) drives a warm emissive on that tooth, so the eye finds the note;
- **drive**: cylinder angle `omega t`, crank `-ratio * omega t` (pinion on the wheel), worm `40 * omega t`;
- **score**: `events()` = one `pluck` per pin at T (marimba bar note at the tooth's pitch + a quiet plucked octave + a
  tick), one ratchet tick per crank pinion tooth, a whir + pad bed. `tuneVoices(spec.sound)` maps them for
  `kit/schedule.scoreFromEvents`.
`createPlan` throws if a tooth is re-plucked sooner than `comb.minGap` or a note falls outside one cylinder turn.
The built-in tune, "Pinwheel Lullaby", is original to this style (C-major pentatonic, C4 to D6, 80 pins).

## Good for / avoid for
- Good for: "the program is the pattern" (encoded instructions -> output), sequences and scores, automation, stored
  patterns becoming behaviour, training data -> response, punch cards / piano rolls / firmware, calm mechanical loops.
- Avoid for: anything needing numbers or text in the picture (only the overlay caption), fast or dense music (a pin
  holds its tooth ~0.28 s, so one tooth cannot repeat faster than `comb.minGap` = 0.6 s), branching logic (a cylinder
  only plays straight through), dark or moody topics (the look is bright and warm).

## Planner (`tune.js`, Node-safe; `style.plan` / `style.motion`)
| call | what |
|---|---|
| `SCALE` | 12 pitches `{ name, hz }`, one per tooth, low to high. |
| `TUNE` | `{ name, t0, step, notes: [[step, tooth], ...] }` — the one list. |
| `createPlan({ movement, tune, scale, end })` | `{ teeth, notes (= pins, with psi), omega, amp, contact, minGap, cylAngle(t), crankAngle(t), wormAngle(t), deflection(i, t), energy(i, t), events() }`. |
| `tuneVoices(SND)` | voices for `scoreFromEvents` (`pluck`, `ratchet`, `bed`). |
| `panOf(movement)` | event -> stereo pan from x along the comb. |

## Props (`style.props`)
| prop | what |
|---|---|
| `wood({ size })` | pale wooden table top (kit `woodTexture`, wide boards). |
| `movement(plan)` | builds and adds everything; returns `{ group, cylinder, comb, crank, governor, update(t) }`. |
| `cylinder(plan)` | drum + caps + one InstancedMesh of pins + both wheels; `userData.setAngle(a)`. |
| `comb(plan)` | heel, block, screws, 12 pivoting teeth (own material each); `userData.update(t)`. |
| `frame()`, `crank(y, z)`, `governor()` | bedplate / brackets / arbor; crank shaft + pinion + arm + knob; worm + vanes. |
| `caption()` | overlay plate; `userData.show(text, alpha)`. |

## Signature motion
- Constant slow turn; pins ride over the top toward the viewer and down onto the tooth tips.
- Press, release, ring: ~0.28 s of the pin pushing the tip down 62 mm (toy scale), then a 6.5–10.5 Hz decaying ring.
- Crank turns 5x the cylinder; governor vanes spin 40x (about 16 degrees per frame at 30 fps: no strobing).
- Camera: one short arc move per beat, locked during holds; the macro shot sits on the pin/tooth contact line.

## Sound palette
`marimba` (bar note, decay 0.62 s low to 0.36 s high) + `pluck` one octave up (the metallic edge) + a `tick` per pin;
`tick` per ratchet click; `whir` (164 Hz, governor) and a soft `pad` (C3, fifth, tenth) as the bed. Demo measured:
see the demo's `renders/checks/RUN.txt`. Measured, never listened to.

## Tuning knobs (`spec.movement`, `spec.sound`)
- `cylinder.period` — seconds per turn = the longest tune; `pins.aPre/aRel` — how long and how far a pin pushes a tooth.
- `comb.teeth/pitch/lengthLow/lengthHigh/minGap`; `vib.hz/tau` — the visible ring; `vib.glow/glowTau` — the warm tint.
- `drive.ratio`, `governor.ratio`; `track.*` — the engraved rings and bar lines; `sound.*` — levels and decays.

## Known limitations
- The visible ring frequency is a stand-in: real pitches (262–1175 Hz) alias at 30 fps. Low teeth ring slower, that is all.
- Teeth are rigid bars pivoting at the root, not bending cantilevers; fine at these amplitudes, wrong in an extreme close-up.
- Pin/tooth contact is a rule (the tip follows the pin between two angles), not collision; the pin visibly overlaps the
  tooth tip by a few millimetres at some angles. Gear and worm meshing is phased by formula, not checked for overlap.
- The warm tint on a ringing tooth reads salmon rather than gold on grey steel (emissive on metal).
- The comb block is a plain brass box and the largest undetailed surface in wide shots.
- Polished steel can flare to near-white when the key light reflects straight into the lens (left-front low angles).
- One tune per cylinder turn; `createPlan` does not wrap notes, so a demo longer than `cylinder.period` shows the
  pins come round again without sounding.
