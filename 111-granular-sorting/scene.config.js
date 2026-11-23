// scene.config.js — 111-granular-sorting: "Shaken into order" (accumulation and uneven outcomes), told by a jar of cream
// and red beads on a lab shaker (style "granular-sorting"). Plain data + the style's pure planner. No THREE, no window:
// imported by scene.js (browser) and by render-sfx / export-spec (Node). The bead simulation runs ONCE here, at import
// (shaker.simulate: seeded Monte Carlo tap-and-settle), and every bead position, plate lift, camera close-up, trail and
// sound cue comes from that one RUN + PLAN. World: the jar's inside is 3.24 m wide, floor at y = 0.66, centred on x = 0.
import { STYLE_SPEC as S } from "./_atlas/styles/granular-sorting/spec.js";
import { simulate, createPlan, shakerVoices, layout, arrivals, runHash } from "./_atlas/styles/granular-sorting/shaker.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot } from "./_atlas/kit/framing.js";

export const ID = "111-granular-sorting";
export const STYLE = "granular-sorting";
export const TITLE = "Shaken into order";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (storyboard 111, approved)
export const BEATS = [
  { id: "mixed", t: 0, dur: 2.5, label: "Mixed all the way through" },
  { id: "shake", t: 2.5, dur: 3, label: "Shake. Tiny hops." },
  { id: "slip", t: 5.5, dur: 3, label: "Small ones slip under" },
  { id: "ride", t: 8.5, dur: 3.5, label: "Big ones ride up" },
  { id: "nobody", t: 12, dur: 3, label: "No one sorted them" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
// one caption plate stays up the whole time; the text swaps at each beat boundary (quick fade out, fade in)
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t, off: BEATS[i + 1] ? BEATS[i + 1].t : Infinity, first: i === 0 }));

// ---------------------------------------------------------------- the one simulation + plan
export const RUN = simulate(S.sim);
// Node makes the sound and Chrome draws the picture from separate runs of the same simulation: they must agree to the
// bit. RUN_HASH was recorded from this code; any other value (a different JS engine's maths, a changed spec) fails here,
// in both environments, instead of shipping a picture that disagrees with its sound.
export const RUN_HASH = "404ce3de";
export const RUN_HASH_NOW = runHash(RUN);
if (typeof globalThis.window !== "undefined") globalThis.window.__gsRunHash = RUN_HASH_NOW;
if (RUN_HASH_NOW !== RUN_HASH && !globalThis.process?.env?.GS_RECORD) {
  throw new Error(`111-granular-sorting: simulation hash ${RUN_HASH_NOW} != recorded ${RUN_HASH} (${typeof globalThis.window !== "undefined" ? "browser" : "node"})`);
}
export const SCHEDULE = {
  // beat 2: five real-time taps; beat 3: four slower taps watched in close-up; beat 4: strobed fast forward
  taps: [0.2, 0.75, 1.3, 1.85, 2.4].map((d) => ({ t: B.shake.t + d, dur: 0.45 }))
    .concat([0.45, 1.1, 1.75, 2.4].map((d) => ({ t: B.slip.t + d, dur: 0.52 }))),
  fast: { t0: B.ride.t + 0.05, t1: B.nobody.t, slope: 0.35 },
  hop: S.hop,
  focus: { c0: 5, c1: 9, margin: 12 },
};
export const PLAN = createPlan(RUN, SCHEDULE);
const LY = layout(S);
const fw = (c) => { const [x, y] = LY.toWorld(...PLAN.restXY(c, PLAN.focus.i)); return [x, y]; };

// ---------------------------------------------------------------- camera: one move per beat, locked holds
const FOV = S.camera.fov;
const WIN = { x0: -0.95, x1: 0.95, y0: -0.95, y1: 0.68 };       // the caption plate owns the top band
const O = LY.outer;
const JAR = { box: [[O.x0 - 0.12, O.y0 - 0.12, O.z0], [O.x1 + 0.12, O.y1, O.z1]] };
const shot = (subject, az, el, o = {}) => {
  const k = fitShot(subject, { azimuth: az, elevation: el, fov: FOV, window: WIN, fill: 1, ...o });
  return { pos: k.pos, target: k.target, fov: FOV };
};
const closeBox = (c) => { const [x, y] = fw(c); return { box: [[x - 0.78, y - 0.42, -0.1], [x + 0.78, y + 0.5, 0.1]] }; };
const OPEN = shot(JAR, 0.26, 0.18, { fill: 1.0 });
const WIDE = shot(JAR, 0.12, 0.1, { fill: 1.0 });
const CLOSE_A = shot(closeBox(5), 0.1, 0.06);
const CLOSE_B = shot(closeBox(9), 0.08, 0.06);
const WIDE2 = shot(JAR, -0.1, 0.1, { fill: 1.0 });
const END = shot(JAR, -0.2, 0.13, { fill: 1.02 });
export const CAMERA = [
  { t: 0, ...OPEN },
  { t: B.shake.t + 0.1, ...WIDE, ease: "inOutSine" },
  { t: B.slip.t - 0.05, ...WIDE },
  { t: B.slip.t + 0.5, ...CLOSE_A, ease: "inOutCubic" },
  { t: B.ride.t - 0.1, ...CLOSE_B, ease: "inOutSine" },
  { t: B.ride.t + 2.0, ...WIDE2, ease: "inOutCubic" },
  { t: B.nobody.t + 0.1, ...WIDE2 },
  { t: DURATION, ...END, ease: "inOutSine" },
];

