# Style briefs 91–100 and how to run a builder (written 2026-11-22)

This file plus `BUILDER-BRIEF.md` is everything a builder agent needs. It is written so that ANY capable model can do the
work — no knowledge of the earlier conversation is assumed. One agent builds one style.

## How the orchestrator starts a builder (copy this prompt, fill in NN and id)

> You are a builder adding ONE new style to the 3D Style Atlas: number **NN**, id **`<id>`**.
> 1. Read `/Volumes/Panther/3D Style Atlas/_orchestration/BUILDER-BRIEF.md` and follow it exactly.
> 2. Read `/Volumes/Panther/3D Style Atlas/_orchestration/STYLE-BRIEFS-91-100.md`: the sections "Rules for every builder"
>    and "NN <id>".
> 3. If `/Volumes/Panther/3D Style Atlas/NN-<id>/HANDOFF.md` (or `SK/styles/<id>/HANDOFF.md`) exists, a previous agent
>    started this style. Read it, read the code it left, and CONTINUE that work — do not start over unless the code is
>    unusable (say why in your report).
> 4. Work autonomously to a finished, rendered, checked demo and give the final report in the brief's format.

Run each builder as a background subagent; about six at a time is what the machine can render. Orchestrator duties are
in "Orchestrator checklist" at the bottom.

## Rules for every builder (on top of BUILDER-BRIEF.md)

**Work in this order. Do not skip the looking.**
1. Read the two reference docs and one template style named in BUILDER-BRIEF.md. Budget: reading is not the job; start
   building within the first few steps.
2. Write the planner module first (plain data in, plain data out, Node-safe, seeded RNG only). Everything on screen and
   every sound cue is derived from it.
3. Get ANY picture on screen early (`build.mjs --skip-render`, then `check-frames.mjs --times 1,4,8,12,14.5`), then open the
   stills with the Read tool and judge them like a viewer would. Fix the single biggest problem. Repeat at least three
   times. Most of the quality comes from these loops, not from the first draft.
4. Only then do the final build with render, and `check-frames --deep` LAST, after the final code edit. If you edit
   anything afterwards, run both again.

**What "good" looks like — check each still against this list**
- The subject fills the frame in every shot, most of all the last one. If more than about a third of a frame is empty
  background, move the camera in or make the subject bigger.
- Bright, with clear contrast in both value and hue. No dark beat, no one-colour scene. A dark look is allowed only if
  the subject itself glows and still fills the frame.
- The "before" state shows nothing of the reveal.
- Exactly one label on screen at all times from 0 s to 15 s; each fully visible for at least 1.5 s; text large enough to
  read on a phone (cap height roughly 3 % of frame height or more); inside the safe area; never covered by the subject.
  Check the stills at beat boundaries for gaps.
- The key object of the money shot is large, not a speck.
- Something is visibly happening within the first second.
- One real "wow" moment: a reveal, a transformation, or a camera move that changes what the viewer thought it was.

**Engineering rules**
- Every frame is a pure function of t. No `Math.random`, no clocks, no `requestAnimationFrame`, no state carried from
  one frame to the next, no physics stepping. Precompute a plan; evaluate it at t.
- Keep a frame cheap (instancing, one shader instead of many meshes, few real lights, no multi-pass blur per frame).
  The 15 s render should take about a minute, not an hour.
- Fine noise and thousands of glowing particles bloat the MP4. Target ≤ 12 MB at CRF 22; raise CRF only as far as 26.
- Sound: derive every cue time from the plan. Audio max ≤ −1 dBFS, mean between −20 and −28 dB. If the mean is louder
  than −20, lower the gain and rebuild.
- Touch only `SK/styles/<id>/` and `PILOT/NN-<id>/`. No kit edits, no installs or downloads, no git, no index or
  gallery scripts, never kill a process you did not start. System fonts only.
- Environment quirks: the first `sync-kit` can take minutes (Dropbox hydration) — use long timeouts and run builds in
  the background. `npx --no-install hyperframes --version` may complain; the scripts' own `npx hyperframes` calls work
  from cache. The Panther drive is exFAT, so `._*` files appear everywhere — ignore them. If a build complains about
  `_atlas/styles/<another id>`, another builder is mid-write: wait a minute and re-run.
- All original work: no brand names, logos, existing artworks, characters or songs.

