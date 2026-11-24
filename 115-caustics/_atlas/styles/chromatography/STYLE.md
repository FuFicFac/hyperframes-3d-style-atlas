# Chromatography (`chromatography`)

**Look.** Paper chromatography on a bright daylight lab bench: a pale blue-grey tiled wall, a mid grey resin bench, a short wide
glass jar with a little clear solvent, a strip of white filter paper hanging from a black binder clip on a clamp-stand
arm, a steel rule beside it (ticks only, no numerals), a felt-tip marker, and a small steel drying rack. A pen dots black
ink near the bottom of the strip; the strip is lowered into the solvent; a damp front climbs the paper and the black dot
stretches and splits into blue, magenta and yellow bands. White paper (cut edges slightly darkened) standing off blue-grey
tiles, cool steel and glass, saturated dye colours. The two rack strips carry different inks: violet / green / orange
(three bands) and teal / red (two bands), at heights unlike the main strip's.
Toy-scale exaggerated (a 1.2 m × 0.4 m strip) so bands and the paper read at 1080p.

Motion type: analytical (closed form) with an art-directed clock. Front height above the solvent = K·sqrt(process time)
(Lucas–Washburn wicking shape); process time is a time-lapse clock that runs at 1× until the front reaches the dot and then
ramps (smoothstep) to about 10× so the slow late climb still reads in seconds — the speed-up is art-directed. Each dye's
band centre = origin + Rf × (front − origin) with a fixed Rf; band width grows linearly with distance travelled and the peak
falls so the amount is conserved (a modelling choice, not fitted to real dyes). Strip moves (lower, lift, hang) are eased
rigid moves. Nothing is simulated; physical accuracy was not checked against a real ink.

**Signature mechanic.** One shader on the strip. Per pixel: paper albedo from a code-baked fibre texture; a darker damp
region under a front that wobbles with the paper's formation noise, a thin tide line and a darker soaked zone below the
solvent surface; and up to four dyes as soft (super-)Gaussians plus a faint streak back to the origin. Dye colour is
SUBTRACTIVE per RGB channel, `paper × exp(−Σ absorbance_rgb × concentration)`, so the three dyes stacked on the dot read
black and show their own colours once apart (absorbance sums are balanced so the dot has no colour fringe).

**Good for.** "What is it made of?", decomposition, mixed causes behind one result, provenance / tracing an output back to
its parts, things that look simple but are several components moving at different rates, separating signals.
**Avoid for** numbers or text in the picture, dark or moody looks, fast action, anything needing many (> 4) components.

## Files
- `spec.js` — palette, materials, lights, set dimensions (bench, wall, jar, stand, rule, rack, clip, pen), strip + paper
  look, the black ink (dyes + Rf), dye absorbances, spread knobs, the two finished strips, caption, sound.
- `chromaplan.js` — **pure planner, Node-safe** (imports only `kit/time.js`): `createPlan`, `dyeState`, `finishedDyes`, `chromaVoices`.
- `style.js` — `createStyle(stage)`: the strip material, props, `style.plan` / `style.motion` = the planner.

## Planner (`chromaplan.js`)
- `createPlan({ strip, solventY, ink, spread, t, frontAtStop, arm, clipDrop, home, slot, pen })` → plan. K is solved so the
  front meets the dot at `t.meetDot`; the time-lapse `rate` is solved so the front stands at `frontAtStop` at `t.stop`
  (throws if no speed-up is needed).
  - `front(t)` (strip v), `clock(t)`, `dyesAt(t)` → `[{ name, u, v, su, sv, amp, tail, origin, crisp }]`, `deposit(t)`, `wetness(t)`.
  - `stripPose(t)` → `{ top, sway, phase }` (jar → Bezier lift → rack), `solventV(t)`, `penAt(t)`, `cornersAt(t)`, `worldAt(u, v, t)`.
  - `separations(k)` → first time each band clears its neighbours by k × (σ₁ + σ₂). `events()` → `penIn`, `tick`, `lower`,
    `dip`, `hiss` (one grain per 0.32 s, level = front speed), `split` (per band), `lift`, `hang`, `chord`.
- `finishedDyes(ink, { dotV, frontV, spread })` → static bands for an already-run strip.
- `chromaVoices(spec.sound)` → voices for `kit/schedule.scoreFromEvents`.

## Props (`style.props`)
| prop | what |
|---|---|
| `labBench(plan, { slots })` | everything for one plan (adds itself): room, jar, rack, stand + arm + rule, strip, pen, finished strips; `update(t)` |
| `strip()` | Group, origin at the strip's top centre: curled paper mesh with the chromatography material + clip; `userData.chroma.set(dyes, front, solventV, wetness)` |
| `stripMaterial()` | the shader alone (MeshStandard + injected GLSL); needs an `aStrip` (metres) attribute |
| `fibreTexture(seed)` | 512² tile: r = fibres (5 200 seeded strokes), g = formation noise, b = fine noise |
| `jar()` | fresnel-glass jar (outer + inner wall, base, lip), solvent volume + meniscus, contact shade |
| `stand()` | clamp stand; `arm` group (boss, screw, bar) moves with the strip |
| `rule()`, `pen()`, `clip()`, `rack()`, `room()` | set pieces; pen origin at the nib, `userData.aim(axis)` |
| `caption()` | overlay chip (top left, strip icon), `userData.show(text, alpha)` |

## Signature motion
- Pen glides in, dots for 0.5 s (the dot grows with the deposit, crisp-edged while dry), leaves.
- Strip lowers on the clamp arm into the jar; the bottom soaks; the front shoots up then slows (sqrt).
- When the front reaches the dot the edge softens and blooms, then the dot stretches upward and peels into three bands.
- Camera: locked holds, one move per beat, tilting up with the bands; one move to the rack synchronised with the lift.

## Sound palette
`whoosh` pen in, `tick` + `penScratch` dot, `whir` lowering, `bubble` ×2 dip, soft `paper` grains following front speed,
one `marimba` note per band as it separates (yellow G5, magenta D5, blue G4), `whoosh` + `bubble` lift, `click` hang,
`marimba` G-major arpeggio chord, quiet `pad` bed.

## Tuning knobs (spec)
- `ink[].rf` / `mass` — band order and strength; `dyes` — absorbance per RGB (keep the three sums equal for a neutral black).
- `spread.s0 / au / av / suMax / crispWet / tail / gain` — dot size, band growth, band edge softness, streaking, density.
- `paper.wet / soaked / tide / wobble / fibre` — how the damp region reads; `paper.edge / edgeW` — edge darkening.
- `finished[]` — the rack strips' inks (dyes `green`, `orange`, `violet`, `teal`, `red` exist for them).
- Scene: `TIMES.meetDot`, `frontAtStop`, ramp window — how fast it separates (the scene's `NOTES.separations` lists the times).

## Known limitations
- The time-lapse speed-up is art-directed; Rf values and band widths are illustrative, not measured.
- Bands are smooth ellipses (no fingering, no uneven solvent front beyond a gentle wobble, no dye interaction).
- Glass is fresnel-only (no refraction): the strip below the rim looks hazy, not bent; the solvent does not wick visibly
  into the glass meniscus.
- The strip is lifted by an invisible hand; the clip hook is schematic. Drying is a fade of the damp tint only.
- Rack strips must sit far left so close-ups do not show their bands early; framing relies on that layout.
- Fibre texture + moving camera costs bitrate; the camera is locked during holds.
