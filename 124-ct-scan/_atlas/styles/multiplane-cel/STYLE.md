# Multiplane Cel (`multiplane-cel`)

**Look.** Classic hand-painted cel animation shot on a multiplane camera. Inside the picture: a storybook landscape in
flat gouache with visible brush strokes and dry-brush bristle marks (pale sky with clouds and a sun, lavender and
blue-green far hills, a sunny meadow with an ochre path and a red-roofed cottage, a round-crowned tree grove, dark
foreground ferns, a flowering bush and an overhanging branch) and one inked-and-painted cel bird (black ink line, flat
blue paint, one flat shade tone, a soft cel shadow on the layer below) flapping on twos. Pulled back: the truth — six
glass panes in steel trays on rails in a steel frame, peg bars on every tray, warm lamp bars between the shelves, a
hand wheel on one tray and a film camera on a cantilever arm from the back rail, over the centre, looking straight down; a bright studio
corner (oak floor, cream walls) around it. Paint is unlit (exact gouache colours in every shot); the rig is lit.
A cream caption card with an ink serif italic sits bottom-centre on the overlay (exact colours).

**Signature mechanic.** Painted layers on stacked glass (`multiplane.js`, THREE-free):
- every layer is painted in the reference lens' picture coordinates (u, v): on pane i at distance d0 below the lens,
  (u, v) = world (u * halfW_i, -v * halfH_i). So the stack reads as ONE flat picture from the lens, and lower panes are
  painted physically larger — the way multiplane backgrounds are;
- inside the picture the camera only moves down the stack (plus a small truck): pane i scales by d0 / d(t), so the
  foreground flies apart and the sky barely moves (true multiplane parallax, no 3D landscape);
- camera keys are spherical `{ target, az, el, dist }` with `up = (-sin el sin az, cos el, -sin el cos az)`: it can look
  straight down (el = PI/2, picture-up = -Z) and turn smoothly into a three-quarter view without a lookAt flip. The kit
  camera rig forces world-up Y, so the scene places the camera itself (`style.applyCamera(stage.camera, plan.cameraAt(t))`);
- the rig shot is FITTED (`fitKey`), not hand-typed, and the scene gates the build on picture coverage (no glass edge in
  a picture shot) and on the rig filling >= 70 % of the frame width;
- one tray slides sideways on its rails (`slideAt(t)`, eased, hand wheel turns with it); back inside the picture that
  layer has moved (the grove slides off the cottage);
- the cel bird: 8 wing drawings in one atlas canvas, picked by texture offset (no redraw): pose = floor(t * 15) mod 8 and
  its path position is also held for two frames — on twos. Flight = slow Lissajous over the sky, flipped when heading left.

## Good for / avoid for
- Good for: storytelling openers, "how classic animation was made", "it's layers" explanations (compositing, depth,
  parallax, UI layers, a stack of systems), "behind the scenes" reveals, nostalgic/fairy-tale tone, before/after by
  sliding one layer.
- Avoid for: data, numbers, text in the picture (only the overlay caption), photographic or modern looks, fast action
  (the cel is on twos, the camera moves are slow), anything needing many characters (one cel atlas per character).

## Planner (`multiplane.js`, Node-safe; `style.plan` / `style.motion`)
| call | what |
|---|---|
| `layout(S)` | `{ lens, levels: [{ i, id, y, d0, halfW, halfH, margin, full }], tanH, aspect, byId }` |
| `camFrom(key)`, `project(cam, p, { fov, aspect })` | spherical key -> pose (pos, target, up, forward); NDC projection of a point. |
| `fitKey(points, { az, el, fov, window, fill })` | a three-quarter key that fills the window with the points. |
| `createPlan(S, { keys, slide: { level, du, t0, t1 }, bird, end, cues })` | the plan; picture keys as `{ t, pic: [x, z, height] }`. |
| `plan.cameraAt(t)` | `{ pos, target, up, fov, el, dist, picture }`. |
| `plan.slideAt(t)`, `plan.slideMetres`, `plan.birdAt(t)` (`{ u, v, pose, flip }`), `plan.flapTimes()`, `plan.closeness(t)` | |
| `plan.events()`, `multiplaneVoices(spec.sound)` | bed / flaps / cues / slide events -> SCORE via kit `scoreFromEvents`. |
| `paneArt(S, level, slideX)` | the painted rectangle of a level (coverage gate). |

