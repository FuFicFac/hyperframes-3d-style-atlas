// scene.config.js — 95-dollhouse-cutaway: "What happens to one question inside an AI system" (style "dollhouse-cutaway").
// Plain data + the style's pure planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). The house layout, the courier's route, every room's light level and mini-animation, the label
// flips and every sound cue come from ONE plan (rooms.js); the picture and SCORE both read it.
// World: x right, y up, z toward the viewer; the house's open front is the plane z = LAYOUT.zF.
import { STYLE_SPEC as S } from "./_atlas/styles/dollhouse-cutaway/spec.js";
import { plan as makePlan } from "./_atlas/styles/dollhouse-cutaway/rooms.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot } from "./_atlas/kit/framing.js";
import { clamp } from "./_atlas/kit/time.js";

export const ID = "95-dollhouse-cutaway";
export const STYLE = "dollhouse-cutaway";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

const built = makePlan(S);
export const LAYOUT = built.layout;
export const PLAN = built.plan;
const ST = S.route.stops;

// ---------------------------------------------------------------- beats = the courier's stops; one label per beat
export const BEATS = ST.map((s, k) => ({
  id: s.room, t: k ? PLAN.switches[k - 1] : 0, dur: (k < ST.length - 1 ? PLAN.switches[k] : DURATION) - (k ? PLAN.switches[k - 1] : 0), label: S.route.labels[k],
}));

// ---------------------------------------------------------------- camera: three framings fitted to the house
const WIN = { x0: -0.92, x1: 0.92, y0: -0.9, y1: 0.9 };
const [BMIN, BMAX] = LAYOUT.box;
const bub = S.courier.bubble, hv = LAYOUT.hover;
const BUBBLE = [[hv[0] - bub[0] / 2 - 0.3, hv[1] - bub[1] / 2 - 0.4, hv[2]], [hv[0] + bub[0] / 2 + 0.3, hv[1] + bub[1] / 2 + 0.3, hv[2]]];
const HOUSE_PTS = { box: [BMIN, BMAX] };
const WITH_BUBBLE = { box: [BMIN, [BMAX[0], Math.max(BMAX[1], BUBBLE[1][1]), BMAX[2]]] };
const shot = (subject, azimuth, elevation, fill) => {
  const k = fitShot(subject, { azimuth, elevation, fov: S.camera.fov, window: WIN, fill });
  return { pos: k.pos, target: k.target, fov: S.camera.fov };
};
const FR = S.route.front, X = S.route.exit;
const CLOSED = shot(HOUSE_PTS, -0.07, 0.07, 0.95);
const OPEN = shot(HOUSE_PTS, 0, 0.05, 0.97);
const CREEP = shot(HOUSE_PTS, 0.035, 0.05, 0.97);
const FINAL = shot(WITH_BUBBLE, 0, 0.06, 0.97);
export const CAMERA = [
  { t: 0, ...CLOSED },
  { t: FR.t1 + 0.2, ...OPEN, path: "arc", ease: "inOutSine" },
  { t: X.tube, ...CREEP, ease: "inOutSine" },
  { t: X.settle + 0.15, ...FINAL, ease: "inOutCubic" },
  { t: DURATION, ...FINAL },
];

