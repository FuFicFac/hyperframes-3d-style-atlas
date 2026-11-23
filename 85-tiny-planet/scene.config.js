// scene.config.js — 85-tiny-planet: "A model builds its world from what it reads" (style "tiny-planet").
// Plain data + the style's pure globe planner. No THREE, no window: imported by scene.js (browser) and by
// render-sfx / export-spec (Node). Places are [lat, lon] in degrees on the globe (lon 0 faces the camera at spin 0,
// +lon is to the right). The plan proves three things here, in Node, and the build fails if one is false:
//   1. before the turn, the visible disc shows no unread ground (the "before" does not give the reveal away);
//   2. after the turn, most of the visible disc is still bare (the reveal);
//   3. by the end every place has been read and every feature has appeared (the finished planet).
import { STYLE_SPEC as S } from "./_atlas/styles/tiny-planet/spec.js";
import { createPlan, planetVoices } from "./_atlas/styles/tiny-planet/globe.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport } from "./_atlas/kit/framing.js";

export const ID = "85-tiny-planet";
export const STYLE = "tiny-planet";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats
const TURN = { t: 8.4, dur: 1.9, deg: 112, ease: "inOutCubic" };
export const BEATS = [
  { id: "blank", t: 0, dur: 2.0, label: "A model starts blank" },
  { id: "read", t: 2.0, dur: 3.6, label: "Text rains in. Land rises." },
  { id: "life", t: 5.6, dur: 3.4, label: "More reading, more world" },
  { id: "turn", t: 9.0, dur: 2.5, label: "It only knows what it read" },
  { id: "more", t: 11.5, dur: 3.5, label: "Keep reading. It fills in." },
];
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.05 : 0.15), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.3 : Infinity }));

// ---------------------------------------------------------------- the world (content of this demo)
export const WORLD = {
  nearPole: [0, 0], nearCap: 110, edgeNoise: 4,          // reads before the turn reach only this cap; the rest is the far side
  spin: { deg0: -18, rate: 3.6, turns: [TURN] },
  continents: [
    { at: [12, 8], r: 40, amp: 1.0 },      // the main continent, faces the camera in the first half
    { at: [26, -88], r: 25, amp: 0.95 },   // west: swings into view (already grown, lamps on) during the turn
    { at: [-40, -38], r: 21, amp: 0.9 },
    { at: [46, 82], r: 15, amp: 0.9 },
    { at: [-18, 72], r: 13, amp: 0.85 },
    { at: [6, 208], r: 38, amp: 1.0 },     // the far continent: bare until the last beat
    { at: [-36, 152], r: 19, amp: 0.9 },
    { at: [42, 162], r: 15, amp: 0.9 },
  ],
  towns: [
    { id: "main", at: [14, 13], r: 13, houses: 22, tower: true },
    { id: "west", at: [27, -91], r: 9, houses: 10, tower: false },
    { id: "far", at: [9, 236], r: 12, houses: 18, tower: true },
  ],
  roads: [
    [[14, 13], [2, -6], [-6, -18]],
    [[14, 13], [30, 24], [38, 40]],
    [[14, 13], [10, 34]],
    [[27, -91], [18, -74]],
    [[9, 236], [4, 214], [14, 196]],
    [[9, 236], [-8, 244]],
  ],
  reads: [
    // beat 2: land (near side)
    { id: "n0", kind: "land", side: "near", at: [4, -40], t: 1.55, dur: 2.4, reach: 78 },
    { id: "n1", kind: "land", side: "near", at: [10, 0], t: 2.1, dur: 3.0, reach: 126 },
    { id: "n2", kind: "land", side: "near", at: [-30, -50], t: 2.2, dur: 2.2, reach: 72 },
    { id: "n3", kind: "land", side: "near", at: [35, 55], t: 2.6, dur: 2.2, reach: 70 },
    { id: "n4", kind: "land", side: "near", at: [40, -78], t: 3.0, dur: 2.0, reach: 62 },
    { id: "n5", kind: "land", side: "near", at: [-25, 70], t: 3.3, dur: 2.0, reach: 62 },
    // beat 3: life (near side)
    { id: "l1", kind: "life", side: "near", at: [14, 13], t: 5.5, dur: 2.6, reach: 128 },
    { id: "l2", kind: "life", side: "near", at: [-30, -40], t: 5.9, dur: 1.8, reach: 72 },
    { id: "l3", kind: "life", side: "near", at: [35, 58], t: 6.3, dur: 1.8, reach: 66 },
    { id: "l4", kind: "life", side: "near", at: [27, -91], t: 6.7, dur: 1.4, reach: 50 },
    // beat 5: the far side, land then life in quick succession
    { id: "f1", kind: "land", side: "far", at: [0, 196], t: 11.5, dur: 1.6, reach: 94 },
    { id: "f2", kind: "land", side: "far", at: [-30, 156], t: 11.8, dur: 1.2, reach: 56 },
    { id: "f3", kind: "land", side: "far", at: [25, 234], t: 12.05, dur: 1.2, reach: 56 },
    { id: "g1", kind: "life", side: "far", at: [9, 236], t: 12.4, dur: 1.5, reach: 132 },
    { id: "g2", kind: "life", side: "far", at: [0, 190], t: 12.8, dur: 1.1, reach: 72 },
  ],
  clouds: 9,
  finale: 13.9,
};

