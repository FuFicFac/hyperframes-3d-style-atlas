# Style plans 113–124: storyboards, engineering notes and how to run a builder (written 2026-11-23, run 5)

Twelve new art-and-craft styles. The owner asked on 2026-11-23 for all twelve to be planned and built without a separate
approval step, by Opus 5.5 builders, four at a time. One agent builds one style.

A builder needs exactly four things: `BUILDER-BRIEF.md`, the section "Rules for every builder" in
`STYLE-BRIEFS-91-100.md`, the section "Rules for this run" below, and its own style section below.

| # | id | Demo title | Signature mechanic | Motion type | Risk |
|---|---|---|---|---|---|
| 113 | fourier-epicycles | Circles that draw | a chain of spinning circles whose tip draws a picture | Exact | Low |
| 114 | barrier-grid | The stripes hold the motion | a striped sheet slides over a scrambled print and the picture moves | Exact | Medium (aliasing) |
| 115 | caustics | The glass hides a picture | light through a lumpy glass slab gathers into a picture at one height | Analytical approximation | Medium to high |
| 116 | guilloche | Two dials, endless lace | a lathe engraves phase-shifted wavy rings that weave rosettes | Analytical | Medium (aliasing) |
| 117 | risograph | Three inks, one picture | three ink layers print off-register, then snap into register | Art-directed | Low |
| 118 | linocut | Cut away what isn't | carve, ink the raised part, press, peel: a mirrored print | Art-directed | Low to medium |
| 119 | pointillism | Only dots | pure-colour dots that mix only in the eye | Art-directed | Medium (file size) |
| 120 | cyanotype | Sunlight makes the print | exposure dose builds a print around objects; rinse turns it blue | Analytical dose | Low |
| 121 | strange-attractor | A tiny difference | two almost identical starts stay together, then part for good | Numerical simulation | Medium |
| 122 | glassblowing | Breath and fire | a glowing gather inflated, shaped and cooled to clear glass | Art-directed | Medium to high |
| 123 | papercut-lightbox | Depth made of light | white paper layers that gain depth only when lit from behind | Art-directed | Low to medium |
| 124 | ct-scan | Slice by slice | thin slices of a sealed box stack into the hidden object | Exact slicing, art-directed staging | Medium |

## Rules for this run (on top of BUILDER-BRIEF.md and "Rules for every builder" in STYLE-BRIEFS-91-100.md)

- **Build the storyboard as written.** Use its beat start times, its labels word for word, its demo title, its look and
  its mechanic. The demo topic is the craft or phenomenon itself; do NOT swap it for an AI topic. Every label below is
  26 characters or fewer and was checked by script. Change one only if it truly cannot be made readable, and say so.
- **Three.js only, everything from code.** Procedural geometry, materials, shaders, lighting, particles, textures and
  environments. No image, model, video or audio files, nothing downloaded, no web fonts (system font stacks only).
- **No hands, no people.** There are no model files, and hands built from primitives look wrong. Tools move on their
  own (a gouge, a roller, a brush tip, jacks, a blowpipe). Design the tool so it reads clearly and visibly touches the work.
- **Say what the motion is.** `STYLE.md` must contain a line starting `Motion type:` stating plainly whether the motion is
  exact, analytical, art-directed or numerically simulated, starting from the "Motion type" line below and corrected to
  what you actually built. Do not claim physical or historical accuracy you did not check.
- **Nothing steps inside `renderAt(t)`.** Anything iterative (113's transform, 115's ray mapping, 119's dot placement,
  121's integration, 124's volume bake) runs once in the Node-safe planner module when the page loads: fixed step,
  seeded RNG, plain arrays, under about 3 seconds. The scene then reads stored results for any t. Results must be
  identical on every page load (`determinism: OK`).
- **Node and Chrome can differ in the last bits of `Math.sin`, `cos`, `exp`, `log`, `pow`.** That matters only where a
  tiny difference flips a decision (which item is first, when a threshold is crossed). Wherever sound cues (built in Node)
  and picture (built in Chrome) both depend on such a decision, derive it from integer or table data, or check it: print a
  short fingerprint of the planner's key results in both Node and the page and compare them, as styles 108–111 do.
- **Captions (the commonest weakness in 85–112):**
  - Large: cap height about 3 % of frame height or more, bold, on a contrasting plate.
  - Never in the top-left corner: keep a clear box of 140 × 110 px at the top-left free of captions and key detail,
    because the numbered reels put a number badge there.
  - Exactly one label visible at every instant from 0 to 15 s; cross-fade at beat changes (no instant with none);
    each label fully visible for at least 1.5 s; inside the safe area; never covered by the subject.
- **Bright by default.** Where a beat is dark by design (115 beat 4, 123 beats 3–5), the subject itself must glow and
  fill the frame, and the rest of the demo must be bright.
