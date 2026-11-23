// scene.config.js — 86-fireworks: "Temperature — one prompt, many answers" (style "fireworks").
// Plain data + the style's pure shell planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Every launch, burst, flash and sound cue is derived from BEATS through the shell plan.
// World: a locked camera 6 m above the water, 150 m from the launch barges, looking up at the bursts (z = 0 plane);
// the skyline is on the far shore (z = -70 / -120).
// The story: the SAME shell (prompt: "a heart") is fired at rising temperature — exact, looser, plain scatter —
// then many shells at the right heat write one word across the sky.
import { STYLE_SPEC as S } from "./_atlas/styles/fireworks/spec.js";
import { planShow, wordShells, showVoices, cityPlan, skyStars, bargeLamps } from "./_atlas/styles/fireworks/shells.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, boxCorners, pxRect } from "./_atlas/kit/framing.js";

export const ID = "86-fireworks";
export const STYLE = "fireworks";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;
const P = S.palette;

// ---------------------------------------------------------------- beats (T = the temperature the shells are fired at)
export const BEATS = [
  { id: "exact", t: 0, dur: 3.3, label: "Low temperature: exact", T: 0.1 },
  { id: "loose", t: 3.3, dur: 3.3, label: "Warmer: looser, new takes", T: 0.8 },
  { id: "scatter", t: 6.6, dur: 3.2, label: "Too hot: just scatter", T: 1.7 },
  { id: "tuned", t: 9.8, dur: 5.2, label: "Tune it: fresh and clear", T: 0.3 },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t - (i ? 0 : 0.5), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.3 : Infinity }));
// the gauge knob: holds each beat's T, slides to the next over `slide` seconds from the beat start
export const GAUGE = { slide: 0.45, keys: BEATS.map((b) => ({ t: b.t, T: b.T })) };

// ---------------------------------------------------------------- the shells
// One prompt: the same two-layer heart, every time. Only T (and the colour of the paper stars) changes.
const heart = (color, inner) => [{ shape: "heart", color }, { shape: "heart", scale: 0.52, color: inner }];
export const SHELLS = [
  // exact: two shells, the same crisp heart twice
  { id: "exactA", burst: B.exact.t + 0.25, x: -46, y: 54, R: 33, T: B.exact.T, layers: heart(P.pink, P.gold), life: 3.3, from: [-44, 1.4, 0] },
  { id: "exactB", burst: B.exact.t + 1.0, x: 46, y: 54, R: 33, T: B.exact.T, layers: heart(P.pink, P.gold), life: 3.0, from: [44, 1.4, 0] },
  // loose: three takes on the heart
  { id: "looseA", burst: B.loose.t + 0.15, x: -64, y: 55, R: 27, T: B.loose.T, layers: heart(P.gold, P.white), life: 3.1, from: [-78, 1.4, 0] },
  { id: "looseB", burst: B.loose.t + 0.75, x: 0, y: 53, R: 27, T: B.loose.T, layers: heart(P.cyan, P.white), life: 2.9, from: [0, 1.4, 0] },
  { id: "looseC", burst: B.loose.t + 1.35, x: 64, y: 55, R: 27, T: B.loose.T, layers: heart(P.violet, P.gold), life: 2.7, from: [78, 1.4, 0] },
  // scatter: the same heart shell, far too hot
  { id: "hotA", burst: B.scatter.t + 0.15, x: -52, y: 56, R: 33, T: B.scatter.T, layers: heart(P.red, P.orange), life: 2.4, from: [-44, 1.4, 0] },
  { id: "hotB", burst: B.scatter.t + 0.55, x: 50, y: 58, R: 34, T: B.scatter.T, layers: heart(P.red, P.orange), life: 2.4, from: [44, 1.4, 0] },
  { id: "hotC", burst: B.scatter.t + 1.0, x: -2, y: 50, R: 36, T: B.scatter.T, layers: heart(P.red, P.orange), life: 2.5, from: [0, 1.4, 0] },
  { id: "hotD", burst: B.scatter.t + 1.5, x: -80, y: 44, R: 26, T: B.scatter.T, layers: heart(P.red, P.orange), life: 2.0, from: [-78, 1.4, 0] },
  { id: "hotE", burst: B.scatter.t + 1.85, x: 82, y: 42, R: 26, T: B.scatter.T, layers: heart(P.red, P.orange), life: 2.2, from: [78, 1.4, 0] },
  { id: "hotF", burst: B.scatter.t + 2.35, x: 8, y: 60, R: 34, T: B.scatter.T, layers: heart(P.red, P.orange), life: 2.2, from: [0, 1.4, 0] },
  // tuned: one shell per letter writes the word across the whole sky
  ...wordShells("IDEAS", {
    id: "word", cap: 47, center: [0, 55], letterSpacing: 0.3, burst: B.tuned.t + 0.35, stagger: 0.13, glitterStart: 0.2, T: B.tuned.T, take: 0.25,
    colors: [P.pink, P.gold, P.cyan, P.green, P.violet], life: 8, fadePow: 0.8, gravity: 0.9, spacing: 1.2, size: 36, rise: 1.05, word: true,
  }).map((s, i) => ({ ...s, from: [S.barges.xs[i], 1.4, 0] })),
];

