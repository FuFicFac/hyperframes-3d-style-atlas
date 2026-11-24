// scene.config.js — 118-linocut: "Cut away what isn't" (style "linocut").
// Plain data + the style's pure planner (lino.js). No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). The beats set every window of the plan (carving, roller, paper, baren, peel, lift); the picture and
// every sound cue read the same plan.
// World: the block is centred at the origin on a bench at y = 0, lino top at S.block.ply + S.block.lino; seen from the
// front (+Z), the block's far edge is -Z. Block x = world x, block y = world -z. The block is carved MIRRORED.
import { STYLE_SPEC as S } from "./_atlas/styles/linocut/spec.js";
import { createLinoPlan } from "./_atlas/styles/linocut/lino.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { fitShot, framingReport, pxRect } from "./_atlas/kit/framing.js";

export const ID = "118-linocut";
export const STYLE = "linocut";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;
export const TITLE = "Cut away what isn't";

// ---------------------------------------------------------------- beats (storyboard: times + labels as written)
export const BEATS = [
  { id: "gouge", t: 0, dur: 3.0, label: "A gouge cuts the block" },
  { id: "clear", t: 3.0, dur: 3.2, label: "Cut away the white parts" },
  { id: "ink", t: 6.2, dur: 2.8, label: "Ink only the raised part" },
  { id: "press", t: 9.0, dur: 3.0, label: "Press, rub and peel" },
  { id: "mirror", t: 12.0, dur: 3.0, label: "It prints as a mirror" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
// the caption roll for beat k runs [t - lead, t - lead + roll]: the new line is fully in 0.1 s after the beat starts
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: i ? b.t - S.caption.lead : 0, roll: S.caption.roll }));

// ---------------------------------------------------------------- the plan (every window from the beats)
export const PLAN_CFG = {
  windows: {
    approach: [0, 0.32],
    carve1: [0.32, B.clear.t - 0.14],
    carve2: [B.clear.t + 0.04, B.ink.t - 0.34],
    exit: [B.ink.t - 0.34, B.ink.t + 0.3],
  },
  roller: { enter: [B.ink.t + 0.02, B.ink.t + 0.38], roll: [B.ink.t + 0.38, B.ink.t + 2.1], leave: [B.ink.t + 2.1, B.ink.t + 2.66] },
  paper: { down: [B.press.t - 0.14, B.press.t + 0.44] },
  baren: { in: [B.press.t + 0.4, B.press.t + 0.62], rub: [B.press.t + 0.62, B.press.t + 1.9], out: [B.press.t + 1.9, B.press.t + 2.22] },
  peel: { start: B.press.t + 2.0, mid: B.mirror.t, end: B.mirror.t + 0.7 },
  present: { lift: [B.mirror.t + 0.45, B.mirror.t + 1.75], flatten: [B.mirror.t + 0.75, B.mirror.t + 1.6] },
  reveal: B.mirror.t + 1.62,
};
export const PLAN = createLinoPlan(PLAN_CFG);

// Picture (Chrome) and sound (Node) both use the stroke table: record its fingerprint and fail loudly in either
// environment if they ever disagree (LINO_RECORD=1 prints the new value instead of failing).
export const PLAN_HASH = "60e1fbcf";
export const PLAN_HASH_NOW = PLAN.fingerprint();
if (typeof globalThis.window !== "undefined") globalThis.window.__linoHash = PLAN_HASH_NOW;
if (PLAN_HASH_NOW !== PLAN_HASH && !globalThis.process?.env?.LINO_RECORD) {
  throw new Error(`118-linocut: plan hash ${PLAN_HASH_NOW} != recorded ${PLAN_HASH} (${typeof globalThis.window !== "undefined" ? "browser" : "node"})`);
}