- **Fill the frame.** In every shot the subject is large; the final shot is filled by the subject. If more than about a
  third of a frame is empty background, move the camera in. Do not show the whole apparatus small in a big room.
- **Fine regular patterns alias and bloat the MP4** (114, 116, 117, 119): keep stripes, grooves and dots at least 6 px
  wide on screen in wide shots, anti-alias analytically in the shader (`fwidth`/`smoothstep`), prefer head-on framing in
  the money shot, and check a 100 % crop of a still for moiré. MP4 ≤ 12 MB at CRF 22; raise CRF only as far as 26.
- **Something moves in the first second**, and one wow moment (named below) must land. Say in the report whether it did.
- **Sound:** every cue derives from the planner. Audio max between −1 and −3 dBFS, mean between −20 and −28 dB.
- Extra check stills: besides 1, 4, 8, 12, 14.5, render a still 0.15 s after every beat start and one at your wow moment,
  and include those times in the final `check-frames --deep` run.

## How the orchestrator starts a builder (model: Opus 5.5, effort: extra high)

> You are a builder adding ONE new style to the 3D Style Atlas: number **NN**, id **`<id>`**.
> 1. Read `/Volumes/Panther/3D Style Atlas/_orchestration/BUILDER-BRIEF.md` and follow it exactly.
> 2. Read the section "Rules for every builder" in `/Volumes/Panther/3D Style Atlas/_orchestration/STYLE-BRIEFS-91-100.md`.
> 3. Read `/Volumes/Panther/3D Style Atlas/_orchestration/STYLE-PLANS-113-124.md`: "Rules for this run" and "NN · <id>".
> 4. If `/Volumes/Panther/3D Style Atlas/NN-<id>/HANDOFF.md` (or `SK/styles/<id>/HANDOFF.md`) exists, a previous agent
>    started this style: read it and the code it left and CONTINUE that work. Otherwise start fresh.
> 5. Work autonomously to a finished, rendered, checked demo and give the final report in the brief's format.

Orchestrator review per style: `_orchestration/review-sheet.sh NN-<id> <out-dir>`, look at the sheet, judge it against
"Rules for this run", send the same builder back once with specific fixes if a beat is weak, then mark QUEUE.md.

---

## 113 · fourier-epicycles — "Circles that draw"

**Look.** A pale drafting table seen from above at a slight angle. A chain of brass arms, each turning on the end of the
last, each with its circle drawn as a thin brass ring. A pen at the tip leaves a dark ink line on cream paper. Bright,
warm daylight; brass, ink blue-black, one accent colour (coral) for the pen tip.

**Mechanic and planner (`epicycles.js`).** A closed outline of an original simple songbird silhouette (define it in code
as a smooth closed curve from a few dozen control points; one continuous line, no lifting). Sample 256 points evenly
by arc length, take the discrete Fourier transform in plain JS, sort terms by amplitude. Tip position with K terms at
phase p: sum of the first K rotating vectors. The ink trail for a beat is the tip path from that beat's start phase to
now, computed from the same sum (never accumulated). Each beat draws exactly one full cycle, finishing 0.4 s before the
beat ends. Earlier beats' finished outlines stay on the paper as faint grey lines so the improvement is visible.

**Motion type:** Exact (a finite Fourier sum evaluated at t).

| Beat | Start | Label | What happens |
|---|---|---|---|
| 1 | 0.0 | One circle draws a circle | K = 1: one arm turns, the pen draws a plain circle. |
| 2 | 2.6 | Add two: a wobbly loop | K = 3: two smaller arms ride on the first; the line becomes a lumpy loop. |
| 3 | 5.4 | Twelve: a rough shape | K = 12: the chain is longer; something bird-like but blunt. |
| 4 | 8.2 | Sixty: it draws a bird | K = 60: a long whirling chain; the pen draws a clear bird. Camera follows the tip, then eases back. |
| 5 | 12.0 | Only circles, added up | The arms lift away and fade; the finished ink bird fills the frame beside the faint earlier tries. |

**Camera.** Start framed on the single arm so the circle fills most of the height. Widen only as far as each drawing
needs. In beat 4 start close on the whirling outer arms, then ease back so the whole bird is drawn in view.

**Sound.** Additive synthesis from the same terms: each active circle is a sine partial (pitch from its frequency index,
level from its radius), so the tone grows richer as circles are added. A soft tick when each outline closes.

**Wow.** Beat 4: a chain of sixty spinning arms that looks like chaos draws a recognisable bird.

**Watch out for.** Small outer circles vanish: give rings and arms a minimum drawn thickness. The line must be thick
enough to read at 1080p. The K = 1 circle and K = 3 loop must not already look like a bird. Keep every outline on the paper.