export const CITY = cityPlan(S.skyline);
export const PLAN = planShow(SHELLS, S.shells, {
  palette: P, crackles: S.sound.crackle.count,
  extras: [...skyStars(S.sky.stars), ...CITY.beacons, ...bargeLamps(S.barges)],
});
export const SPRITES = PLAN.n;

// ---------------------------------------------------------------- camera: locked (the bursts are the motion)
export const CAMERA = [
  { t: 0, pos: S.view.pos, target: S.view.target, fov: S.camera.fov },
  { t: DURATION, pos: S.view.pos, target: S.view.target, fov: S.camera.fov },
];

// ---------------------------------------------------------------- framing gate
// Every planned shape (not the too-hot scatter) must sit inside the safe window and clear of the caption panel while
// it hangs: from 0.7 s after its burst until it has mostly faded.
const C = S.caption;
const panel = { id: "caption", ...pxRect(C.x, C.y, C.w, C.h) };
function regions(t) {
  const out = [];
  for (const sh of PLAN.shells) {
    if (sh.heat.scatter > 0.5) continue;
    const hang = sh.word ? DURATION : sh.burst + sh.life * 0.6;
    if (!(t > sh.burst + 0.7 && t < hang)) continue;
    // loose shells (noisy by design): gate the planned shape, not the strays
    const r = sh.R * 0.9, box = sh.T > 0.6 ? [[sh.x - r, sh.y - r, 0], [sh.x + r, sh.y + r, 0]] : PLAN.shellBox(sh.id, t - sh.burst);
    out.push({ id: sh.id, pts: boxCorners(...box) });
  }
  return out;
}
export const FRAMING = framingReport(regions, CAMERA, {
  duration: DURATION, drift: S.camera.drift, fov: S.camera.fov, safe: 0.93, keepOut: [panel],
});
if (!FRAMING.ok && !globalThis.process?.env?.FW_NOGATE) {
  throw new Error(`86-fireworks framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events + a low bed and a crowd
export const EVENTS = PLAN.events.filter((e) => e.t >= 0 && e.t < DURATION);
const Q = S.sound;
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: Q.bed.gain, root: Q.bed.root, chord: [0, 7, 12, 19], attack: 1.5, release: 2, brightness: Q.bed.brightness },
  { t: 0, type: "murmur", dur: DURATION, gain: Q.crowd.gain, density: Q.crowd.density, pitch: Q.crowd.pitch, seed: 5 },
  ...scoreFromEvents(EVENTS, showVoices(Q), { seedBase: 311 }),
].filter((e) => e.t >= 0);
export const DUCK = [];
export const NOTES = {
  mechanism: "shells.js: p(t) = C + D(1 - e^(-k tau)) - y(g/k)(tau - (1 - e^(-k tau))/k); D = planned target (+ temperature noise / take / scatter). The vertex shader evaluates the same closed form.",
  sprites: SPRITES,
  shells: PLAN.shells.map((s) => ({ id: s.id, launch: +s.launch.toFixed(2), burst: +s.burst.toFixed(2), T: s.T, stars: s.stars.length })),
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst?.ndc} at ${FRAMING.worst?.t}s, ${FRAMING.worst?.id})` : "FAILS",
};
