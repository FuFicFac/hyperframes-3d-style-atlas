// scene.config.js — 101-ripple-interference: "Timing decides the pattern" (coordination and conflicting inputs), told
// by two dippers in a ripple tank (style "ripple-interference"). Plain data + the style's pure planner. No THREE, no
// window: imported by scene.js (browser) and by render-sfx / export-spec (Node). The water, the dippers, the corks and
// every tap of the score come from the one PLAN (ripple.js).
// World: tank centred on the origin, inner x +-2.5, z +-1.7, water at y 0.26; the bar and both sources at z = -1.05,
// the camera mostly on the +Z side looking toward the bar.
import { STYLE_SPEC as S } from "./_atlas/styles/ripple-interference/spec.js";
import { createPlan, rippleVoices, panOf } from "./_atlas/styles/ripple-interference/ripple.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot } from "./_atlas/kit/framing.js";

export const ID = "101-ripple-interference";
export const STYLE = "ripple-interference";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (storyboard, approved: labels word for word)
export const BEATS = [
  { id: "one", t: 0, dur: 2.5, label: "One source. Clean rings." },
  { id: "two", t: 2.5, dur: 3, label: "Add a second source" },
  { id: "instep", t: 5.5, dur: 3, label: "In step: they add up" },
  { id: "outstep", t: 8.5, dur: 3.5, label: "Out of step: they cancel" },
  { id: "pattern", t: 12, dur: 3, label: "Timing decides the pattern" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
// one label at all times: each fades out over the last 0.2 s of its beat and the next fades in over 0.2 s
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: i ? b.t : -1, off: BEATS[i + 1] ? BEATS[i + 1].t - 0.2 : Infinity }));

// ---------------------------------------------------------------- the one plan
// source 1 is already running at t = 0 (rings from the first frame); source 2 joins in beat 2; its timing slides
// half a cycle (phi: 0 -> pi) early in beat 4 — the change reaches the corks ~1.3 s later, travelling with the waves;
// the camera holds on the corks until the swap has landed (~10.9 s), then pulls back in beat 5.
export const TIMING = { starts: [-1.0, B.two.t + 0.1], slide: { t0: B.outstep.t + 0.05, t1: B.outstep.t + 1.1, to: Math.PI } };
export const PLAN = createPlan({ wave: S.wave, tank: S.tank, timing: TIMING, corks: { z: 0.15 }, end: DURATION });

// ---------------------------------------------------------------- camera: one move per beat, locked holds
const FOV = S.camera.fov;
const WIN = { x0: -0.95, x1: 0.95, y0: -0.95, y1: 0.66 };          // the caption plate owns the top band
const TX = S.tank.halfX + S.tank.wall, TZ = S.tank.halfZ + S.tank.wall;
const TANK = [[-TX, 0, -TZ], [TX, S.tank.rimY, TZ]];
const DRIVERS = [[-0.81, 1.1, S.wave.srcZ], [0.81, 1.1, S.wave.srcZ]];   // keep the driver housings under the caption band
const shot = (box, az, el, o = {}) => {
  const k = fitShot([{ box }, ...(o.extra ?? [])], { azimuth: az, elevation: el, fov: FOV, window: WIN, fill: 1, ...o });
  return { pos: k.pos, target: k.target, fov: FOV };
};
const [cA, cB] = PLAN.corks;
const OPEN = shot([[-TX, 0, -1.3], [0.6, 0.5, 1.2]], -0.3, 0.62, { extra: DRIVERS });                       // left half: one source, clean rings
const OPEN2 = shot([[-TX, 0, -1.3], [0.9, 0.5, 1.4]], -0.24, 0.64, { extra: DRIVERS });     // slow push while the rings spread
const BOTH = shot([[-TX * 0.92, 0, -TZ], [TX * 0.92, 0.4, TZ]], 0.06, 0.78);             // high: both sources, calm lines
const BOTH2 = shot([[-TX * 0.9, 0, -TZ], [TX * 0.9, 0.4, TZ]], 0.1, 0.8, { fill: 1.03 });
const LOW = shot([[cA.x - 0.66, 0.2, -1.1], [cB.x + 0.66, 1.08, cA.z + 0.15]], 0.1, 0.24);   // low on the corks
const LOW2 = shot([[cA.x - 0.7, 0.2, -1.1], [cB.x + 0.7, 1.08, cA.z + 0.15]], 0.13, 0.24);
const MID = shot([[-1.3, 0.2, -1.2], [1.4, 1.08, 0.55]], 0.08, 0.55);                     // corks + the lines sweeping from the bar
const MID2 = shot([[-1.25, 0.2, -1.2], [1.35, 1.08, 0.55]], 0.08, 0.57);
const WIDE = shot(TANK, -0.05, 0.86, { fill: 1.02 });                                     // the whole tank, pattern settled
const WIDE2 = shot(TANK, -0.09, 0.88, { fill: 1.06 });
export const CAMERA = [
  { t: 0, ...OPEN },
  { t: B.two.t - 0.1, ...OPEN2, ease: "inOutSine" },
  { t: B.two.t + 1.3, ...BOTH, ease: "inOutSine" },
  { t: B.instep.t - 0.1, ...BOTH2, ease: "inOutSine" },
  { t: B.instep.t + 1.3, ...LOW, ease: "inOutSine" },
  { t: B.outstep.t - 0.1, ...LOW2, ease: "inOutSine" },
  { t: B.outstep.t + 1.1, ...MID, ease: "inOutSine" },
  { t: B.pattern.t - 0.05, ...MID2, ease: "inOutSine" },
  { t: B.pattern.t + 1.6, ...WIDE, ease: "inOutSine" },
  { t: DURATION, ...WIDE2, ease: "outSine" },
];

