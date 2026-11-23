# Style briefs 101–112 and how to run a builder (written 2026-11-23, run 4)

One agent builds one style. This file, `BUILDER-BRIEF.md`, the section "Rules for every builder" in
`STYLE-BRIEFS-91-100.md`, and your style's section in `STORYBOARDS-101-112.md` are everything you need.
The owner approved the storyboards on 2026-11-23 and asked for all twelve to be built.

## Rules for this run (on top of BUILDER-BRIEF.md and "Rules for every builder" in STYLE-BRIEFS-91-100.md)

- **The storyboard is approved. Build it as written.** Use its beat start times and durations, its labels word for word,
  its demo title, its look and its mechanic. The demo topic is the phenomenon itself; do NOT swap it for an AI topic.
  Change a label only if it truly cannot be made readable, and say so in your report.
- **Three.js only, everything from code.** Procedural geometry, materials, shaders, lighting, particles. No image, model,
  video or audio files, nothing downloaded, no web fonts. Textures and environments are generated in code.
- **Say what the motion is.** Your `STYLE.md` must contain a line starting `Motion type:` that states plainly whether the
  motion is analytical, art-directed or numerically simulated, using the storyboard's "Motion type" paragraph as the
  starting point and correcting it to what you actually built. Do not claim physical accuracy you did not check.
- **Simulated styles (108–111) never step inside `renderAt(t)`.** Run the simulation in the Node-safe planner module:
  fixed time step, seeded RNG, plain arrays. Run it once when the page loads, store the states you need, and have the
  scene read (and, if needed, interpolate between) stored states for any t. Keep that load-time work under about
  3 seconds on this machine; shrink the grid or particle count rather than exceed it. Results must be identical on every
  page load (`determinism: OK`). If you interpolate between stored states, say so under Limits.
- **Bright by default.** 108 and 112 are dark by design: there the subject itself must glow and fill the frame.
- **One wow moment**, named for your style below. Make it land; say in the report whether it did.
- Reference only (read for ideas, do not import or copy files from it): the owner's liquid-splash experiment at
  `/Volumes/Panther/New horizons/liquid-hero/src/` shows a refractive liquid shader, analytic studio lights and a
  closed-form water surface on the same Three.js revision.

## Per-style engineering notes

**101 ripple-interference** — one water mesh displaced in the vertex shader by the closed-form sum of two ring-wave
sources (amplitude falling with distance, phase from t); normals from the same function; corks and dippers evaluate the
same function in JS. Source 2's phase offset is a function of t (0 → half a cycle across beat 4). Clear turquoise water
over a pale tank floor so the bands read by refraction and highlights. Wow: beat 4, the calm lines sweep and the corks swap.

**102 photoelastic-stress** — one shader on the beam: stress from superposed point-load (Flamant-type) solutions for the
press and each support, weighted by load(t) and support positions(t); band colour = retardation looked up in an
interference-colour table that you compute in code (integrate over the visible spectrum into a small data texture). The
notch raises stress locally (a simple concentration factor is fine; say so). Wow: beat 4, the bands at the notch relax
when the third support takes load.

**103 percolation** — planner: seeded square grid of bonds (about 22 × 13), a seeded opening order, incremental
union-find to find the exact bond that first joins top to bottom; schedule bonds before it across beats 1–3, that bond at
beat 4; water fill times in beat 5 from breadth-first distance along the joined cluster. Instanced valves and pipes.
The wet region must stop exactly one bond short in beat 3. Wow: beat 5, water running the whole board.

**104 chromatography** — planner: front height ~ sqrt(time); each dye has a fixed fraction of the front and a width that
grows with distance. Paper strip is one shader (fibre texture generated in code, damp region darker, bands as soft
Gaussians that subtract light like real dyes). Glass jar, clip, pen and two finished strips are simple procedural props.
Wow: beat 3, the black dot splitting into colours.

**105 tensegrity** — planner: node positions of a three-level strut-and-cord tower; cord tensions from a force-density
balance (small linear solve) with and without the weight; a second solved pose after one cord is removed. The slump
between poses is an eased blend (art-directed; say so). Cord brightness and pluck pitch come from tension. Keep the tower
large in frame and the camera moving. Wow: beat 5, the slump when one cord goes.

