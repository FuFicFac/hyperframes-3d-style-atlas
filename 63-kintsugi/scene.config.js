// scene.config.js — 63-kintsugi: "The break becomes beauty" — a celadon bowl breaks and is mended with gold (style "kintsugi").
// Plain data + the style's pure fracture planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Every clink, return tap and gold-junction chime in SCORE comes from the same plan the picture reads.
import { STYLE_SPEC as S } from "./_atlas/styles/kintsugi/spec.js";
import { createPlan, kintsugiVoices } from "./_atlas/styles/kintsugi/fracture.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { fitShot, prepareKeys, sampleCameraKeys, projectPoint, pxRect } from "./_atlas/kit/framing.js";

export const ID = "63-kintsugi";
export const STYLE = "kintsugi";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (every plan time comes from these)
export const BEATS = [
  { id: "whole", t: 0, dur: 2.4, label: "A celadon tea bowl" },
  { id: "break", t: 2.4, dur: 4.0, label: "It falls and breaks" },
  { id: "gather", t: 6.4, dur: 2.9, label: "Every piece returns" },
  { id: "gold", t: 9.3, dur: 2.9, label: "Mended with gold" },
  { id: "beauty", t: 12.2, dur: 2.8, label: "The break becomes beauty" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.15 : 0.2), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.4 : Infinity }));

// ---------------------------------------------------------------- camera bearings (azimuth 0 = camera on +Z)
const AZ = { open0: 0.55, open1: 0.4, lift: 0.3, scatter: 0.2, scatter2: 0.02, mend: 0.12, gold0: 0.0, gold1: 0.22, end: 1.15 };
// the gold is poured at the rim facing the camera at the gold beat (fracture.js azimuth = atan2(z, x))
const POUR_AZ = Math.PI / 2 - AZ.gold0 + 0.28;

// ---------------------------------------------------------------- the one plan
export const TIMES = { land: 0.4, lift: B.break.t + 0.05, impact: B.break.t + 0.8, gather: B.gather.t, pour: B.gold.t + 0.1, end: DURATION, pourAz: POUR_AZ };
export const PLAN = createPlan(S, TIMES);

// ---------------------------------------------------------------- camera keys from fitted shots
const ring = (r, y, n = 32) => Array.from({ length: n }, (_, i) => [r * Math.cos((i / n) * 2 * Math.PI), y, r * Math.sin((i / n) * 2 * Math.PI)]);
const BOWL = [...ring(S.bowl.rimR, S.bowl.rimY + 0.02), ...ring(S.bowl.rimR * 0.62, 0.15), ...ring(S.bowl.footR, 0)];
const lifted = (pts, dy) => pts.map((p) => [p[0], p[1] + dy, p[2]]);
const REST = PLAN.shards.flatMap((s) => PLAN.worldPoints(s.id, TIMES.gather - 0.01));
const span = (t0, t1, dt = 0.1) => { const out = []; for (let t = t0; t <= t1 + 1e-9; t += dt) for (const sh of PLAN.shards) out.push(...PLAN.worldPoints(sh.id, t).filter((_, k) => k % 3 === 0)); return out; };
const WIN = { x0: -0.92, x1: 0.92, y0: -0.84, y1: 0.86 };
const WIN_S = { ...WIN, y0: -0.6, y1: 0.8 };   // while pieces are loose they stay above the caption band
const shot = (pts, az, el, fill = 1, extra = {}) => fitShot(pts, { azimuth: az, elevation: el, fov: S.camera.fov, window: WIN, fill, ...extra });
const K = (t, s, o = {}) => ({ t, pos: s.pos, target: s.target, fov: S.camera.fov, ...o });
const OPEN0 = shot([...BOWL, ...lifted(BOWL, S.shardMotion.setDown)], AZ.open0, 0.3, 0.97);
const OPEN1 = shot(BOWL, AZ.open1, 0.3, 1.0);
const GOLD0 = shot(BOWL, AZ.gold0, 0.36, 1.02);
const GOLD1 = shot(BOWL, AZ.gold1, 0.33, 1.04);
const END = shot(BOWL, AZ.end, 0.3, 1.02);
// follow shots while pieces are loose: every `step` s a shot fitted to where every piece is over the next ~0.75 s
// (bearing and elevation eased between the bracketing shots), then a 3-tap smoothing of positions and targets.
const follow = (t0, t1, step, az0, az1, el0, el1, fill, ahead = 0.6) => {
  const out = [];
  for (let t = t0; t <= t1 + 1e-9; t += step) {
    const u = (t - t0) / (t1 - t0), e = u * u * (3 - 2 * u);
    const sh = shot(span(Math.max(0, t - 0.1), t + ahead), az0 + (az1 - az0) * e, el0 + (el1 - el0) * e, fill, { window: WIN_S });
    out.push({ t: +t.toFixed(3), pos: sh.pos, target: sh.target });
  }
  const sm = (k, i) => out[i][k].map((_, j) => (out[Math.max(0, i - 1)][k][j] + 2 * out[i][k][j] + out[Math.min(out.length - 1, i + 1)][k][j]) / 4);
  return out.map((o, i) => ({ t: o.t, pos: sm("pos", i), target: sm("target", i), fov: S.camera.fov, ease: "linear" }));
};
const FALLKEYS = follow(TIMES.lift + 0.15, TIMES.impact + 1.5, 0.3, AZ.open1, AZ.scatter, 0.32, 0.56, 0.98, 0.3);
const HOMEKEYS = follow(B.gather.t + 0.6, B.gold.t - 0.3, 0.3, AZ.scatter, AZ.gold0 + 0.04, 0.58, 0.38, 0.96);
export const CAMERA = [
  K(0, OPEN0),
  K(B.break.t, OPEN1, { ease: "inOutSine" }),
  ...FALLKEYS.map((k, i) => (i ? k : { ...k, ease: "inOutSine" })),
  ...HOMEKEYS.map((k, i) => (i ? k : { ...k, ease: "inOutSine" })),
  K(B.gold.t + 0.15, GOLD0, { ease: "inOutSine" }),
  K(B.beauty.t, GOLD1, { ease: "inOutSine" }),
  K(DURATION, END, { ease: "inOutSine", path: "arc" }),
];