**Done means all of these, measured on the LAST run**
build exit 0 · lint 0 errors AND 0 warnings · `determinism: OK` · `deep self-check: OK` · mp4-vs-code OK · audio in range ·
MP4 ≤ ~12 MB, 15.000 s · 3–6 beats, one label per beat (≤ ~26 characters) · `renders/checks/RUN.txt` and the check stills
left in the project · `STYLE.md` filled in honestly (look, good for / avoid for, prop factories, sound palette, knobs, limits).

**Final report (under 250 words, facts only):** files created; beat list; planner module name; the wow moment and whether
it landed; build exit, lint counts, determinism and deep-check lines, audio max/mean, MP4 path/size/CRF; which stills you
opened; what still looks weak. State plainly: "not watched in motion; audio measured, not heard."

If you are stopped before finishing, write `HANDOFF.md` in your project folder: what exists, its state, decisions made,
what is verified, biggest visible problems, exact next commands.

---

## 91 flip-dot
- **Look:** a big mechanical flip-disc display (old bus destination sign): a grid of round discs, matt black on one side,
  bright yellow on the other, each flipping on a pivot.
- **Mechanic:** a planner turns a sequence of target bitmaps into per-disc flip events (time, direction) with wave/scan
  orderings; each disc's rotation is a function of t with slight overshoot; instanced meshes; lit so the 3D flip shows in
  close-up. Clicks come from the same flip plan (density → clatter).
- **Not a duplicate of:** `split-flap-board`, `pin-art` (here: two-state discs forming pictures, visible flip waves).
- **Demo — "how an AI image appears out of noise (diffusion)":** board starts as seeded random noise → pass after pass
  fewer discs flip and a simple original icon (cat face, lightbulb) settles out → close-up of single discs flipping →
  final wide, the finished picture fills the frame. Wow: the pass where the picture becomes recognisable. The opening
  noise must not hint at the picture.

## 92 laser-mirrors
- **Look:** an optics bench seen from above at an angle: laser source, swivelling mirrors on posts, a beam splitter,
  target sensors, light haze so the beam is a glowing line. Mid-tone bench, not black.
- **Mechanic:** an exact ray tracer in the planner: given mirror angles as functions of t, reflect segment to segment to
  get the beam polyline; the beam arrives along the path at a planned speed; hit points flare; targets light when struck.
  Turning one mirror re-routes everything downstream. Hum, a ping per bounce and target chimes come from the hit plan.
- **Not a duplicate of:** `glass-light`, `circuit-board`.
- **Demo — "how an AI agent routes a request":** the beam (the request) bounces to a target tagged SEARCH → a mirror
  swivels and it is re-routed to CODE, then ANSWER → finale: a splitter fans the beam so every target lights at once in
  different colours, filling the frame. Wow: one small mirror turn sweeping the whole downstream beam across the table.
  Beams thick and bright; components large.

## 93 tessellation-morph
- **Look:** a wall of interlocking tiles (cut paper or painted tile, slight bevel and shadow so it reads as 3D), two
  strongly contrasting colours, every tile the same creature.
