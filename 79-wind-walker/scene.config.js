// scene.config.js — 79-wind-walker: "No brain. Just geometry." (style "wind-walker").
// Plain data + the style's pure linkage planner. No THREE, no window: imported by scene.js (browser) and by render-sfx /
// export-spec (Node). Footprints, step thuds, tube creaks and crank knocks all come from the same plan the picture reads.
import { STYLE_SPEC as S } from "./_atlas/styles/wind-walker/spec.js";
import { createGait, createPlan, walkerVoices, TAU } from "./_atlas/styles/wind-walker/linkage.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { fitShot, prepareKeys, sampleCameraKeys, projectPoint } from "./_atlas/kit/framing.js";

export const ID = "79-wind-walker";
export const STYLE = "wind-walker";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats
export const BEATS = [
  { id: "sticks", t: 0, dur: 3.3, label: "Seven sticks. One crank." },
  { id: "loop", t: 3.3, dur: 2.9, label: "The foot draws a flat step" },
  { id: "reveal", t: 6.2, dur: 3.2, label: "Twelve legs, one shaft" },
  { id: "walk", t: 9.4, dur: 2.8, label: "Wind in. Walking out." },
  { id: "final", t: 12.2, dur: 2.8, label: "No brain. Just geometry." },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: b.t + (i ? 0.15 : 0.25), off: BEATS[i + 1] ? BEATS[i + 1].t - 0.4 : Infinity }));

// ---------------------------------------------------------------- the one plan
// crank phase chosen so the hero foot touches down 0.6 s in (something lands in the first second)
const G0 = createGait(S.linkage, S.gait);
const HERO = G0.legs.find((l) => l.station === S.hero.station && l.side === S.hero.side);
export const CLOCK = { ...S.clock, theta0: G0.contacts[HERO.id].down - TAU * S.clock.rate * 0.6, ramps: [{ t: B.reveal.t - 0.4, dur: 2.6, to: 0.44 }] };
export const PLAN = createPlan(S, { end: DURATION, past: 14, clock: CLOCK });
if (!PLAN.report.ok) throw new Error(`79-wind-walker: linkage verification failed ${JSON.stringify(PLAN.report)}`);

// ---------------------------------------------------------------- timing of the reveal (scene.js reads these)
export const TIMES = {
  mist: [B.reveal.t - 0.9, B.reveal.t + 2.3],       // sea mist lifts
  ink: [B.reveal.t + 0.1, B.reveal.t + 1.5],        // diagram ink fades out
  glow: [B.reveal.t + 2.0, B.reveal.t + 3.4],       // the glowing foot loop fades out
  loopT0: 0.25,                                     // the loop starts drawing here
};

// ---------------------------------------------------------------- camera (positions are RELATIVE to the walking body: scene.js adds body x)
const FOV = S.camera.fov, RIDE = PLAN.report.rideHeight;
const HZ = HERO.z + 2 * S.build.layer;
const orbit = (target, az, el, d) => ({ target, pos: [target[0] + d * Math.sin(az) * Math.cos(el), target[1] + d * Math.sin(el), target[2] + d * Math.cos(az) * Math.cos(el)] });
const TOP = RIDE + S.linkage.hip[1] + S.sails.height[0] + S.sails.height[1];
const ZH = (S.gait.stations / 2) * S.gait.spacing;
const MASTY = RIDE + S.linkage.hip[1] + S.sails.height[0];
const SUBJECT = [];   // the creature's real silhouette: feet, knees, mast tops, boom ends
for (const z of [-ZH + 0.45, 0, ZH - 0.45]) for (const x of [-1.25, 1.25]) SUBJECT.push([x, 0, z], [x * 0.95, RIDE + 1.2, z]);
for (let f = 0; f <= S.gait.stations; f++) SUBJECT.push([S.sails.lean, MASTY + S.sails.height[1] * Math.sin((Math.PI * (f + 0.5)) / (S.gait.stations + 1)), (f - S.gait.stations / 2) * S.gait.spacing]);
SUBJECT.push([-0.8, RIDE + 1.6, ZH + 0.96], [-0.8, RIDE + 1.6, -ZH]);
const BOX = SUBJECT;
const WIN = { x0: -0.93, x1: 0.93, y0: -0.7, y1: 0.93 };
const wide = (az, el, fill, extra = {}) => fitShot(BOX, { azimuth: az, elevation: el, fov: FOV, window: WIN, fill, ...extra });
const K = (t, s, o = {}) => ({ t, pos: s.pos, target: s.target, fov: FOV, ...o });
const LEG0 = orbit([0.25, 0.86, HZ], 0.04, 0.02, 5.3);
const LEG1 = orbit([0.15, 0.83, HZ], 0.08, 0.03, 5.8);
const WIDE0 = wide(-0.98, 0.05, 1.0);
const WIDE1 = wide(-0.84, 0.07, 1.0);
const END = wide(-0.7, 0.34, 1.0, { window: { x0: -0.42, x1: 0.93, y0: -0.6, y1: 0.9 } });
export const CAMERA = [
  K(0, LEG0),
  K(B.loop.t - 0.3, LEG1, { ease: "inOutSine" }),
  K(B.reveal.t - 0.5, LEG1),
  K(B.walk.t - 0.3, WIDE0, { ease: "inOutCubic", path: "arc" }),
  K(B.final.t - 0.5, WIDE1, { ease: "inOutSine", path: "arc" }),
  K(DURATION - 0.7, END, { ease: "inOutCubic", path: "arc" }),
  K(DURATION, END),
];
export const HERO_Z = HZ;