## Prop factories (`style.props`)
| prop | what |
|---|---|
| `multiplane(plan)` | everything: studio corner, plinth, posts, rails, six trays with glass + peg bars + paintings, lamp bars, hand wheel, film camera, cel bird + cel shadow; `update(t)` (tray slide, wheel, bird drawing/position). |
| `caption()` | overlay caption card, `userData.show(text, alpha)`. |
| `room()`, `filmCamera()` | set pieces. |
`style.painters` exposes the gouache painters (`paintSky`, `paintHills`, `paintMeadow`, `paintGrove`, `paintFoliage`,
`paintSheen`, `birdAtlas`) — each paints one canvas once, seeded. `style.applyCamera(cam, pose)` places the camera.

## Sound palette
A warm G-major `pad` bed from t = 0; music-box `pluck` phrases on the beats (G B D G opening, resolving phrase on the
final picture); `blip` chirps for the bird; one soft `paper` flutter per wing downstroke (level follows the camera's
distance); `whoosh` in for each push, out for the pull-back; `thud` + low lamp `hum` when the rig shot settles; `clack`
+ `whir` + `clack` for the tray slide; a `chime` when the picture lands. All times come from BEATS / the plan.

## Knobs (spec.js)
- `rig`: pane size, level count, `baseY`, `gap`, `lensY` (reference lens), posts, plinth, lamps, peg bars.
- `picture.fov` (the lens' frame every layer is painted in); `layers[]` (margin past the frame, canvas px, `full`).
- `gouache`: stroke length/width/alpha, coverage, lightness jitter, edge darkening, seed; palette for every paint colour.
- `cel`: poses, fps (15 = on twos), bird size, ink width, shadow offset/alpha/blur.
- `glass`: Fresnel alphas, sheen, dust count. Lights `fill`/`key`/`rim`, lamp strip emission, bloom threshold.

## Known limits (seen while building the demo)
- A vertical rig is a tall subject in a 16:9 frame. The first rig (6 m panes, 0.36 m shelves, tall camera tower) filled
  only 50 % of the frame width; it reached 75 % with wide 7.2 m panes, 0.30 m shelves, a 50 deg picture lens (so the
  camera sits lower), a compact camera and a fitted low three-quarter key. The plinth sits partly behind the caption.
- From a low three-quarter angle the paintings are seen nearly edge-on and read poorly (first pass); the demo adds a
  second, steeper rig key (el 1.2) for the slide so the layers and the slid grove are legible. A cross beam or a front
  top rail over the stack blocks that view — the camera now hangs from a cantilever arm off the back rail, and the top
  frame is open at the front. The camera body still covers a little of the far sky in the steep shot.
- The camera can't fly through the film camera: the back-in path drops BELOW the camera body (eye at lens height,
  60 deg down) before levelling to straight down; a path from above put the lens ring across the frame.
- The glass's direct specular (key light) made a big blooming hot spot when looking straight down the stack; glass
  `specularIntensity` and clearcoat are 0, so the reveal's glassiness comes from the Fresnel rim term only.
- The painted sheets end in hard rectangles (visible in the rig shots and while pulling back) — true to painted cels
  on glass, but the near layers are small sheets on big panes; foreground layers read as floating strips from outside.
- Canvas memory: five layer canvases of 3584-4096 px (painted once at load, ~1-2 s). Push-ins magnify the foreground
  ~2x, so near layers are slightly soft at the end of a push.
- The bird turns by mirroring (no turn drawing), and its flight is a closed-form Lissajous, not keyed animation.
- Faces read where you don't want them: a light disc over a light plate on the camera front read as a face; trims on
  the camera are dark now.
- Dropbox stalled reads of other styles' files during `sync-kit` while many agents synced at once (the copy hung on
  a read); a minimal copy of kit + vendor + this style was used for the still loop, and the final build used the
  normal sync once it worked again.
- Audio levels were measured (sfx.wav and MP4 mean -21.3 dB, peak -5.3 dBFS), not listened to.
