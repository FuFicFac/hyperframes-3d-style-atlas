# Marionette

**Look.** A lacquered, brightly painted wooden string puppet (a friendly robot: yellow block head, teal body, orange and
blue limbs, wooden bead joints) on a small toy-theatre stage — pale painted-sky backdrop with hills and clouds, red pleated
curtains, warm plank floor — worked from above by a wooden control bar: a spine with a grip knob, a hand bar, a rocking
leg bar and a rail of painted name tags. Thick coloured strings (one colour per string, matching its tag). Bright, high
key, `neutral` tone mapping, soft shadows on the backdrop. Toy scale exaggerated ~4x (puppet 2.4 m, strings 3.4 cm).

**Signature mechanic — a closed-form string rig (`strings.js`).** The control is the only animated input: the bar's pose
(`x y z pitch roll yaw`), the leg bar's `rock`, and a pull on any tagged string (`pull:<tag>`), each as eased keys plus
sine windows. Every string has a fixed length, and each frame is solved from that, with no stepping:

| part | solve |
|---|---|
| hips | hang from the BACK string (fixed length): lower the bar and the knees fold, lift it and the feet leave the floor |
| torso | a rod from the waist whose top is held by the HEAD string: circle-circle intersection, the forward-falling branch — lower the head eyelet while the back string holds the hips and the puppet bows |
| arms | the wrist hangs straight under its eyelet when the arm can reach that point (two-bone IK, elbow pole down/back); otherwise the lowest point of (reach sphere) ∩ (string sphere); a slack string leaves the arm hanging from the shoulder |
| legs | the thigh is one bone, so a taut knee string puts the knee on the lowest point of (hip, thigh) ∩ (eyelet, string); the shin hangs from the knee; the foot stops on the floor |
| sway | every key move leaves a damped swing, an effective-gravity tilt `A e^(-s/tau) sin(2 pi f s)` per part, closed form |
| strings | taut = straight; slack = a belly whose depth follows from the spare length (smaller on near-vertical strings) |
| tags | each hangs from the tag rail on its own strand; pulling a tag DOWN by p draws its string in by p (pull-cord) |

**Good for.** "Who controls what" stories: inputs and the one thing each moves, cause and effect, levers of a system,
dependencies, influence, incentives; anything where a reveal of the hidden controller is the point. Friendly, child-safe tone.

**Avoid for.** Dense data, long text (tags hold one word), more than ~6 strings (they overlap from the front), subjects
that need realistic human motion — the puppet moves like a puppet, on purpose.

## Props (`style.props`)

| prop | what it is | hooks |
|---|---|---|
| `stageSet()` | plank floor, painted backdrop (canvas), two pleated curtains | static |
| `puppet()` | the painted wooden figure | `userData.pose(P)` |
| `controlBar()` | spine + grip, hand bar, rocking leg bar, tag rail, eyelets | `userData.pose(P.bar)` |
| `stringSet(plan)` | six live tubes (head, back, two hands, two knees) + five tag strands | `userData.update(P)` |
| `tagSet()` | five painted name tags (per-tag width, canvas text) | `userData.update(P)` |
| `marionette(plan)` | all of the above for one plan, added to the scene | `update(t)` → the pose |
| `caption()` | overlay plate, bottom-left corner, up to two short lines | `userData.show("a\nb", alpha)` |

`style.plan` = the planner module. **Planner: `strings.js`** (Node-safe, no THREE): `createPlan({ puppet, rig, strings,
tags, control, end })` → `{ channels(t), pose(t), events(), rest, stringPoints(s) }`; `rigVoices(SND)`, `panOf`, and the
maths (`lowestOnCircle`, `twoBone`, `stringPoints`, `barRotation`). `scene.config.js` builds SCORE with
`scoreFromEvents(plan.events(), rigVoices(S.sound))`.

## Control plan format

```js
control = {
  keys:  { y: [{ t, v, ease }], pitch: [...], "pull:prompt": [...] },   // offsets from rest; hold before/after
  waves: [{ ch: "rock", from, to, amp, hz, phase, fade }],               // sine windows (walk, wave, dance)
  tagDrops: { rules: 7.4, ... },                                          // when each tag drops down its strand (hidden before)
}
```
Recipes: **bow** = `y` −0.5 with `pull:data` +0.48 (the back string holds the hips while the head eyelet comes down);
**wave** = `pull:prompt` 0.6 plus a 2.5 Hz wiggle; **walk** = `rock` ±0.6 rad at ~1.15 Hz with a little `yaw` and `y` bob;
**entrance** = `y` from +0.5 to 0 (the feet land: a step event) and a small dip after.

## Sound palette

All from the plan: `step` (clack + low wooden bar) where a foot meets the floor — found by scanning the pose at 120 Hz;
`taut` (soft pluck) when a slack string takes weight; `creak` (short gritty glide) when a bar channel starts to move;
`pull` / `release` (plucks) for a tagged pull; `knock` for each swing of a waved channel; `tag` (wooden bar note, row B a
fourth higher) for each tag drop. The scene adds the bed pad, a riser + whoosh under the crane and two chimes.

## Tuning knobs (spec.js)

- `rig.barY` — string length. Longer = a more dramatic rise to the bar, but a smaller puppet in the full shot.
- `rig.wristRest` — rest height of the hands (strings taut at rest, classic marionette pose).
- `rig.kneeSlack` — spare length on the knee strings (their rest sag; also how far the leg bar rocks before a knee lifts).
- `rig.sway` (`tau`, `cap`, `hz`) and `rig.swayGain` per channel — how much each move swings the limbs afterwards.
- `rig.blend` — metres of tautness over which a limb goes from hanging to held (hides the kink at the moment a string bites).
- `strings.radius` — 0.017 reads at 1080p in a 4 m-tall frame; do not go below ~0.012.
- `tags.list` (`x`, `w`, `row`), `tags.rows` — lay tags out so a pulled tag (it comes down ~0.6 m) meets no neighbour.

## Known limitations

- Not a physics simulation: each limb takes the lowest position its string allows, independently. Arms do not push the
  body, the puppet's weight does not shift, and the torso only pitches (no side lean, no twist beyond a share of bar yaw).
- The head string is drawn to the nodded head top, so its drawn length varies by a few centimetres during a bow.
- In the blend band (first 6 cm of tautness) a string is drawn straight although the limb has not quite reached it.
- Knee strings run in front of the body and cross the chest (and the face from a 3/4 view), as on a real marionette.
- Tags are hidden until their `tagDrops` time. In the demo a string is pulled once BEFORE its tag is shown (the first
  wave): the pull is real, the tag that explains it arrives with the reveal.
- A big `roll` or `pitch` swings the long tag rail a long way (2.7 m half-length): it enters a puppet-only frame early.
  Bow with `y` + `pull:data`, not pitch, if the bar must stay out of shot.
- Pulls are implemented for the back, hand and knee strings; `pull:training` (head) is ignored.
- Nothing holds the bar: the puppeteer is deliberately left out. Front views are best; beyond ~35° the tags read as planes.
- Sound levels were measured, not listened to.