// ---------------------------------------------------------------- framing gate: the jar stays in frame in every wide
export const FRAMING = framingReport([
  { id: "jar-open", box: JAR.box, from: 0, to: B.slip.t - 0.05, required: true },
  { id: "focus", pts: (t) => { const [x, y] = LY.toWorld(...PLAN.focusPos(t)); return [[x - 0.3, y - 0.3, 0], [x + 0.3, y + 0.3, 0]]; }, from: B.slip.t + 0.5, to: B.ride.t - 0.1, required: true },
  { id: "jar-end", box: JAR.box, from: B.ride.t + 2.0, to: DURATION, required: true },
], CAMERA, { duration: DURATION, drift: S.camera.drift, fov: FOV, window: { x0: -0.97, x1: 0.97, y0: -0.97, y1: 0.7 } });
if (!FRAMING.ok && !globalThis.process?.env?.GS_NOGATE) {
  throw new Error(`111-granular-sorting framing: ${JSON.stringify(FRAMING.spans.slice(0, 6))}`);
}

// ---------------------------------------------------------------- rings (beat 1: every red bead, bottom to top; beat 5: all on top)
const order = Array.from({ length: RUN.nL }, (_, i) => i).sort((a, b) => RUN.ys[a] - RUN.ys[b] || a - b);
const orderEnd = Array.from({ length: RUN.nL }, (_, i) => i).sort((a, b) => RUN.xs[PLAN.end * RUN.N + a] - RUN.xs[PLAN.end * RUN.N + b] || a - b);
export const RINGS = {
  first: order.map((i, k) => ({ i, t: B.mixed.t + 0.2 + k * 0.15 })),
  last: orderEnd.map((i, k) => ({ i, t: B.nobody.t + 0.35 + k * 0.07 })),
};
// the cream beads that slip under the close-up bead turn amber as each tap lands, and fade back in the fast forward
export const HIGHLIGHT = [];
for (let c = SCHEDULE.focus.c0 + 1; c <= SCHEDULE.focus.c1; c++) {
  const T = SCHEDULE.taps[c - 1];
  for (const j of arrivals(RUN, PLAN.focus.i, c)) HIGHLIGHT.push({ j, t: T.t + T.dur * 0.62 });
}
export const HIGHLIGHT_OFF = { t: B.ride.t + 0.7, dur: 0.6 };
// trails: the focus bead's path appears in the close-up, every path in the fast forward, then they fade
export const TRAILS = { focusOn: B.slip.t + 0.6, allOn: B.ride.t + 0.1, fadeOff: B.nobody.t - 0.2, fadeDur: 0.6, level: 1, arriveHold: 0.5, arriveFade: 0.9 };

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: the plan's events
export const EVENTS = PLAN.events()
  .concat(RINGS.first.map((r, k) => ({ kind: "ring", t: r.t, k, n: RUN.nL })))
  .concat(RINGS.last.map((r, k) => ({ kind: "ringEnd", t: r.t, k, n: RUN.nL })))
  .concat([{ kind: "bed", t: 0 }, { kind: "pull", t: B.ride.t + 0.1 }, { kind: "push", t: B.slip.t + 0.02 }]);
const V = shakerVoices(S.sound);
const SB = S.sound.bed;
V.ring = (e) => [{ type: "marimba", hz: 659.25 * Math.pow(2, (e.k * 2) / 12 / 2), decay: 0.12, dur: 0.4, gain: 0.08 }];
V.ringEnd = (e) => [{ type: "marimba", hz: 1046.5 * Math.pow(2, [0, 4, 7, 12][e.k % 4] / 12), decay: 0.18, dur: 0.5, gain: 0.06 }];
V.bed = () => [{ type: "pad", dur: DURATION - 0.2, root: SB.root, chord: SB.chord, brightness: SB.brightness, attack: 0.8, release: 2.2, gain: SB.gain }];
V.pull = () => [{ type: "whoosh", dir: "out", dur: 1.6, gain: 0.16 }];
V.push = () => [{ type: "whoosh", dir: "in", dur: 0.6, gain: 0.12 }];
export const SCORE = scoreFromEvents(EVENTS, V, { seedBase: 111 });
export const DUCK = [];
export const NOTES = {
  mechanism: "shaker.js: Monte Carlo tap-and-settle (lift 2 + 0.2 x height, then 40 lowest-first passes of down-or-sideways hard-disc moves). 2D: one bead layer; cream depth jitter is look only.",
  run: `${RUN.N} beads (${RUN.nL} red), ${RUN.taps} taps simulated; shown: ${PLAN.end} (all twelve uncovered from tap ${PLAN.end}); focus bead ${PLAN.focus.i} rises ${PLAN.focus.rise.toFixed(1)} radii over taps 6-9 with ${PLAN.focus.arrivals} cream arrivals beneath`,
  framing: FRAMING.ok ? "ok" : `FAILS ${JSON.stringify(FRAMING.spans.slice(0, 4))}`,
  numbers: "no data shown",
};
