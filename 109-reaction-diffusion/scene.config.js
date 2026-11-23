// scene.config.js — 109-reaction-diffusion: "Rules, not a plan" — a Gray–Scott pattern growing in a dish of gel
// (style "reaction-diffusion"). Plain data + the style's pure simulation planner. No THREE, no window: imported by
// scene.js (browser) and by render-sfx / export-spec (Node). The SAME simulation run gives the picture and the sound:
// five drop plinks at the landing times the sim injects its seeds, then a granular crackle whose density follows how
// much of the dish is patterned and still changing.
// Dish coords (0..1 of the sim grid) map to world X (x) and +Z toward the viewer (y); the dish is centred on the origin.
import { STYLE_SPEC as S } from "./_atlas/styles/reaction-diffusion/spec.js";
import { createPlan, texturePlan, runHash } from "./_atlas/styles/reaction-diffusion/grayscott.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot, pxRect } from "./_atlas/kit/framing.js";

export const ID = "109-reaction-diffusion";
export const STYLE = "reaction-diffusion";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (storyboard 109, approved: times + labels verbatim)
export const BEATS = [
  { id: "seeds", t: 0, dur: 2.5, label: "A few seeds" },
  { id: "rules", t: 2.5, dur: 3.0, label: "Two simple local rules" },
  { id: "split", t: 5.5, dur: 3.0, label: "Spots split and spread" },
  { id: "compete", t: 8.5, dur: 3.5, label: "Neighbours compete" },
  { id: "maze", t: 12.0, dur: 3.0, label: "No one drew this" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
// exactly one label at all times: the current beat's label, swapped AT the beat boundary under a brief dip (alpha >= .4)
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t, off: BEATS[i + 1] ? BEATS[i + 1].t : Infinity }));
export const labelAt = (t) => {
  const L = LABELS.find((l) => t < l.off) ?? LABELS[LABELS.length - 1];
  const d = Math.min(...BEATS.slice(1).map((b) => Math.abs(t - b.t)));
  return { text: L.text, alpha: 0.4 + 0.6 * smooth(0, 0.16, d) };
};

// ---------------------------------------------------------------- the simulation (run once, here)
const SIM = S.sim;
export const SEEDS = [
  { x: 0.52, y: 0.55, t: 0.35 },   // centre first: its fall is in frame from t = 0
  { x: 0.27, y: 0.72, t: 0.72 },
  { x: 0.74, y: 0.73, t: 1.09 },
  { x: 0.3, y: 0.32, t: 1.46 },
  { x: 0.7, y: 0.27, t: 1.83 },
].map((s) => ({ ...s, r: SIM.ring.r, ring: SIM.ring.w }));
export const PLAN = createPlan({
  n: SIM.n, radius: SIM.radius, Du: SIM.Du, Dv: SIM.Dv, seed: SIM.seed, seedNoise: SIM.seedNoise,
  storeEvery: SIM.storeEvery, vMax: SIM.vMax, claimAt: SIM.claimAt, duration: DURATION,
  // time-lapse clock: video seconds -> cumulative simulation steps (nearly frozen while the drops land)
  clock: [[0, 0], [B.rules.t, 40], [B.rules.t + 1.0, 140], [B.split.t, 900], [B.compete.t, 3200], [B.maze.t, 6000], [DURATION, 8200]],
  schedule: [
    { t: 0, ...SIM.spots },
    { t: B.compete.t, ...SIM.spots },
    { t: B.compete.t + 3.0, ...SIM.stripes },
  ],
  seeds: SEEDS,
});

// Node (render-sfx: the sound) and the page (the picture) each run the simulation; they must agree bit for bit.
// RUN_HASH was recorded from this code (Node and headless Chrome both gave it, 2026-11-23); any other value (a JS
// engine's maths, a changed spec/seed/clock) fails here in BOTH environments instead of shipping picture != sound.
export const RUN_HASH = "1e7b15cb";
export const RUN_HASH_NOW = runHash(PLAN);
if (typeof globalThis.window !== "undefined") globalThis.window.__rdRunHash = RUN_HASH_NOW;
if (RUN_HASH_NOW !== RUN_HASH && !globalThis.process?.env?.RD_RECORD) {
  throw new Error(`109-reaction-diffusion: simulation hash ${RUN_HASH_NOW} != recorded ${RUN_HASH} (${typeof globalThis.window !== "undefined" ? "browser" : "node"})`);
}

