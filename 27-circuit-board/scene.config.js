// scene.config.js — 27-circuit-board: "How a signal moves through a circuit" (input → processor → memory → output)
// as a macro shot of a printed circuit board. Plain data (Node-importable). Units: metres at ×100 macro scale
// (board 6.4 × 3.6 m, top at y = 0), Y-up, seconds. The board layout, the routed traces, the pulse schedule,
// the beats, the camera keys and the SCORE all come from the style's THREE-free planner (signals.js), so the
// sound and the camera are on the picture by construction. No real parts, no part numbers, no brand marks.
import { octiRoute, partPin, planSignals, cameraKeys, signalVoices } from "./_atlas/styles/circuit-board/signals.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";

export const ID = "27-circuit-board";
export const STYLE = "circuit-board";
export const DURATION = 15;
export const FPS = 30;
export const PALETTE = "green";

// ---- parts (board coordinates: x right, z toward the viewer) ----------------------------------------------
export const PARTS = {
  J1: { kind: "header", at: [-2.75, 0.1], pins: 4, axis: "z", ref: "J1", refAt: [0, -0.62] },
  R1: { kind: "resistor", at: [-2.05, 0.227], axis: "x", ref: "R1" },
  U1: { kind: "qfp", at: [-0.75, 0.0], body: [1.0, 1.0, 0.14], perSide: 8, pitch: 0.1, name: "PROCESSOR", ref: "U1" },
  Y1: { kind: "crystal", at: [-0.75, -1.12], axis: "x", ref: "Y1", refAt: [0.42, 0] },
  C1: { kind: "capacitor", at: [-1.3, -1.12], axis: "z", ref: "C1" },
  C2: { kind: "capacitor", at: [-0.2, -1.12], axis: "z", ref: "C2" },
  C3: { kind: "capacitor", at: [-1.65, 0.62], axis: "z", ref: "C3", refAt: [-0.2, 0] },
  C4: { kind: "capacitor", at: [0.25, 0.62], axis: "z", ref: "C4" },
  U2: { kind: "soic", at: [1.35, -0.7], body: [0.86, 0.39, 0.15], perSide: 7, pitch: 0.127, name: "MEMORY", ref: "U2", refAt: [0.6, -0.33] },
  C5: { kind: "capacitor", at: [0.62, -0.78], axis: "z", ref: "C5" },
  R4: { kind: "resistor", at: [1.9, 0.75], axis: "z", ref: "R4", refAt: [-0.17, 0] },
  R5: { kind: "resistor", at: [2.25, 0.75], axis: "z", ref: "R5", refAt: [-0.17, 0] },
  R6: { kind: "resistor", at: [2.6, 0.75], axis: "z", ref: "R6", refAt: [0.17, 0] },
  D1: { kind: "led", at: [1.9, 1.2], axis: "z", ref: "D1", refAt: [-0.17, 0] },
  D2: { kind: "led", at: [2.25, 1.2], axis: "z", ref: "D2", refAt: [-0.17, 0] },
  D3: { kind: "led", at: [2.6, 1.2], axis: "z", ref: "D3", refAt: [0.17, 0] },
};
const pin = (id, side, i) => partPin(PARTS[id], side, i);
const LEDS = ["D1", "D2", "D3"];

