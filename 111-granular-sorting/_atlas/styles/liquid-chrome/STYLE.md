# Liquid Chrome (`liquid-chrome`)

Turn-of-the-millennium Y2K chrome. Mirror-finish liquid metal flows, merges like mercury, pinches apart and re-forms
into icons and puffy chrome lettering. It floats in a saturated cyan → violet → magenta void with a neon grid, soft bokeh orbs,
four-point sparkles and lens flares. The liquid is a **raymarched signed-distance field**: a smooth union of up to 40 control
primitives (spheres, capsules, rounded slabs, union or carve), uploaded every frame from plain data. It reflects a **procedural
chrome world written in GLSL**: near-black zenith, deep-blue sky with light bands, a white-hot horizon line over a black band,
warm orange ground, magenta/cyan/white strips and a sun. The result is the iconic banded look with no image files. Blobs reflect
each other (second bounce), and creases get field AO. Thin-film iridescence is optional. Tone mapping is `neutral`; bloom starts at 1.25.
Demo: `Builder/HyperFrames/3d-style-atlas-pilot/23-liquid-chrome/`.

**Good for:** "one thing becomes many", "many things merge into one", playful tech and AI explainers, product or feature
reveals with a retro-future mood, title cards, icon reveals, music/creator content.
**Avoid for:** sober or serious topics, dense diagrams or data, many small labels, photoreal scenes, anything that needs
hard edges or exact geometry. SDF icons are soft-cornered by nature.

## Props (`style.props`)
| factory | returns |
|---|---|
| `liquid({ maxPrims, steps, selfReflect })` | raymarched box mesh. `userData.set(prims, t)` uploads slots and fits the box. `setRipples([{ p, age, amp }])` |
| `inflatedText(text, { cap, radius, letterSpacing, lineHeight })` | stroke-font tubes in the same chrome shader. `userData.update(t, start, { stagger })` springs the glyphs in. `chars`, `width` |
| `sparkles({ capacity })` | screen-space HDR points. `userData.set([{ x, y, kind: star\|halo\|ghost\|streak, size, level, color, rot }])`. `flare(x, y, level)` returns flare entries |
| `backdrop()` · `gridFloor()` | gradient void with glow and drifting orbs (`update(t)`). Additive neon grid fading to the horizon (`update(t, level)`). Also `factories.backdrop/grid/liquid` |
| `caption(text, { size })` | flat outlined techno caption on the overlay (exact colours). `userData.update(t, { on, off, x, y, world })` |

Helpers: `style.env.set({ yaw, iridescence, horizon })` turns the reflected world, which is cheap. `env.sunWorld()`.
`helpers.chromeMaterial()` is the mirror ShaderMaterial for any mesh. `helpers.highlightPoint(prim, camPos)` gives the sun-glint point (use it for sparkles).

## The plan module (`liquid.js`, pure and Node-safe; exposed as `style.plan`)
- Primitive builders: `prim / sph / cap / rbox / ghost`. Slot = `{ c, he, r, rot, yaw, k, w, op }`. `w` = presence: at 0 the slot shrinks inside itself, so it never pops.
- `SHAPES`: `sphere chat frame code wave(t) play star heart arrow ring bar`. Each is about 2 units wide, faces +Z, and has ≤ 9 slots.
- Morphs: `fitSlots`, `collapsedLike(target, R)` (the melted state), `mixPrims(A, B, u)`, `morphThrough(A, B, u)`, `place(prims, { pos, scale, rot, yaw })`.
- Motion: `wobbleBlob(t, { R, n })`, `orbiters(t)`, and `splitPrims(u, { from, R0, to, r, k })` for pinch-split. Reverse u to merge; the neck forms from the k swell.
- Droplets: `dropletPlan({...})` → `dropletAt(d, t, { R })`, `absorbed(plan, t)` (drives the swell), and `dropletEvents(plan)` → SCORE through `scoreFromEvents`.

Recipe: keep a fixed slot layout (groups × slots, slot 0 = core). Build the whole list from `t` every frame, and hand over between
phases only where both sides give identical slots: split end = collapsed start = core radius `morph.R`, same `k`.

## Signature motion
Never at rest: cores circle inside one union, plus a surface wobble. Droplets accelerate in, stretch into teardrops, sink and ripple.
A split bows toward the camera while the blend radius swells (a mercury neck), then snaps. Shapes re-form through a melt.
Type inflates letter by letter with a spring overshoot. The camera glides through a slight barrel "fisheye" (`lens.barrel`).

## Sound palette
Wet `bubble` bloops (pitch by droplet size) on every merge, plus a low `pop` on every third. A `bubble` per neck snap. `blip` arpeggios as icons form.
`riser` shimmer into the swell. `sparkle`/`chime` on glints. Rising `pop`s per inflating glyph. Bed: maj9 `pad` at 131 Hz, brightness
1500 Hz, gain .34, plus an airy 523 Hz layer (brightness 3200). The demo's mix averages −23 dB.

## Tuning knobs (`spec.js`)
`env.*` controls the reflected world (sky colours, `horizonIntensity/Width`, `darkBand`, ground, `panels[]` strips, `sun`).
`chrome.f0/edgeBoost/iridescence/filmThickness/occlusion/selfReflect`. `liquid.steps/reflectSteps/relax/wobble/ripple/margin/maxPrims`.
`type.radius` (puffiness)/`letterSpacing`. `caption.*`. `sparkle.*`, `flare.*`. `backdrop.stops/glow/orbs`. `grid.*`. `lens.barrel`. `post.bloom`.

## Known limitations
- Rays that miss get silhouette AA. Occlusion edges *inside* the liquid (one blob in front of another) do not, and a merge crease
  seen behind a front blob can show a 1-px stair at 2× zoom.
- Mirror reflections of small flying droplets appear as tiny beads on the big blob. This is physically right, but it reads as specks.
- SDF icons have rounded corners only. Carved details (chat dots) need `k` ≤ .05 and must sit on the face (z ≈ surface).
- Morphs between different shapes go through a melt (`morphThrough`). A direct slot blend of unrelated shapes looks like noodles.
- Cost scales with live slots × covered pixels. The demo (≤ 36 slots, 80 steps, 22 bounce steps) rendered at about 0.11 s/frame on M1 Pro.
- The liquid writes `gl_FragDepth`. The kit `depthOfField` pre-pass would see only its bounding box, so it is not supported.
- Blender export sees only the bounding boxes. Re-create the liquid there as metaballs or remesh, and copy the env as an HDRI.