/** dish coords -> world [x, z] (same mapping as style.dishToWorld) */
const R = S.dish.radius;
export const dishToWorld = (x, y) => { const c = (PLAN.n - 1) / 2; return [((x * (PLAN.n - 1) - c) / PLAN.radius) * R, ((y * (PLAN.n - 1) - c) / PLAN.radius) * R]; };

// where the fronts meet: the patterned cell with the most distinct drops' territories within `rad` cells (final state)
export const MEET = (() => {
  const N = PLAN.n, rad = 16, last = (PLAN.layers - 1) * N * N;
  let best = { score: -1 };
  for (let j = rad; j < N - rad; j += 2) for (let i = rad; i < N - rad; i += 2) {
    if (!PLAN.mask[j * N + i]) continue;
    const seen = new Set(); let ink = 0;
    for (let dj = -rad; dj <= rad; dj += 2) for (let di = -rad; di <= rad; di += 2) {
      if (di * di + dj * dj > rad * rad) continue;
      const q = (j + dj) * N + i + di;
      if (PLAN.labels[q]) seen.add(PLAN.labels[q]);
      if (PLAN.states[last + q] > 0.4 * 255) ink++;
    }
    const di = i - (N - 1) / 2, dj = j - (N - 1) / 2, d = Math.sqrt(di * di + dj * dj) / PLAN.radius; // prefer the middle (exactly rounded)
    const score = seen.size * 100 + ink * 0.1 - d * 40;
    if (score > best.score) best = { score, i, j, colonies: seen.size };
  }
  const [x, z] = dishToWorld(best.i / (PLAN.n - 1), best.j / (PLAN.n - 1));
  return { x, z, colonies: best.colonies, cell: [best.i, best.j] };
})();

/** colony tint: none in beats 1–3, each drop's own hue in beat 4; in beat 5 a ring wipe from the centre returns it to one teal */
export const colonyAt = (t) => smooth(B.compete.t + 0.15, B.compete.t + 0.75, t);
export const wipeAt = (t) => (t < B.maze.t + 0.1 ? -1 : -0.1 + 1.25 * smooth(B.maze.t + 0.1, B.maze.t + 1.5, t));
function smooth(a, b, x) { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); }

// ---------------------------------------------------------------- camera: one move per beat, still holds
const gy = S.dish.gelTop;
const region = (cx, cz, h) => ({ box: [[cx - h, gy, cz - h], [cx + h, gy + 0.02, cz + h]] });
const CAP = pxRect(S.caption.x, S.caption.y, 640, S.caption.h);
const WIN = { x0: -0.97, x1: 0.97, y0: -0.97, y1: 0.97 };
const fov = S.camera.fov;
const shot = (sub, o) => { const s = fitShot(sub, { fov, window: WIN, ...o }); return { pos: s.pos, target: s.target, fov }; };
const OPEN = shot(region(0, 0.02, 0.8), { elevation: 1.02, fill: 1.0 });
const NEAR = shot(region(0, 0.04, 0.68), { elevation: 1.08, fill: 1.0 });
const RINGS = shot(region(0.02, 0.06, 0.52), { elevation: 1.12, fill: 1.0 });
const SPREAD = shot(region(0, 0.03, 0.64), { elevation: 1.0, fill: 1.0, azimuth: 0.12 });
const MACRO = shot(region(MEET.x, MEET.z, 0.4), { elevation: 0.7, fill: 1.0, azimuth: -0.25 });
const MACRO2 = shot(region(MEET.x, MEET.z, 0.36), { elevation: 0.66, fill: 1.0, azimuth: -0.33 });
const WIDE = shot({ box: [[-R - 0.03, 0, -R - 0.03], [R + 0.03, S.dish.height, R + 0.03]] }, { elevation: 0.95, fill: 0.99 });
export const CAMERA = [
  { t: 0, ...OPEN },
  { t: B.rules.t, ...NEAR, ease: "inOutSine" },
  { t: B.rules.t + 1.2, ...RINGS, ease: "inOutCubic" },
  { t: B.split.t, ...RINGS },
  { t: B.split.t + 2.0, ...SPREAD, ease: "inOutCubic" },
  { t: B.compete.t, ...SPREAD },
  { t: B.compete.t + 1.4, ...MACRO, ease: "inOutCubic" },
  { t: B.maze.t, ...MACRO2, ease: "inOutSine" },
  { t: B.maze.t + 2.2, ...WIDE, ease: "inOutCubic" },
  { t: DURATION, ...WIDE },
];