// ---- routed signal traces (octilinear; vias flagged) -------------------------------------------------------
const outRoute = (k, z0) => {
  const s = pin("U2", "S", 4 + k), R = PARTS[["R4", "R5", "R6"][k]], D = PARTS[LEDS[k]];
  return octiRoute([s, [s[0], z0], { at: [R.at[0], z0 + (R.at[0] - s[0])], lead: "diag" }, partPin(R, "a"), partPin(D, "a")]);
};
export const ROUTES = {
  in: octiRoute([pin("J1", null, 2), [-2.35, 0.227], partPin(PARTS.R1, "a"), partPin(PARTS.R1, "b"), { at: [-1.72, 0.227], via: true }, [-1.5, -0.25], pin("U1", "W", 1)]),
  bus: octiRoute([pin("U1", "E", 2), { at: [0.4, -0.15], via: true }, [0.969, -0.25], pin("U2", "S", 0)]),
  out0: outRoute(0, -0.18),
  out1: outRoute(1, -0.24),
  out2: outRoute(2, -0.3),
};
// exposed copper with no signal on it (density / realism); most end in a via to another layer
const viaEnd = (pts) => pts.map((p, k) => (k === pts.length - 1 ? { at: p, via: true } : p));
export const DECOR = [
  octiRoute(viaEnd([pin("J1", null, 0), [-2.45, -0.281], [-2.0, -0.73]])),
  octiRoute(viaEnd([pin("J1", null, 1), [-2.42, -0.027]])),
  octiRoute(viaEnd([pin("J1", null, 3), [-2.4, 0.481], [-2.2, 0.68]])),
  octiRoute([pin("U1", "W", 7), [-1.65, 0.35], partPin(PARTS.C3, "a")]),
  octiRoute(viaEnd([pin("U1", "W", 4), [-1.52, 0.05], [-1.62, -0.05]])),
  octiRoute([pin("U1", "N", 2), [-0.9, -0.8], partPin(PARTS.Y1, "a")]),
  octiRoute([pin("U1", "N", 5), [-0.6, -0.8], partPin(PARTS.Y1, "b")]),
  octiRoute(viaEnd([pin("U1", "N", 7), [-0.4, -0.8], [-0.4, -0.9]])),
  octiRoute([pin("U1", "S", 7), [-0.4, 0.82], [0.25, 0.82]]),
  octiRoute([pin("U1", "E", 5), [0.3, 0.15], { at: [1.096, -0.25], lead: "straight" }, pin("U2", "S", 1)]),
  octiRoute([pin("U1", "E", 7), [0.1, 0.35], [0.25, 0.35], partPin(PARTS.C4, "a")]),
  ...[1, 2, 3, 4].map((i) => octiRoute(viaEnd([pin("U2", "N", i), [pin("U2", "N", i)[0], -1.24]]))),
  octiRoute([pin("U2", "N", 0), [0.97, -1.15], [0.62, -1.15], partPin(PARTS.C5, "a")]),
  octiRoute(viaEnd([partPin(PARTS.D1, "b"), [1.9, 1.47], [2.85, 1.47]])),
  octiRoute([partPin(PARTS.D3, "b"), [2.6, 1.47]]),
  octiRoute([partPin(PARTS.D2, "b"), [2.25, 1.47]]),
];

// ---- the signal plan: one pulse per net; each launches a beat after the previous one ARRIVES ------------
const SPEED = 1.35;
export const NETS = [
  { id: "in", route: ROUTES.in, start: 2.15, speed: SPEED, target: "U1", targetKind: "chip" },
  { id: "bus", route: ROUTES.bus, after: "in", delay: 2.05, speed: SPEED, target: "U2", targetKind: "memory" },
  ...[0, 1, 2].map((k) => ({ id: `out${k}`, route: ROUTES[`out${k}`], after: "bus", delay: 1.9, speed: SPEED, target: LEDS[k], targetKind: "led" })),
  // the cycle again, fast, under the final title (quieter)
  { id: "in2", route: ROUTES.in, start: 12.0, speed: 3.4, target: "U1", targetKind: "chip", gain: 0.45, wave: 2 },
  { id: "bus2", route: ROUTES.bus, after: "in2", delay: 0.25, speed: 3.4, target: "U2", targetKind: "memory", gain: 0.45, wave: 2 },
  ...[0, 1, 2].map((k) => ({ id: `out${k}b`, route: ROUTES[`out${k}`], after: "bus2", delay: 0.2, speed: 3.4, target: LEDS[k], targetKind: "led", gain: 0.4, wave: 2 })),
];
export const PLAN = planSignals(NETS);
const arr = PLAN.arrive, lau = PLAN.launch;
const ledOn = Math.max(...[0, 1, 2].map((k) => arr(`out${k}`)));

// ---- beats (derived from the plan) -------------------------------------------------------------------------
export const BEATS = [
  { id: "input", t: 0, dur: lau("in") },                       // J1: a signal arrives at the connector
  { id: "process", t: lau("in"), dur: lau("bus") - lau("in") }, // pulse runs to the processor, which decides
  { id: "memory", t: lau("bus"), dur: lau("out0") - lau("bus") },
  { id: "output", t: lau("out0"), dur: 11.4 - lau("out0") },     // three pulses fan out, LEDs light
  { id: "whole", t: 11.4, dur: DURATION - 11.4 },               // pull back: the whole path, the cycle again
];
const beat = (id) => BEATS.find((b) => b.id === id);