// ---------------------------------------------------------------- the one plan
export const PLAN = createPlan({ spec: S, world: WORLD, end: DURATION });

// ---------------------------------------------------------------- camera: locked, one push-in at the end
const FOV = S.camera.fov;
const WIDE = { pos: [0, 1.1, 14.2], target: [0, 0.24, 0], fov: FOV };
const CLOSE = { pos: [0, 0.95, 9.9], target: [0, 0.2, 0], fov: FOV };
export const CAMERA = [
  { t: 0, ...WIDE },
  { t: 12.3, ...WIDE },
  { t: 14.3, ...CLOSE, ease: "inOutSine" },
  { t: DURATION, ...CLOSE },
];

// ---------------------------------------------------------------- proofs (Node): framing + what the viewer can see
const Rg = S.globe.R + 0.25;
export const FRAMING = framingReport([
  { id: "globe", pts: [[-Rg, 0, 0], [Rg, 0, 0], [0, -Rg, 0], [0, Rg, 0]], from: 0, to: 12.3, required: true },
], CAMERA, { duration: DURATION, drift: S.camera.drift, fov: FOV, safe: 0.98 });
const tEnd = TURN.t + TURN.dur;
export const SEEN = {
  beforeTurn: Math.max(...[6.4, 7, 7.6, 8.2, TURN.t].map((t) => PLAN.bareVisible(t))),   // must be ~0
  afterTurn: PLAN.bareVisible(tEnd + 0.3),                                                 // must be large
  atEnd: PLAN.bareVisible(DURATION - 0.3),                                                 // must be 0
};
const C = PLAN.coverage;
if (!globalThis.process?.env?.TP_NOGATE) {
  if (!FRAMING.ok) throw new Error(`85-tiny-planet framing: ${JSON.stringify(FRAMING.spans.slice(0, 4))}`);
  if (SEEN.beforeTurn > 0.004) throw new Error(`85-tiny-planet: unread ground visible before the turn (${SEEN.beforeTurn.toFixed(3)})`);
  if (SEEN.afterTurn < 0.5) throw new Error(`85-tiny-planet: the reveal shows too little bare ground (${SEEN.afterTurn.toFixed(3)})`);
  if (SEEN.atEnd > 0 || C.unreached > 0 || C.lastFeature > DURATION - 0.25) throw new Error(`85-tiny-planet: the planet is not finished at the end ${JSON.stringify({ SEEN, C })}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events
export const EVENTS = PLAN.events();
export const SCORE = scoreFromEvents(EVENTS, planetVoices(S.sound), { seedBase: 185, pan: (e) => e.pan ?? 0 });
export const DUCK = [];
export const NOTES = {
  mechanism: "globe.js: everything is [lat, lon] on the globe. Word-chip streams land at a place; a front spreads from each landing (outQuad) and the closed-form arrival time at each vertex / facet / tree / house / road sample drives rise, colour and pop. Reads reach only their own cap, so the far side stays bare until the last beat.",
  seen: `bare share of the visible disc: before the turn ${SEEN.beforeTurn.toFixed(3)}, after it ${SEEN.afterTurn.toFixed(2)}, at the end ${SEEN.atEnd.toFixed(3)}`,
  counts: `${PLAN.trees.length} trees, ${PLAN.houses.length} houses, ${PLAN.lamps.length} lamps, ${PLAN.roads.length} roads, ${PLAN.clouds.length} clouds, ${PLAN.chips.length} word chips in ${PLAN.reads.length} streams`,
  coverage: `last land ${C.lastLand.toFixed(2)} s, last feature ${C.lastFeature.toFixed(2)} s, unreached ${C.unreached}`,
  framing: FRAMING.ok ? "ok (globe inside the frame until the final push-in, which crops the poles on purpose)" : "FAILS",
  numbers: "no data shown; toy scale (the globe is 6 m across)",
};
