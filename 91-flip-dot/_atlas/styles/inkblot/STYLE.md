# Inkblot (`inkblot`)

**Look.** A heavy cream card (3.6 x 1.7 m, toy-scale) on a pale blue-grey desk in bright, soft daylight. Glossy domed
beads of wet ink — black, crimson, indigo — sit on the left half; the right half folds over on a real hinge, a wooden
rubbing disc presses it, and the card peels open on a perfectly mirrored blot: noise-feathered edges, a pale capillary
halo, darker pooled rims, colours bleeding into the black. Wet ink is glossy and dries to matte. Then pencil outlines
(graphite on paper, chalk-white over ink) draw themselves over the blot and "read" it — one reading at a time.
All blots and drawings are original (not the Rorschach plates). Caption: an ink-dark pill with cream serif text on the overlay.

**Signature mechanic** (`blotplan.js`, THREE-free, `style.plan`):
- **Half-space.** Every ink / pencil coordinate is `(a, b)`: `a` = distance from the centre crease, `b` = up the sheet.
  Both card faces run the same fragment program on `(a, b)`, so the blot is mirrored by construction.
- **Ink field** = sum of elliptical blobs `w * exp(-k (q - 1))` minus voids (ink where the sum > 1). `plan.blobState(t)`
  writes the blob uniforms each frame: a drop lands -> round bead (pop + slow soak) -> pressed ellipse (only while the
  card is shut) -> slight capillary growth. The shader adds a domain warp, edge noise, feather, halo and rim from one
  baked tileable noise texture; `plan.fieldAt(a, b, t)` is the same sum on the CPU (bounds, tests).
- **Fold** = `kit/shapes.hingeGroup` about z; `plan.hingeAngle(t)` (0 open, PI shut). The flap takes the print at the
  moment it shuts. `plan.pressPose(t)` moves the rubbing disc; `plan.wet(t)` / `plan.bleed(t)` drive sheen and feathering.
- **Readings** = half-space polylines (`READINGS`: moth, two faces, mask — drawn for the default blot). Each is baked once
  into a texture: R = pencil coverage, G = draw order (cumulative stroke length); a progress uniform reveals it.
- **Sound** from the same plan (`events(plan)` + `blotVoices(SND)` -> `scoreFromEvents`): bubble+pop plip per drop (pitch by
  size, panned), paper + whoosh for the fold, slap + thud when it shuts, rustle + squish per rub, paper + squish peel,
  a marimba note per reading and one penScratch per pencil stroke.

## Good for / avoid for
- Good for: ambiguity and interpretation, "the model sees what it was trained to see", hallucination, pattern-matching,
  bias in reading data, same data -> different stories, symmetry, psychology topics.
- Avoid for: text- or number-heavy content, precise diagrams, anything that needs asymmetry (the mirror is built in),
  dark moods.

## Props (`style.props`)
| prop | what |
|---|---|
| `blot(plan)` | desk + card + droplets + press, added to the scene; `update(t)` drives everything from the plan. |
| `card(plan)` | inked half + hinged flap (`userData.update(t)`, `pivot`, `faceL`, `faceR`). |
| `droplets(plan)` | falling glossy drops for the plan's main drops. |
| `press(plan)` | wooden rubbing disc with a knob. |
| `desk()` | desk plane + contact shadow. |
| `caption()` | overlay pill; `userData.show(text, alpha)`. |

## Planner (`blotplan.js`)
| call | what |
|---|---|
| `createBlot({ blot, ink, sheet, timing, readings?, readAt? })` | the plan: `drops`, `sats`, `voids`, `readings` (with stroke windows), `bounds`. |
| `plan.blobState(t, A?, B?)` | blob uniforms + `press`, `bleed`, `wet`, `printed`. |
| `plan.fieldAt(a, b, t)`, `plan.inkDistance(a, b, t)` | the field / pseudo distance on the CPU. |
| `plan.hingeAngle(t)`, `pressAmount`, `bleed`, `wet`, `dropAir(i, t)`, `pressPose(t)`, `readingState(k, t)` | closed forms of t. |
| `events(plan)`, `blotVoices(SND)` | sound events and voices. |
| `catmull`, `ellipse`, `READINGS` | curve helpers and the default drawings. |

## Tuning knobs (spec)
`blot.drops / sats / voids / scale` (the design), `ink.k`, `ink.warp`, `ink.edgeLow / edgeFine`, `ink.feather`,
`ink.halo`, `ink.rim`, `ink.body`, `ink.bead`, `ink.wetRoughness`, `timing.*`, `pencil.width / sketch / tooth`.

## Known limitations
- At most 24 blobs (drops + splashes + voids) and 3 readings (three texture slots in the shader).
- A new blot needs new hand-drawn readings: `READINGS` fits the default blot only (the planner does not trace contours).
- The pressed shape is authored per drop; the ink does not physically flow — the spread happens hidden under the shut card.
- The card is rigid (no paper bend during the fold); no pencil prop — lines draw themselves on both halves at once.
- The mirror is exact, so asymmetric drawings are impossible; the paper mottling is the only unmirrored detail.
- Wet gloss depends on the room environment and the top-down camera: the sheen fade is subtle in the locked top shot.
- The shut card is a near-square subject: in the press shot it fills only ~55 % of the frame width.
