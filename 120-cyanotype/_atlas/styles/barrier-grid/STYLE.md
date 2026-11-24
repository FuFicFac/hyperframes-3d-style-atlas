# Barrier Grid (`barrier-grid`)

**Look.** Scanimation on a desk. A cream printed card (polaroid-like: wide bottom margin) lies on pale maple boards. Its
picture area is an interlaced print: six frames of an original bird flapping (front view, a bold near-black navy
silhouette with a teal beak and eyes, faint light-teal "wing-beat" rings behind it) cut into vertical strips 7.5 mm
wide, strip i carrying frame (i mod 6). On its own the card is a striped blur. Under the picture a navy sawtooth index
comb (strip k carries a tooth (k+1)/6 tall) stays uncovered, and a teal "frame meter" of the same kind sits at the foot
of the picture. A clear acetate sheet printed with opaque, bright light-coral vertical stripes (5 strips opaque, 1 strip
clear, a lit cut edge) lies 4 mm above the print; through its slits exactly one strip in six shows, so one frame shows:
the bird becomes a bold dark shape of navy slivers on a bright coral-and-cream field. Bright, even light; neutral tone
mapping; a soft analytic shadow of the sheet on the print; an overlay caption chip (charcoal plate, cream text, a little
striped-sheet icon with one teal slit) at the bottom centre.

Motion type: exact. The moving picture is produced by real occlusion of a static print by a second plane, not keyframed:
the print shader is a function of card position only (never of t); the barrier's x offset (in strips) is the only
animated input, and offset k uncovers strips i ≡ k (mod 6) = frame k. The offset itself is an art-directed schedule
(eased slide-in, a linear-ramp run, single eased steps, a cosine swing). The bird's flap cycle is drawn, not simulated.

**Good for:** "one thing holds many states and a mask chooses which one you see" — multiplexing, time-sharing, sampling,
how a static medium can store motion, persistence of vision, before/after mechanisms, any "look how simple the trick is"
explainer. **Avoid for:** subjects that need full-colour pictures (one dark ink + one spot colour), long text, fine
detail or thin shapes (every frame is seen through 1/6 of its columns: draw bold), numbers.

## Planner (Node-safe): `barrier.js`
- `birdFrames(bird, N)` → per frame a fixed slot list of primitives (uneven capsules, circles, triangles; teal or black).
  `birdPose(bird, phi)` (arm/hand angles: the hand lags the arm so the wing bends into an M; body bob).
- `packFrames(frames)` → uniform arrays; `printGLSL(slots, N)` → GLSL `frameSD(k, p, dT, dK)` unrolled over the slot
  layout (+ `sdCapsule`, `sdTriangle`). `frameSD`, `pulseRing`, `printSample` are the JS twins (previews/tests in Node).
- `stripIndex`, `stripFrame(i, N)`, `frameUnderSlits(offset, N)`.
- `createBarrierPlan(cfg)` → `{ offset(t), gap(t), visible(t), speed(t), uniformsAt(t), events({ end }), fingerprint() }`.
  `events()`: one `tick` per integer strip crossed while the sheet moves ≤ `tick.maxRate` strips/s (its `frame` is the
  frame that crossing uncovers → the pitch; none while the sheet is still entering; a touch-and-return on one integer at
  a swing's turning point counts once), `hiss` chunks scaled by speed, `slide`, `land`, `step`, `settle`.
  The picture never depends on a threshold decision (it reads the continuous offset), so Node/Chrome last-bit maths
  differences cannot desync sound and picture; `fingerprint()` is logged by the demo page and stored in NOTES anyway.

## Props (`style.props`)
| prop | what |
|---|---|
| `barrierGrid(plan)` | desk + card + acetate, added to the scene; `update(t)` sets the sheet's x / height / visibility and the print's shadow uniforms from `plan.uniformsAt(t)` |
| `card(frames)` / `printMaterial(frames)` | extruded card (edge only) + the print face ShaderMaterial: interlace with box-filtered strip boundaries, bird SDFs with per-pixel AA, pulse rings, meter, index comb, keyline, paper mottling, and the sheet's exact soft shadow (the acetate point on the light ray from each pixel) |
| `acetate()` / `barrierMaterial()` | the striped sheet (local x from the picture's left edge), its 0.6 mm rim, a soft shadow quad on the desk; `userData.set(offsetStrips, gap, visible)` |
| `desk()`, `softShadow()` | pale maple plane (kit `woodTexture`), soft rounded-rect drop shadows |
| `caption()` | overlay chip, bottom centre (keeps the top-left 140 × 110 px free); `userData.show(text, alpha)` |

**Signature motion.** The sheet slides in over the scrambled card and lands (one still frame appears); then it slides
sideways and the bird flaps — forward makes the rings expand and the flap run forward, backward reverses it; single
one-strip steps in an oblique macro show each slit landing on the next strip (the teal meter in every slit grows one
step); a tighter head-on shot swings it three flaps forward and three back.

**Sound palette.** Low warm pad bed (G2, fifth/octave/tenth, 900 Hz low-pass); acetate hiss (high `rustle`, gain from the
sheet's speed); a whoosh for the slide-in; a thud + paper for the landing; one `marimba` tick per strip crossed, six
pitches (C D E G A C') in rotation = the frame being uncovered, so the loop is audible and reverses when the sheet does;
a click per single step; soft whooshes on the macro dive/return; a low chime when the sheet stops. Measured, not heard.

**Colour rule (from the 114 review).** The sheet's stripes must be a BRIGHT opaque colour (coral `palette.barrier`) and the
figure a near-black ink on bright paper: then the decoded figure is dark slivers on a bright field and the frame stays
bright (mean luma ≈ 166–175/255 after the sheet lands). The first build used classic black stripes over a teal bird: correct
mechanism, but 5/6 of every frame was black (mean luma ≈ 100) and the bird was a faint dim-teal shape.

**Knobs (spec.js).** `grid.{frames, strip, slit, gap}` (the whole mechanism), `card.{picW, picH, margin, band, meter,
keyline, grain, gradient, level}`, `bird.*` (pose amplitudes, lag, sizes, scale, centre), `pulse.*` (ring spacing, width,
tint, fade), `acetate.{left, right, bottom, top, clear, sheen, edgeGlow, shadow, deskShadow}`, `caption`, `sound`.
Camera: head-on keys use fov 12° (near-orthographic); the macro uses the same lens closer.

**Limits (hit while building).**
- The barrier covers 5/6 of the picture by construction, so its colour sets the look of every decoded shot: keep it
  bright (see the colour rule). Each frame is seen through one column in six (7.4 px slits every 44 px at 1080p): the
  figure must be bold (thick wings and body) to read as a solid shape in a still. Between integer offsets two adjacent
  frames show side by side in each slit (that is what the real thing does).
- The bird's body barely moves between frames, so the bare interlaced print shows a solid dark body and wing roots:
  the demo frames beat 1 off the head and pulls back behind the sheet's leading edge so the whole scrambled bird is never
  seen. Beat 1's frame therefore holds a large solid navy mass in its top-left corner.
- Perspective parallax between the sheets (4 mm gap) shifts the slits by ≤ ~9 % of a strip at the picture's edges in
  the head-on shots (fov 12°); a wider lens would mix frames visibly at the edges.
- Fine stripes under a moving camera are expensive to encode: the camera holds still in every head-on beat.
- Fonts are the OS's system stack (Avenir Next / Helvetica Neue).