**Differs from:** `clockwork`, `wind-walker`, `music-box` (here the picture is the sum of rotations).

---

## 114 · barrier-grid — "The stripes hold the motion"

**Look.** A printed card on a light wooden desk, filling the frame, with a clear acetate sheet printed with black
vertical stripes. Bright, even light; cream card, black ink, one spot colour (teal) in the print; a soft shadow under
the acetate so it reads as a separate sheet.

**Mechanic and planner (`barrier.js`).** Six frames of an original looping animation built from parametric shapes (a
bird flapping its wings, drawn as bold silhouettes), rasterised in code into a data texture. Interlace them by column:
column strip i shows frame (i mod 6). The barrier is a real second plane a hair above the card with opaque stripes five
strips wide and a clear slit one strip wide. The animation is NOT faked: the card texture never changes; sliding the
barrier sideways by one strip uncovers the next frame, and the picture moves because of real occlusion. Barrier
offset(t) is the only animated input.

**Motion type:** Exact (the effect is produced by the geometry, not keyframed).

| Beat | Start | Label | What happens |
|---|---|---|---|
| 1 | 0.0 | A scrambled print | The card alone, drifting slightly under the camera: a striped blur, no clear picture. |
| 2 | 2.8 | Lay stripes over it | The acetate slides in from the right and settles. One still frame of the bird appears. |
| 3 | 5.6 | Slide them: it moves | The acetate slides slowly sideways: the bird flaps. |
| 4 | 9.0 | Each slit shows one frame | Macro on a few strips at an angle: slits, strips and the gap between sheets are visible; the sheet steps one strip at a time. |
| 5 | 12.0 | Six pictures in one print | Head-on wide. The sheet slides back and forth smoothly; the bird flaps large in frame. |

**Camera.** Head-on (near-orthographic, long lens) in beats 1, 2, 3 and 5 so there is no parallax between the sheets.
Beat 4 is the only oblique shot.

**Sound.** A soft acetate slide (filtered noise following barrier speed) and one pitched tick per strip crossed, six
pitches in rotation so the loop is audible. A paper thump when the sheet lands.

**Wow.** Beat 3: the still print starts to move the moment the stripes slide.

**Watch out for.** Aliasing and moiré are the whole risk: one strip must be at least 6 px wide on screen in the wide
shots (so a full period is 36 px or more), edges anti-aliased in the shader, and the camera exactly head-on. Check a
100 % crop. The scrambled card in beat 1 must not read as a bird. Fine stripes bloat the MP4: use CRF up to 26 if needed.

**Differs from:** `zoetrope`, `flipbook`, `slit-scan`, `op-art` (here one static print holds all frames and a mask selects one).

---

## 115 · caustics — "The glass hides a picture"

**Look.** A sunlit pale room. A clear, gently lumpy glass slab held in a slim metal frame on a vertical rail above a
white tabletop. A beam of warm light comes straight down through it. On the table: the bright, sharp-edged light pattern
that such glass casts. Glass slightly aqua with bright rims; white table; brass rail; soft blue shadows.

**Mechanic and planner (`caustic.js`).** Target: a bold original smiling-sun icon (thick strokes) as a brightness map with
a floor of about 8 % so no region is empty. Map a regular grid of about 400 × 400 rays to the target with a smooth,
crossing-free mapping built from cumulative sums: map x by the column cumulative distribution, then y by the conditional
row distribution. Each ray's sideways deflection is (mapped position − straight-through position). The landing point at
glass height d above the table is straight + (d / d_focus) × deflection: at d = 0 the light is even, at d = d_focus the
picture is sharp, beyond that it over-focuses and smears. Brightness on the table is made by drawing the rays as additive
points into a render target each frame (cheap), lightly blurred, then tone-mapped onto the table. The slab's visible bumps
are shaded with normals derived from the same deflection field, so the glass on screen is the glass that makes the picture.
Glass height d(t) is the only animated input besides the camera.

**Motion type:** Analytical approximation (small-angle refraction; a cumulative-sum mapping in place of a true
optimal-transport solve; say so).

| Beat | Start | Label | What happens |
|---|---|---|---|
| 1 | 0.0 | A lumpy piece of glass | Close on the slab turning slightly in room light; bumps catch highlights. No beam yet. |
| 2 | 2.6 | Shine a light through it | The beam switches on with the glass almost on the table: an even bright patch, faintly mottled. |
| 3 | 5.4 | Raise it: light gathers | The slab rises on its rail; mottles pull into bright curved lines and dark gaps. |
| 4 | 9.0 | At one height: a picture | At the focus height the lines lock into the smiling sun. Room light dips slightly so the picture glows. |
| 5 | 12.0 | The bumps hold the picture | Wide: slab above, picture below, both in frame. The slab rises a little past focus (smear) and returns (sharp). |