- **Mechanic:** build a gap-free tile from a parallelogram by deforming edges in matched pairs (what bulges out on one
  side is cut from the opposite side); interpolate the edge curves between named key shapes (square → fish → bird, your
  own simple silhouettes — do not copy any artist's tessellations). The morph parameter can vary across the wall. Eyes
  and details fade in at key shapes. Soft clicks and whooshes follow the morph plan.
- **Demo — "latent space: sliding smoothly from one idea to another":** plain squares → fish → birds → wide shot with
  the whole gradient squares → fish → birds across one wall → a row of birds lifts off the wall and flies out (the wow).
  Tiles big enough that the creature is recognised at once.

## 94 fogged-glass
- **Look:** a steamed-up window; behind it a warm, softly blurred scene (street bokeh or sunrise — bright, not night
  black). A finger draws clear lines; through them the scene is sharp. Drops gather and run, leaving clear trails; fog
  creeps back over old strokes.
- **Mechanic:** a stroke planner (polylines with per-point times) feeding a fog mask that is a function of t: clear amount
  = max over strokes of (drawn by now × re-fog decay with age), plus planned drip trails (start time, stick-slip speed
  from a closed form, wobble from a seeded table). One shader over the pane: blurred and milky where fogged (pre-blur the
  background once), sharp with bead edges where wiped. Squeaks and drip plinks come from the stroke/drip plan.
- **Demo — "the context window: why AI forgets the start of a long chat":** the finger writes a word, then another, then
  another; the first fogs over and vanishes → finale: one wide palm sweep clears an arc and the whole sharp scene is
  revealed (the wow). Written words are the subject: make them large. The fogged pane must hide the scene at the start.

## 95 dollhouse-cutaway
- **Look:** a toy building seen straight on with the front wall removed: a grid of small furnished rooms on several
  floors, joined by stairs, pipes, chutes and a lift. Unlit rooms are dim but readable (never black); lit rooms glow warm.
- **Mechanic:** a room-graph planner (rooms, connectors, a route with arrival times) gives per-room light level, the
  courier's position along connectors, and each room's mini-animation phase. The front wall swings open on a hinge at the
  start. Thunks, switch clicks and a rising chime per room come from the route plan. Use emissive glow, not many real lights.
- **Not a duplicate of:** `tiny-diorama`, `isometric-pastel`, `exploded-view`.
- **Demo — "what happens to one question inside an AI system":** a question parcel enters at the door → a room that chops
  it into tokens → a library that looks things up → a workshop of layers → a room that checks the answer → out through
  the roof. Finale: every room lit, the house filling the frame (the wow). Courier easy to spot; rooms distinct in colour.

## 96 pendulum-wave
- **Look:** a pendulum-wave demonstration on a bright bench: about 15 large balls, rainbow by index, on V-strings from
  a wooden frame, each a little longer than the last.
- **Mechanic:** closed form: pendulum k makes (N + k) swings in cycle time T, so angle_k(t) = A·cos(2π(N+k)t/T); string
  lengths follow from the periods. Compress T so the full drift-apart-and-return happens inside 15 s. Trails computed from
  the same formula at earlier t. A soft tick per centre crossing, pitched by index, from the same formula — the sound goes
  from one chord to a ripple and back to unison.
- **Demo — "how a model knows word order (positional encoding)":** all together → drifting into a travelling wave →
  freeze: "each moment has its own pattern" → the snap back into one line (the wow), balls filling the frame. Include an
  end-on shot where the snake wave fills the frame.

## 97 string-art
- **Look:** a dark-stained (but well lit) wooden board with rows of brass nails; bright coloured thread is wound nail to
  nail. Every thread is perfectly straight, yet together they make smooth curves. Warm workshop light, thread colours
  saturated against the board; nails catch highlights.
- **Mechanic:** a winding planner: an ordered list of nail-to-nail segments with start times (e.g. nail i on one edge to
  nail i+k on the other, giving a parabola envelope; then circle chords giving a cardioid). At time t the thread is drawn
  up to the current point, with a visible moving spool/needle tip and a tiny wrap around each nail. Instanced thin
  cylinders or one merged line mesh; thread thick enough to read at 1080p. A soft pluck/tick at each nail, pitch rising
  with index, from the same plan.
- **Demo — "a neural network draws curves with straight lines":** one straight thread ("One unit: a straight line") →
  a few threads, a rough bend → many threads, a smooth curve appears though no thread bends → close-up proving every
  thread is straight → final wide: a second colour completes a large figure (cardioid or heart) filling the board and the
  frame. Wow: the pull-back where the tangle of straight lines turns out to be a perfect curve.

## 98 loom-weave
- **Look:** a wooden tabletop loom seen from the weaver's side and slightly above: taut vertical warp threads, heddle
  frames that lift alternate sets, a shuttle that flies across carrying coloured weft, a reed that beats each row down.
  Bright daylight, natural wood, warp in cream and weft in two or three strong colours. The growing cloth is the subject.
- **Mechanic:** a draft planner: a pattern bitmap (rows × warp threads) plus a punch-card strip decide, for each pick,
  which warp threads rise. From the plan, as functions of t: shed opening, shuttle position, beat, and the woven cloth
  rendered row by row (each crossing is over or under according to the bitmap — a shader on a cloth plane reading a data
  texture, with thread relief). The punch card advances one row per pick, and its holes visibly match the row just
  woven. Clack of heddles, shuttle swish, reed thump — all from the pick plan.
- **Not a duplicate of:** `felt-stitch`.
- **Demo — "the first program was a pattern of holes":** threads only, no picture → the shuttle starts, plain rows →
  the punch card comes into view: "Holes choose which threads lift" → rows build faster and a picture emerges in the
  cloth (a simple original motif, e.g. a bird or a small robot) → final shot: the finished motif large in frame with the
  card beside it: "A pattern of holes: a program". Wow: the motif appearing out of ordinary-looking rows. Speed up picks
  over time so the full motif finishes by about 12 s. Keep the motif large (coarse weave: roughly 40 × 30 crossings).

## 99 pottery-wheel
- **Look:** a potter's wheel in a sunlit studio: wet grey-brown clay spinning on a wheel head, glossy with water, soft
  throwing rings on its surface; simple stylised hands or wooden shaping tools press on it. Light plaster wall behind,
  shelf of finished pots out of focus. Clay must contrast with the background.
- **Mechanic:** the clay is a lathe (surface of revolution) whose profile curve is a pure function of t, interpolated
  between named key profiles (lump → cylinder → bowl → narrow-necked vase), with volume kept roughly constant so it looks
  like the same clay. Spin shows through surface streaks/throwing rings and a slight planned wobble that damps as the clay
  is centred. The tool/hand positions come from the same profile (they sit where the profile is changing most). Glaze
  colour sweeps on at the end. Wheel hum pitched by spin speed, wet squelches at shape changes — from the profile plan.
- **Demo — "fine-tuning: the same model, reshaped for a job":** a spinning lump: "One lump of clay" → centred and
  raised: "Training gives it a form" → pressed into a bowl: "Fine-tune it for one job" → pulled into a vase: "Or reshape
  it for another" → wheel slows, glaze sweeps on, finished vase large in frame: "Same clay. New purpose." Wow: the bowl
  collapsing inward and rising into the tall vase in one continuous move. Keep the clay filling at least half the frame
  height throughout.

## 100 endless-zoom  (the closer — make it the best of the hundred)
- **Look:** one continuous, unbroken zoom inward through nested worlds, each drawn in a clean, bright, distinct colour
  key so the viewer always knows a new level has begun, ending exactly where it started.
- **Mechanic:** a level planner: a list of levels, each a self-contained scene authored at unit size with a marked
  "portal" (position + scale) where the next level lives. Zoom is exponential in t (constant perceived speed):
  s(t) = exp(k·t). At time t only the two or three levels near the current scale are visible; each is drawn at
  scale s(t) / levelScale, cross-fading as it passes the lens, with the camera aimed at the next portal. Because the last
  level's portal contains the first level, the loop closes and the final frame equals the first frame. Never animate by
  accumulating scale — compute it from t. Keep each level cheap (it is on screen for about 2.5 s). A rising Shepard-style
  tone (octave-spaced partials whose loudness follows a fixed bell curve, all from s(t)) plus a soft chime at each level
  crossing.
- **Not a duplicate of:** `infinity-mirror` (that is the same room repeated; this is different worlds, one inside the next).
- **Demo — "what is inside one AI answer":** start on a chat bubble with a typed answer and a blinking cursor →
  into one word: "Every word is a token" → into the token: "Every token is numbers" (a column of glowing values, no real
  statistics — abstract bars) → into the numbers: "Numbers flow through layers" (a network of nodes) → into one node:
  "Layers run on chips" (a chip, then its grid of tiny switches) → into one switch: a spark jumps: "A spark, on or off" →
  the spark is the blinking cursor of the same chat bubble: "And it all adds up to this." Six levels, about 2.3 s each,
  one label per level. Wow: the last crossing, when the spark turns out to be the cursor and the viewer is back at the
  start. The first and last frames must match (check t = 0.05 against t = 14.95 side by side). Each level must fill the
  frame while it is the current one — no small object floating in emptiness.

---

## Orchestrator checklist (per style, after a builder reports)
1. Read `PILOT/NN-<id>/renders/checks/RUN.txt`: `mp4-vs-code: OK`, `determinism: OK`, `deep self-check: OK`.
2. Measure yourself: `ffmpeg -i <mp4> -af volumedetect -vn -f null -` (max ≤ −1 dB, mean −20 to −28), file size, 15.000 s.
3. Make a contact sheet of the check stills and LOOK at it. Judge against "What good looks like" above. If a beat fails
   badly (dark, tiny subject, missing label, reveal spoiled), send the same builder back with the specific fix.
4. Mark the row DONE in `QUEUE.md` with size, CRF, audio levels and the weak spots you saw. Start the next style.
5. If a builder dies on a usage limit, its files are safe: resume that agent, or start a new one with the prompt at the
   top — step 3 of the prompt makes it continue from `HANDOFF.md` or from the code on disk.

When all 16 are DONE, follow "Closing out" in the run handoff: `build-index.mjs`, `build-gallery.mjs` (it overwrites
`gallery.html` — another agent added one line of links under the subtitle; put it back afterwards), update `SKILL.md`
(84 → 100), `QUEUE.md`, rsync the skill into `skill/`, grep for the owner's username/email before staging, and commit or
push only on the owner's explicit yes.
