# Why AI Matters — House (`wam-house`)

The **house style** for the Why AI Matters channel (host Ekello Harrid): the 3D form of its existing defaults. It is a deep-navy newsroom
studio rather than a void, with a faint 1 m floor grid, a lit horizon line, soft blue/green haze, a blurred-mirror floor and a vignette.
Extruded League Gothic capitals stand on the floor: paper faces, navy sides and bevels that catch green/blue rim light. **THE RULE**,
one electric-green bar, ties every component together. Warm paper cards carry serif headlines and Space Mono metadata. Red marks the
single most important thing in a frame. Sets are joined by whip-pans, and holds are locked off. Demo: `Builder/HyperFrames/3d-style-atlas-pilot/24-wam-house/`.

**Good for:** idents, bumpers, lower thirds, chapter cards, key numbers, pull quotes, end cards and recurring segments.
**Avoid for:** whole explainers with many objects (use another atlas style and add the overlay pieces), light or pastel topics, and real data shown without a source.

## Design system
- **Palette** (`spec.palette`): navy `#0a1424` (world), paper `#f2ecdf` (faces, cards), green `#39d98a` (**THE RULE only**, plus "AI" in the
  mark), blue `#3b7bff` (rim light, "WHY"), red `#ff5d4f` (once per frame at most: the key number), mute `#8fa0bb` (secondary mono).
- **Type roles:** display = League Gothic capitals (3D type, names); mono = Space Mono bold caps, tracked 0.14 em (labels, indexes, metadata);
  serif = editorial headlines and quotes in sentence case. Each family is ONE stack in `spec.fonts`.
- **The accent device: THE RULE.** It always draws on first (outExpo, ~0.4 s, left → right) and everything else is timed from its end. The
  bar is the same in every role: plinth under display type (letters rise *out of its top face*), progress fill on a chapter card, margin bar
  on a quote card, the top edge of the lower third, and the underline on the ident bug. It keeps green to roughly 2–5 % of the frame.
  I chose a bar over corner brackets because one bar can serve as plinth, underline, progress and divider, and it reads at phone size.
- **Safe areas:** UI stays inside the 5 % title-safe margin (lower third at x 132, y 742; bug at 132, 92). Mono ≥ 44 px, names 112 px,
  display caps ≥ 1.1 m at 10.6 m (about 20 % of frame height). All four were checked at 480 px wide.
- **The mark:** WHY blue, AI green, MATTERS paper, matching the approved splash (`youtube-video-builder/reference/splash-reference.md`).

## Components (`style.props`; copy is always a parameter; timing comes from `rundown.js` plans)
| component | signature | use |
|---|---|---|
| `rule({ length, height, depth })` | Group; `setDraw(u)`, `update(t,{on,dur,out})` | the accent device anywhere |
| `displayType(text, { cap, wordTones, tones, plinth })` | Group on a rule plinth; `update(t, identPlan/endPlan)` | ident, end card, hero words |
| `keyStat({ value via plan, cap, suffix, tone })` | Group; count-up = `rundown.statValue(t, plan)` (pure) | one big number |
| `chapterCard({ index, count, kicker, title, stack })` | paper slab, spring flip, rule = progress | chapter openers |
| `quoteCard({ quote, attribution })` | paper slab slides up, vertical rule | pull quotes |
| `paperCard({ w, h, draw, state })` | printed slab (memoised canvas) | custom editorial cards |
| `lowerThird({ name, sub })` | overlay; `update(t, lowerThirdPlan)` | name supers over footage |
| `dataLabel(text, { index, px, scrim })` | overlay mono over tick ruler, types on; anchors to 3D points | taglines, captions |
| `sampleTag(text)` | dashed mono tag | marks placeholder numbers (required for sample data) |
| `identBug()` | overlay mark + rule, settles into a corner | end cards, corner bug |
| `studioSet({ sets, bokeh })` | floor + grid + horizon + haze (+ bokeh for darker host holds) | always |
`rundown.js` (THREE-free) has the `identPlan`, `lowerThirdPlan`, `chapterPlan`, `statPlan`, `endPlan` and `quotePlan` plans. It also has `whipCamera(sets)`, `whipWindows`,
`statText`, `sonicLogo`, `voices(spec)` (event → SFX) and `bed`. `scene.config.js` imports it, so SCORE and the camera share the picture's times.
`style.lightsAt(x, level)` moves the light rig to a set, `style.whip(px)` sets the motion blur, and `style.render(t, { setX })` runs the mirror pass and renders.

## Signature motion
The rule draws, then capitals rise out of the plinth (55 ms stagger, 0.5 s, 6 % overshoot), then the mono types on. Sets change with an
18 m whip-pan (inOutExpo, 0.45 s), a horizontal motion-blur pass and a 0.55 m dolly-in that settles in 0.6 s. The camera does not drift during holds.
Cards flip in on a stiff spring and land square to the camera. Lower-third plates unfold from the rule and fold back into it.

## Sound palette
**Sonic logo** (`spec.sonicLogo`): four kit `blip` notes C5 F5 G5 C6 (sus4 → octave), with a soft chime and low thud on the last note.
The last note lands with the last ident letter. The end card uses a reprise of the last two notes. Rule draw = bright short `whoosh` + `tick`. Type-on = sparse
soft `tick`s. Whip = `whoosh` peaking on arrival. Card = `fold` + `whoosh`. Count-up = a rising `tick`/`blip` ladder, one per whole number.
Land = `thud`. Bed = `pad`, root 55 Hz, brightness **520 Hz** (a cutoff in Hz), gain 0.55. Demo mean is −22.3 dB and the peak −3.3 dBFS.

## Tuning knobs (`spec.js`)
`fonts.*` (one stack per role) · `type.depth/bevel/tracking/crease/rise` · `rule.height/depth/overhang/draw` · `set.spacing/grid/horizon/haze`
· `floor.strength/fade` (mirror) · `card.pxPerMetre/selfLit/fibre/flip` · `whip.dur/settle/dolly/blur` · `overlay.monoPx/lowerThird/bug`
· `stat.countDur/decimals` · `sonicLogo` · `bed` · lights (positions are set-relative; `lightsAt` offsets them).

## Font status (checked 2026-11-13 in the headless renderer)
- **League Gothic: real.** The HyperFrames compiler embeds it from its cache when `index.html` CSS names it. The 3D type is traced from it.
- **Space Mono: real** (400/700), embedded the same way.
- **Newsreader: not used; system fallback `Iowan Old Style` → Georgia.** It was not in the renderer's font cache. A probe that named it made
  the compiler fetch it, so it may be available now. To switch, put `"Newsreader"` first in `fonts.serif`, name it in the CSS and re-check.
- Scenes must name the families in CSS (lint rejects unembeddable fallbacks such as "Arial Narrow") and `await loadFonts()` before
  building type. `window.__wamFonts` reports which families resolved.

## Known limitations
- Glyphs are traced from a raster (420 px/em, RDP 1.1 px). Curves are slightly polygonal at very large sizes, and the outward bevel adds
  small spikes at very acute corners (W, M, ×). Kerning comes from canvas pair measurement.
- The lower third, labels and bug are drawn on the overlay. Over real footage they need the overlay rendered alone (transparent), which the
  kit cannot do yet. The demo shows them over a dark studio "host hold".
- The key stat re-lays its digits every frame (cached geometries). Values with more than five characters need `maxChars`.
- Card faces use seeded fibre noise and a little self-lighting to stay paper-coloured under the warm key. Cards seen beyond ~40° read as planes.
- Fonts are embedded, so frames are pixel-identical on this Mac; other machines need the same HyperFrames font cache.