**Camera.** Beats 2–4 look down at the table so the light pattern fills the frame, with the slab's edge visible at the
top for context. Beat 5 is the only shot showing the whole rig; even there the picture must stay large.

**Sound.** A glassy pad whose brightness follows sharpness of focus; a switch click for the beam; a clear chime at the
focus; a soft detune when it over-focuses in beat 5.

**Wow.** Beat 4: meaningless bright squiggles snap into a clear picture at exactly one height.

**Watch out for.** The even patch in beat 2 must show no hint of the sun. Avoid speckle: jitter ray origins with a seeded
table and use enough rays. The table must stay white and bright, not grey. Clear glass on a pale room disappears: give it
an aqua tint, bright rim, a dark refracted edge line and the metal frame.

**Differs from:** `glass-light`, `laser-mirrors`, `cymatics`, `ripple-interference`.

---

## 116 · guilloche — "Two dials, endless lace"

**Look.** A silver disc on a small brass engraving lathe (a rose engine), seen close, the disc filling most of the frame.
A fixed steel cutter touches the turning disc and leaves fine bright grooves. Two brass dials with pointers sit at the
bottom right. Dark teal bench, brass machine, silver disc, and at the end translucent deep-blue enamel over the pattern.

**Mechanic and planner (`guilloche.js`).** About 36 rings. Ring k is the curve r(θ) = R_k + a · sin(n·θ + k·s), where
n (lobes) and s (phase step per ring) are the two dials and a is fixed. Rings are cut in order, one disc turn each,
getting quicker. The grooves are not geometry: one shader on the disc finds, for each pixel, the nearest already-cut
ring from the closed form and uses the groove's cross-section to tilt the normal, so grooves glint as the disc turns
under a code-generated studio environment. A dial change re-forms every ring at once.

**Motion type:** Analytical. The live morph in beat 4 is art-directed (a real machine would have to re-cut).

| Beat | Start | Label | What happens |
|---|---|---|---|
| 1 | 0.0 | One wavy ring | The disc turns; the cutter touches; a single wavy ring appears with a curl of swarf. |
| 2 | 2.6 | Shift each ring a little | Rings step outward, each shifted by s; a pattern starts to weave. |
| 3 | 5.6 | The waves weave a rosette | The last rings land; slow close pass over the grooves as they glint. |
| 4 | 8.6 | Turn a dial: new pattern | Dial 1 turns (n: 8 → 13), then dial 2 (s changes): the whole rosette flows into a new design, twice. |
| 5 | 11.8 | Simple rule, rich pattern | The disc stops; blue enamel floods across; a light sweeps over the finished dial. |

**Camera.** The disc always fills at least three quarters of the frame height. Beat 3 is an oblique close-up; beats 4–5
are nearly head-on so the whole rosette is seen changing. Keep the dials visible in beat 4.

**Sound.** Lathe hum; a cutting hiss per ring whose pitch rises with ring index; two dial ratchets in beat 4 (one click
per step of n); a soft pour and a bell tone for the enamel.

**Wow.** Beat 4: turning one small dial re-weaves the entire pattern.

**Watch out for.** Aliasing and moiré: grooves at least 3 px wide with ring spacing of 8 px or more in the widest shot,
analytic anti-aliasing, check a 100 % crop. Not gold on gold: silver disc, brass machine, teal bench, blue enamel. The
glint must come from the groove normals, not from painted lines.

**Differs from:** `clockwork`, `op-art`, `cymatics`, `embossed-letterpress`.

---

## 117 · risograph — "Three inks, one picture"

**Look.** A sheet of rough off-white paper on a print tray, filling the frame at a slight tilt, and a print drum that
rolls across it. Three flat inks: fluorescent pink, medium blue, warm yellow. Coarse halftone dots, slightly uneven ink,
visible paper tooth. Where inks overlap they multiply into purple, green, orange and a near-black.

**Mechanic and planner (`riso.js`).** An original poster — a big sun over sea and mountains with one bird — defined in
code as three tone maps (one per ink). Each ink is laid as halftone dots (its own screen angle; dot size from tone) with
seeded grain. Colour is physical overprint: paper × product over inks of (1 − coverage × (1 − ink colour)). Each layer has
a registration offset (dx, dy, small rotation) that is a function of t. A drum pass reveals a layer behind a moving line.
Yellow goes down clearly out of register, then all three are nudged into register.

**Motion type:** Art-directed (the overprint colour model is a standard multiply approximation; say so).

| Beat | Start | Label | What happens |
|---|---|---|---|
| 1 | 0.0 | First ink: pink shapes | The drum rolls left to right; pink sun and sky bands appear behind it. |
| 2 | 3.0 | Second ink: blue on top | Blue sea, mountains and bird print over the pink; overlaps turn purple. |
| 3 | 6.0 | Third ink: out of line | Yellow lands shifted: bright fringes and doubled edges everywhere. |
| 4 | 9.0 | Line them up: it snaps | The layers slide into register; fringes close; greens and oranges appear; the picture turns crisp. |
| 5 | 12.0 | Three inks made them all | Macro on the halftone dots where three inks overlap, then back out to the whole print filling the frame. |

