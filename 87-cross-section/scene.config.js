// scene.config.js — 87-cross-section: "Opening the black box" (style "cross-section").
// Plain data + the style's pure planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). The slicing plane (PLANE keys), the first-touch time of every solid (CUTS) and the signal that
// runs through the model (FLOW) are planned here once; the picture and SCORE both read them.
// World: x = direction of flow (tokens in on the left, answer out on the right), y up, z toward the viewer.
import { STYLE_SPEC as S } from "./_atlas/styles/cross-section/spec.js";
import { blackBoxModel, cutEvents, flowPlan, planeAt, sideOf, onPlane } from "./_atlas/styles/cross-section/slice.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot } from "./_atlas/kit/framing.js";
import { clamp } from "./_atlas/kit/time.js";

export const ID = "87-cross-section";
export const STYLE = "cross-section";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (focus = part group, anchor = model anchor)
export const BEATS = [
  { id: "box", t: 0, dur: 2.6, label: "What happens inside?" },
  { id: "cut", t: 2.6, dur: 3.0, label: "Slice it open" },
  { id: "tokens", t: 5.6, dur: 2.4, label: "Tokens come in", focus: 1, anchor: "tokens" },
  { id: "layers", t: 8.0, dur: 2.4, label: "Layers transform them", focus: 2, anchor: "layers" },
  { id: "answer", t: 10.4, dur: 2.2, label: "An answer comes out", focus: 3, anchor: "answer" },
  { id: "end", t: 12.6, dur: 2.4, label: "Structure, not magic" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({
  text: b.label, focus: b.focus ?? 0, anchor: b.anchor ?? null,
  on: b.t + (i ? 0.06 : 0.2), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.3 : Infinity,
}));

// ---------------------------------------------------------------- the model and the plane
export const MODEL = blackBoxModel(S.model, S.palette);
export const CUT_DONE = B.tokens.t - 0.2;
export const PLANE = [
  { t: 0, d: 5.9, yaw: -0.7, pitch: 0.09 },                                   // the sheet glides in from the front left
  { t: B.cut.t, d: 3.5, yaw: -0.7, pitch: 0.09, ease: "linear" },             // ...and touches the corner
  { t: B.cut.t + 0.7, d: 2.75, yaw: -0.66, pitch: 0.09, ease: "linear" },     // through the wall
  { t: CUT_DONE, d: 0.26, yaw: -0.05, pitch: 0.09, ease: "outSine" },         // the cut: diagonal, squaring up as it goes
  { t: B.end.t, d: -0.25, yaw: -0.05, pitch: 0.09, ease: "linear" },          // then it creeps deeper while we read
  { t: DURATION, d: -0.25, yaw: -0.05, pitch: 0.09 },
];
export const CUTS = cutEvents(MODEL.prims, PLANE, { origin: MODEL.origin, t1: DURATION });
export const CONTACT = CUTS.find((e) => e.kind === "shell").t;      // the plane touches the shell
export const REVEAL = CUTS.find((e) => e.group > 0).t;              // the first coloured part is cut

// ---------------------------------------------------------------- the signal (a band of light along x) + what shows outside
export const FLOW = flowPlan({
  starts: [0.15, 1.95, 3.75, B.tokens.t + 0.3, B.layers.t - 0.25, B.layers.t + 1.45, B.answer.t + 0.8, B.end.t + 0.4],
  travel: 1.5, x0: MODEL.flowX[0], x1: MODEL.flowX[1], hold: 0.8, stops: MODEL.stops,
});

// ---------------------------------------------------------------- camera: wide-ish 3/4 -> square to the cut -> final
const WIN = { x0: -0.94, x1: 0.94, y0: -0.62, y1: 0.93 }; // the caption band lives below y0
const [BMIN, BMAX] = MODEL.box;
const shot = (azimuth, elevation, fill, zFront = BMAX[2]) => {
  // once the front is cut away the subject is what is LEFT: fit the box only up to zFront
  const k = fitShot({ box: [BMIN, [BMAX[0], BMAX[1], zFront]] }, { azimuth, elevation, fov: S.camera.fov, window: WIN, fill });
  return { pos: k.pos, target: k.target, fov: S.camera.fov };
};
const OPEN0 = shot(-0.62, 0.32, 0.86), OPEN = shot(-0.52, 0.3, 0.94), CUT = shot(-0.27, 0.2, 0.98, 0.55), END = shot(-0.15, 0.17, 1.0, 0.1);
export const CAMERA = [
  { t: 0, ...OPEN0 },
  { t: B.cut.t + 0.2, ...OPEN, path: "arc", ease: "inOutSine" },
  { t: CUT_DONE, ...CUT, path: "arc", ease: "inOutSine" },
  { t: B.end.t, ...CUT },
  { t: B.end.t + 1.4, ...END, path: "arc", ease: "inOutSine" },
  { t: DURATION, ...END },
];

// ---------------------------------------------------------------- framing gate: what is left of the box stays inside the window
// (the 8 corners; a corner on the removed side of the plane is moved onto the plane)
const CORNERS = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [i & 1 ? BMAX[0] : BMIN[0], i & 2 ? BMAX[1] : BMIN[1], i & 4 ? BMAX[2] : BMIN[2]]);
const kept = (t) => { const pl = planeAt(PLANE, t, MODEL.origin); return CORNERS.map((c) => (sideOf(c, pl) > 0 ? onPlane(c, pl) : c)); };
export const FRAMING = framingReport([{ id: "box", pts: kept, required: true }], CAMERA, { duration: DURATION, fov: S.camera.fov, window: { x0: -0.96, x1: 0.96, y0: -0.66, y1: 0.96 } });
if (!FRAMING.ok && !globalThis.process?.env?.XS_NOGATE) {
  throw new Error(`87-cross-section framing: ${JSON.stringify({ spans: FRAMING.spans.slice(0, 6), worst: FRAMING.worst })}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: every cue from BEATS / CUTS / FLOW
const SND = S.sound;
const pan = (e) => clamp((e.x ?? 0) / 3.2, -1, 1) * 0.6;
const open = (t) => t >= REVEAL; // before the reveal the machine is heard through the wall: low and dull
const NOTE = [0, 3, 5, 7, 10];   // one step per layer
const hz = (semi) => 262 * 2 ** (semi / 12);
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: SND.pad.gain, root: SND.pad.root, chord: [0, 7, 12, 16], attack: 1.2, release: 1.6, brightness: SND.pad.brightness },
  { t: 0, type: "hum", dur: DURATION, gain: SND.hum.gain, hz: SND.hum.hz },
  { t: 0, type: "servo", dur: CONTACT, hz: 62, hz2: 104, grit: 0.12, gain: SND.approach.gain, seed: 3 },
  { t: CONTACT - 1.1, type: "riser", dur: 1.1, gain: SND.slice.gain * 0.7, seed: 4 },
  { t: CONTACT, type: "thud", gain: SND.contact.gain, pitch: 1.25, seed: 5 },
  { t: CONTACT, type: "whoosh", dir: "out", dur: CUT_DONE - CONTACT, gain: SND.slice.gain, seed: 6 },
  { t: REVEAL, type: "chime", sparkle: true, notes: 6, dur: 1.6, gain: SND.reveal.gain, seed: 7 },
  // one tick per solid, the moment the plane first touches it
  ...scoreFromEvents(CUTS.filter((e) => e.kind !== "shell"), {
    token: () => [{ type: "tick", gain: SND.cutTick.gain, pitch: 1.5 }],
    wire: () => [{ type: "tick", gain: SND.cutTick.gain * 0.6, pitch: 2.2 }],
    neuron: () => [{ type: "tick", gain: SND.cutTick.gain * 0.7, pitch: 1.9 }],
    layer: () => [{ type: "clack", gain: SND.cutTick.gain * 1.6, pitch: 0.9 }],
    answer: () => [{ type: "clack", gain: SND.cutTick.gain * 1.8, pitch: 1.3 }],
    core: () => [{ type: "tick", gain: SND.cutTick.gain, pitch: 2.6 }],
  }, { seedBase: 101, pan }),
  // the signal: a step per layer, a bell when the answer lands (dull thumps while the box is still closed)
  ...scoreFromEvents(FLOW.events, {
    token: (e) => [{ type: "blip", gain: open(e.t) ? SND.flow.open * 0.8 : SND.flow.muffled, pitch: open(e.t) ? 2 : 0.5, notes: [0, 7] }],
    layer: (e) => [{ type: "marimba", gain: open(e.t) ? SND.flow.open : SND.flow.muffled, hz: hz(NOTE[e.i % NOTE.length]) * (open(e.t) ? 1 : 0.5), dur: 0.5, mallet: open(e.t) ? 0.5 : 0.15 }],
    answer: (e) => (open(e.t) ? [{ type: "chime", gain: SND.answer.open, dur: 1.1, notes: 3, pitch: 1.2 }] : [{ type: "pop", gain: SND.answer.muffled, pitch: 0.7 }]),
  }, { seedBase: 701, pan }),
  { t: B.end.t + 0.1, type: "chime", gain: SND.end.gain, dur: 2.2, notes: 5, seed: 9 },
];
export const DUCK = [];
export const NOTES = {
  mechanism: "slice.js plans the plane (offset + yaw + pitch from eased keys) and the first-touch time of every solid; style.js clips every mesh at the plane and paints the cut faces on one quad in the plane from the same primitive list (signed distance functions).",
  solids: MODEL.prims.length,
  contact: CONTACT, reveal: REVEAL, cutTicks: CUTS.length, flowEvents: FLOW.events.length,
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst?.ndc} at ${FRAMING.worst?.t}s)` : "FAILS",
};
