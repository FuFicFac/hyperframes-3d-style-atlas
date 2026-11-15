# Mixing Console (`mixing-console`)

A vintage analogue recording console shot close and low across its surface in warm studio light. Brushed-aluminium
channel strips (printed legends, fader scales, screws) sit between oiled walnut end-cheeks with a leather armrest in
front; each strip has a long-throw fader, five coloured rotary knobs with white pointer lines (GAIN red, HI blue, MID
green, LO orange, PAN cream), square lit MUTE/SOLO buttons and a 12-segment LED bargraph. A dark meter bridge carries
one needle VU meter per channel (warm backlit cream faces, red zone, peak lamp), a larger master VU and an amber EQ
curve display. White console tape with marker-pen channel names runs along the front. The master section has a red
master fader, stereo LEDs, transport buttons, aux knobs and a jog wheel; a reel-to-reel tape machine turns its reels
behind, against a slatted walnut wall.
Demo: `Builder/HyperFrames/3d-style-atlas-pilot/46-mixing-console/` ("Balancing a mix": rhythm group up, bass up / keys
down, solo + EQ the keys, mute the hats, the balanced mix; levels are SAMPLE DATA).

**Signature mechanic: settings made physical, and the meters respond.** Every control is a labelled parameter and the
console is the diagram. `mixplan.js` turns parameter tracks into control positions — faders glide to planned values
(a group of faders starts, moves and lands together, like automation, with a small motorised settle), knobs turn
through detents (dwell, snap, one tick per detent), buttons press, latch and light — and turns the planned signal into
meter readings: each channel's notes (a 120 bpm four-bar pattern) get a gain at their onset = velocity x level x fader
law x EQ x mute/solo x master; each VU needle and LED column is the **closed-form** response of an underdamped
2nd-order movement to those note envelopes (VU: ~300 ms rise, ~9 % overshoot; LED: fast, 1 s peak hold); the master
meter sums the channels. Solo one channel and every other meter falls; mute one and the master drops; turn an EQ knob
and the curve display reshapes. **The sound is the mix:** SCORE is the same notes synthesized at the same gains (kick,
snare, hats, bass, keys, pad layers), so what you hear is what the meters show — plus fader whirs, button clacks and
detent ticks from the same plan.

**Good for:** tuning parameters and trade-offs, "turn this up, that down", balancing a mix of ingredients, settings
walkthroughs, signal levels and headroom, priorities as fader positions, before/after a setting change, mute/solo as
"isolate one factor".
**Avoid for:** precise numeric readouts (meters show behaviour, not values), more than ~8 channels in one shot, data that
is not a level/amount, sequences/processes with many steps, dark or cold looks.

## Files
`spec.js` (all numbers), `style.js` (Three code), `mixplan.js` (**pure** planner, no THREE — imported by `scene.config.js`
so SCORE, camera shots and the framing gate come from the same plan as the picture). Exposed as `style.plan` / `style.motion`.

## Props (`style.props`)
| factory | what it makes |
|---|---|
| `consoleDesk({ channels: [{ label, colors? }], masterLabel })` | the whole console in the world (panel tilted by `console.slope`): strips, master section, meter bridge (VUs, master VU, EQ display), console tape, walnut cheeks + trim, armrest, fascia. `userData`: `layout` (= `mixplan.consoleLayout`), `strips[]`, `master`, `vus[]`, `masterVu`, `eq`, `tape`, `panel`, `face` |
| `channelStrip({ number, colors })` | one strip: brushed faceplate artwork, fader, knobs `gain hi mid lo pan`, `mute`/`solo` lit buttons, LED column (`userData` has each) |
| `masterSection()` | master faceplate, red master fader, stereo LEDs, jog wheel, transport buttons, aux knobs |
| `fader({ master })` | slot + cap with a white line; `userData.set(pos 0..1)` |
| `knob({ kind, color })` | skirt + coloured cap + pointer; `userData.set(angle)` (use `helpers.knobAngle(kind, value)`) |
| `litButton({ color })` | square lens button; `userData.set(on, press 0..1)` (press travel, latch depth, emissive when lit) |
| `ledBar({ n })` | instanced LED column (green/amber/red); `userData.set(lit, peak)` in segments (from `mixplan.ledLit`) |
| `vuMeter({ w, h, label })` | bezel, backlit cream face, needle on a pivot below the face, peak lamp, glass; `userData.set(deflection)` (from `mixplan.vuDeflection`) |
| `eqDisplay({ w, h })` | dark glass with grid + amber curve; `userData.set({ lo, mid, hi }, label)` (redraw on change + `uploadTexture`) |
| `jogWheel()` | rubber knurled rim, chrome face, finger dimple; `userData.set(angle)` |
| `consoleTape({ names: [{ text, x, w }], width })` | torn strips of white tape with marker-pen names (Marker Felt) |
| `reel({ r, pack })`, `tapeMachine()` | aluminium reels with three windows; the tape machine behind (`userData.update(t)` turns the reels) |
| `studioRoom()` | slatted walnut wall + floor |
| `mixController({ desk, mix })` | `update(t, { eqFor, jog })`: sets every control and meter from a `planMix` plan |
| `caption()`, `stamp()` | overlay caption card (one fixed place) and the SAMPLE DATA tag (below the caption) |
`style.factories`: `studioRoom`, `tapeMachine`.