// ---- silkscreen captions (one at a time: printed on arrival, wiped off as the camera leaves) ---------------
export const CAPTIONS = [
  { id: "c1", text: "A SIGNAL ARRIVES", at: [-2.38, 1.0], cap: 0.1, on: 0.55, off: lau("in") + 0.15 },
  { id: "c2", text: "THE CHIP DECIDES", at: [-0.75, 1.12], cap: 0.1, on: arr("in") + 0.15, off: lau("bus") - 0.1 },
  { id: "c3", text: "MEMORY KEEPS IT", at: [1.35, -1.45], cap: 0.1, on: arr("bus") + 0.15, off: lau("out0") - 0.1 },
  { id: "c4", text: "OUTPUT LIGHTS UP", at: [1.85, 1.62], cap: 0.1, on: ledOn + 0.2, off: beat("whole").t + 0.1 },
  { id: "title", text: "INPUT → PROCESS → OUTPUT", at: [-0.65, 1.45], cap: 0.16, on: beat("whole").t + 1.0, off: 99 },
];
export const SIGNAL_IN = { at: CAPTIONS[0].on - 0.15 };           // J1's pin lights: the signal is at the connector
export const THINK = { start: arr("in") + 0.45, step: 0.17, pins: [["E", 0], ["E", 1], ["N", 7], ["S", 7], ["E", 3], ["E", 2]] };

// ---- camera: macro holds on each part, tracking the pulse between them ----------------------------------
export const SHOTS = [
  { t: 0, kind: "hold", focus: [-2.5, 0.05, 0.6], dist: 2.9, az: 16, el: 36, fov: 24 },
  { t: lau("in") + 0.1, blend: 1.0, kind: "track", net: "in", lead: 0.1, dist: 2.5, az: 6, el: 30, fov: 24 },
  { t: arr("in") + 0.05, blend: 1.0, kind: "hold", focus: [-0.75, 0.05, 0.62], dist: 3.0, az: -10, el: 42, fov: 24 },
  { t: lau("bus") + 0.1, blend: 0.9, kind: "track", net: "bus", lead: 0.1, dist: 2.6, az: 2, el: 34, fov: 24 },
  { t: arr("bus") + 0.05, blend: 0.9, kind: "hold", focus: [1.35, 0.05, -1.02], dist: 2.9, az: 14, el: 44, fov: 24 },
  { t: lau("out1") + 0.1, blend: 1.0, kind: "track", net: "out1", lead: 0.1, dist: 2.7, az: 8, el: 36, fov: 24 },
  { t: ledOn + 0.05, blend: 1.0, kind: "hold", focus: [2.02, 0.05, 1.36], dist: 2.8, az: -12, el: 42, fov: 24 },
  { t: beat("whole").t + 0.55, blend: 1.6, kind: "hold", focus: [0.05, 0, 0.12], dist: 8.8, az: 0, el: 52, fov: 24 },
];
export const CAMERA = cameraKeys(SHOTS, PLAN, { t0: 0, t1: DURATION, fps: FPS });

export const OBJECTS = [
  { id: "bench", primitive: "procedural", factory: "bench", procedural: "dark matte work surface 0.51 m below the board top (out of focus)", dims: {} },
];

// ---- sound: every cue derives from the plan / captions -----------------------------------------------------
const sig = scoreFromEvents(PLAN.events, signalVoices({ level: 1 }), { pan: (e) => Math.max(-0.6, Math.min(0.6, e.at[0] / 4)), seedBase: 31 });
export const SCORE = [
  // bed: low dark pad (brightness = low-pass cutoff in Hz) + a quiet mains hum once the processor is powered
  { t: 0, type: "pad", dur: DURATION, root: 55, chord: [0, 7, 12, 15, 19], brightness: 650, attack: 2.0, release: 2.5, gain: 0.85 },
  { t: arr("in"), type: "hum", dur: DURATION - arr("in"), gain: 0.05, seed: 3 },
  // the signal arriving at the connector
  { t: SIGNAL_IN.at, type: "blip", notes: [0, 12], dur: 0.06, pitch: 1.3, gain: 0.22, pan: -0.55 },
  ...sig,
  // processor "thinking": one soft tick per pad flash
  ...THINK.pins.map((p, k) => ({ t: THINK.start + k * THINK.step, type: "tick", pitch: 1.8 + k * 0.12, gain: 0.08, pan: -0.2, seed: 60 + k })),
  // captions printing on (a soft tick) and the final title (low chime + sub)
  ...CAPTIONS.slice(0, 4).map((c, k) => ({ t: c.on, type: "tick", pitch: 0.8, gain: 0.1, seed: 80 + k })),
  { t: CAPTIONS[4].on, type: "chime", dur: 2.8, pitch: 0.5, gain: 0.2, seed: 90 },
  { t: CAPTIONS[4].on, type: "thud", dur: 1.4, pitch: 0.45, gain: 0.45, seed: 91 },
  { t: beat("whole").t, type: "whoosh", dir: "out", dur: 1.6, pitch: 0.45, gain: 0.3, seed: 92 },
];
export const DUCK = [];
export const NOTES = "Board, parts, traces, pulses and captions are built in scene.js from circuit-board props; layout, routes, pulse plan, camera keys and SCORE come from signals.js. Neutral idea, no numbers, no brands.";
