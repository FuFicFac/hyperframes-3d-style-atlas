# Shadow Puppets (`shadow-puppets`)

A shadow theatre seen from the audience. The screen fills the frame: a warm, glowing cloth with a faint weave, a slight
sag, a darker double-layer hem and tie knots, held in a pine frame with a deep playboard. It is lit from behind by one
lamp, so the cloth has a soft hot spot where the lamp sits and falls off toward the corners. Flat cut-out puppets on rods
live between the lamp and the cloth and cast real shadows on it. Coloured gel windows in the cut-outs make patches of
jewel colour, and the rods show as thin lines running down off the cloth. Neutral tone mapping keeps the amber and the
gels as designed. Captions sit on a dark wooden plaque with a gold inlay and cream serif capitals (overlay, exact colour).

**Signature mechanic: shadow geometry as a pure function of time.** A caster at depth d behind the cloth, lit by a lamp
of radius r at depth L, casts a shadow magnified by M = L/(L−d) with a soft edge 2rd/(L−d) wide. So moving a puppet
toward the lamp makes it big and soft, and moving it toward the cloth makes it small and crisp. Zoom, scale changes and
depth layers come from moving puppets, not the camera. Jointed limbs swing on their own rods. Scenery slides in from the
sides in layers, and thin translucent card makes a lighter layer behind. Moving the lamp swings and stretches every
shadow at once: near-cloth scenery barely moves, near-lamp puppets swing a lot. A deterministic cloth ripple bends the
silhouettes slightly and swells after each entrance.

**How the shadows are made (the projector).** No shadow maps are involved. Each cut-out part is baked once into a
signed-distance field (outline and windows) plus a nearest-window gel colour, using a canvas raster, an exact EDT and
canvas anti-aliasing for sub-pixel edges. Every frame, one full-cloth quad per caster is rendered into a HalfFloat
transmission target with multiplicative blending. The quad's shader follows each cloth point's ray back to the lamp, finds
where it crosses the caster's plane (fraction s), reads the SDF there, and uses a soft-edge width of 2r(1−s), the exact
disc-lamp penumbra in caster units. Overlaps multiply and gels tint. Yawed or rotated casters work too, because the hit
point is a true ray-plane intersection. The cloth shader shows that target multiplied by the lamp falloff, hot spot,
weave, drape, ripple and hem. The real cut-out meshes (alpha-cut cards with gel films), rods and lamp also exist behind the
cloth.

**Good for:** stories and fables, history, myths vs reality, scale comparisons (near = big, far = small), "what's behind
the screen", anything warm, simple and narrated. **Avoid for:** data, numbers, UI, lots of text (shadows can't carry small
type; titles work at ≥ 0.35 m cap), photographic realism, dark or moody palettes (this look is bright and warm), and
fast action (it reads best at a storyteller's pace).

## Planner: `puppetry.js` (THREE-free, Node-safe; `style.plan`)
| export | what |
|---|---|
| `magnification(L, d)`, `penumbra(r, L, d)`, `depthForScale(L, M)`, `shadowPoint(lamp, p)`, `placeForShadow(lamp, at, M)`, `shadowExtent(lamp, pose, bbox)` | the shadow geometry (framing checks in Node) |
| `planShow(show)` → `{ lamp(t), pose(id, t), events, ripple(t), home }` | the whole show. Actor keys are in **shadow space** against the home lamp: `{ t, at:[sx,sy], size:M, rot, yaw, op, scale, ease, tap }`. They are converted to physical (x, y, depth) and interpolated physically, so a lamp move swings shadows correctly. Limbs: `{ base, keys:[{t,a,ease,tap}], swing:{amp,rate,phase,on,ramp}, steps }`. Lamp keys: `{ t, x, y, z, r, level, ease }` |
| events | `swish` (each long move, with `dur`, `dist`, `depth`), `step` (swing zero crossings), `tap` (keys with `tap`), `lamp` (lamp moves), `pluck` (theme notes). Feed them to `kit/schedule.scoreFromEvents` |
| `sampleKeys`, `swing`, `swingTimes`, `themeFromBeats(beats, phrases)` | keyed tracks, walk/flap oscillation, footfalls, a plucked theme timed from BEATS |
| `cut.*` | cut-out shapes in metres: `poly rect ellipse circle diamond star crescent leaf hills zigzag`, `title(text, cap)` (kit stroke-font letters as strokes); `cutBounds(cut)` |

A part's cut = `{ fill: [poly], strokes: [{ pts, w }], holes: [{ poly, gel }] }`. Holes without `gel` are plain cuts (full
light). `gel` is a key of `spec.gels` (ruby, amber, emerald, sapphire, violet, rose) or a hex colour.

