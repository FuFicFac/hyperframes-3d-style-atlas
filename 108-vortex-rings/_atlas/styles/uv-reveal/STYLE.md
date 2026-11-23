# UV Reveal

**Look.** An ordinary printed page on a warm oak desk under bright room light: a headline, a flat illustration, grey
lines of dummy text. Nothing else. A hand-held UV torch glides in, clicks on, the room dims — and inside the torch's
violet pool the paper sinks to deep violet and a second, hidden layer glows: a lattice of small watermark marks, neon
contours over the picture, a code strip, a big rubber stamp. Saturated cyan, green, lime and magenta. The glow lives
only where the pool is, with a short phosphor afterglow trailing behind it. Last move: the room light goes out, the
torch lifts away, the pool grows past the sheet and the whole hidden layer glows at once while the camera rises to a top
shot filled by the sheet. Demo: `89-uv-reveal/` ("AI's invisible watermark").

**Good for:** anything hidden in plain sight — watermarks, provenance, metadata, fingerprints, steganography, hidden
bias, fine print, "what the model also learned", forensic checks, security features. **Avoid for:** stories with no
"before" surface (the mechanic is the contrast between the two layers), dense data, anything that needs a bright frame
throughout (the UV beats are deliberately violet), long text in the hidden layer (marks must be big and few).

**Not thermal-camera / microscope-slide.** Those change how the whole picture is seen. Here the surface carries two
complete, different pictures and a moving light chooses between them locally.

## Files

| File | What |
|---|---|
| `spec.js` | palette, world (neutral tone mapping), lights (`fill`, `key`, `uvFill`), bloom, `page`, `print` (visible layer colours), `hidden` (fluorescent layer: colours, texts, `gain`, `paperGlow`, `poolTint`, `shimmer`), `torch` (size, `lean`, `poolSoft`, spot, beam, room/uvFill levels, `afterglow`, `wobble`), caption, `sound` |
| `torchplan.js` | **planner (Node-safe)**: `layout(seed)`, `createPlan({ keys, switchOn, lightsOff, floodDur, legs, torch, end, seed })`, `torchVoices(S.sound)`, `PAGE`, `pxToWorld`, `worldToSheet` |
| `style.js` | `createStyle(stage)` → props below; `style.plan` = the planner module |

## The planner (`torchplan.js`)

`keys = [{ t, x, z, r, h, stop? }]`: pool centre on the sheet (world XZ, sheet centred on the origin), pool radius `r`
and lens distance `h` (the beam half-angle is `atan(r / h)`, so the head can "zoom" without the torch rising). Keys are
joined by a timed cubic Hermite (finite-difference tangents, zero at `stop` keys); a few millimetres of hand sway are
added from `t`. Plan API, all pure functions of `t`:

- `poolAt(t)` → `{ x, z, r, h }`, `torchAt(t)` → `{ lens, dir, dist, pool }`
- `onAt(t)` lamp level, `roomAt(t)` room-light level, `floodAt(t)` final flood level
- `trailAt(t)` → 20 afterglow samples `{ x, z, w }`: the pool positions of the last 1.4 s, weight `e^(−age/τ)` tapered to
  0 at the end of the window and multiplied by the lamp level at that time
- `maskAt(t, x, z)` the glow mask at a world point (what the shader computes for the pool term)
- `hits` (first time the pool reaches each watermark tile, thinned to one per 0.2 s), `stampAt`, `events()` for SCORE

`layout(seed)` returns the hidden layer's geometry in sheet pixels (tile lattice, stamp box, code-strip bars, dummy text
lines), so the baked textures, the hit list and the pings read the same data.

## Props

| Prop | What | Hook |
|---|---|---|
| `uvDesk(plan, { marker, pencil })` | the whole set (desk, sheet, torch, pencil, highlighter); also drives key/fill × room, `uvFill`, background, bloom strength, highlighter fluorescence | `update(t)` |
| `sheet(plan)` | the two-layer page: `MeshStandardMaterial` with the visible print as `map`; hidden layer added to emission × mask via `onBeforeCompile` | `userData.update(t)`, `userData.uniforms` |
| `torch(plan)` | torch body + lens, violet `SpotLight`, additive cone beam | `userData.update(t)` |
| `desk()`, `pencil()`, `marker()` | oak top; props (the highlighter body fluoresces under UV) | — |
| `caption()` | overlay chip (exact colours, after post) | `userData.show(text, alpha)` |

Both layers are baked ONCE into 2048 × 1152 canvases at build (`drawVisible`, `drawHidden` in style.js); no canvas or
texture is touched per frame — only ~25 uniforms. To change the content, edit `spec.print` / `spec.hidden` (texts,
colours) or the two draw functions.

## Signature motion

Mask `g = lamp × (1 − smoothstep(poolSoft·r, r, d))`, max'ed with the 20 afterglow samples. In the shader
`diffuse ×= mix(1, poolTint, g)` (the visible print sinks to deep violet) and `emission += (hidden × gain + paperGlow) × g`.
With the lamp off every term is exactly 0 — the "before" page shows no trace. Room light dims to `torch.room.torch` over
0.6 s at switch-on and to `torch.room.flood` at lights-off; bloom strength follows the lamp (0 in the lit room, so the
white page never hazes). Camera: one slow push while the torch enters, locked during the sweep, one rise to the top shot.

## Sound

Warm `pad` in the lit room → darker, wider `pad` + 100 Hz lamp `hum` under UV. `paper` + `thud` as the sheet lands,
`clack` switch, a `whoosh` per sweep leg, one `blip` per watermark tile the pool reaches (from `plan.hits`, pitched up a
small scale, panned by x), `chime` + `thud` when the widened beam finds the stamp, `clack` + `riser` + `rumble` at
lights-off, `chime` sparkle + `whoosh` out as the flood completes. All from `plan.events()` via `scoreFromEvents`.

## Tuning knobs

- Pool feel: `torch.poolSoft` (0.68; lower = softer edge), key `r` / `h`, `torch.afterglow.tau` (0.8 s) and `radius`.
- Contrast inside the pool: `hidden.poolTint` (how dark/violet the paper goes), `hidden.paperGlow`, `torch.spot.candela`.
  Without the tint the white paper + violet light went pale lilac and the marks washed out.
- Vividness: `hidden.gain` (1.15) with `torch.bloom` (0.5). Higher gain or bloom whitens the cyan/lime first.
- Room during the sweep: `torch.room.torch` (0.3 keeps the rest of the page readable; lower is moodier).
- Final frame: `torch.uvFill.flood` and `hidden.poolTint` set how deep the violet is; the top-shot `fill` is in the scene.

## Known limitations

- No hand: the torch floats. It reads as hand-held only through its lean and a few millimetres of sway.
- The pool mask is a circle on the sheet, while the SpotLight footprint of the leaning torch is a slightly stretched
  ellipse (~1.2:1). The mask dominates on the sheet; on the desk around it only the spot shows.
- The glow mask exists only on the sheet. The desk and props just get violet light (the highlighter's glow is a
  separate emissive level).
- From this camera the torch body covers part of what its own pool reveals (worst at the start of the stamp read).
- "Fluorescence" is pictorial: the visible print is multiplied toward violet inside the pool rather than simulated;
  real paper with brighteners would glow blue-white.
- Hidden marks must be large: the 64 px tile glyphs are the smallest that read at 1080p in the three-quarter shot.
- Sheet is 16:9 so the final top shot fills the frame; a portrait page would need a different last shot.
- The trail is 20 discrete samples; at pool speeds above ~2.5 m/s the afterglow would show scallops.