## Planner (`mixplan.js`, Node-safe)
- `planMix(S, { channels, automation, duration })` → `fader(id, t)`, `knob(id, name, t)` (detented), `button(id, name, t)`,
  `gain(id, t)`, `notes`, `allNotes`, `vu(id, t)`, `led(id, t)`, `peak(id, t)`, `masterVu(t)`, `masterLedSide(t, ±1)`,
  `masterPeakSide`, `eq(id, t)`, `events` (faderMove / button / detent). Automation: `{ kind: "fader", ch: id | [ids] | "master",
  at, to, dur }`, `{ kind: "knob", ch, name, at, to, dur }`, `{ kind: "button", ch, name: "mute"|"solo", at, on }`.
- Ballistics: `ballistics({ f0, zeta })`, `noteResponse(B, note, tau)` (closed form for decaying and sustained notes).
- Law / EQ: `faderDb`, `faderGain`, `posForDb`, `dbToGain`, `eqDb`, `eqCurve`. Tracks: `valueTrack`, `detented`, `latchTrack`.
- Faces: `vuDeflection` (linear in voltage, 0 VU at 71 % of scale), `vuMarks`, `ledLit`.
- Sound: `mixScore(mix, S.mix.voices)` (one event per note at its post-master gain, panned by the PAN knob; pads split where
  the console changed their gain), `controlVoices(S.mix.controls)` for `scoreFromEvents`.
- Layout / camera: `consoleLayout(S, { channels })` (`stripX`, `master`, `toWorld`, `bridge.face`, `stripBox(i0, i1, { zone:
  "all"|"front"|"meters" })`), `fitShot(pts, { elev, azim, fov, win })`, `windowCheck(keys, regions, { win })`.

## Recipe
1. `scene.config.js`: `CHANNELS` (id, label, kind, level, initial fader/knobs), `AUTOMATION` from `BEATS`, `MIX = planMix(...)`;
   regions with `stripBox(..., { zone })` — "front" for fader/button beats, "meters" for knob/EQ/VU beats, "all" for the wide;
   shots with `fitShot` (low elevation 0.3–0.46 rad); gate with `windowCheck` (caption band) + kit `framingReport`;
   `SCORE = mixScore(MIX, S.mix.voices) + scoreFromEvents(MIX.events, controlVoices(S.mix.controls))`.
2. `scene.js`: `consoleDesk({ channels })`, `mixController`, `caption()`, `stamp()`; `renderAt` calls `ctl.update(t, { eqFor })`.

## Default sound palette
The mix itself (no separate bed): kick = `thud`, snare = `paper` + short high `thud`, hats = `click`, bass = `servo` at the
note pitch (saw-like), keys = `chime` triads (+ an octave-up "air" layer that grows with the HI EQ), pad = `pad` chords on the
music bus. Controls: motor fader `whir` (70 → 96 Hz), button `clack` (pitch 1.7) + `click`, detent `tick`. Caption: quiet `tick`.
Demo measured mean −18.7 dB, max −1.1 dBFS (measured with volumedetect, not listened to).

## Tuning knobs
`mix.tempo`, `mix.progression`, `mix.kinds` (pattern steps, velocities, envelope decay, `meter` trim per kind), `mix.voices`
(levels and timbre per kind), `mix.law` (fader law), `mix.vu` / `mix.led` (`f0`, `zeta`, `hold`), `mix.vuFace.zero`,
`mix.master.meter`, `mix.eq` (band centres, range). Look: `console.slope`, `stripW`, `bridge.tilt`, `button.lit/dim`, `led.lit`,
`vu.backlight`, `knob.capFinish`, light `key` intensity, `post.bloom`.

## Known limitations
- **No depth of field in the demo.** The kit `depthOfField` (BokehPass) blurred the whole frame uniformly here, even with
  `aperture: 0` (not depth-dependent — likely the depth pre-pass at this ~1 m scene scale); `opts.dof` defaults to false. The
  "shallow focus" of the brief is therefore missing; the background tape machine is simply sharp. Kit promotion candidate.
- VU needles on percussive channels sit low most of the time (real VU ballistics average short hits); the LED columns carry
  the rhythm. Raise `mix.kinds.<kind>.meter` for livelier needles at the cost of realism.
- Meter readings and sound share the gains, but the "air" layer for HI EQ and the band gain are a simple model, not a filter.
- The pad's gain changes split its chord into crossfaded chunks (0.12 s); same-pitch partials can comb briefly at a split.
- Close low shots put the knob rows under the caption in fader beats (they are not the subject there); the faceplate legends
  (GAIN/HI/fader dB numbers) are small — legible in close shots only.
- Text is OS-rasterised (Marker Felt, Avenir Next, Helvetica Neue): identical on this Mac, slightly different elsewhere.
- Fader scale and VU face numbers are printed scale markings; any level shown in a video must still be stamped SAMPLE DATA.