// ---------------------------------------------------------------- camera: one move per beat, still holds
const TOP = S.block.ply + S.block.lino, fov = S.camera.fov;
const orbit = (target, az, el, d) => [target[0] + d * Math.sin(az) * Math.cos(el), target[1] + d * Math.sin(el), target[2] + d * Math.cos(az) * Math.cos(el)];
const key = (t, pos, target, ease) => ({ t, pos: pos.map((v) => +v.toFixed(4)), target: target.map((v) => +v.toFixed(4)), fov, ...(ease ? { ease } : {}) });
// caption plate (bottom-left) as an NDC rect: subjects in the whole-block shots stay above it
export const CAPTION_RECT = pxRect(S.caption.x, S.caption.y, 760, S.caption.h);
const BLOCK_BOX = { box: [[-S.block.w / 2, 0, -S.block.h / 2], [S.block.w / 2, TOP, S.block.h / 2]] };
const PAPER_BOX = { box: [[-PLAN.cfg.paper.w / 2, 0, -PLAN.cfg.paper.h / 2], [PLAN.cfg.paper.w / 2, TOP, PLAN.cfg.paper.h / 2]] };
const WIN = { x0: -0.96, x1: 0.96, y0: -0.6, y1: 0.95 };
// beat 1: low and close behind the gouge as it ploughs round the moon (block top-left: the design is mirrored)
const moon = [-0.082, TOP, -0.058];
const s1 = fitShot(BLOCK_BOX, { azimuth: 0.0, elevation: 1.0, fov, window: WIN, fill: 0.97, align: [0, 0.2] });
const s2 = fitShot(BLOCK_BOX, { azimuth: 0.1, elevation: 0.86, fov, window: WIN, fill: 0.99, align: [0, 0.2] });
const s3 = fitShot(PAPER_BOX, { azimuth: 0.16, elevation: 0.95, fov, window: WIN, fill: 1.0, align: [0, 0.1] });
// beat 5: block on the left, the print standing on the right (nearer), both large
// the print ends parallel to the image plane (normal = -camera forward, edges along camera right/up): no keystone
const FIN_T = [0.165, 0.085, 0.0];
const FIN_P = orbit(FIN_T, 0.0, 0.58, 0.75);
export const PRINT_CENTRE = [0.318, 0.14, 0.04];
const fwd = [FIN_T[0] - FIN_P[0], FIN_T[1] - FIN_P[1], FIN_T[2] - FIN_P[2]];
const fl = Math.hypot(...fwd);
export const PRESENT = {
  pos: [PRINT_CENTRE[0], PRINT_CENTRE[1] - (TOP + 0.0007), PRINT_CENTRE[2]],
  tilt: Math.asin(-fwd[1] / fl),
  yaw: Math.atan2(-fwd[0], -fwd[2]),
};
export const CAMERA = [
  key(0, orbit(moon, 0.16, 0.5, 0.18), [moon[0] + 0.002, moon[1] + 0.008, moon[2] + 0.002]),
  key(B.clear.t - 0.1, orbit(moon, 0.02, 0.54, 0.17), [moon[0] + 0.002, moon[1] + 0.006, moon[2] + 0.0]),
  key(B.clear.t + 1.5, s1.pos, s1.target, "inOutCubic"),
  key(B.ink.t, s1.pos, s1.target),
  key(B.ink.t + 1.2, s2.pos, s2.target, "inOutSine"),
  key(B.press.t, s2.pos, s2.target),
  key(B.press.t + 0.9, s3.pos, s3.target, "inOutSine"),
  key(B.mirror.t + 0.2, s3.pos, s3.target),
  key(B.mirror.t + 1.7, FIN_P, FIN_T, "inOutCubic"),
  key(DURATION, FIN_P, FIN_T),
];

