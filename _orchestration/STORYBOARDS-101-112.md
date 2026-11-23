# Storyboards — proposed styles 101–112

Status: **storyboards for review. Nothing here is built.** Written 2026-11-23, following the atlas skill's storyboard step (3–6 beats, one short label per beat, what moves; owner says yes before any build).

- Numbers 101–112 are provisional. The atlas is at 100; confirm the next free number against `_orchestration/QUEUE.md` before assigning any.
- Every demo is 15 seconds, built only from code in Three.js on the atlas kit (r181). The kit is not edited.
- One label on screen at a time, each at least 1.5 seconds, each 26 characters or fewer (checked by script).
- Sound is derived from the same beat plan as the picture. No audio has been made or heard.
- **Motion type** says plainly whether a style is analytical, art-directed or numerically simulated.

## At a glance

| # | Style | Demo title | Motion type | Risk |
|---|---|---|---|---|
| 101 | Ripple Interference | Timing decides the pattern | Analytical | Low |
| 102 | Photoelastic Stress | Where the load really goes | Analytical approximation | Low to medium |
| 103 | Percolation | One link away | Exact | Low |
| 104 | Chromatography | What is in the black? | Analytical | Low |
| 105 | Tensegrity | Nothing touches | Mixed | Medium |
| 106 | Snap-Through | Then, all at once | Analytical | Medium |
| 107 | Magnetic Memory | It remembers | Analytical with memory | Medium |
| 108 | Vortex Rings | A push that travels | Mixed | Medium to high |
| 109 | Reaction-Diffusion | Rules, not a plan | Numerical simulation | Medium |
| 110 | Differential Growth | When room runs out | Numerical simulation | Medium |
| 111 | Granular Sorting | Shaken into order | Numerical simulation, if it holds up | High |
| 112 | Schlieren | The air was moving | Art-directed | High overlap |

## 101 · Ripple Interference (`ripple-interference`)

**Demo:** “Timing decides the pattern”  
**Explains:** Coordination and conflicting inputs

