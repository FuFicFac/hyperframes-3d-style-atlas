// scene.config.js — 113-fourier-epicycles: "Circles that draw" (style "fourier-epicycles"). Plain data + the style's
// pure planner. No THREE, no window: imported by scene.js (browser) and by render-sfx / export-spec (Node).
// One plan (epicycles.js) is the single source of truth: the arms on screen, the ink line, the camera's follow move,
// the framing gate and every sound cue (one sine partial per arm, ticks as outlines close) all read it.
import { STYLE_SPEC as S } from "./_atlas/styles/fourier-epicycles/spec.js";
import { createPlan } from "./_atlas/styles/fourier-epicycles/epicycles.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot, pxRect } from "./_atlas/kit/framing.js";

export const ID = "113-fourier-epicycles";
export const STYLE = "fourier-epicycles";
export const TITLE = "Circles that draw";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (storyboard 113, labels word for word)
export const BEATS = [
  { id: "one", t: 0, dur: 2.6, label: "One circle draws a circle", K: 1 },
  { id: "three", t: 2.6, dur: 2.8, label: "Add two: a wobbly loop", K: 3, grow: 0.32 },
  { id: "twelve", t: 5.4, dur: 2.8, label: "Twelve: a rough shape", K: 12, grow: 0.42 },
  { id: "sixty", t: 8.2, dur: 3.8, label: "Sixty: it draws a bird", K: 60, grow: 0.6 },
  { id: "added", t: 12.0, dur: 3.0, label: "Only circles, added up" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b) => ({ text: b.label, on: b.t }));
// label change: a 0.24 s counter-wheel roll that completes 0.04 s before each beat start (always exactly one label)
export const LABEL_ROLL = { roll: 0.24, lead: 0.04 };

// ---------------------------------------------------------------- the one plan
// each drawing beat: new arms unfurl over `grow` s from the beat start, then the pen draws exactly one full turn,
// finishing 0.4 s before the beat ends.
const END_GAP = 0.4;
export const STAGES = BEATS.filter((b) => b.K).map((b, i) => ({
  id: b.id, K: b.K,
  grow: b.grow ? [b.t, b.t + b.grow] : null,
  draw: [b.grow ? b.t + b.grow : b.t + 0.05, b.t + b.dur - END_GAP],
  ramp: 0.1,
  samples: b.K >= 40 ? 1200 : b.K >= 10 ? 512 : 256,
}));
export const PLAN = createPlan({ stages: STAGES, scale: S.chain.scale, center: [0, 0], growEach: 0.16 });
// Node (sound, camera) and Chrome (picture) each run the DFT; the term ORDER decides which arms exist in each beat, so
// both must agree to the bit. RUN_HASH was recorded from this code in Node and confirmed in the page (window.__feHash).
export const RUN_HASH = "64340916";
if (typeof globalThis.window !== "undefined") globalThis.window.__feHash = PLAN.hash;
if (PLAN.hash !== RUN_HASH && !globalThis.process?.env?.FE_RECORD) {
  throw new Error(`113-fourier-epicycles: term hash ${PLAN.hash} != recorded ${RUN_HASH} (${typeof globalThis.window !== "undefined" ? "browser" : "node"})`);
}
export const LIFT = { t0: B.added.t, t1: B.added.t + 1.3, height: 0.22 }; // beat 5: the chain lifts away and fades