**106 snap-through** — planner: a shallow bistable arch (two-bar or sinusoidal-arch model) giving deflection for each
load step and the limit load; weights arrive on a schedule; at the limit the arch flips with a short damped ring;
weights hop ballistically and settle; removing weights leaves it flipped. Dial gauge reads the same deflection.
Spring-steel blue strip, real-looking clamps. Wow: beat 4, the snap.

**107 magnetic-memory** — planner: grid of latching tiles (about 56 × 30), seeded initial states; magnet path 1 and
path 2 as curves in t; a tile flips at the first time the pull at its position exceeds its (seeded) threshold; pass 2 is
higher so weaker and only flips some back. Each flip is a short damped swing from that time. Bright white board, hard
tiles, no liquid. Wow: beat 4, the track still there with the magnet gone.

**108 vortex-rings** — planner: two coaxial thin vortex rings; integrate their radii and positions with a fixed-step
RK4 from launch times to 15 s into a table (this is the numerical part; the classic leapfrog must emerge from the
equations, not be keyframed). Smoke: instanced soft particles whose position is a closed form of (seeded phase, t, ring
state): they circle the ring's core. Side-lit against black; rings large in frame. Wow: beat 4, one ring threading the other.

**109 reaction-diffusion** — planner: Gray–Scott on a CPU grid (start about 160 × 160; reduce if load time exceeds 3 s),
fixed step, seeded seeds; store a state every 0.5 s of video. Scene: one shader reads two neighbouring stored states and
blends; the dish surface is raised from the same field so light catches it. Tune feed/kill so spots split and then lock
into stripes within the 15 s. Wow: beat 4, fronts from different seeds meeting and bending into stripes.

**110 differential-growth** — planner: a closed 2D curve that grows by inserting points, with neighbour springs,
short-range repulsion and a circular wall; fixed step; store snapshots resampled to a fixed point count so they can be
blended; guarantee no self-crossing (test it in the planner and fail loudly). Scene: the curve extruded upward as a
coral-pink paper ribbon inside a clear hoop. Wow: beat 4, waves sprouting smaller waves.

**111 granular-sorting** — planner: spheres in a thin flat-fronted jar (one bead-layer deep is fine and readable; say
so), a few hundred small and about a dozen large, soft-contact collisions, gravity, a pulsed shaker floor, fixed step;
store positions per video frame (or every other, blended). If it cannot be made stable and fast enough, fall back to a
seeded art-directed plan using the same gap-filling rule and label it as art-directed in STYLE.md and your report.
Wow: beat 4, the large beads climbing in steps.

**112 schlieren** — the mirror disc is one shader: a procedural plume density that is a closed form of position and t
(rising, widening, rolling; a sideways puff in beat 4); ordinary view shows only flame and bench, schlieren view shows
the sideways rate of change of that density as light and dark on grey. The disc must fill most of the frame and be
bright enough to read. Wow: beat 3, the plume appearing in "still" air.

## How the orchestrator starts a builder

> You are a builder adding ONE new style to the 3D Style Atlas: number **NN**, id **`<id>`**.
> 1. Read `/Volumes/Panther/3D Style Atlas/_orchestration/BUILDER-BRIEF.md` and follow it exactly.
> 2. Read "Rules for every builder" in `/Volumes/Panther/3D Style Atlas/_orchestration/STYLE-BRIEFS-91-100.md`.
> 3. Read `/Volumes/Panther/3D Style Atlas/_orchestration/STYLE-BRIEFS-101-112.md`: "Rules for this run" and your
>    style's engineering note.
> 4. Read your style's section in `/Volumes/Panther/3D Style Atlas/_orchestration/STORYBOARDS-101-112.md`. It is approved.
> 5. If `PILOT/NN-<id>/HANDOFF.md` or `SK/styles/<id>/HANDOFF.md` exists, continue that work.
> 6. Work autonomously to a finished, rendered, checked demo and give the final report in the brief's format.

Orchestrator checklist: as in `STYLE-BRIEFS-91-100.md`. No index, gallery, git or site changes without the owner's yes.