**Camera.** The sheet fills the frame throughout. Beat 3 pushes in on an edge where the misregistration is obvious; beat 5
starts as a macro on dots and ends on the full print.

**Sound.** A drum roll and thump per pass (pitch per ink), a paper slide, two small nudges and a clean click when the
register snaps, then a bright chord built from the three ink pitches.

**Wow.** Beat 4: the blurred, fringed print snaps into a sharp picture with colours no single ink has.

**Watch out for.** Halftone dots at least 8 px across in the wide shots, anti-aliased; check a 100 % crop for moiré between
the three screens. The picture must be bold enough to read in two inks. Pink alone must already look good (no near-blank
first beat). Keep the misregistration large enough to read at 1080p (about 1.5 % of sheet width).

**Differs from:** `ukiyo-e` (carved blocks, layer by layer), `newspaper-press`, `constructivist-poster`, `embossed-letterpress`.

---

## 118 · linocut — "Cut away what isn't"

**Look.** A grey-green lino block on a pale wooden bench, large in frame. A V-gouge with a wooden handle ploughs grooves and
lifts curls of lino. Then a black ink roller, then cream paper, then the print: solid black and cream, slightly
salt-and-peppered where the ink was thin.

**Mechanic and planner (`lino.js`).** An original bold design carved in reverse: a crescent moon, a cat on a roof and the
word LOOK, all mirrored on the block. The carved area is a set of strokes (polylines with width and start/end times); at
time t a pixel is carved if any stroke has passed it (maximum over strokes, never accumulated). Block shader: carved areas
are lower, paler and show a V-groove normal; uncarved areas are the flat top. Inking: a roller sweeps and only the flat top
turns glossy black. Printing: a paper plane hinges down, a round baren rubs over it (the image ghosts through faintly),
then the paper peels back from one corner. The print is the mirror image of the inked top, so LOOK reads correctly.

**Motion type:** Art-directed.

| Beat | Start | Label | What happens |
|---|---|---|---|
| 1 | 0.0 | A gouge cuts the block | Close on the gouge ploughing its first curved grooves; curls lift. |
| 2 | 3.0 | Cut away the white parts | Many strokes in quick succession clear the background; the design is there but hard to read, pale on grey. |
| 3 | 6.2 | Ink only the raised part | The roller sweeps across: the raised design turns black and pops, visibly reversed. |
| 4 | 9.0 | Press, rub and peel | Paper down, baren rubs, the sheet peels back from one corner showing the first black shapes. |
| 5 | 12.0 | It prints as a mirror | The print lifts and turns to face the camera beside the block: LOOK reads the right way round. |

**Camera.** Beat 1 is a low close-up along the gouge. Beat 2 rises to see the whole block. Beat 5 frames block and print
side by side, both large, print nearer.

**Sound.** A gritty scrape per stroke (length from stroke length), a sticky roller hiss, paper down, circular baren rubs,
a slow peel, a soft chord on the reveal.

**Wow.** Beat 5: the backwards word on the block comes out reading correctly on the print.

**Watch out for.** Grey block on a dark bench is mud: use a pale bench and strong side light so grooves read. The design
must be big and simple. The mirrored lettering must be clearly legible as mirrored in beat 3. Black ink must look like
ink (glossy, with roller texture), not a void.

**Differs from:** `ukiyo-e` (multi-block colour layering; here one block, subtractive carving, the mirror), `embossed-letterpress`.

---

## 119 · pointillism — "Only dots"

**Look.** A canvas in a bright studio, filling the frame. Thousands of small round dabs of pure, unmixed paint with a
little raised relief and canvas weave between them. Palette of about ten clean hues (no browns, no greys, no black).

**Mechanic and planner (`dots.js`).** An original sunlit scene built in code from gradients and shapes: a lake, a
sailing boat, one large tree, sky. About 10,000 dots at seeded, evenly spread positions (jittered grid or best-candidate
sampling). Each dot takes a pure palette colour chosen by a seeded rule so that the local average matches the scene
colour: mostly the two nearest pure hues in proportion, plus a share of the complementary hue in shadows. Dots appear on
a schedule, region by region, each with a tiny pop. Instanced discs. "Mixing in the eye" is shown honestly with a
defocus: render the canvas to a target and blur it by a radius that is a function of t.

**Motion type:** Art-directed.