// ---------------------------------------------------------------- camera
const FOV = S.camera.fov, ASPECT = 16 / 9;
const CAP = pxRect(S.caption.x, S.caption.y, S.caption.w, S.caption.h);
const BADGE = pxRect(0, 0, 150, 120);                                   // the reel's number badge (top-left)
const WIN = { x0: -0.93, x1: 0.93, y0: CAP.y1 + 0.05, y1: 0.9 };        // above the caption plate
const EL = 1.22, EL_CLOSE = 0.92, AZ = 0, AZ_CLOSE = 0.22;
const P3 = (p, y = 0) => [p[0], y, p[1]];
const curvePts = (i, step = 4) => PLAN.curve(i).filter((_, m) => m % step === 0).map((p) => P3(p));
/** everything of stage i drawn by t (sampled), plus the pen tip */
const drawnPts = (i, t, step = 6) => {
  const c = PLAN.curve(i), M = c.length - 1, ph = t < STAGES[i].draw[0] ? 0 : PLAN.phaseAt(i, t);
  const out = [];
  for (let m = 0; m <= Math.floor(ph * M); m += step) out.push(P3(c[m]));
  out.push(P3(PLAN.tip(t)));
  return out;
};
const shot = (pts, o = {}) => {
  const k = fitShot(pts, { azimuth: AZ, elevation: EL, fov: FOV, window: WIN, fill: 0.94, ...o });
  return { pos: k.pos, target: k.target, fov: FOV, dist: k.dist };
};
const SHOT1 = shot(curvePts(0), { fill: 0.95 });
const SHOT2 = shot([...curvePts(1), ...curvePts(0)], { fill: 0.95 });
const SHOT3 = shot([...curvePts(2), ...curvePts(1), ...curvePts(0)], { fill: 0.96 });
const WIDE = shot([...curvePts(3), ...curvePts(2)], { fill: 0.97 });
const FINAL = shot([...curvePts(3)], { fill: 0.985, elevation: 1.27 });
// beat 4: start close on the whirling outer arms at the pen, follow the (smoothed) pen, ease back to the wide
const pose = (target, dist, az, el) => ({
  pos: [target[0] + Math.sin(az) * Math.cos(el) * dist, target[1] + Math.sin(el) * dist, target[2] + Math.cos(az) * Math.cos(el) * dist],
  target, fov: FOV,
});
const tanH = Math.tan((FOV * Math.PI) / 360);
const CLOSE_W = 0.7;                                    // frame width (m) at the pen in the close-up
const DIST_CLOSE = CLOSE_W / (2 * tanH * ASPECT);
const WIN_CY = (WIN.y0 + WIN.y1) / 2;
/** target that puts world point p at the window's vertical centre for a camera at (az, el, dist) */
const centreOn = (p, az, el, dist) => {
  const hh = tanH * dist, up = [-Math.sin(el) * Math.sin(az), Math.cos(el), -Math.sin(el) * Math.cos(az)];
  return [p[0] - up[0] * WIN_CY * hh, p[1] - up[1] * WIN_CY * hh, p[2] - up[2] * WIN_CY * hh];
};
const S4 = STAGES[3];
// beat 4: close on the pen at the beak while the 48 new arms unfurl, then a camera FITTED every 0.1 s to everything
// drawn so far + the pen + the outer arms (never closer than the close-up, never narrower than the key before), so it
// widens exactly as the line grows and the head stays in view while the pen runs on; it lands on the wide shot.
const FOLLOW_T0 = B.sixty.t + 0.25, FIT_T0 = S4.draw[0] - 0.1, FIT_T1 = S4.draw[0] + 1.6, WIDE_T = S4.draw[0] + 2.0;
const PEN0 = P3(PLAN.tip(S4.draw[0]), 0.05);
const CLOSE = pose(centreOn(PEN0, AZ_CLOSE, EL_CLOSE, DIST_CLOSE), DIST_CLOSE, AZ_CLOSE, EL_CLOSE);
const outerJoints = (t) => PLAN.joints(t).filter((_, j) => j >= 6 && j % 3 === 0).map((p) => P3(p, 0.06));
const fitKeys = [];
for (let t = FIT_T0; t <= FIT_T1 + 1e-9; t += 0.1) {
  const u = (t - FIT_T0) / (FIT_T1 - FIT_T0), w = -(Math.cos(Math.PI * u) - 1) / 2;
  const az = AZ_CLOSE + (AZ - AZ_CLOSE) * w, el = EL_CLOSE + (EL - EL_CLOSE) * w;
  const k = fitShot([...drawnPts(3, t + 0.12, 6), P3(PLAN.tip(t + 0.12), 0.1), ...outerJoints(t)],
    { azimuth: az, elevation: el, fov: FOV, window: WIN, fill: 0.78, distance: [DIST_CLOSE, 60] });
  fitKeys.push({ t, az, el, dist: k.dist, target: k.target });
}
// only ever widen, then smooth (3-tap, 3 passes) so the move has no jitter
for (let i = 1; i < fitKeys.length; i++) fitKeys[i].dist = Math.max(fitKeys[i].dist, fitKeys[i - 1].dist);
let fk = fitKeys;
for (let pass = 0; pass < 3; pass++) {
  fk = fk.map((k, i) => {
    const a = fk[Math.max(0, i - 1)], c = fk[Math.min(fk.length - 1, i + 1)];
    return { ...k, dist: (a.dist + 2 * k.dist + c.dist) / 4, target: [0, 1, 2].map((j) => (a.target[j] + 2 * k.target[j] + c.target[j]) / 4) };
  });
}
const FOLLOW = [
  { t: FOLLOW_T0, ...CLOSE, ease: "inOutCubic" },
  { t: S4.draw[0] - 0.2, ...CLOSE, ease: "linear" },
  ...fk.map((k) => ({ t: +k.t.toFixed(3), ...pose(k.target, k.dist, k.az, k.el), ease: "linear" })),
  { t: WIDE_T, pos: WIDE.pos, target: WIDE.target, fov: FOV, ease: "inOutSine" },
];
const EASE_T1 = WIDE_T, SEEN_T = S4.draw[0] + 0.2;
const K = (t, s, ease = "inOutCubic") => ({ t, pos: s.pos, target: s.target, fov: FOV, ease });
export const CAMERA = [
  K(0, SHOT1),
  K(B.three.t - 0.05, SHOT1),
  K(B.three.t + 0.75, SHOT2),
  K(B.twelve.t - 0.05, SHOT2),
  K(B.twelve.t + 0.75, SHOT3),
  K(STAGES[2].draw[1] + 0.05, SHOT3),
  ...FOLLOW,
  K(B.added.t, WIDE, "linear"),
  K(DURATION, FINAL, "inOutSine"),
];

