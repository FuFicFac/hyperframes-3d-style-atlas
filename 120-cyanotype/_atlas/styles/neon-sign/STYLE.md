# Neon Sign (`neon-sign`)

Glass-tube neon on a dark painted brick wall at night. Lettering and icons are real round tubes swept
along single-stroke paths, bent (filleted) at corners, with dark electrode caps, stand-off mounts, clips,
feed-through wires and cable runs to a transformer box. Lit tubes have an HDR emissive core (brighter
facing the camera) so only tubes bloom; each part also paints an additive glow decal on the wall and
drives coloured point lights, so the bricks visibly catch the spill. Unlit tubes stay visible as dull,
slightly hue-tinted glass. Motion is electrical, not physical: tubes switch on with a seeded stutter.

**Good for:** short punchy claims, definitions, "X becomes Y" reveals, lists of 3–6 labelled items,
counters/IDs, night/city/retro/tech moods, anything where "switching on" = an idea arriving.
**Avoid for:** dense text (> ~30 chars per row), charts or precise geometry, soft/organic topics,
lots of simultaneous motion, lowercase typography, bright daytime looks.

## Prop factories (`style.props`)
| prop | returns |
|---|---|
| `brickWall({ width, height, center:[x,y] })` | wall plane at z = 0 with painted brick map + bump |
| `neonText(text, { height, color, align, spill=1, letterSpacing, wordSpacing, lineHeight, gapBefore:{i:m}, glow })` | element, 1 part per letter (A–Z, 0–9, `? ! . , : ; ' " - + = / \| ( ) [ ] < > # % & *`, `\n`) |
| `neonIcon(name, { size, color, spill, perStroke, ...iconOpts })` | `arrow{dir}` `circle` `ring` `underBracket{w,h}` `bracketL` `bracketR` `divider` `bolt` `check` `chevron` `star` `heart` `counter{digits}` |
| `neonPath(strokes, { cap, color, perStroke })` | element from raw strokes (`[x,y]` points / `["a",cx,cy,rx,ry,deg0,deg1]` arcs, metres) |
| `acrylicPlate(text, { height, color, font, weight })` | 5 cm edge-lit acrylic plate: glowing polished rim + printed text (kit text helper); `userData.setLevel(l)`, `update(t,{on,seed})` |
| `spillLight({ color, position, intensity })` | extra coloured PointLight for custom spill |
| `cable(points, { radius, bend })` / `cableRun(from, to, { viaX, viaY, clips })` | thin black cables hugging the wall |
| `transformer({ w, h, d, label })` | wall-mounted transformer box; `userData.inputs` = cable gland points |

Element API (`el.userData`): `update(t, { on, stagger=.07, seed, off, color, order })`,
`setPart(i, level, color?)` + `sync()`, `setAll(level, color?)`, `charRange(i0, i1) → {x0,x1,parts}`,
`ends`/`feed` (wall feed-through points), `width`, `bounds`, `parts[]`.
Also exported: `flicker(t, onTime, seed, opts) → level` (kit/motion.js flicker with this style's defaults), `layoutText`, `ICONS`,
`sweepGeometry`, `expandStroke`, `filletPath` (re-exported from kit/paths.js). The font data is `kit/strokefont.js`. `factories`: `brickWall neonText neonIcon acrylicPlate transformer`.

Recipe for "re-light as something else" (e.g. tokens): per part, `t < reOn ? flicker(t, on_i, s) in colour A
: flicker(t, reOn, s2) in colour B`, then `sync()` — see `03-neon-sign/scene.js`.

## Default sound palette
`bed: hum` (60 Hz, plus a quiet 120 Hz layer at pitch 2) · `enter: buzz` (flicker 0.8–0.95, dur ≈ the
element's light-up time) + `click` crackles · `ui: tick` per item/chunk · `land: clack` (relay) for
plates and the closing line · `exit: click`.

## Tuning knobs (all in `spec.js`)
- `world.toneMapping: "neutral"` keeps gas colours saturated (ACES turned lime/cyan cores white).
  `neon.emissive` (2.2) vs `post.bloom` {0.85, 0.32, threshold 1.0}: 2.6/1.0 already blurs letters together.
- `neon.lumaExp` + `spill.lumaRef/lumaMin/lumaMax`: per-colour luminance balance (lime ×0.4, violet ×1.6)
  so every gas has a similar core and spill; raise `lumaMin` if lime should dominate.
- `neon.tubeRadius` (× cap), `bendRadius`, `letterSpacing`, `standoff`, `capLength`, `mountEvery`, `clipScale`.
- `spill.lightIntensity` / `lightDistance` / `glowStrength` / `glowWidth`: wall spill and halo.
- `plate` {depth, rim, edge, body, emissive}: acrylic thickness, rim glow, body glow, text brightness.
  `neonText(..., { spill: n })` sets point lights per element (0 for small parts; budget ~8 total).
- `flicker` {dur, pulses, pulseLen, pulseLevel, hum, humHz}: stutter character and shimmer depth.
- `wall` {colors (dark blue-grey paint), mortarColor, chip, grime, …}; `lights.ambient`/`moon` set how much brick reads unlit.

## Known limitations
- Per-part materials (one per letter): fine to ~150 letters; spill point lights are the real budget.
- Letters are one stroke-weight, uppercase only; no lowercase or accented glyphs. `&` is rough.
- Caps on every stroke end make dense rows (small caption text) look busy — realistic, but noisy below ~0.3 m cap.
- Colour switching on the same tube is a motion-graphics cheat, not real neon.
- Token gaps (`gapBefore`) are baked into the layout, so the sentence already reads split before it is tokenised.
- Glow decals are flat on the wall: a camera swing > ~35° off-axis shows them as planes.
- Glass is `standard`. (The original note that `physical` + `clearcoat` suppresses emissive was checked by the kit maintainer and is wrong for r181: clearcoat only dims emission by its Fresnel, ~2 % facing, ~30 % at silhouettes.)
- Acrylic plate text uses OS-rasterised system fonts (pixel-identical on this Mac only).