// ---------------------------------------------------------------- framing gate: the gel region of each shot stays in frame
export const FRAMING = framingReport((t) => {
  if (t > B.maze.t + 2.2) return [{ id: "dish", box: [[-R, gy, -R], [R, gy, R]] }];
  return [{ id: "centre", box: [[-0.1, gy, -0.1], [0.1, gy, 0.1]] }];
}, CAMERA, { duration: DURATION, drift: S.camera.drift, fov, window: WIN });
if (!FRAMING.ok && !globalThis.process?.env?.RD_NOGATE) {
  throw new Error(`109-reaction-diffusion framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the simulation's events
const SND = S.sound;
export const EVENTS = texturePlan(PLAN, { start: B.rules.t - 0.3, end: DURATION - 0.2, rate: SND.grain.rate });
const hash = (n) => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; };
const lerp = (a, b, u) => a + (b - a) * u;
const VOICES = {
  drop: (e) => [
    { type: "bubble", dur: 0.14, gain: SND.drop.gain, pitch: lerp(SND.drop.pitch[0], SND.drop.pitch[1], hash(e.seed * 7)) },
    { type: "thud", dur: 0.25, gain: SND.drop.gain * 0.22, pitch: 1.6 },
  ],
  grain: (e) => [
    { type: "tick", dur: 0.025, gain: lerp(SND.grain.gain[0], SND.grain.gain[1], e.level), pitch: lerp(SND.grain.pitch[0], SND.grain.pitch[1], hash(e.seed)) },
  ],
};
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: SND.bed.gain, root: SND.bed.root, chord: SND.bed.chord, brightness: SND.bed.brightness, attack: SND.bed.attack, release: SND.bed.release, seed: 7 },
  ...scoreFromEvents(EVENTS, VOICES, { seedBase: 109, pan: (e) => (e.kind === "drop" ? (SEEDS[e.seed - 1].x - 0.5) * 1.2 : (hash(e.seed * 3) - 0.5) * 1.4) }),
];
export const DUCK = [];
export const NOTES = {
  mechanism: "grayscott.js: Gray–Scott (Du 1, Dv .5, 9-point Laplacian, explicit Euler dt 1) on a 160-cell grid clipped to a 76-cell-radius dish with a no-flux rim; run once at load; activator stored every 0.25 s of video; the gel shader blends the two stored states around t.",
  steps: PLAN.steps,
  runHash: RUN_HASH_NOW,
  clock: "video time -> steps is piecewise linear (40 steps by 2.5 s, 8200 by 15 s)",
  schedule: `F/k ${SIM.spots.F}/${SIM.spots.k} (spots split) eased to ${SIM.stripes.F}/${SIM.stripes.k} (stripes) over ${B.compete.t}-${B.compete.t + 3} s`,
  meet: MEET,
  coverage: [2.5, 5.5, 8.5, 12, 15].map((t) => +PLAN.coverageAt(t).toFixed(3)),
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst.ndc} at ${FRAMING.worst.t}s)` : "FAILS",
  captionRect: CAP,
};