**Look.** A shallow ripple tank on a dark bench, seen at a low angle: clear turquoise water (the hero's liquid), two brass dippers on one bar, two corks floating as markers. Side light picks out every crest.

**Signature mechanic.** Two point sources; the surface is their exact sum. Sliding one source's timing moves the lines of calm.

**Motion type.** Analytical. Height = sum of two travelling ring waves, a closed form in t. Corks ride the same function.

| Beat | Starts | Lasts | Label | What moves |
|---|---|---|---|---|
| 1 | 0 s | 2.5 s | One source. Clean rings. | Left dipper taps; rings spread across the tank. |
| 2 | 2.5 s | 3 s | Add a second source | Right dipper joins. Still lines of calm appear between bands of chop. |
| 3 | 5.5 s | 3 s | In step: they add up | Camera drops low. One cork on a band bobs high; the cork on a calm line sits still. |
| 4 | 8.5 s | 3.5 s | Out of step: they cancel | The right dipper's timing slides half a beat. The calm lines sweep sideways; the corks swap roles. |
| 5 | 12 s | 3 s | Timing decides the pattern | Pull back to the whole tank as the pattern settles. |

**Sound.** Two soft pitched taps, one per dipper per cycle; they fall into unison in beat 3 and into alternation in beat 4.

**Risk and overlap.** Low. Close to Cymatics in subject (waves make patterns), but here the pattern comes from two inputs disagreeing.

## 102 · Photoelastic Stress (`photoelastic-stress`)

**Demo:** “Where the load really goes”  
**Explains:** Workload, fragility, resilience

**Look.** A light table in a bright lab. A clear plastic beam with a notch rests on two supports between two polarising sheets; under them it turns black with rainbow bands. A small screw press sits above.

**Signature mechanic.** Stress shows as colour. Bands crowd where stress concentrates and spread out when the load is shared.

**Motion type.** Analytical approximation. Stress = superposed point-load solutions for the press and each support; band colour is computed from the stress difference. Not a finite-element solve, so no scientific caption.

| Beat | Starts | Lasts | Label | What moves |
|---|---|---|---|---|
| 1 | 0 s | 2.5 s | Clear plastic. No load. | The second polariser slides over; the beam goes dark and plain. |
| 2 | 2.5 s | 3 s | Load on. Stress shows. | The press comes down. Rainbow bands bloom from the contact point and the supports. |
| 3 | 5.5 s | 3 s | Bands crowd at the notch | Push in on the notch: bands pack tightly there as the press turns further. |
| 4 | 8.5 s | 3.5 s | Add one more support | A third support slides under. The bands at the notch thin out and spread along the beam. |
| 5 | 12 s | 3 s | Same load. Shared. | Wide shot: a calmer, even pattern. |

**Sound.** A low servo for the press, a rising glassy tone that tracks the peak stress, a soft knock as the support seats, the tone relaxing.

**Risk and overlap.** Low to medium. The colour table must be right or it looks like a generic rainbow. Nearest neighbour is Thermal Camera; the mechanic differs.

## 103 · Percolation (`percolation`)

**Demo:** “One link away”  
**Explains:** Tipping points, access, adoption

**Look.** A white enamel board of small brass pipes in a square grid, each joint a tiny valve, lit from the front. Blue water waits in a trough along the top; a dry trough runs along the bottom.

**Signature mechanic.** Valves open in a seeded random order. Water fills only what it can reach. One specific valve joins the top to the bottom.

**Motion type.** Exact. Connectivity of the seeded grid is solved directly for every moment, and the deciding valve is found by that solve, not staged. Water fill times follow path length from the top.

| Beat | Starts | Lasts | Label | What moves |
|---|---|---|---|---|
| 1 | 0 s | 2.5 s | Links open at random | Valves click open here and there. Water enters only the few pipes touching the top. |
| 2 | 2.5 s | 3 s | Clusters grow, still apart | More open. Separate clusters are tinted; the wet one creeps down a little. |
| 3 | 5.5 s | 3 s | So close. Still no path. | Most valves are open. The wet region ends one pipe short; the bottom trough is dry. |
| 4 | 8.5 s | 2.5 s | One more link | Close-up: a single valve turns. |
| 5 | 11 s | 4 s | Now it runs end to end | Water races the newly joined path to the bottom trough. Pull back to the whole board. |

**Sound.** Dry clicks per valve, a held breath of silence before beat 4, one louder click, then a rising rush of water.

**Risk and overlap.** Low. Clear and countable. Lichtenberg also shows 'many paths, one connects' but grows a tree; this is a threshold in a fixed grid.

## 104 · Chromatography (`chromatography`)

**Demo:** “What is in the black?”  
**Explains:** Mixed causes, provenance, complexity beneath simplicity

**Look.** Daylight lab bench. A strip of white filter paper hangs from a clip into a glass jar with a little clear solvent. A pen dots black ink near the bottom of the strip. Two finished strips hang behind.

**Signature mechanic.** The solvent front climbs; each dye in the ink travels at its own fixed fraction of that climb, so one dot becomes separate bands.

**Motion type.** Analytical. Front height follows a square-root-of-time climb; each band's position is its fraction of the front, its width grows with distance. All closed form.

| Beat | Starts | Lasts | Label | What moves |
|---|---|---|---|---|
| 1 | 0 s | 2.5 s | One black dot | The pen touches the paper and lifts. The strip lowers into the jar. |
| 2 | 2.5 s | 3 s | The solvent climbs | A damp front rises through the paper and reaches the dot. |
| 3 | 5.5 s | 3.5 s | The black comes apart | The dot stretches upward and splits into blue, magenta and yellow. |
| 4 | 9 s | 3 s | Each colour, its own pace | Close-up beside a ruler edge: the bands pull further apart as the front keeps climbing. |
| 5 | 12 s | 3 s | One spot. Many parts. | The strip lifts out and hangs beside the two others, each with a different set of bands. |

**Sound.** A pen tick, a soft continuous paper hiss that follows the front, one marimba note as each band separates, a light chord at the end.

**Risk and overlap.** Low. It is ink on paper again (Paper Marbling, Inkblot, Ukiyo-e), so the set must look like a lab, not a craft table.

## 105 · Tensegrity (`tensegrity`)

**Demo:** “Nothing touches”  
**Explains:** Distributed support and interdependence

**Look.** A bright studio table. A three-level tower of pale wooden struts held only by red cords; no strut touches another. A small brass weight and a pair of snips wait at the side.

**Signature mechanic.** Struts push, cords pull, and every part carries a share. Remove one cord and the whole shape changes.

**Motion type.** Mixed. The standing shape and the sharing of load are solved from the structure's balance (analytical). The sag after the cut is art-directed between two solved poses, not a rigid-body simulation.

| Beat | Starts | Lasts | Label | What moves |
|---|---|---|---|---|
| 1 | 0 s | 3 s | Sticks that never touch | Slow orbit. Gaps between the struts are plain to see. |
| 2 | 3 s | 3 s | The cords carry it | Cords light up one after another, brighter where they pull harder. |
| 3 | 6 s | 3 s | Press down. All share. | The weight is set on top. The whole tower flexes a little; every cord brightens at once. |
| 4 | 9 s | 2.5 s | Cut one cord | Close-up: the snips close on a single cord. |
| 5 | 11.5 s | 3.5 s | Each leans on all | The tower slumps to a new, lower shape; three struts finally touch. |

**Sound.** A plucked string per cord, pitched by its tension; the chord tightens under the weight; a snip, then the chord drops and detunes.

**Risk and overlap.** Medium. A still structure for nine seconds needs strong camera work. Shares 'balance' with Hanging Mobile and strings with Marionette.

## 106 · Snap-Through (`snap-through`)

**Demo:** “Then, all at once”  
**Explains:** Thresholds and decisions

**Look.** A bright workbench. A thin blue spring-steel strip is bowed upward between two clamps, with a small tray on its crown and a dial gauge beside it. A stack of identical brass weights stands ready.

**Signature mechanic.** Each added weight barely moves the arch, until one more flips it through to the other side. Taking weights off does not flip it back.

**Motion type.** Analytical. The arch follows the textbook force-deflection curve of a shallow bistable arch; the flip happens at that curve's limit point, followed by a short damped ring. The weights' jump is ballistic.

| Beat | Starts | Lasts | Label | What moves |
|---|---|---|---|---|
| 1 | 0 s | 2.5 s | A shallow arch holds | The arch at rest; first weight placed. The dial barely moves. |
| 2 | 2.5 s | 3 s | Add a little. Nothing. | Two more weights. The dial creeps. |
| 3 | 5.5 s | 3 s | More. Still holding. | Two more. The arch is visibly flatter; the dial needle nears a red mark. |
| 4 | 8.5 s | 2.5 s | One more | The last weight lands. The arch snaps downward; the weights hop. |
| 5 | 11 s | 4 s | No small step back | Weights are lifted off one by one. The arch stays flipped. |

**Sound.** A soft clink per weight with a slowly rising held tone, a hard metallic snap, then clinks again over a low, changed tone.

**Risk and overlap.** Medium. It can read as a diagram unless the steel, clamps and gauge look real. Lab Glassware already covers thresholds; this one adds 'no way back'.

## 107 · Magnetic Memory (`magnetic-memory`)

**Demo:** “It remembers”  
**Explains:** Memory, bias, path dependence

**Look.** A white tabletop board holding a grid of small two-tone pivoting tiles (dark one side, pale the other), each a tiny magnet that latches either way. A red-and-silver bar magnet on a handle.

**Signature mechanic.** A passing magnet flips the tiles under it. When it leaves, they stay flipped. A weaker second pass only partly rewrites the first.

**Motion type.** Analytical with memory. Each tile's state is decided by the strongest pull it has felt along the magnet's known path, so any moment can be computed directly without stepping. The flip itself is a short damped swing.

| Beat | Starts | Lasts | Label | What moves |
|---|---|---|---|---|
| 1 | 0 s | 2.5 s | Every tile, its own way | Top-down: a random speckle of dark and pale. |
| 2 | 2.5 s | 3.5 s | A magnet passes | The magnet sweeps a curve across the board. Tiles under it flip to dark in a wave. |
| 3 | 6 s | 2.5 s | The magnet leaves | It lifts away out of frame. |
| 4 | 8.5 s | 3 s | The pattern stays | Low angle across the board: the dark track is still there, perfectly still. |
| 5 | 11.5 s | 3.5 s | The past shapes the next | A second, higher pass crosses the track. It flips some tiles back and leaves the rest. |

**Sound.** A fast run of tiny clicks that follows the magnet, silence when it leaves, a sparser run on the second pass.

**Risk and overlap.** Medium. Must not look like Ferrofluid: no liquid, bright set, hard tiles. The physics is only honest with latching tiles; compass needles would swing back.

## 108 · Vortex Rings (`vortex-rings`)

**Demo:** “A push that travels”  
**Explains:** Momentum, feedback, unintended consequences

**Look.** A long black-walled glass tank lit from the side. A drum with a round hole sits at the left end; white smoke rings travel to the right against the dark.

**Signature mechanic.** Two rings on the same line change each other: the rear one shrinks, speeds up and passes through the front one, which widens and slows.

**Motion type.** Mixed. Ring size and position come from the classic thin-ring equations, integrated once at load with a fixed step and stored, so any moment can be read back (numerical). The smoke inside each ring is art-directed particles circling the core.

| Beat | Starts | Lasts | Label | What moves |
|---|---|---|---|---|
| 1 | 0 s | 2.5 s | One tap. One ring. | The drum skin is tapped; a ring leaves the hole. |
| 2 | 2.5 s | 3 s | It keeps its shape | The camera tracks beside it; smoke rolls around the core. |
| 3 | 5.5 s | 2.5 s | Send a faster second | A harder tap. A smaller, quicker ring sets off behind the first. |
| 4 | 8 s | 3.5 s | One passes through | The rear ring tightens and threads the front one, which spreads wide. |
| 5 | 11.5 s | 3.5 s | Each changed the other | Wide shot: two rings travel on at new sizes and speeds. |

**Sound.** A soft drum thump per tap, a low airy whoosh that follows each ring's speed, a brief flutter as they pass.

**Risk and overlap.** Medium to high. Convincing smoke from particles is the hard part. A dark set is right for smoke but the atlas already has several dim demos.

## 109 · Reaction-Diffusion (`reaction-diffusion`)

**Demo:** “Rules, not a plan”  
**Explains:** Emergence, local rules, adaptation

**Look.** A macro shot of a glass dish on a pale lab bench: cream gel with a deep teal pattern growing in it, slightly raised so the light catches its edges.

**Signature mechanic.** Two substances spread and react. A few seeds grow into spots, the spots split, and the fronts meet and lock into stripes.

**Motion type.** Numerical simulation. The standard two-chemical model is stepped on the GPU at a fixed rate; states are stored every half second and replayed from the nearest one, so seeking is repeatable on one machine. Results may differ slightly between graphics cards.

| Beat | Starts | Lasts | Label | What moves |
|---|---|---|---|---|
| 1 | 0 s | 2.5 s | A few seeds | Five drops land on the gel. |
| 2 | 2.5 s | 3 s | Two simple local rules | Each drop swells into a ring and pinches into spots. |
| 3 | 5.5 s | 3 s | Spots split and spread | Spots divide again and again, filling outward. |
| 4 | 8.5 s | 3.5 s | Neighbours compete | Fronts from different seeds meet, stall, and bend into stripes. |
| 5 | 12 s | 3 s | No one drew this | Pull back: the whole dish is one maze. |

**Sound.** Five soft drops, then a quiet granular texture whose density follows how much of the dish is patterned; it settles as the maze locks.

**Risk and overlap.** Medium. First atlas style that is truly stepped: needs the stored-state replay built and proven. Near Microscope Slide in look.

## 110 · Differential Growth (`differential-growth`)

**Demo:** “When room runs out”  
**Explains:** Expansion under constraint

**Look.** A bright pastel studio. A flat ring of coral-pink paper ribbon stands on edge inside a low clear glass hoop on a white table.

**Signature mechanic.** The ribbon keeps getting longer but the hoop does not get bigger, so it buckles into waves, then waves upon waves.

**Motion type.** Numerical simulation. A closed curve grows by adding points while neighbours push apart and the hoop pushes back; stepped at a fixed rate on the CPU at load and stored, so any moment can be read back.

| Beat | Starts | Lasts | Label | What moves |
|---|---|---|---|---|
| 1 | 0 s | 2.5 s | A simple ribbon | A plain ring, well inside the hoop. |
| 2 | 2.5 s | 3 s | It keeps growing | The ring swells until it meets the glass. |
| 3 | 5.5 s | 3 s | No room. It buckles. | The first slow waves fold inward. |
| 4 | 8.5 s | 3.5 s | Folds upon folds | Each wave sprouts smaller waves; the camera drifts down to ribbon height. |
| 5 | 12 s | 3 s | Growth meets its limit | Top-down: the hoop is packed with one continuous, never-crossing ribbon. |

**Sound.** A soft paper rustle whose rate follows the ribbon's length, with a gentle tick each time a new fold forms.

**Risk and overlap.** Medium. Second stepped style. The ribbon must never cross itself, which the solver has to guarantee.

## 111 · Granular Sorting (`granular-sorting`)

**Demo:** “Shaken into order”  
**Explains:** Accumulation and uneven outcomes

**Look.** A clear straight-sided jar on a small shaker plate in a bright kitchen-lab. It is filled with small cream beads and a dozen large red ones, mixed evenly.

**Signature mechanic.** Each shake lifts everything a little. Small beads fall into the gaps under large ones, so the large ones end up on top.

**Motion type.** Numerical simulation, if it holds up. A few hundred spheres with collisions, stepped at a fixed rate at load and stored. If that proves too slow or unstable, the fallback is a seeded art-directed plan using the same gap-filling rule, and it would be labelled as such.

| Beat | Starts | Lasts | Label | What moves |
|---|---|---|---|---|
| 1 | 0 s | 2.5 s | Mixed all the way through | The jar at rest; red beads scattered at every height. |
| 2 | 2.5 s | 3 s | Shake. Tiny hops. | The plate pulses. Everything hops a few millimetres. |
| 3 | 5.5 s | 3 s | Small ones slip under | Close-up on one red bead: cream beads trickle into the gap beneath it each time it lifts. |
| 4 | 8.5 s | 3.5 s | Big ones ride up | Time speeds up. Red beads climb in steps. |
| 5 | 12 s | 3 s | No one sorted them | The plate stops. All the red beads sit on top. |

**Sound.** A dry rattle per shake, slightly brighter each time as large beads reach the top, then stillness.

**Risk and overlap.** High. The hardest to do honestly, and beads in a jar sit close to Galton Board and Marble Run.

## 112 · Schlieren (`schlieren`)

**Demo:** “The air was moving”  
**Explains:** Hidden processes and disturbances

**Look.** An optics bench in a dim lab: a candle in front of a large round mirror, a razor blade on a stand, a camera. The mirror's disc fills most of the frame.

**Signature mechanic.** With the blade at the mirror's focus, air of different temperature shows as light and dark. The candle's still-looking air turns out to be a rising, rolling plume.

**Motion type.** Art-directed. The plume is a procedural flow, a closed form in t, not a fluid solve; the picture is that flow's sideways rate of change, which is what the blade really selects.

| Beat | Starts | Lasts | Label | What moves |
|---|---|---|---|---|
| 1 | 0 s | 2.5 s | A candle. Still air? | Ordinary view in the mirror: flame, nothing else. |
| 2 | 2.5 s | 3 s | Slide in a blade | The razor edge moves into the focus. The disc dims to even grey. |
| 3 | 5.5 s | 3 s | Now the heat shows | A plume appears above the flame: smooth at first, then rolling. |
| 4 | 8.5 s | 3.5 s | A breath bends it | A puff from a straw at the side knocks the plume sideways; eddies spin off. |
| 5 | 12 s | 3 s | It was always moving | Split disc: ordinary view on the left, the plume on the right. |

**Sound.** Near silence, a blade slide, then a soft airy texture that follows the plume, a short puff, and the texture swirling.

**Risk and overlap.** High overlap. Cloud Chamber, Thermal Camera and UV Reveal already cover 'invisible made visible'. A dim set adds to the atlas's dark demos.

## Suggested build order

1. **First (exact, no solver):** 101 Ripple Interference, 102 Photoelastic Stress, 103 Percolation, 104 Chromatography.
2. **Second:** 105 Tensegrity, 106 Snap-Through, 107 Magnetic Memory, 108 Vortex Rings.
3. **Third (stepped simulation; needs stored-state replay proven first):** 109 Reaction-Diffusion, 110 Differential Growth, 111 Granular Sorting.
4. **Hold:** 112 Schlieren, unless the overlap with three existing styles is acceptable.