// ---------------------------------------------------------------- framing gate: the subject of each held shot stays in frame
const CORKS = [[cA.x - 0.12, 0.2, cA.z - 0.1], [cB.x + 0.2, 0.62, cA.z + 0.1]];
export const FRAMING = framingReport([
  { id: "open", box: [[-TX * 0.9, 0, -1.2], [0.5, 0.5, 1.1]], from: 0, to: B.two.t - 0.1, required: true },
  { id: "both", box: [[-TX * 0.9, 0, -TZ], [TX * 0.9, 0.4, TZ]], from: B.two.t + 1.3, to: B.instep.t - 0.1, required: true },
  { id: "corks-low", box: CORKS, from: B.instep.t + 1.3, to: B.pattern.t - 0.05, required: true },
  { id: "tank-wide", box: [[-TX, 0, -TZ * 0.9], [TX, S.tank.rimY, TZ]], from: B.pattern.t + 1.6, to: DURATION, required: true },
], CAMERA, { duration: DURATION, drift: S.camera.drift, fov: FOV, window: { x0: -0.99, x1: 0.99, y0: -0.99, y1: 0.7 } });

if (!FRAMING.ok && !globalThis.process?.env?.RI_NOGATE) {
  throw new Error(`101-ripple-interference framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events (one tap per dipper stroke)
export const EVENTS = PLAN.events();
export const SCORE = scoreFromEvents(EVENTS, rippleVoices(S.sound), { seedBase: 101, pan: panOf(S.tank) });
export const DUCK = [];
const amp = (c, t0, t1) => PLAN.ampAt(c.x, c.z, t0, t1).toFixed(3);
export const NOTES = {
  mechanism: "ripple.js: h = sum_i A0/sqrt(1 + r_i/r0) env_i(tau_i) cos(omega tau_i - phi_i(tau_i)), tau_i = t - r_i/c; phi_2 slides 0 -> pi in beat 4 (retarded, so the calm lines sweep outward).",
  corks: `cork A (centre line) bob ${amp(cA, 6.5, 8.4)} m in step -> ${amp(cA, 11.2, 12)} m out of step; cork B (half-wavelength line, x ${cB.x.toFixed(3)}) ${amp(cB, 6.5, 8.4)} -> ${amp(cB, 11.2, 12)} m`,
  taps: `${PLAN.taps[0].length} + ${PLAN.taps[1].length} taps (one per dipper stroke)`,
  framing: FRAMING.ok ? "ok" : `FAILS ${JSON.stringify(FRAMING.spans.slice(0, 4))}`,
  numbers: "no data shown on screen",
};
