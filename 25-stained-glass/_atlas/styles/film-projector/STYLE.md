# Film Projector (`film-projector`)

A dark screening room. A vintage reel-to-reel projector (hammertone enamel body, lamp house with glowing vents, chrome
lens, two holed-flange reels on arms, sprocket drums and threaded film loops) stands on a wooden cabinet behind rows of
seats. It throws a raymarched, dusty light cone onto a pull-down screen (roller case, black masking, pull ring). The
picture is a simple procedural sepia/black-and-white silent film. Gate weave, soft vignette, scratches, dust specks and
a slight flicker all come from a hash of the simulated film-frame index. The signature mechanic is the cut between two
sets. The camera rides a backlit, sprocketed film strip from frame to frame, where each film frame holds one step of the
idea. Then it cuts to the screen, where that frame is projected large with a silent-film intertitle card as its label.
A 3-2-1 sweep-clock leader (my own design, with a 2-pop) opens the clip. It ends on an end card, a clear runout, a
white tail-out, the lamp dying and the motor running down.
Demo: `Builder/HyperFrames/3d-style-atlas-pilot/30-film-projector/`.

**Good for:** history, origin stories, "how it used to be", before/after, nostalgic intros, step-by-step stories with 3–5
beats and one short caption each, archive-flavoured channel openers.
**Avoid for:** data, charts and numbers (the picture is soft and worn), colour-critical content, long text (one card
≤ ~26 chars per beat), fast cutting below ~2.5 s per beat, and bright or modern moods.

## Files
`spec.js` (all numbers), `style.js` (Three code + 2D painters), and `reel.js`, the **pure** projection planner (no THREE).
`scene.config.js` imports `reel.js` too, so the camera shots, sprocket clatter, 2-pop, card stings and tail flaps come from
the same plan the picture reads.

## Props (`style.props`)
| factory | what it makes |
|---|---|
| `projector()` | body, lamp house + vents + leak light, lens (emissive glass), arms, two `reel`s, drums, film loops, live strands. `userData.update({ reels, lamp })`, `lensTip` (local) |
| `reel({ radius, hubR, holes })` | two holed flanges, a film pack with ring texture, hub. `userData.set(angle, packRadius)` |
| `cabinet({ height })` | wooden projector stand |
| `screen({ texture })` | fabric with the projected-picture shader, masking, roller case, bar, pull ring, screen-spill point light. `userData.setWear(wear, lamp)`, `setBounce(k)` |
| `projectedMaterial(texture)` | the projected-picture ShaderMaterial alone (sepia tone, weave, flicker, ≤ 8 specks, ≤ 3 scratches, vignette, hotspot, soft aperture) |
| `lightCone({ length, width, height, texture })` | raymarched pyramid from the lens to the image rectangle: soft edges, angular streaks, drifting dust noise, tinted by the picture's own light. `userData.update({ t, camera, level, weave })` |
| `dustMotes({ beam \| box, count, seed })` | seeded additive points drifting as f(t), lit only inside the cone (beam mode) or anywhere (box mode). `userData.update({ t, camera, level })` |
| `filmStrip({ frames, pictures, titles })` | a bent strip with sprocket holes, edge code (`SAMPLE 01 ▸`), frame lines, frame contents (picture + its intertitle card, as printed) as sepia-toned canvases, and a light table that follows `userData.setFocus(k)` |
| `programme({ pictures, titles, endTitle, endSub })` | the projected canvas, redrawn only when `plan.programme(t)` changes (JSON key). `{ texture, set(state) }` |
| `intertitle(text, { width, sub, layout })` | standalone intertitle card mesh (`setState({ text, sub, u })`) |
| `countdownLeader({ width })` | standalone leader card mesh (`setState({ n, sweep })`) |
| `room()` | carpet floor, cloth walls, 5 seat rows (instanced) |
`style.factories`: `room`, `projector` (cabinet + projector, `dims.standHeight`), `screen`.
`style.painters`: `writingDesk`, `steamTrain`, `steamship`, `cottage` (sample pictures, `painter(ctx, x, y, w, h, seconds)`),
`leader`, `intertitle`. A picture can be any function with that signature. `drawPicture` (exported) lifts a picture by
`intertitle.lift` so the subject clears the lower card.
`style.helpers.projection({ plan, programme, screen, beam, motes, projector, camera })` returns
`update(t, { beam, motes })`, which wires everything to the plan for one frame.