// ---------------------------------------------------------------- framing gate: house (with sign) always; bubble once out
export const FRAMING = framingReport([
  { id: "house", box: [BMIN, BMAX], required: true },
  { id: "sign", box: LAYOUT.signBox, required: true },
  { id: "bubble", box: BUBBLE, required: true, from: X.settle, to: DURATION },
], CAMERA, { duration: DURATION, fov: S.camera.fov, safe: 0.92 });
if (!FRAMING.ok && !globalThis.process?.env?.DH_NOGATE) {
  throw new Error(`95-dollhouse-cutaway framing: ${JSON.stringify({ spans: FRAMING.spans.slice(0, 6), worst: FRAMING.worst })}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: every cue from the plan's events
const SND = S.sound;
const pan = (e) => clamp((e.x ?? 0) / 9, -1, 1) * 0.55;
const semi = (k) => 2 ** (k / 12);
const NOTE = SND.chime.steps;
const LAYER = [0, 3, 5, 7];
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: SND.pad.gain, root: SND.pad.root, chord: [0, 7, 12, 16], attack: 1.0, release: 1.5, brightness: SND.pad.brightness },
  { t: S.route.finale.t - 0.3, type: "pad", dur: DURATION - S.route.finale.t + 0.3, gain: SND.padHigh.gain, root: SND.padHigh.root, chord: [0, 4, 7, 11, 14], attack: 0.5, release: 1.2, brightness: SND.padHigh.brightness, seed: 3 },
  ...scoreFromEvents(PLAN.events, {
    hop: () => [{ type: "pop", gain: SND.hop.gain, pitch: 0.75 }],
    land: () => [{ type: "thud", gain: SND.hop.gain, pitch: 1.6, dur: 0.25 }],
    door: () => [{ type: "click", gain: SND.door.gain, pitch: 0.7 }, { type: "fold", gain: SND.door.gain * 0.5, dur: 0.3 }],
    doorShut: () => [{ type: "thud", gain: SND.door.gain, pitch: 1.4, dur: 0.3 }, { type: "click", gain: SND.door.gain * 0.6, pitch: 1.2 }],
    frontOpen: (e) => [{ type: "whoosh", dir: "in", dur: e.dur, gain: SND.front.gain }, { type: "servo", dur: e.dur, hz: 70, hz2: 120, grit: 0.25, gain: SND.front.gain * 0.5 }],
    frontStop: () => [{ type: "thud", gain: SND.thunk.gain, pitch: 0.8 }, { type: "clack", gain: SND.thunk.gain * 0.5, pitch: 0.7 }],
    move: (e) => [{ type: "servo", dur: e.dur, hz: e.lift ? 110 : 95, hz2: e.lift ? 260 : 150, grit: 0.2, gain: SND.move.gain }],
    light: (e) => [
      { type: "click", gain: SND.switch.gain, pitch: 1.1 },
      { type: "marimba", hz: SND.chime.base * semi(NOTE[e.k]), dur: 0.8, gain: SND.chime.gain, mallet: 0.4, offset: 0.04 },
    ],
    stamp: () => [{ type: "clack", gain: SND.action.gain, pitch: 0.75 }, { type: "thud", gain: SND.action.gain * 0.6, pitch: 1.8, dur: 0.2 }],
    chop: (e) => [{ type: "clack", gain: SND.action.gain * 1.1, pitch: 1.25 + e.k * 0.1 }, { type: "tick", gain: SND.action.gain * 0.6, pitch: 2 }],
    book: (e) => [{ type: "blip", gain: SND.action.gain * 0.8, pitch: 1 + e.k * 0.12, notes: [0, 7] }, { type: "paper", gain: SND.action.gain * 0.5, dur: 0.25 }],
    press: (e) => [{ type: "clack", gain: SND.action.gain, pitch: 0.9 }, { type: "marimba", hz: 262 * semi(LAYER[e.k]), dur: 0.5, gain: SND.action.gain * 0.8, mallet: 0.6 }],
    fuse: () => [{ type: "chime", sparkle: true, notes: 5, dur: 1.2, gain: SND.action.gain }],
    tick: () => [{ type: "blip", gain: SND.action.gain, pitch: 1.5, notes: [0, 4, 7] }, { type: "chime", notes: 3, dur: 0.9, gain: SND.action.gain * 0.6, pitch: 1.3 }],
    bounce: (e) => [{ type: "pop", gain: SND.hop.gain, pitch: 1 + e.k * 0.2 }],
    pump: () => [{ type: "squish", gain: SND.action.gain }],
    roll: () => [{ type: "tick", gain: SND.action.gain * 0.5, pitch: 1.4 }],
    launch: (e) => [{ type: "riser", dur: e.dur, gain: SND.out.gain * 0.8 }],
    emerge: () => [{ type: "pop", gain: SND.out.gain, pitch: 1.1 }, { type: "whoosh", dir: "out", dur: 0.5, gain: SND.out.gain * 0.6 }],
    bubble: () => [{ type: "chime", sparkle: true, notes: 6, dur: 1.6, gain: SND.finale.gain }],
    finale: () => [{ type: "chime", notes: 6, dur: 2.2, gain: SND.finale.gain * 0.7, pitch: 0.75 }],
    ripple: (e) => [{ type: "click", gain: SND.switch.gain * 0.7, pitch: 1.3 + e.k * 0.05 }],
    flip: () => [{ type: "clack", gain: SND.flip.gain, pitch: 1.7 }],
  }, { seedBase: 101, pan }),
];
export const DUCK = [];
export const NOTES = {
  mechanism: "rooms.js plans the house (room boxes, lamps, track points) and the courier's route (stops, legs, train spacing, hops); every room's light level, every mini-animation pulse, the front-wall angle, the label flips and every SCORE cue are pure functions of t read from that one plan. style.js draws the whole house with one unlit shader indexed by room.",
  stops: ST.map((s) => `${s.room} ${s.arrive}-${s.leave}`).join(", "),
  events: PLAN.events.length,
  framing: FRAMING.ok ? `ok (worst ${JSON.stringify(FRAMING.worst?.ndc ?? FRAMING.worst)} at ${FRAMING.worst?.t}s)` : "FAILS",
};
