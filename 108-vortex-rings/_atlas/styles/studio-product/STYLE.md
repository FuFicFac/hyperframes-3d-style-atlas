# Studio Product (`studio-product`)

A high-end product commercial: one hero object floating on a black seamless sweep, lit like a phone or car
ad. Reflections come from a **procedural studio**: a black room of emissive softboxes, strips and gradient cards
rendered to a PMREM at load (no image files), plus a long sweep strip that travels over the set so its highlight
slides across every glossy face. Direct lights match the emitters. Materials: polished black glass (clearcoat),
brushed aluminium (procedural streak roughness/bump + anisotropy), satin ceramic, gold, one saturated accent.
The floor is a **blurred planar mirror** (second render from the mirrored camera), fading radially. ACES, bloom
only above 2.0 HDR, vignette, grain as dither. Type is overlay-drawn: light-weight tracked caps, hairline rules.

**Good for:** hardware/product reveals, "meet the X" openers, feature callouts on one object, premium/tech moods,
anything where "light passing over it" = attention. **Avoid for:** many objects, diagrams, process flows, cute or
warm topics, scenes needing context/environment, matte or organic subjects (they have nothing to reflect).

## Props (`style.props`) and helpers
| prop | returns |
|---|---|
| `sweep({ width, depth, height, radius, center })` | black cyclorama with blurred-mirror floor; `style.render` does its mirror pass |
| `bevelSlab({ w, d, h, radius, bevel, holes:[{w,d,radius,x,z}], material \| materialName })` | rounded slab on y=0, bevelled edges, UVs in metres |
| `lathedBody([[r,y]...], { segments, materialName })` | turned body (knob, barrel, pedestal, dot) |
| `etchedPanel({ w, d, cols, rows, gap, seed })` | black clearcoat glass with seeded etched cells; `setCell(i,j,v)`, `setAll`, `commit()`, `cellCenter(i,j)` |
| `contactPads({ w, d, perSide, length, width, height, inset, rows })` | InstancedMesh of edge pads (gold) |
| `ballGrid({ w, d, pitch, radius, keepOut })` | InstancedMesh of spheres under y=0 (BGA, feet, rivets) |
| `edgeTrace(points, { radius, color, intensity, tail })` | HDR hairline along a path; `set(head, { level, tail, full })` |
| `turntable({ keys:[{t,v,ease}] \| speed })` | invisible Group; `update(t)` sets rotation.y |
| `contactShadow(o)` | kit contact shadow, darker default |
| `callout(label, { dir, knee, run, sub })` | overlay dot+ring, elbow hairline, small-caps label; `update(t, { anchor, on, off })` |
| `titleLockup(title, { sub, x, y, size, rule })` | overlay title + drawn rule + sub; `update(t, { on, off })` |
| `brushedMaterial({ perMetre, seed, color })` | a new brushed-metal material with its own streak maps |

`style.studio.set({ level, sweepU, sweepLevel, yaw, rotation })` (re-bakes the PMREM only when inputs change;
`rotation` = `scene.environmentRotation.y`, free). `style.render(t, { focus:[x,y,z] })` = mirror pass + DOF focus +
`stage.render`. `style.dof` (BokehPass), `style.helpers` (`studioEnvironment`, `brushedMaps`, `reflectiveSweep`,
`roundRectShape`, `roundRectLoop`, `ballGrid`, `depthOfField`). Factories: `sweep bevelSlab lathedBody etchedPanel contactPads`.
Materials: `glass brushedMetal ceramic ceramicLight accent gold floor`.

**Plan module `lightplan.js`** (THREE-free, import it in `scene.config.js` via `./_atlas/...`): `sweepAt(t, sweeps)`,
`sweepPeak(s)`, `studioLevel(t, {on,dur,off})`, `keyed(t, keys)`, `shotKeys(shots)` (hard cuts), `wavePlan(cols, rows, {origin,start,step})`, `pulse(t, on, opts)`.

## Signature motion
Black → `edgeTrace` lap → first sweep brings `studioLevel` up. Turntable ~0.1 rad/s, eased to rest on the hero.
Sweeps ~1.3–2 s, back horizon → overhead → front. Arc-key macros, one pull-back, hard cuts on beats. Callouts draw
on 0.45 s, hold ≥ 1.5 s, fade 0.45 s; one at a time.

## Sound palette
`bed: pad` (root 55 Hz, minor 5-note, `brightness` 400–900 **Hz**) · sweeps: `whoosh` pitch 0.45–0.55, q 0.9, peak
on `sweepPeak` · reveal: `thud` pitch 0.4 + `rumble` · glows: `chime` 0.5–1.0 + `sparkle` · callouts: `tick` · cuts: short `whooshOut`.

## Tuning knobs (`spec.js`)
- `studio.panels` (pos/size/intensity/soft), `studio.sweep` {size, radius, from, to, intensity}, `sigma` (crispness), `size`.
- `floor` {strength, facing, blur, fade, envIntensity, specular, resolution}; `post.bloom.threshold` (2.0) — keep high.
- `brushed` {streaks, perMetre, roughness, bump, anisotropy}; `glow` {color, strength}; `trace`; `dof` {aperture, maxblur}.
- `overlay` sizes/tracking/colours; `lights` (all scaled by the studio level).

## Known limitations
- A floating flat object shows only its underside in the mirror: give it something there (`ballGrid`) or lower it.
- A big strip reflecting in a flat top can wash out what is under the glass; turn the studio (`rotation`) per shot.
- Mirror floor assumes the plane y = 0; the cove is excluded by height. Cost: one extra scene render + BokehPass.
- Re-baking the PMREM each sweep frame costs a few ms; static frames reuse it. Fonts are system stacks (this Mac).
- Paths below an object's top plane get hidden on the far side: put `edgeTrace` on the top ridge.