| Beat | Start | Label | What happens |
|---|---|---|---|
| 1 | 0.0 | Up close: only dots | Macro: a brush tip dabs orange and blue dots side by side; they stay separate. |
| 2 | 2.8 | No colour is ever mixed | Dots flood across the canvas as the camera tracks and rises. |
| 3 | 6.0 | Step back: a scene forms | Pull back to the whole canvas: lake, boat and tree emerge from the dots. |
| 4 | 9.0 | Your eye does the mixing | A slow squint (defocus): dots melt into glowing greens, violets and greys, then sharpen again. |
| 5 | 12.0 | Green? Blue plus yellow | Push in on the tree: the "green" is plainly blue and yellow dots. |

**Camera.** The canvas always fills the frame; "stepping back" ends with the canvas edge just inside the frame, not a small
canvas in a room.

**Sound.** Soft dabs whose density follows the dot schedule (patter in beat 2), a marimba note as each region completes,
a pad that opens with the defocus.

**Wow.** Beat 3: the pull-back that turns a field of unrelated dots into a sunny lake.

**Watch out for.** File size: 10,000 crisp dots are expensive to encode; keep dots at least 7 px across in the full view
and use CRF up to 26. The macro in beat 1 must not reveal the scene. The scene must be bold (large tree, large sail). Dots
need a darker rim or relief shading or they turn into flat confetti.

**Differs from:** `impasto` (strokes), `mosaic` (tiles), `flip-dot`, `point-cloud`.

---

## 120 · cyanotype — "Sunlight makes the print"

**Look.** A sheet of sensitised paper (pale yellow-green) pinned to a light wooden board in strong sun, filling the frame.
On it: a fern frond, a key, a feather and a strip of lace, as flat procedural objects with slight thickness and real
shadows. Later: bronze-grey exposed paper with pale silhouettes, and finally deep Prussian blue with white shapes.

**Mechanic and planner (`exposure.js`).** Each object has a silhouette mask, a height (which sets how soft its shadow
edge is) and a place time and lift time. The dose at a point is the time integral of sunlight not blocked there; because
the schedule is piecewise, the dose is a closed form of t (sum of the uncovered intervals so far). The feather lifts
early, so its area gets a partial dose and prints as a mid-blue ghost. Paper colour is looked up from (dose, washed
amount); the wash is a water line sweeping across in beat 5. The colour table is hand-tuned to look right.

**Motion type:** Analytical dose; the colour response is art-directed (say so; no chemistry is simulated).

| Beat | Start | Label | What happens |
|---|---|---|---|
| 1 | 0.0 | Lay things on the paper | The four objects drop onto the sheet one after another with a small settle. |
| 2 | 2.6 | Sunlight changes the paper | Sun brightens; the open paper slowly turns from yellow-green to bronze-grey around the objects. |
| 3 | 6.0 | Less time: a paler mark | The feather lifts away early; its pale shape starts to darken late. |
| 4 | 8.6 | Lift them: shadows stay | The other three lift off: crisp pale silhouettes, and the feather's half-dark ghost. |
| 5 | 11.6 | Rinse: it turns deep blue | The sheet slides into a tray; a wave of water crosses it and everything exposed turns deep blue, the shapes white. |

**Camera.** Mostly top-down with a slight tilt so the objects' thickness and shadows read. Beat 3 pushes in on the feather.
Beat 5 ends on the washed print filling the frame.

**Sound.** Soft thuds as objects land; a warm pad that brightens with the dose; a lift whoosh per object; water slosh and a
rising chime with the blue.

**Wow.** Beat 5: the dull bronze sheet floods to deep blue with clean white shapes.

**Watch out for.** Beats 2–4 can look drab (olive and bronze): keep the sun bright, the board light, the objects
colourful (green fern, brass key, white lace, grey-blue feather). The plain sheet must show no shapes before exposure.
Objects must be large.

**Differs from:** `uv-reveal` (a hidden layer under a torch), `thermal-camera`, `newspaper-press` (here a dose builds over time).

---

## 121 · strange-attractor — "A tiny difference"

**Look.** A bright studio (pale background, soft floor shadow). The Lorenz butterfly drawn as thick glossy tubes like a
wire sculpture: one coral, one teal, each with a glowing bead at its head. Not a dark screen with thin neon lines.

**Mechanic and planner (`lorenz.js`).** Integrate the Lorenz equations with fixed-step RK4 at page load for two starts
that differ by a tiny amount, plus a cloud of about 200 starts packed into a speck. Store the paths in tables. The
planner searches for the starting difference that makes the two paths separate (distance above a set threshold) at
9.3 s ± 0.2 s of video, and fails loudly if it cannot. The scene draws each tube as the last several seconds of its
path up to t and the cloud as instanced beads, all read from the tables. A small unlabelled gauge shows the distance
between the two beads. Print a fingerprint of the tables in Node and in the page and compare them.