## Props (`style.props`)
| prop | returns |
|---|---|
| `screen()` (also factory `screen`) | cloth (self-lit shader) + frame rails, playboard, cap mouldings, tie knots, a wall with an opening (flush with the frame front, so the backstage is only seen through the cloth) and a floor. `userData.box`, `userData.clothBox` |
| `lamp()` | brass hood + bulb on a stand, placed from the lamp state by `style.update` |
| `puppet(design, { name })` | `design = { parts: { id: { cut, parent, joint:[x,y], rod:[x,y] \| rods:[{at, lean}], rodLean, cardT } }, cardT }`. Every part is drawn in the puppet's own frame and hinges at `joint`. Each part is a real alpha-cut card + gel film AND a caster. `userData.update(pose)` takes the planner pose (limbs in degrees) |
| `scenery(design \| cut, { name, cardT })` | a puppet with no limbs (hills, trees, moon). `cardT` 0.2–0.4 = thin translucent card (a lighter layer) |
| `titleCut(text, { cap, weight, rods, holes })` | the words as one stroke-font cut-out on a thin bar, held on two rods |
| `caption(text, { x, y, px })` | overlay plaque (exact colour); `userData.update(t, { on, off })` |
| `label(text)` | kit text label in the style's serif |

Per frame: `style.update({ t, lamp: plan.lamp(t), ripple: plan.ripple(t) })`, then each `puppet.userData.update(plan.pose(id, t))`,
then **`style.render(t)`** (it renders the transmission target first, then the frame). `style.projector.addCaster({ obj, bake | rod,
density })` and `style.bakeCut(cut)` are exposed for custom casters.

## Sound palette
Bed `pad` root 98 Hz, chord [0, 7, 12, 16, 19], `brightness` 650 **Hz** (sets the mean, around −21 dB). The plucked-string
theme is approximated with a short `blip` plus its octave plus a tiny `click` attack, one phrase per beat
(`themeFromBeats`). Swishes are a low `whoosh` (pitch 0.42, q 0.9) plus a sparse low `rustle`, one per long move. Steps
are a soft low `clack` (pitch 0.42) on each footfall. Taps (a key landing, the jaw opening) are a `clack`, with a low
`thud` for the title and `thud` + `rumble` for a near-lamp giant. A lamp move adds a quiet `whir` plus a `whoosh`. The demo
adds a darker minor `pad` under the giant and lamp beats.

## Tuning knobs (`spec.js`)
`screen` {width, height, bottom, frame {rail, depth, playboard, cap}, sag, hem, ties}, `cloth` {gain, falloff, hotGain,
hotExp, floor, floorLevel, weave {pitch, amp, slub, drape, drapeFreq}, ripple {amp, shade, speed, waves}}, `lamp` {x, y,
z, r, color, level} (r sets the softness: 0.09 m gives ~1 px at the cloth and ~0.4 m at d = 2.7 m), `projector` {rt
size, margin, minWidth (cloth diffusion), cardT (card translucency), gelGain, bakePxPerMetre, bakeMax}, `gels`, `post`
(bloom threshold 1.25: only the hot spot blooms), `overlay` (plaque).

## Known limitations
- Casters must sit between the lamp and the cloth (0 < d < L). A caster behind the lamp or in front of the cloth casts
  nothing (by design, no error).
- The soft edge is a linear ramp over the SDF (a good disc-lamp approximation). Very thin parts near the lamp fade out
  rather than showing a true penumbra overlap, and SDF corners round off slightly when soft.
- Overlapping parts of one puppet multiply their card translucency (`cardT`), so a limb over the body reads a shade
  darker. That matches translucent leather, but set `cardT` toward 0 for fully black card.
- Rods are drawn in their part's plane and always point down past the cloth bottom (lean set per rod). There is no
  puppeteer's hand.
- One lamp per style instance. Coloured or second lamps (two-colour shadows) are not implemented.
- The cloth hot spot and falloff are analytic. The cloth sag and ripple displace the mesh and bend the shadows slightly,
  but the shadow geometry is computed on the flat plane z = 0.
- Captions overlap the bottom of the cloth (the near hills' trim) in a 16:9 frame where the screen fills the frame.
  Keep important shadow detail above the bottom ~12 % of the cloth.
- The weave is procedural and kept subtle for bitrate: at 1080p it reads as a fine texture, not individual threads.
- Each caster is a full-cloth quad (fragment cost ≈ casters × target pixels). The demo's 16 casters at 1600 × 850 are
  cheap on the M1 Pro. Past ~60 casters, bound the quads to each shadow's box.
- Rendering the backstage (camera behind the cloth showing the real puppets and lamp) has not been tried in a demo.
  The geometry is all there, but the cloth renders opaque from behind.