// ---------------------------------------------------------------- framing gate (replays the rig exactly)
// Required in frame (inside WIN, i.e. above the caption plate, and clear of the badge corner): everything drawn so far
// in the current beat plus the earlier outlines; in beat 4's close-up only the pen; from the ease-back on, the bird.
const gate = (t) => {
  const out = [];
  if (t < B.three.t) out.push({ id: "circle", pts: drawnPts(0, t) });
  else if (t < B.twelve.t) out.push({ id: "loop", pts: [...drawnPts(1, t), ...curvePts(0, 8)] });
  else if (t < STAGES[2].draw[1] + 0.05) out.push({ id: "rough", pts: [...drawnPts(2, t), ...curvePts(1, 8)] });
  else if (t < SEEN_T) out.push({ id: "pen", pts: [P3(PLAN.tip(t)), P3(PLAN.tip(t), 0.11)] });
  else if (t < EASE_T1) out.push({ id: "drawn", pts: [...drawnPts(3, t, 8), P3(PLAN.tip(t), 0.11)] });
  else out.push({ id: "bird", pts: curvePts(3, 6) });
  return out;
};
export const FRAMING = framingReport(gate, CAMERA, {
  duration: DURATION, drift: S.camera.drift, fov: FOV, window: WIN, keepOut: [{ id: "badge", ...BADGE }],
});
// how much of the frame the finished bird fills in the closing shot
const birdBox = (() => {
  let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
  for (const p of PLAN.curve(3)) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  return { x: [x0, x1], z: [y0, y1] };
})();
if (!FRAMING.ok && !globalThis.process?.env?.FE_NOGATE) {
  throw new Error(`113-fourier-epicycles framing: ${JSON.stringify({ spans: FRAMING.spans.slice(0, 6), worst: FRAMING.worst })}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: every cue from the PLAN
// additive synthesis: each arm is one sine partial (pitch f0 x |k|, level from its radius) that enters when the arm
// unfurls and fades as the chain lifts away; an unfurl tick per new arm; a pen scratch per drawing; a tick as each
// outline closes; a soft chime when the bird closes; an air whoosh as the chain lifts.
const SND = S.sound;
export const EVENTS = PLAN.events();
const partialEnd = DURATION; // the tone (the sum of every circle) rings on and fades out under the finished bird
const voices = {
  arm: (e) => {
    const v = [{
      type: "pad", bus: "music", dur: partialEnd - e.t, root: SND.partial.f0 * Math.abs(e.k), chord: [0],
      attack: e.grown ? SND.partial.attack : 0.25, release: SND.partial.release, brightness: SND.partial.brightness,
      gain: SND.partial.gain * Math.pow(e.rel, SND.partial.curve), pan: e.k > 0 ? 0.28 : -0.28,
    }];
    if (e.grown) v.push({ type: "tick", gain: SND.unfurl.gain * (0.45 + 0.55 * Math.pow(e.rel, 0.25)), pitch: 0.8 + 0.012 * e.j, pan: e.k > 0 ? 0.35 : -0.35 });
    return v;
  },
  stroke: (e) => [{ type: "penScratch", dur: e.dur, speed: 0.6 + 0.1 * Math.log2(e.K + 1), gain: SND.scratch.gain }],
  close: (e) => [
    { type: "tick", gain: SND.close.gain, pitch: 0.9 },
    ...(e.K >= 60 ? [{ type: "chime", dur: 1.6, notes: 4, gain: SND.done.gain, offset: 0.02 }] : []),
  ],
};
export const SCORE = [
  ...scoreFromEvents(EVENTS, voices, { seedBase: 113, pan: () => 0 }),
  { t: LIFT.t0 + 0.05, type: "whoosh", dir: "out", dur: 1.4, gain: SND.lift.gain, pitch: 0.8, seed: 9 },
].sort((a, b) => a.t - b.t);
export const DUCK = [];
export const NOTES = {
  mechanism: "epicycles.js: an original songbird outline (33 control points, closed Hermite spline) resampled to 256 points by arc length; DFT in plain JS with a sqrt-only twiddle table (bit-identical in Node and Chrome); c_0 is the pivot, the other 255 terms sorted by amplitude. Beat k shows the first K terms; the pen is their sum at the beat's phase, the ink is that sum sampled over one turn and drawn up to the current phase.",
  hash: PLAN.hash,
  terms: PLAN.terms.slice(0, 12).map((c) => `${c.k}:${(c.r * S.chain.scale).toFixed(3)}m`).join(" "),
  captured: STAGES.map((s) => `K${s.K}: ${(PLAN.captured(s.K) * 100).toFixed(2)}%`).join(", "),
  birdBox,
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst?.ndc} at ${FRAMING.worst?.t}s, ${FRAMING.worst?.id})` : `FAILS ${JSON.stringify(FRAMING.spans.slice(0, 4))}`,
};