**Motion type:** Numerical simulation (fixed-step RK4, precomputed, read back by t).

| Beat | Start | Label | What happens |
|---|---|---|---|
| 1 | 0.0 | One rule, followed exactly | The coral bead sets off and draws the first loops. |
| 2 | 2.8 | A twin starts a hair apart | The teal bead starts beside it; the two tubes run as one two-coloured strand. |
| 3 | 6.0 | They agree... for a while | Loop after loop together; the gauge barely moves, then starts to creep. |
| 4 | 9.0 | Then they part for good | At a fork one goes left and one right; the gauge jumps; they never rejoin. |
| 5 | 12.0 | Unpredictable, same shape | The 200-bead speck bursts across the whole butterfly; the shape stays the same. |

**Camera.** Slow orbit; the attractor fills the frame height. Beat 4 moves to face the fork where they split.

**Sound.** Two voices whose pitch follows each bead's height: perfect unison, then a slow beat between them, then two
separate lines. A soft swell of many voices for the cloud.

**Wow.** Beat 4: the two identical-looking paths split at a fork.

**Watch out for.** Two overlapping tubes hide each other: lay them side by side as a twisted two-colour strand or dash
one. Tubes thick enough to read. Time-scale the simulation so about six loops happen before the split. Label 3 uses
three full stops, not an ellipsis character.

**Differs from:** `light-painting`, `murmuration`, `galton-board`, `vortex-rings`.

---

## 122 · glassblowing — "Breath and fire"

**Look.** A hot shop: a steel blowpipe lying across two bench rails, turning steadily, with glowing glass on its end. A
furnace mouth glows orange at the back, but the workshop is daylit (pale walls, steel, wood) — not a black room. Tools
that move by themselves: wooden paddle, steel jacks (tongs). Finished glass is clear aqua with two coloured stripes
spiralling through it.

**Mechanic and planner (`gather.js`).** The glass is a surface of revolution around the pipe axis with an outer and an
inner profile. Profiles are interpolated between named keys (gather blob → long drop → bubble → necked bulb → opened
vase) with the volume of glass kept constant, so the wall thins as the bubble grows (thin wall = paler tint).
Temperature is a function of t: exponential cooling with two reheats; glow colour and brightness come from temperature
through a code-built hot-body ramp (white-yellow → orange → dull red → none). When the pipe's turning pauses, the hot
glass sags slightly off-axis and recentres when turning resumes (art-directed). Jacks close on the neck and open the lip.

**Motion type:** Art-directed (volume conserved, cooling exponential; no fluid simulation).

| Beat | Start | Label | What happens |
|---|---|---|---|
| 1 | 0.0 | Molten glass on a pipe | Close on the glowing honey-like gather turning on the pipe; it sags when the turn pauses, recovers when it resumes. |
| 2 | 2.8 | One breath: a bubble | A pulse travels down the pipe; a bubble swells inside the glass. |
| 3 | 6.0 | Turn, swing, pinch | The pipe swings down to stretch the bubble, comes back; jacks close and pinch a neck. |
| 4 | 9.0 | Reheat, then open the lip | A bright reheat flash; the jacks open the end into a flared lip. |
| 5 | 12.0 | As it cools, it clears | The glow drains from the tip inward: orange → amber → clear aqua with its stripes; light passes through onto the bench. |

**Camera.** The glass fills at least half the frame height in every shot. Side-on for the swelling and pinching;
three-quarter for the final cool-down so light through the glass lands on the bench.

**Sound.** Low furnace roar; a breath (filtered noise) with a rising tone as the bubble grows; tool taps; a whoosh on
reheat; a glassy ping at the end whose pitch rises as the glass cools.

**Wow.** Beat 5: the glowing orange form drains to clear, striped glass in one continuous cool-down.

**Watch out for.** Clear glass on a pale wall vanishes: tint it aqua, give it a bright rim, a dark refracted edge line
and the coloured stripes. Real transmission materials are costly: a Fresnel-and-thickness shader is acceptable; if you
use the physical material, check render time. A glowing object in a dark frame is not allowed here: keep the room lit.

**Differs from:** `pottery-wheel` (also a turned profile; here inflated from inside, horizontal axis, heat colour,
transparency), `lab-glassware`, `liquid-chrome`.

---

## 123 · papercut-lightbox — "Depth made of light"

**Look.** A deep wooden shadow-box frame holding seven sheets of white paper, each cut into a silhouette and spaced
apart: sky with a cut-out moon, far mountains, near mountains, forest, a hill with a small house, foreground trees, a
foreground border of leaves. Lit from the room it is white on white and nearly flat. Lit from behind it becomes a glowing
misty landscape: far layers bright, near layers progressively darker and warmer.