// framing report (not a gate): how much of the frame the creature box spans at each beat end
const KEYS = prepareKeys(CAMERA, { fov: FOV });
const boxPts = SUBJECT;
export const FRAMING = [9.4, 10.5, 12, 13.5, 14.8].map((t) => {
  const cam = sampleCameraKeys(KEYS, t, { fov: FOV });
  let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
  for (const p of boxPts) { const [x, y] = projectPoint(cam, p); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { t, x: [+x0.toFixed(2), +x1.toFixed(2)], y: [+y0.toFixed(2), +y1.toFixed(2)] };
});

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: wind bed + the plan's events
const Q = S.sound;
const smooth = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
const level = (t) => 0.5 + 0.5 * smooth(TIMES.mist[0], TIMES.mist[1], t);   // the herd is muffled while it is in the mist
export const EVENTS = PLAN.events();
const wind = [];
for (let i = 0, t = 0; t < DURATION - 1; i++, t += 2.4) wind.push({ t, type: "whoosh", dir: i % 2 ? "out" : "in", dur: 5.6, pitch: Q.wind.pitch * (i % 3 === 1 ? 1.25 : 1), q: 0.8, gain: Q.wind.gain * (0.7 + 0.3 * level(t + 2.5)), pan: i % 2 ? 0.35 : -0.35, seed: 40 + i });
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION + 0.5, root: Q.bed.root, chord: Q.bed.chord, attack: 1.2, release: 2, brightness: Q.bed.brightness, gain: Q.bed.gain, seed: 5 },
  ...wind,
  { t: TIMES.mist[0] - 0.4, type: "whoosh", dir: "in", dur: 3.4, pitch: 0.7, q: 1, gain: Q.wind.gustGain, seed: 71 },   // the gust that lifts the mist
  { t: S.sails.gust.t + 0.9, type: "paper", dur: 0.7, pitch: 0.45, density: 0.6, gain: Q.sail.gain, pan: -0.2, seed: 72 },
  { t: S.sails.gust.t + 1.7, type: "paper", dur: 0.6, pitch: 0.4, density: 0.6, gain: Q.sail.gain * 0.8, pan: 0.3, seed: 73 },
  { t: B.final.t + 0.15, type: "marimba", hz: Q.final.hz, notes: [0, 7, 12], step: 0.14, dur: 1.4, gain: Q.final.gain, seed: 74 },
  ...scoreFromEvents(EVENTS, walkerVoices(Q, level), { seedBase: 179, pan: (e) => e.pan ?? 0 }),
].sort((a, b) => a.t - b.t);
export const DUCK = [];
export const NOTES = {
  mechanism: "linkage.js: each leg = straight-line four-bar + pantograph solved by two circle–circle intersections per crank angle; 12 legs = phase-offset copies on one crankshaft; body x / y locked to the lowest foot (closed form); footprints and step sounds at planned touchdowns.",
  sticks: PLAN.sticks,
  verification: PLAN.report,
  prints: PLAN.prints.length,
  steps: EVENTS.filter((e) => e.kind === "step").length,
  framing: FRAMING,
};