// ---------------------------------------------------------------- framing gate (whole-block shots): block inside the frame
export const FRAMING = framingReport(
  (t) => (t >= B.clear.t + 1.5 && t <= B.mirror.t + 0.2 ? [{ id: "block", ...BLOCK_BOX, required: true }] : []),
  CAMERA, { duration: DURATION, drift: S.camera.drift, fov, safe: 0.99 },
);

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events
const SND = S.sound;
const k01 = (x) => Math.max(0, Math.min(1, x));
const VOICES = {
  approach: () => [{ type: "whoosh", dir: "in", dur: 0.42, q: 1.4, pitch: 0.9, gain: 0.22 }],
  carve: (e) => (e.dur >= 0.12
    ? [
      { type: "penScratch", dur: e.dur, speed: 0.55, pitch: SND.scrape.pitch, gain: SND.scrape.gain },
      { type: "rustle", dur: e.dur, density: 0.6, pitch: 0.42, gain: SND.scrape.gain * 0.7 },
      { type: "tick", pitch: 0.6, gain: SND.tick.gain * 1.2 },
    ]
    : [{ type: "tick", pitch: 0.65 + 0.6 * k01(e.len / 0.2), gain: SND.tick.gain * (0.6 + 0.6 * k01(e.len / 0.2)) }]),
  toolAway: (e) => [{ type: "whoosh", dir: "out", dur: e.dur, q: 1.1, pitch: 0.85, gain: 0.25 }],
  rollerLand: () => [{ type: "thud", pitch: 1.7, gain: 0.32 }],
  roll: (e) => [
    { type: "rustle", dur: e.dur, density: 0.95, pitch: 0.3, gain: SND.roll.gain },
    { type: "whir", dur: e.dur, hz: 58, hz2: 66, grit: 0.6, gain: SND.roll.gain * 0.35 },
  ],
  rollerOff: (e) => [{ type: "whoosh", dir: "out", dur: e.dur + 0.1, q: 1, pitch: 0.7, gain: 0.22 }],
  paperDown: (e) => [{ type: "paper", dur: e.dur + 0.1, fold: true, density: 0.3, gain: SND.paper.gain }],
  rub: (e) => [{ type: "rustle", dur: e.dur * 0.9, density: 0.45, pitch: 0.85 + 0.08 * (e.q % 3), gain: SND.rub.gain }],
  peel: (e) => [
    { type: "paper", dur: e.dur, density: 0.22, pitch: 0.55, gain: SND.peel.gain },
    { type: "rustle", dur: e.dur, density: 0.3, pitch: 0.7, gain: SND.peel.gain * 0.4 },
  ],
  lift: (e) => [{ type: "whoosh", dir: "in", dur: e.dur, q: 1.1, pitch: 0.75, gain: 0.3 }],
  reveal: () => [
    { type: "marimba", hz: SND.chord.hz, notes: [0, 4, 7, 12], step: 0.09, decay: 0.55, mallet: 0.35, dur: 1.9, gain: SND.chord.gain },
    { type: "chime", dur: 1.6, pitch: 0.8, notes: 4, gain: 0.12 },
  ],
};
export const EVENTS = PLAN.events();
export const SCORE = [
  { t: 0, type: "pad", root: SND.bed.root, chord: [0, 7, 12, 16], dur: DURATION, attack: 0.6, release: 1.6, brightness: SND.bed.brightness, gain: SND.bed.gain, seed: 7 },
  { t: PLAN_CFG.windows.carve2[0], type: "rustle", dur: PLAN_CFG.windows.carve2[1] - PLAN_CFG.windows.carve2[0], density: 0.85, pitch: 0.5, gain: SND.blur.gain, seed: 9 },
  ...scoreFromEvents(EVENTS, VOICES, { seedBase: 311, pan: (e) => e.pan ?? 0 }),
];
export const DUCK = [];

export const NOTES = {
  title: TITLE,
  planHash: PLAN_HASH_NOW,
  strokes: PLAN.strokes.length,
  beat1Strokes: PLAN.nFirst,
  carveEnd: +PLAN.carveEnd.toFixed(3),
  framing: { ok: FRAMING.ok, worst: FRAMING.worst },
  mechanism: "lino.js: design SDF -> marching-squares contour cuts + detail cuts + clearing columns, each with [t0, t1]; per-texel carve bake (first-pass time/depth, deepest-stroke time/depth); roller contact line inks texels shallower than 0.34 mm; baren path baked to a first-rub time map; corner curl on a cylinder; rigid slerp to the present pose.",
};
