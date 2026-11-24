// scene.config.js — 124-ct-scan: "Slice by slice" — a CT scan of a sealed box (style "ct-scan").
// Plain data + the style's pure planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). The SAME plan gives the picture and the sound: the whirr follows the scan line, a tick per slice
// drawn, soft flips as the slices peel, a run of snaps as the stack closes, a chord when the robot appears, dial clicks
// and a ratchet per quarter turn of the key.
// World: the scanner ring stands at x = -2 (left), the panel floats at x = 0.3 (behind, high), the reconstruction
// plinth stands at x = 0.45 in front of it. The volume's local frame: origin at the box's bottom centre, robot faces +z.
import { STYLE_SPEC as S } from "./_atlas/styles/ct-scan/spec.js";
import { createPlan, fingerprint, BOX, panelLayout } from "./_atlas/styles/ct-scan/volume.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot, pxRect } from "./_atlas/kit/framing.js";

export const ID = "124-ct-scan";
export const STYLE = "ct-scan";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (storyboard 124: times + labels verbatim)
export const BEATS = [
  { id: "box", t: 0, dur: 2.6, label: "What is in the sealed box?" },
  { id: "slice", t: 2.6, dur: 3.4, label: "X-rays take one thin slice" },
  { id: "stack", t: 6.0, dur: 3.0, label: "Many thin slices, stacked" },
  { id: "shape", t: 9.0, dur: 3.0, label: "Together: the hidden shape" },
  { id: "metal", t: 12.0, dur: 3.0, label: "Dial it: see only metal" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
// exactly one label at all times: at a beat change the old label rolls UP and out of the plate while the new one rolls
// in from below (never side by side, never two texts over each other). The roll (S.caption.roll s, a quick expo
// crossing) ends just after the beat start, so the new label is fully in by b.t + LAG.
const ROLL = S.caption.roll, LAG = 0.05;
export const labelAt = (t) => {
  let i = 0;
  while (i + 1 < BEATS.length && t >= BEATS[i + 1].t - ROLL + LAG) i++;
  const b = BEATS[i];
  if (i > 0 && t < b.t + LAG) {
    const u = (t - (b.t - ROLL + LAG)) / ROLL;
    return { a: BEATS[i - 1].label, b: b.label, u: Math.min(1, Math.max(0, u)) };
  }
  return { a: b.label, b: "", u: 0 };
};

// ---------------------------------------------------------------- the plan (volume.js)
const SC = S.scanner, PN = S.panel, PL = S.plinth;
const LAYOUT = panelLayout(PN, BOX);
const panelW = LAYOUT.outerW, panelH = LAYOUT.outerH;
const y0 = PL.h + PL.table;                                   // turntable top
const ROW = [PL.c[0], y0 + BOX.w / 2 + 0.004, PL.c[2]];        // centre of the closed lying block
export const PLAN = createPlan({
  duration: DURATION,
  box: { scanY: SC.scanY, t0: 0.25, t1: 4.2, stop: 0.5 },
  slices: { n: 20, top: 0.625, bottom: 0.03 },   // from the head (eyes + ears) down to the feet
  panel: { c: PN.c, layout: LAYOUT },
  // each slice draws in large in the hero view, then shrinks into its thumbnail: slow first, accelerating
  draw: { t0: 2.62, gaps: [0.65, 0.42, 0.32, 0.24, 0.17], step: 0.095, durs: [0.45, 0.3, 0.25, 0.2, 0.16], dur: 0.09, lastHold: 0.55, toCell: 0.3, heroZoom: 1.3 },
  peel: { t0: 6.05, step: 0.03, swing: 0.32, fly: 0.75, bulge: 0.14 },
  row: { c: ROW, spread: 1.8 },
  close: { t0: 9.0, step: 0.027, dur: 0.16 },
  fade: { t0: 9.55, dur: 0.55 },
  reveal: 9.8,
  tip: { t0: 10.15, dur: 0.8, lift: 0.2 },
  turn: { t0: 10.95, t1: 15.0, from: 0, to: -1.3 },
  panelLift: { t0: 6.9, dur: 1.3, dy: 2.4 },
  dial: [{ t0: 12.35, dur: 0.5 }, { t0: 13.05, dur: 0.55 }],
  dialShow: { t0: 11.95, dur: 0.3 },
  key: { t0: 12.4, ramp: 0.8, rate: 0.45 },
  moves: { toPanel: { t: 2.1, dur: 0.75 }, swing: { t: 8.0, dur: 0.95 } },
  bake: S.bake,
});
// The plan runs in Node (sound) and in the page (picture); its event times and the baked volume must agree.
// Recorded from this code in Node and headless Chrome; any other value fails here in BOTH environments.
export const PLAN_HASH = "6fcfec7d-2a789642";
export const PLAN_HASH_NOW = fingerprint(PLAN);
if (typeof globalThis.window !== "undefined") globalThis.window.__ctHash = PLAN_HASH_NOW;
if (PLAN_HASH_NOW !== PLAN_HASH && !globalThis.process?.env?.CT_RECORD) {
  throw new Error(`124-ct-scan: plan hash ${PLAN_HASH_NOW} != recorded ${PLAN_HASH} (${typeof globalThis.window !== "undefined" ? "browser" : "node"})`);
}

// ---------------------------------------------------------------- camera: one move per beat, still holds
const fov = S.camera.fov;
const shot = (sub, o) => { const s = fitShot(sub, { fov, ...o }); return { pos: s.pos, target: s.target, fov }; };
const sx = SC.pos[0], sz = SC.pos[2];
// the box incl. its label (which sits 0.1-0.27 m up the front face): it must stay clear of the caption
const boxAt = (t) => { const b = PLAN.boxY(t) + 0.08; return { box: [[sx - BOX.w / 2, b, sz - BOX.d / 2], [sx + BOX.w / 2, PLAN.boxY(t) + BOX.h, sz + BOX.d / 2]] }; };
// subjects stay above the caption plate (its top is at y = 858 px, NDC -0.59) and inside the 5 % margin
const CAPWIN = { x0: -0.9, x1: 0.9, y0: -0.53, y1: 0.9 };
// beat 1: the box large, the ring cropping the frame (camera front-right, a little above the scan plane)
// (the whole box incl. its printed label, which sits low on the front face, stays above the caption)
const BOX0 = shot({ box: [[sx - 0.36, 0.25, sz - 0.3], [sx + 0.36, 1.12, sz + 0.3]] }, { azimuth: 0.42, elevation: 0.22, fill: 0.98, window: { x0: -0.9, x1: 0.9, y0: -0.5, y1: 0.9 } });
const BOX1 = shot({ box: [[sx - 0.36, 0.62, sz - 0.3], [sx + 0.36, 1.5, sz + 0.3]] }, { azimuth: 0.36, elevation: 0.22, fill: 0.98, window: { x0: -0.9, x1: 0.9, y0: -0.5, y1: 0.9 } });
// beat 2: the panel head-on, above the caption band
const PANEL = shot({ box: [[PN.c[0] - panelW / 2, PN.c[1] - panelH / 2, PN.c[2]], [PN.c[0] + panelW / 2, PN.c[1] + panelH / 2, PN.c[2]]] }, { azimuth: 0, elevation: 0, fill: 1.0, window: { x0: -0.92, x1: 0.92, y0: -0.55, y1: 0.9 } });
// beat 3: the spaced row edge-on (level, head-on), then at an angle
const rowSpan = (t) => { let a = Infinity, b = -Infinity; for (let k = 0; k < PLAN.heights.length; k++) { const x = PLAN.rowX(k, t); a = Math.min(a, x); b = Math.max(b, x); } return [a, b]; };
const [rx0, rx1] = rowSpan(8.0);
const ROWBOX = { box: [[rx0 - 0.01, y0, ROW[2] - BOX.d / 2], [rx1 + 0.01, y0 + BOX.w + 0.01, ROW[2] + BOX.d / 2]] };
const EDGE = shot(ROWBOX, { azimuth: 0, elevation: 0.0, fill: 0.92, window: CAPWIN });
const ANGLE = shot(ROWBOX, { azimuth: -0.62, elevation: 0.1, fill: 0.98, window: CAPWIN });
// beat 4: the closed lying block, then the upright volume (with the turntable)
const x0 = ROW[0] - BOX.h / 2;
const LYING = shot({ box: [[x0, y0, ROW[2] - BOX.d / 2], [x0 + BOX.h, y0 + BOX.w, ROW[2] + BOX.d / 2]] }, { azimuth: -0.6, elevation: 0.09, fill: 0.95, window: CAPWIN });
const UP = shot({ box: [[ROW[0] - BOX.w / 2, y0 + 0.02, ROW[2] - BOX.d / 2], [ROW[0] + BOX.w / 2, y0 + BOX.h, ROW[2] + BOX.d / 2]] }, { azimuth: -0.6, elevation: 0.07, fill: 1.0, window: { x0: -0.9, x1: 0.9, y0: -0.53, y1: 0.94 } });
// beat 5: push in on the turning metal — both gears, their axles and the key (shaft + bow sweep) fill the frame (as turned at 14.6 s)
const yawEnd = PLAN.turnAt(14.6);
const metalPts = [];
for (const [gx, gy, R] of [[-0.043, 0.37, 0.07], [0.0493, 0.3335, 0.046]]) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const z of [0.015, 0.037]) metalPts.push([gx + dx * R, gy + dy * R, z]);
for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const z of [-0.176, -0.248]) metalPts.push([-0.043 + dx * 0.083, 0.37 + dy * 0.083, z]);
metalPts.push([-0.043, 0.37, 0.07], [0.0493, 0.3335, 0.07]);
const upper = metalPts.map(([lx, ly, lz]) => {
  const c = Math.cos(yawEnd), s = Math.sin(yawEnd);
  return [ROW[0] + c * lx + s * lz, y0 + 0.004 + ly, ROW[2] - s * lx + c * lz];
});
const METAL = shot({ pts: upper }, { azimuth: -0.6, elevation: 0.05, fill: 0.92, window: { x0: -0.86, x1: 0.86, y0: -0.48, y1: 0.86 } });
export const SHOTS = { BOX0, BOX1, PANEL, EDGE, ANGLE, LYING, UP, METAL };
export const CAMERA = [
  { t: 0, ...BOX0 },
  { t: 2.1, ...BOX1, ease: "inOutSine" },
  { t: 2.85, ...PANEL, ease: "inOutCubic" },
  { t: 6.35, ...PANEL },
  { t: 7.75, ...EDGE, ease: "inOutCubic" },
  { t: 8.0, ...EDGE },
  { t: 8.95, ...ANGLE, ease: "inOutCubic", path: "arc" },
  { t: 9.05, ...ANGLE },
  { t: 9.8, ...LYING, ease: "inOutCubic" },
  { t: 10.15, ...LYING },
  { t: 11.0, ...UP, ease: "inOutCubic" },
  { t: 12.2, ...UP },
  { t: 14.3, ...METAL, ease: "inOutSine" },
  { t: DURATION, ...METAL },
];

