# Glass & Light (`glass-light`)

An optics-bench still life: polished clear and coloured glass solids (prisms, blocks, faceted gems, lenses, spheres,
rods) on a dark matte bench in a dim hazy room, with **light as the actor**. Beams are computed by real ray optics
(`optics.js`: Snell refraction, total internal reflection, per-wavelength Cauchy IOR) and re-traced every frame from the
pieces' current transforms. They draw as additive volumetric shafts (soft halo, bright core, drifting dust, travel head),
a prism fans white light into a spectrum, and caustics land on the table where the rays hit. **Glass** is an opaque
custom shader that samples a same-frame pre-render of the scene without the glass, refracted per colour channel, giving
chromatic fringes. It adds a Beer-like thickness tint, Fresnel reflection of an analytic softbox studio, bevel-rolled
edges (bright glints plus a dark inner band) and coloured light from nearby beam points. Neutral tone mapping and
restrained bloom (threshold 0.85). Hairline caps captions sit in one fixed lower region.

**Good for:** "many → one" and "one → many" stories (fusion, mixtures, routing, attention, encoders/decoders,
spectra, signal processing), anything where a transformation is a path. **Avoid for:** dense diagrams, many labels,
warm/cute topics, scenes that need people or places, or bright high-key looks (the glass needs a dark room).

## Props (`style.props`)
| prop | returns |
|---|---|
| `bench(o)` | dark cyclorama with a faint blurred-mirror floor (kit `reflectiveSweep`) |
| `glassPiece(kind, o)` / `prism` `block` `gem` `sphere` `lens` `rod` | Group (scene root); `userData.piece()` → optics piece from its CURRENT transform; `material.userData.glass` uniforms. Opts: `id, tint ("clear"\|cyan\|magenta\|amber\|smoke\|green\|hex), density, refract, self, mount` + shape dims |
| `emitter({ label, color, size, height })` | light-source head + glowing aperture + engraved label; `setLevel(k)`, `ray()` → `{o, d}` |
| `beams({ capacity })` | ONE additive ribbon mesh for every beam segment; `set(items, t)` |
| `spill({ capacity })` | same, lying on the bench (dim light under the shafts) |
| `caustics({ capacity })` | additive ellipses on the bench, stretched along the arriving ray; `set([{p, dir, length, width, color}])` |
| `glints({ capacity })` | four-point star sprites (px); `set([{p, color, size, level}])` |
| `dust(o)` | seeded motes lit by their distance to the lit beam segments; `update(t, items, camera)` |
| `spillLights({ count })` | fixed pool of PointLights; `set([{p, color, level}])` |
| `caption(text, { x, y, sub })` | overlay caps + drawn rule + hairline leader to a 3D anchor; `update(t, {on, off, anchor})` |
| `titleLockup(title, o)` | kit title lockup in this look |

Helpers: `beamItems(path, { color, level, head, width, pulse, pulseFrom })` (head = metres travelled; pulse = encoded
packets after `pulseFrom`), `causticFor(path, color, level)`, `polyGeometry(planes)`, `lensGeometry`, `glassMaterial`.
`style.setGlow([{p, color, radius}])` (≤ 6 beam points that tint and light all glass). **Always `style.render(t, { focus })`**:
it runs the mirror pass and the refraction pre-pass, then sets the DoF focus and calls `stage.render`.

**`optics.js` (THREE-free, Node-safe):** shapes `prismShape gemShape boxShape extrudedPoly sphereShape lensShape rodShape`,
`trace(ray, pieces, { nm, maxLen, floorY, stop })` → `{ segments[{a,b,s0,s1,inside}], events, end }`, `spectrum(ray, pieces)`
(one trace per `BANDS` wavelength), `clipPath`, `firstEvent`, `ior(glass, nm)`, `GLASS`, `nmToRGB`, `polyFaces(planes)`.
`stop: { piece, point }` ends a ray inside a piece at its closest approach (several beams "meet" in one block).

## Signature motion
Beam switches on and its head travels (~4 m/s, spark at the head). Pieces slide or turn and beams re-route live. A prism
turns slowly so the fan breathes and sweeps. Encoded packets ride the beam after a piece. One slow arc orbit with shallow
DoF on the active piece. Captions draw a rule, then a leader to the subject.

## Sound palette
Bed `pad` root 55 Hz, `brightness` 360 **Hz**, gain ≈ 0.2. One sustained `pad` tone per beam (chord: [0, 12],
brightness 1500 Hz) at pitches that form a chord when the beams meet. `tick` + `chime` on switch-on, `chime` + `sparkle`
when glass engages, `riser` → `thud` + `rumble` + major `pad` swell at fusion, `sparkle` when a spectrum lands.

## Tuning knobs (`spec.js`)
`glass` {prepass, ior, dispersion, refract, bevel, bevelRoll, edgeDark, fresnelPow, env, panels, tints, density, glowRadius},
`beam` {width, core, coreK, halo, falloff, dust, pulse, speed, spill}, `caustic`, `glint`, `dust`, `prism.glass.boost`
(dispersion exaggeration; 12 gives a 0.8–1.2 m fan over ~3 m), `floor` (mirror strength), `post.bloom`, `overlay`.

## Known limitations
- Refraction is screen-space: glass never shows other glass through it (the pre-pass hides all glass), and anything
  off-screen cannot be refracted in. One extra scene render per frame (plus the mirror pass and BokehPass).
- Beams merging into one is staged (`stop` + a new source at the core), not physics.
- Inside the gem, the fused glow can push the body toward milky white: keep `uSelf` ≤ 0.05 and the core glow ≤ 0.8.
- Emitter labels on the +Z face can be hidden by the emitter in front of them. Keep the camera ≥ ~20° above the bench.
- The mirror's 12-tap blur turns pulsed beams into ringed blobs on the floor. Keep `floor.strength` ≤ 0.15.
- Dark corners macroblock at CRF 22 under heavy gain; the demo ships at CRF 18 (still well under 12 MB).
- Prism sweeps must stay inside the TIR-free yaw window: scan it with `spectrum()` in Node first.
