// scene.config.js — 45-lab-glassware: "a recipe, measured" (SAMPLE DATA). Plain data + the style's pure planner
// (liquids.js): no THREE, no window. Imported by scene.js (browser) and by render-sfx / export-spec (Node), so every
// trickle, clink, drip and fizz in SCORE comes from the SAME plan the picture reads.
// Story: two inputs A (blue) and B (yellow) are measured in cylinders (bars you read off the scale), poured together
// into a beaker (volume conserved: 60 + 40 = 100 on the beaker's own scale), mix to green, then a burette adds C drop
// by drop until the planned sixth drop tips the whole beaker to violet, it fizzes and a foam head rises.
// Units: metres (vessels ~3x real size), Y-up, seconds, radians, sRGB hex. Bench top y = 0; the viewer sits at +Z.
import { STYLE_SPEC as S } from "./_atlas/styles/lab-glassware/spec.js";
import * as L from "./_atlas/styles/lab-glassware/liquids.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, boxCorners } from "./_atlas/kit/framing.js";

export const ID = "45-lab-glassware";
export const STYLE = "lab-glassware";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

export const BEATS = [
  { id: "measure", t: 0.0, dur: 3.7 },  // A and B rise to their graduations
  { id: "pour", t: 3.7, dur: 3.9 },     // both pour into the beaker; volume is conserved; colours swirl to green
  { id: "drop", t: 7.6, dur: 3.7 },     // the burette drips; drop 6 tips it to violet
  { id: "result", t: 11.3, dur: 3.7 },  // fizz + foam head; wide bench
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
const at = (id, off = 0) => B[id].t + off;

// ---------------------------------------------------------------- data (SAMPLE DATA) + layout
export const DATA = { sample: true, A: 60, B: 40, dropUnits: 0.125, flipAt: 6, drops: 6 };
const P = S.palette;
export const COL = { A: P.A, B: P.B, C: P.C, react: P.react };
export const CYL = L.vesselProfile("cylinder");
export const BEAK = L.vesselProfile("beaker");
export const BUR = L.vesselProfile("burette");
export const STAND_AT = [0, 0, 0];
export const BEAKER_AT = [0, S.stand.baseH, 0];                 // the beaker stands on the stand's base plate
export const TIP = [0, 1.12, 0];                                // burette tip (burette origin)
export const CYL_A = [-0.78, 0, 0.05], CYL_B = [0.78, 0, 0.05];
export const RACK_AT = [-1.42, 0, -0.56], FLASK_AT = [1.4, 0, -0.5];

// ---------------------------------------------------------------- the plan (pure)
export const FILL_A = L.planFill({ V: L.fromUnits(DATA.A), t0: at("measure", 0.35), dur: 2.0 });
export const FILL_B = L.planFill({ V: L.fromUnits(DATA.B), t0: at("measure", 0.6), dur: 1.6 });
const beakerFinal = L.heightFor(BEAK, L.fromUnits(DATA.A + DATA.B)) + BEAKER_AT[1];
export const POUR_A = L.planPour({ id: "A", prof: CYL, side: 1, V0: FILL_A.V, rest: CYL_A, lip: [-0.12, 0.86, 0.025], tLift: at("pour", 0.2), flow: 1.9, dstY: beakerFinal - 0.12 });
export const POUR_B = L.planPour({ id: "B", prof: CYL, side: -1, V0: FILL_B.V, rest: CYL_B, lip: [0.12, 0.86, -0.025], tLift: at("pour", 0.35), flow: 1.7, dstY: beakerFinal - 0.12 });
export const POURS = [POUR_A, POUR_B];
export const SWIRL = { t0: Math.min(POUR_A.tFlow + POUR_A.fall, POUR_B.tFlow + POUR_B.fall), t1: Math.max(POUR_A.tEnd + POUR_A.fall, POUR_B.tEnd + POUR_B.fall), ...S.liquid.swirl };
export const DROP_VOL = L.fromUnits(DATA.dropUnits);
export const BUR_ZERO = BUR.top - 0.03;                         // the burette reads 0 here (and is filled to it)
export const BUR_V0 = L.volumeAt(BUR, BUR_ZERO);
export const DROPS = L.planDrops({ start: at("drop", 0.55), every: 0.42, count: DATA.drops, flipAt: DATA.flipAt, tip: TIP, surfaceY: beakerFinal, r: 0.014, vol: DROP_VOL });
export const FIZZ = { t0: DROPS.flipT + 0.25, t1: at("result", 2.6) };
export const FIZZ_BUBBLES = L.planBubbles({ t0: FIZZ.t0, t1: FIZZ.t1, count: 70, theta: [-1.05, 1.05], size: [0.006, 0.013], speed: [0.12, 0.3], accel: 0.5, seed: 17 });
export const FILL_BUBBLES = [FILL_A, FILL_B].map((f, k) => L.planBubbles({ t0: f.t0 + 0.1, t1: f.t1 - 0.2, count: 12, theta: [-0.9, 0.9], size: [0.004, 0.008], speed: [0.25, 0.45], accel: 0.3, seed: 31 + k }));
export const FOAM = { t0: DROPS.flipT + 0.45, rise: 1.7, peak: 0.13, settle: 1.6, rest: 0.095 };
// the rack: five tubes + one layered by density (densest at the bottom)
export const TUBES = [
  { color: P.D, units: 3.6 }, { color: P.E, units: 2.8 },
  { layers: [{ color: P.C, units: 1.2 }, { color: P.B, units: 1.1 }, { color: P.A, units: 1.3 }] },
  { color: P.F, units: 3.2 }, { color: P.C, units: 2.4 }, { color: P.A, units: 3.9 },
];
export const FLASK_UNITS = 26;

export const EVENTS = L.events({
  fills: [{ id: "A", f: FILL_A, prof: CYL }, { id: "B", f: FILL_B, prof: CYL }],
  pours: POURS.map((p) => ({ p, dst: { prof: BEAK, V0: 0, pours: POURS } })),
  swirl: SWIRL, drops: DROPS, fizz: { ...FIZZ, bubbles: FIZZ_BUBBLES }, foam: FOAM,
});

// ---------------------------------------------------------------- labels (one caption at a time) + readouts
export const LABELS = [
  { text: "Measure each input", on: at("measure", 0.3), off: at("measure", 3.25) },
  { text: "Pour them together", on: at("pour", 0.3), off: at("pour", 3.45) },
  { text: "One more drop tips it", on: at("drop", 0.3), off: at("drop", 3.25) },
  { text: "Inputs in, result out", on: at("result", 0.35) },
];
export const LABEL_FADE = { inDur: S.caption.inDur, outDur: S.caption.outDur };
export const READOUTS = [
  { id: "A", text: `A  ${DATA.A}`, on: FILL_A.t1 + 0.2, off: POUR_A.tLift - 0.05, side: "left", color: P.A },
  { id: "B", text: `B  ${DATA.B}`, on: FILL_B.t1 + 0.35, off: POUR_B.tLift - 0.05, side: "right", color: P.B },
  { id: "mix", text: `A+B  ${DATA.A + DATA.B}`, on: SWIRL.t1 + 0.35, off: at("drop", 0.4), side: "right", color: "#42b482" },
];
export const DROP_TAG = { on: DROPS.drops[0].tHit, off: at("drop", 3.3) };   // "n drops" next to the burette tip

// ---------------------------------------------------------------- camera: subject large, caption corner clear
export const CAMERA = [
  { t: 0.0, pos: [0, 0.6, 3.25], target: [0, 0.5, 0], fov: 30 },                                   // eye level: read the scales
  { t: at("measure", 3.5), pos: [0, 0.57, 2.95], target: [0, 0.49, 0], fov: 30, ease: "inOutSine" },
  { t: at("pour", 0.9), pos: [0, 1.0, 3.45], target: [0, 0.64, 0], fov: 30, ease: "inOutSine" },  // up a little: into the beaker
  { t: at("pour", 3.6), pos: [0.08, 1.06, 3.15], target: [0, 0.62, 0], fov: 30, ease: "linear" },
  { t: at("drop", 0.7), pos: [0.16, 0.9, 2.62], target: [0.0, 0.62, 0], fov: 30, ease: "inOutSine" },  // close: tip + surface
  { t: at("drop", 3.4), pos: [0.14, 0.9, 2.55], target: [0.0, 0.62, 0], fov: 30, ease: "linear" },
  { t: DURATION, pos: [0, 1.1, 4.45], target: [0, 0.88, -0.22], fov: 30, ease: "inOutSine" },      // wide bench fills the frame
];

export const OBJECTS = [
  { id: "bench", primitive: "procedural", factory: "bench", procedural: "white lab worktop with a rounded nosing and a pale square-tiled wall behind", position: [0, 0, 0] },
  { id: "stand", primitive: "procedural", factory: "stand", procedural: "retort stand: enamel base plate, steel rod, boss head, clamp arm and jaws", dims: { clampY: 1.58 }, position: STAND_AT },
  { id: "rack", primitive: "procedural", factory: "rack", procedural: "enamel-painted test-tube rack with six slots", position: RACK_AT },
];

// ---------------------------------------------------------------- framing gate (replays the rig; build fails if a subject leaves the safe area)
const REGIONS = [
  { id: "cylinders", pts: boxCorners([-0.92, 0, 0.05], [0.92, 1.0, 0.05]), from: 0, to: at("pour", 0.2), required: true },
  { id: "pour", pts: boxCorners([-1.3, 0.05, 0], [1.3, 1.15, 0]), from: at("pour", 0.9), to: at("pour", 3.6), required: true },
  { id: "beaker+tip", pts: boxCorners([-0.2, 0.06, 0.15], [0.2, 1.16, 0]), from: at("drop", 0.7), to: at("drop", 3.4), required: true },
  { id: "bench", pts: boxCorners([-1.8, 0, -0.56], [1.62, 1.86, 0.1]), from: DURATION - 0.01, to: DURATION, required: true },
];
export const FRAMING = framingReport(REGIONS, CAMERA, { duration: DURATION, drift: S.camera.drift, fov: S.camera.fov, safe: 0.92 });
if (!FRAMING.ok) throw new Error("45-lab-glassware framing: " + JSON.stringify(FRAMING.spans));

// ---------------------------------------------------------------- SCORE (all from the plan's events + BEATS)
const pan = (e) => Math.max(-0.6, Math.min(0.6, (e.x ?? 0) * 0.5));
const M = S.sound.mallet;
const theme = BEATS.flatMap((b, k) => {
  const steps = k === BEATS.length - 1 ? [0, 2, 4, 5] : [k, k + 2];
  return steps.map((s, j) => ({ t: b.t + 0.06 + j * 0.16, type: "chime", dur: 1.3, gain: M.gain * (j ? 0.7 : 0.9), pitch: L.malletPitch(s, M), seed: 900 + k * 10 + j }));
});
const captionCues = LABELS.map((l, k) => ({ t: l.on + 0.05, type: "click", gain: 0.08, pitch: 0.9, seed: 950 + k }));
export const SCORE = [
  // bright, airy daylight bed (brightness is a low-pass cutoff in Hz)
  { t: 0, type: "pad", dur: DURATION, gain: S.sound.bed.gain, root: S.sound.bed.root, chord: S.sound.bed.chord, attack: 1.4, release: 2.0, brightness: S.sound.bed.brightness },
  ...theme,
  ...scoreFromEvents(EVENTS, L.labVoices(S.sound), { pan, seedBase: 101, seedStep: 7 }),
  ...captionCues,
];
export const DUCK = [];
export const NOTES = {
  mechanism: "liquids.js: levels from each vessel's volume-vs-height table; pours tilt the source exactly as far as its remaining volume needs to reach the lip (tiltForLip) and the beaker receives the same volume a fall-time later; mixDyes blends colours (Beer-Lambert); planDrops counts drops, drop 6 flips the colour; SCORE = scoreFromEvents(events(plan)).",
  sample: "All quantities on screen are SAMPLE DATA.",
  volumes: { A: DATA.A, B: DATA.B, beakerUnits: DATA.A + DATA.B, dropUnits: DATA.dropUnits },
  pours: POURS.map((p) => ({ id: p.id, tLift: p.tLift, tFlow: p.tFlow, tEnd: p.tEnd, tDown: p.tDown, thStartDeg: +(p.thStart * 57.2958).toFixed(1), fall: +p.fall.toFixed(3) })),
  drops: DROPS.drops.map((d) => ({ i: d.i, tRel: +d.tRel.toFixed(3), tHit: +d.tHit.toFixed(3), flip: d.flip })),
  framingWorst: FRAMING.worst,
};
