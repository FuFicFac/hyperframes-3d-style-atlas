# Spotlight Stage (`spotlight-stage`)

A Victorian toy theatre seen from the stalls. A gilded, bevelled proscenium arch with a cartouche and gilt columns sits in a
dark plum damask wall. Behind it hangs a two-half crimson velvet house curtain: pleated cloth geometry, a sheen rim and
vertex-shaded fold valleys. It parts and swags into the wings under a fixed swagged valance with gold fringe and tassels. Flat
painted cut-outs (gouache colour, ink outline, engraving hatch, plywood backs) stand on plank boards in front of a painted
backdrop. Hard spots strike with a thunk and throw dusty additive cone beams, soft pools and real shadows. Amber footlights
glow along the apron, and silhouetted front-row heads (top hats, bonnets) frame the bottom of the shot.
Demo: `Builder/HyperFrames/3d-style-atlas-pilot/09-spotlight-stage/`.

**Good for:** "a play in N acts" explainers, thought experiments (Turing test, trolley problem, Chinese room), debates and
A-vs-B comparisons, reveals, historical scenes, and character-driven stories with 2–4 actors and one big caption at a time.
**Avoid for:** data/charts, many simultaneous labels, photoreal subjects, 3D-rotating heroes (cut-outs read as planes beyond
~30°), and fast cutting. The camera must stay in the stalls.

## Frame
x runs across the stage, y up from the boards (y = 0), z toward the audience. Proscenium at z = 0 (opening 8.4 × 4.6 m),
house curtain at z ≈ −0.3, backdrop at z = −5.2, apron lip +1.45, auditorium floor −1.3. Signs hang at z ≈ +0.25 (in front of
the curtain, so a caption survives the close). Keep actors at z ≤ −0.7 (curtain folds reach ±0.3 m).

## Props (`style.props`)
| factory | what it makes |
|---|---|
| `theatre({ tracks, paint, seed })` | the whole house; `userData.{curtain, footlights, backdrop, floor, proscenium, valance}` |
| `proscenium()` · `stageFloor({ width, tracks })` · `masking()` | arch + wall + columns · plank boards and apron with floor tracks · black legs |
| `backdrop({ w, h, paint: "night" \| (h, w, hh) => void, seed })` | painted cloth (kit print helper `h`); `style.painters.night` |
| `curtain({ width, height, z, seed })` | pleated two-half velvet; `userData.setOpen(u)` 0 closed .. 1 gathered + swag |
| `valance({ width, z })` | fixed swagged border, gold fringe (swept tube) + tassels |
| `footlights({ width, z })` | hooded amber bulbs + `spec.footlights.lights` point lights; `userData.setLevel(k)` |
| `followSpot({ from, to, angle, intensity, color, shadow, beam })` | SpotLight + additive dusty cone; `userData.aim(p)`, `setLevel(k)`, `setTime(t)` |
| `paintedCard(shape, { color, ink, hatch:{from,angle}, draw(h), thickness })` | one gouache cut-out piece |
| `cutout({ parts:[{shape,color,hatch,draw,layer}], stick:{dir,length}, base })` | layered actor, optional toy-theatre slide wire |
| `sceneryFlat({ shape\|w,h, color, draw, hatch, mount:"track"\|"wire"\|"none", wireTop })` | painted flat with foot+brace or flying wires |
| `foldingScreen({ panels, panelW, h, fold, color, trim, label })` | zig-zag hinged painted screen |
| `bubble({ text, w, h, tail })` | speech-bubble flat (origin = tail tip, text auto-fits) |
| `hangingSign({ text ("\n" lines), sub, w, h, color, border, wireTop })` | gilt-edged board on wires; `userData.setDrop(y, swing)` |
| `audience({ perRow, rows, width, z, rowGap, scale, seed })` | front-row silhouettes |
`style.factories`: `theatre`, `audience`. `style.shapes` = kit shapes.

## Cues (`cues.js` = `style.motion`, pure, no THREE; import it from `scene.config.js` to time sounds)
`curtain(t, openAt, closeAt)` · `slide(t, start, from, to) → {x, rot, arriveAt}` (lean + damped rock) ·
`drop(t, start, {from, to, out}) → {y, swing, landAt}` (springy lines + pendulum, optional fly-out) ·
`snap(t, at, {off})` (stutter, over-bright thunk, settle) · `aim(t, [{t, p}])` (spring swings between marks) · `popIn` / `popOut`.

## Sound palette (all kit voices)
Curtain = low `whoosh` (q 0.7, pitch 0.45) + dense low `rustle`. Spot strike = `thud` (pitch 0.55) + `clack` (0.5) + short `hum`.
Slide = low `rustle` + `whoosh`, `clack` + `thud` on `arriveAt`. Sign = short `whoosh` and a `thud`/`clack` on `landAt`.
Murmur bed = `rumble` + sparse low `rustle`s hushing as the curtain rises, under a warm `pad` (brightness 700 Hz, gain 0.14).

## Tuning knobs (spec)
`velvet.{folds, foldDepth, gatherGrow, openGap, hemLift, valleyShade, sheenColor}` · `spots.{beamOpacity, beamSoftness, dust,
snapOvershoot}` · `footlights.{intensity, lights}` · `paint.{outline, hatch, grime}` · `motion_tuning.{slideDur, wobble, drop,
curtain}` · `stage.opening/frame` · `world.exposure` (1.18, neutral tone mapping) · `lights.wash` (stage readability).

## Known limitations
- A beam that crosses the camera-side air (source in front of the arch) washes over signs; keep follow-spots above/behind the arch.
- Beams are additive cones, not true volumetrics: no occlusion inside the cone, and they pass through scenery seen edge-on.
- Curtain halves rebuild ~12k vertices per changed frame. Folds can clip props closer than z = −0.7.
- Cut-outs, signs and bubbles are flat: keep the camera within ~25° of facing the stage.
- Superclarendon/Bodoni are macOS system fonts (Georgia fallback elsewhere). The pool is the real SpotLight, so its edge softness
  depends on `spots.penumbra`. There is no easel title card yet: use `hangingSign`.