// ---------------------------------------------------------------- framing check (camera replay; kit/framing.js)
const C = S.caption;
const plateW = (label) => Math.round(C.h * 0.98 + 0.56 * (C.cap / C.capRatio) * label.length);
export const CAPTION_RECT = pxRect(C.x + 6, C.y + 6, Math.max(...BEATS.map((b) => plateW(b.label))), C.h + 10);
const CAPTION_KEEPOUT = BEATS.map((b, i) => ({ id: `caption${i + 1}`, ...pxRect(C.x + 6, C.y + 6, plateW(b.label), C.h + 10), from: b.t, to: b.t + b.dur }));
export const FRAMING = framingReport((t) => {
  const R = [];
  if (t < 2.2) R.push({ id: "box", ...boxAt(t) });
  if (t >= 2.85 && t < 6.35) R.push({ id: "panel", box: [[PN.c[0] - panelW / 2 + PN.bezel, PN.c[1] - panelH / 2 + PN.bezel, PN.c[2]], [PN.c[0] + panelW / 2 - PN.bezel, PN.c[1] + panelH / 2 - PN.bezel, PN.c[2]]] });
  if (t >= 7.75 && t < 9.0) { const [a, b] = rowSpan(t); R.push({ id: "row", box: [[a, y0, ROW[2] - BOX.d / 2], [b, y0 + BOX.w, ROW[2] + BOX.d / 2]] }); }
  if (t >= 11.0 && t < 12.2) R.push({ id: "volume", box: [[ROW[0] - BOX.w / 2, y0 + 0.03, ROW[2] - BOX.d / 2], [ROW[0] + BOX.w / 2, y0 + BOX.h, ROW[2] + BOX.d / 2]] });
  if (t >= 14.3) R.push({ id: "metal", pts: upper });
  return R;
}, CAMERA, { duration: DURATION, drift: S.camera.drift, fov, window: { x0: -1.0, x1: 1.0, y0: -1.0, y1: 1.0 }, keepOut: CAPTION_KEEPOUT });
if (!FRAMING.ok && !globalThis.process?.env?.CT_NOGATE) {
  throw new Error(`124-ct-scan framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events
const SND = S.sound;
const n = PLAN.heights.length;
const VOICES = {
  glide: (e) => [{ type: "whoosh", dir: "in", dur: e.dur, pitch: 0.55, q: 0.8, gain: 0.22 }, { type: "servo", dur: e.dur + 0.3, hz: 70, hz2: 95, grit: 0.1, gain: 0.16 }],
  scanOn: () => [{ type: "blip", dur: 0.07, notes: [0, 7, 12], pitch: 1.0, gain: 0.2 }],
  scan: (e) => [{ type: "whir", dur: e.dur, hz: SND.whir.hz, hz2: SND.whir.hz2, gain: SND.whir.gain }],
  scanOff: () => [{ type: "blip", dur: 0.07, notes: [12, 7], pitch: 1.0, gain: 0.14 }],
  toPanel: (e) => [{ type: "whoosh", dir: "in", dur: e.dur, pitch: 0.8, gain: 0.2 }],
  draw: (e) => e.first
    ? [{ type: "blip", dur: 0.09, notes: [0, 5], pitch: 1.2, gain: 0.22 }, { type: "tick", dur: 0.03, pitch: 1.6, gain: SND.tick.gain }]
    : [{ type: "tick", dur: 0.03, pitch: 1.7 - (0.6 * e.k) / (n - 1), gain: SND.tick.gain * 0.85 }],
  peel: (e) => (e.k % 2 === 0 ? [{ type: "paper", dur: 0.2, density: 0.25, pitch: 1.3, gain: 0.1 }] : []),
  land: (e) => [{ type: "click", dur: 0.02, pitch: 1.4 + 0.02 * e.k, gain: 0.08 }],
  swing: (e) => [{ type: "whoosh", dir: "in", dur: e.dur, pitch: 0.7, q: 0.9, gain: 0.18 }],
  close: (e) => [{ type: "whoosh", dir: "in", dur: e.dur + 0.1, pitch: 0.9, q: 1.2, gain: 0.26 }],
  snap: (e) => [{ type: "tick", dur: 0.03, pitch: 1.1 + 0.035 * (n - 2 - e.k), gain: SND.snap.gain }],
  reveal: () => [
    { type: "chime", dur: 2.4, pitch: 1.0, gain: SND.chord.gain },
    { type: "pad", dur: 3.6, root: 220, chord: [0, 4, 7, 11, 14], brightness: 2200, attack: 0.35, release: 1.6, gain: 0.32, bus: "sfx" },
  ],
  tip: (e) => [{ type: "whoosh", dir: "in", dur: e.dur, pitch: 0.65, gain: 0.18 }],
  stand: () => [{ type: "thud", dur: 0.35, pitch: 0.9, gain: 0.45 }],
  fade: (e) => [{ type: "whoosh", dir: "out", dur: 0.7, pitch: e.i === 0 ? 0.8 : 1.1, gain: 0.2 }],
  detent: (e) => [{ type: "click", dur: 0.025, pitch: 1.0 + 0.12 * e.j + 0.2 * e.i, gain: SND.dial.gain }],
  metal: () => [{ type: "chime", dur: 1.6, pitch: 1.5, sparkle: 0.6, gain: 0.5 }],
  ratchet: () => [{ type: "clack", dur: 0.06, pitch: 1.9, gain: SND.ratchet.gain }],
};
export const EVENTS = PLAN.events;
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: SND.bed.gain, root: SND.bed.root, chord: SND.bed.chord, brightness: SND.bed.brightness, attack: SND.bed.attack, release: SND.bed.release, seed: 7 },
  ...scoreFromEvents(EVENTS, VOICES, { seedBase: 124, pan: (e) => (e.kind === "draw" || e.kind === "snap" ? -0.3 + (0.6 * (e.k ?? 0)) / (n - 1) : 0) }),
];
export const DUCK = [];
export const NOTES = {
  mechanism: "volume.js: box + robot as SDF primitives in three materials, baked once into a 116x128x96 RGBA coverage grid (exact arithmetic + sqrt); slices are exact cross-sections of that grid; the volume is ray-marched (64 steps: card + plastic emission/absorption, metal as a refined shaded iso-surface); gears, axles and the key are analytic so they can turn.",
  volume: `voxels with >50 % coverage: card ${PLAN.volume.counts[0]}, plastic ${PLAN.volume.counts[1]}, metal ${PLAN.volume.counts[2]}; checksum ${PLAN.volume.checksum}`,
  planHash: PLAN_HASH_NOW,
  framing: FRAMING.ok ? `ok (worst ${JSON.stringify(FRAMING.worst)})` : `FAILS ${JSON.stringify(FRAMING.spans.slice(0, 6))}`,
  captionRect: CAPTION_RECT,
};