## Planner (`reel.js` = `style.plan`, pure)
`planFilm({ leader:{t,dur}, beats:[{id,t,dur}], tail:{t,dur,endCard,runout}, ride, cardDelay })` returns:
- `shots`: wide → (strip ride, screen) per beat → wide tail.
- `strip`: the frame layout.
- `events`: `lampOn`, one `sprocket` per film frame (18 fps, slowing through the run-down), `twoPop`, `ride`, `card`,
  `endCard`, `runout`, `tailOut`, `flap`, `lampOff`, `motorStop`.
- `filmUsed(t)`: closed form, constant speed then a linear run-down.
- `frameAt(t)`, `lamp(t)`, `motor(t)`, `programme(t)`, `wearMode(t)`, `wear(f, mode)`.
- `reels(t)`: the pack radius comes from conservation of film area. The angle is the closed-form integral of v/r. The
  empty feed reel coasts, and the take-up spins up to clutch speed once the tail is free.
- `shotAt(t)`.

Also exports `wearAt`, `stripFrame(k)` (pose on the bent strip, for camera keys), `projectorVoices(plan)` (for
`scoreFromEvents`) and `projectorBed(plan, duration)`.

## Sound palette (kit voices)
- **Bed:** motor `hum` (60 Hz) and `whir` (servo at 92 Hz, gain 0.3) run while the motor does. Under them is a low
  `rumble`. The run-down is a `servo` glide down to 28 Hz.
- **Clatter:** one `click` (pitch 0.45) per simulated film frame, alternating pitch and accented every 4th.
- **Leader:** a 1 kHz `blip` 2-pop on the "2".
- **Cards:** a piano-like sting per card. It is a fast-attack `pad` chord (brightness 2400 Hz) plus a quiet `chime`, moving
  I → IV → vi → V and resolving on the end card.
- **Strip ride:** a soft `whoosh`.
- **Tail:** a `clack` + `paper` tail-out, then `paper`/`click` flaps from the loose tail. The lamp strike and lamp off are
  `thud` + `click`.

## Tuning knobs (spec)
- `wear`: `fps` (18), `weave`, `flicker` (keep ≤ 0.06), `scratch`, `specks`, `runout`.
- `screen`: `gain`, `sepia` (0 = B&W), `vignette`, `hotspot`, `soft`.
- `beam`: `density`, `edge`, `dust`, `streaks`, `image`, `steps`, `apexBoost`.
- `motes`: `count`, `size`, `level`.
- `reel`: `speed`, `packR0`, `hubR`, `spindle`, `flaps`, `stopDur`.
- `strip`: `pitch`, `arcR`, `glow`, `table`, `camDist`.
- `intertitle`: `font`, `panel`, `lift`, `textSize`, `fadeFrames`.
- `leader.per` and `sound.*`.

## Known limitations
- Looking down the cone from near the screen, full-strength haze veils the picture. The demo thins the beam to 0.16 and
  the motes to 0.15 in screen shots (`update(t, { beam, motes })`). The beam is not depth-occluded inside the cone, only
  by the depth test on its back faces, so props inside it get no shadow.
- Motes in screen shots read a little like stars on the dark parts of the frame.
- The strip set lives far off at +X and is reached by hard cuts. The rig's linear interpolation means a long ride across
  many frames would cut slightly inside the arc.
- The projected picture redraws its 1024×768 canvas once per film frame (mipmaps for the beam). That is fine offline,
  but heavy for a live preview.
- Intertitle fonts are macOS system faces (Didot / Bodoni 72 / Baskerville, Georgia elsewhere).
- Sepia is gentle under neutral tone mapping. Raise `screen.sepia` or warm `palette.sepiaLight` for a stronger brown.
- Sample pictures are simple flat silhouettes. Real content needs its own painters.
- The tail-out white frame blooms hard on purpose.
- The film path at the gate is stylised: the film runs on the operator side, not through the optical axis.
