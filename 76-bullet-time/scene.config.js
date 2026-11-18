// scene.config.js — 76-bullet-time: "Stop. Look closer." — what happens inside one instant (style "bullet-time").
// Plain data + the style's pure planner (timewarp.js). No THREE, no window: imported by scene.js (browser) and by
// render-sfx / export-spec (Node). Two clocks: WARP maps video time t to world time w(t); CAMPATH is the camera's own,
// never-stopping arc. The picture reads PLAN at w(t); SCORE places every world event where w(t) crosses it.
import { STYLE_SPEC as S } from "./_atlas/styles/bullet-time/spec.js";
import { createWarp, cameraPath, cameraKeys, createSplash, timedEvents, clockEvents, bulletVoices } from "./_atlas/styles/bullet-time/timewarp.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { prepareKeys, sampleCameraKeys, projectPoint } from "./_atlas/kit/framing.js";

export const ID = "76-bullet-time";
export const STYLE = "bullet-time";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats
export const BEATS = [
  { id: "run", t: 0, dur: 2.0, label: "An ordinary splash" },
  { id: "stop", t: 2.0, dur: 2.5, label: "Stop the world's clock" },
  { id: "orbit", t: 4.5, dur: 2.5, label: "The camera keeps moving" },
  { id: "back", t: 7.0, dur: 2.3, label: "Scrub back: it un-happens" },
  { id: "forward", t: 9.3, dur: 2.4, label: "Scrub forward: look closer" },
  { id: "release", t: 11.7, dur: 3.3, label: "Release: time runs again" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.12 : 0.1), off: BEATS[i + 1] ? BEATS[i + 1].t - (i ? 0.38 : 0.22) : Infinity }));

// ---------------------------------------------------------------- clock 1: the world (impact is w = 0)
const IMPACT_T = 1.5;                       // video time of the plunge
export const WARP = createWarp({
  w0: -IMPACT_T, rate0: 1, duration: DURATION,
  phases: [
    { id: "freeze", at: IMPACT_T + 0.12, rate: 0, ramp: 0.4 },      // full speed -> stopped, mid-splash (w = 0.32)
    { id: "reverse", at: B.back.t, rate: -0.36, ramp: 0.4 },        // the splash un-happens...
    { id: "hold", at: B.back.t + 1.6, rate: 0, ramp: 0.4 },         // ...back to just before the plunge (w = -0.26)
    { id: "forward", at: B.forward.t, rate: 0.36, ramp: 0.4 },      // and re-happens, slowly
    { id: "hold2", at: B.forward.t + 1.6, rate: 0, ramp: 0.4 },     // the same instant again (w = 0.32)
    { id: "release", at: B.release.t + 0.1, rate: 1, ramp: 0.3 },   // let go: full speed
    { id: "crawl", at: B.release.t + 0.66, rate: 0.05, ramp: 0.35 },// ease down to a crawl at the top of the rebound jet
  ],
});
export const PLAN = createSplash(S);

// ---------------------------------------------------------------- clock 2: the camera (never stops)
const Y = 0.92;
export const CAMPATH = cameraPath([
  { t: 0.0, az: -0.1, r: 7.6, el: 0.14, target: [-0.95, 1.0, 0] },
  { t: 1.7, az: 0.1, r: 5.9, el: 0.17, target: [-0.1, Y, 0] },
  { t: 2.4, az: 0.3, r: 5.7, el: 0.2, target: [0, Y, 0] },
  { t: 4.7, az: 2.0, r: 5.2, el: 0.4, target: [0, Y - 0.04, 0] },
  { t: 7.0, az: 3.7, r: 5.5, el: 0.3, target: [0, Y, 0] },
  { t: 9.2, az: 4.3, r: 5.3, el: 0.24, target: [0, Y, 0] },
  { t: 10.5, az: 4.62, r: 4.75, el: 0.3, target: [0, Y - 0.02, 0] },   // push in while the splash re-happens
  { t: 11.7, az: 4.98, r: 5.1, el: 0.27, target: [0, Y, 0] },
  { t: 13.0, az: 5.4, r: 5.6, el: 0.22, target: [0, Y + 0.12, 0] },
  { t: 15.0, az: 5.85, r: 5.5, el: 0.2, target: [0, Y + 0.16, 0] },
]);
export const CAMERA = cameraKeys(CAMPATH, DURATION, { step: 0.1, fov: S.camera.fov });

// ---------------------------------------------------------------- framing report (bowl + crown + ball + jet; spray droplets may leave frame)
const KEYS = prepareKeys(CAMERA, { fov: S.camera.fov });
export const FRAMING = (() => {
  const out = []; let minFill = { v: 9, t: 0 }, worst = { v: 0, t: 0 };
  for (let f = 0; f <= DURATION * 10; f++) {
    const t = f / 10, cam = sampleCameraKeys(KEYS, t, { fov: S.camera.fov });
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
    for (const p of PLAN.points(WARP.w(t), { droplets: false })) {
      const [x, y] = projectPoint(cam, p);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const fill = Math.max((x1 - x0) / 2, (y1 - y0) / 2), edge = Math.max(-x0, x1, -y0, y1);
    if (fill < minFill.v) minFill = { v: +fill.toFixed(3), t };
    if (edge > worst.v) worst = { v: +edge.toFixed(3), t };
    if (f % 10 === 0) out.push(`${t}s x[${x0.toFixed(2)},${x1.toFixed(2)}] y[${y0.toFixed(2)},${y1.toFixed(2)}]`);
  }
  return { minFill, worstEdge: worst, ok: worst.v <= 0.95, perSecond: out };
})();

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: world events at their crossings + the clock's own sounds + a bed
export const EVENTS = [...timedEvents(WARP, PLAN.events()), ...clockEvents(WARP, S.sound)].sort((a, b) => a.t - b.t);
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION + 0.5, root: S.sound.bed.root, chord: S.sound.bed.chord, attack: 0.5, release: 2.0, brightness: S.sound.bed.brightness, gain: S.sound.bed.gain, seed: 5 },
  { t: B.orbit.t - 0.5, type: "whoosh", dir: "in", dur: 1.6, q: 0.8, pitch: 0.7, gain: 0.16, seed: 9 },
  ...scoreFromEvents(EVENTS, bulletVoices(S.sound), { seedBase: 176 }),
].filter((e) => e.t >= 0 && e.t < DURATION).sort((a, b) => a.t - b.t);
export const DUCK = [];
export const NOTES = {
  mechanism: "timewarp.js: world rate dw/dt is piecewise linear in video time (run 1, freeze 0, reverse -0.36, forward 0.36, release 1, crawl 0.05), so w(t) is piecewise quadratic; ball, crown, droplets, splats, cavity, ripples and jet are closed-form functions of w; the camera follows a separate Catmull-Rom arc.",
  worldRange: WARP.range.map((v) => +v.toFixed(3)),
  frozenAt: +WARP.w(4).toFixed(3),
  droplets: PLAN.droplets.length,
  splats: PLAN.splats.length,
  soundEvents: EVENTS.length,
  crossings: { impact: WARP.crossings(0).map((c) => `${c.t.toFixed(2)}s ${c.dir > 0 ? "fwd" : "rev"}`) },
  framing: FRAMING,
};