// ---------------------------------------------------------------- framing gate: every shard point in the safe area,
// clear of the caption chip while a label is up; reports the narrowest width fill (subject width / frame width).
const CAP = pxRect(S.caption.x, S.caption.y, 640, S.caption.h + 8);
const KEYS = prepareKeys(CAMERA, { fov: S.camera.fov });
export const FRAMING = (() => {
  const fails = []; let minFill = { v: 9, t: 0 };
  for (let f = 0; f <= DURATION * 15; f++) {
    const t = f / 15, cam = sampleCameraKeys(KEYS, t, { fov: S.camera.fov });
    const capOn = LABELS.some((L) => t >= L.on && t <= L.off + 0.3);
    let x0 = 9, x1 = -9;
    for (const s of PLAN.shards) for (const p of PLAN.worldPoints(s.id, t)) {
      const [x, y] = projectPoint(cam, p);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      if (Math.abs(x) > 0.95 || Math.abs(y) > 0.95) fails.push({ t: +t.toFixed(2), why: "edge", shard: s.id, x: +x.toFixed(2), y: +y.toFixed(2) });
      else if (capOn && x > CAP.x0 && x < CAP.x1 && y > CAP.y0 && y < CAP.y1) fails.push({ t: +t.toFixed(2), why: "caption", shard: s.id });
    }
    const fill = (x1 - x0) / 2;
    if (fill < minFill.v) minFill = { v: +fill.toFixed(3), t: +t.toFixed(2) };
  }
  return { ok: fails.length === 0, fails: fails.slice(0, 6), count: fails.length, minFill };
})();
if (!FRAMING.ok && !globalThis.process?.env?.KIN_NOGATE) throw new Error(`63-kintsugi framing: ${JSON.stringify(FRAMING)}`);

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events + a quiet bed
export const EVENTS = PLAN.events();
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION + 0.5, root: S.sound.bed.root, chord: S.sound.bed.chord, attack: 0.6, release: 2.0, brightness: S.sound.bed.brightness, gain: S.sound.bed.gain, seed: 5 },
  ...scoreFromEvents(EVENTS, kintsugiVoices(S.sound), { seedBase: 163, pan: (e) => e.pan ?? 0 }),
].sort((a, b) => a.t - b.t);
export const DUCK = [];
export const NOTES = {
  mechanism: "fracture.js: warped weighted spherical Voronoi of surface directions (per fragment in GLSL, identical formula in JS); shard poses closed form (tip, fall, two bounces, rest, arc home); gold = Dijkstra arrival along the seam network from one rim pour point, baked to a texture.",
  shards: PLAN.n,
  junctions: PLAN.junctions.length,
  chips: PLAN.chips.length,
  pour: { t: PLAN.pour.t, speed: +PLAN.pour.speed.toFixed(3), dur: PLAN.pour.dur },
  framing: FRAMING.ok ? `ok (narrowest width fill ${FRAMING.minFill.v} at ${FRAMING.minFill.t}s)` : `FAILS ${JSON.stringify(FRAMING.fails)}`,
};