**Mechanic and planner (`layers.js`).** Each layer's cut edge is a seeded procedural profile (ridges, trees from simple
shapes, cut-out windows). Layer k sits at depth z_k and slides into its slot from the side at its own time. Brightness
under backlight: paper lets a fixed fraction through, so a layer's glow falls off with how many sheets are behind it,
and each layer also catches a soft shadow of the layer in front, offset by the backlight's position — a closed form of the
light position at t, so moving the light sweeps every shadow. A front room light and the backlight cross-fade.

**Motion type:** Art-directed (the light model is a simple layer-transmission approximation; say so).

| Beat | Start | Label | What happens |
|---|---|---|---|
| 1 | 0.0 | Plain white paper, cut | Close on the first sheets sliding into their slots; white paper, crisp cut edges, room light. |
| 2 | 2.6 | Stack the layers apart | The rest slide in one by one with a click each; seen from the front it reads almost flat. |
| 3 | 6.0 | Light it from behind | Room light fades, the backlight comes up: the stack turns into a deep glowing valley. |
| 4 | 9.0 | Move: the layers slide | The camera tracks sideways and the backlight drifts: layers shift against each other, shadows sweep. |
| 5 | 12.0 | Depth, made only of light | The light warms from cool dawn to sunset; the house window lights; the scene fills the frame. |

**Camera.** After beat 2 the picture area fills the frame (the wooden frame is at most a thin border). Beat 1 is an
oblique close-up that shows the gaps between sheets.

**Sound.** A paper slide and slot click per layer (pitch rising with layer number), a switch click, a warm pad that
swells with the backlight, soft wind-like noise in beat 4.

**Wow.** Beat 3: flat white paper becomes a deep glowing landscape the instant the backlight comes on.

**Watch out for.** Beats 1–2 are white on white: use raking room light so edges cast thin shadows and the sheets read,
but depth stays shallow. Beats 3–5 are dark-room shots: the scene must glow strongly and fill the frame. Seven layers
must be clearly separable in tone. Avoid banding in the glow gradients (add fine seeded dither).

**Differs from:** `multiplane-cel` (painted layers), `shadow-puppets`, `paper-pop-up`, `stained-glass`, `tiny-diorama`.

---

## 124 · ct-scan — "Slice by slice"

**Look.** A bright, clean scanner room in white and teal. A sealed cardboard box rides a tray through a white scanner
ring. Slices appear as grey images on a large floating panel, then as thin translucent cards in space. The rebuilt volume
is a ghostly box with a toy robot inside it: cardboard faint, plastic mid-bright, metal parts brightest.

**Mechanic and planner (`volume.js`).** Define the box and an original toy robot (blocks, cylinders, spheres, a wind-up key,
two gears inside the chest) as a density function of position with three materials. At page load bake it into a 3D data
texture of about 96 × 96 × 128 voxels (under 3 s). Slice images are exact cross-sections of that texture at the scan
height, with a little seeded grain. The volume is ray-marched (64 steps or fewer) with a threshold: raising the threshold
removes cardboard, then plastic, leaving metal. Scan height, slice count, stack spacing and threshold are functions of t.

**Motion type:** Exact slicing of a defined volume; staging art-directed. Not a simulation of X-ray physics (say so).

| Beat | Start | Label | What happens |
|---|---|---|---|
| 1 | 0.0 | What is in the sealed box? | The box glides into the ring; a teal scan line starts moving down it. |
| 2 | 2.6 | X-rays take one thin slice | The panel fills the frame: the first grey slice draws in, then the next few, each a different abstract shape. |
| 3 | 6.0 | Many thin slices, stacked | Slices peel off the panel as cards and line up in a spaced stack; the camera swings round to see the stack edge-on, then at an angle. |
| 4 | 9.0 | Together: the hidden shape | The cards close up into one translucent block: a robot is standing in the box. Slow turn. |
| 5 | 12.0 | Dial it: see only metal | A dial turns: cardboard fades, then plastic, leaving the bright key and gears turning in space. |

**Camera.** Beat 1 keeps the box large (the ring crops the frame). Beats 2–5 fill the frame with the panel, the stack and
then the volume.

**Sound.** A scanner whirr whose pitch follows the scan line; a tick per slice; a run of quick ticks and a whoosh as the
stack closes; a chord when the robot appears; dial clicks.

**Wow.** Beat 4: a stack of meaningless grey shapes closes up and becomes a robot.

**Watch out for.** Single slices must stay abstract (scan across the robot's height so no slice is a recognisable robot).
Grey on grey is low contrast: slices bright on a dark panel, panel large, room bright. Keep the ray-march cheap. The
volume must be big in frame and clearly three-dimensional (rotate it; add a faint floor shadow).

**Differs from:** `cross-section` (a cutting plane on the real object; here images of slices are rebuilt into a volume),
`point-cloud`, `thermal-camera`, `microscope-slide`, `layer-print`.
