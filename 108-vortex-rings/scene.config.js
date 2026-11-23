// scene.config.js — 108-vortex-rings: "A push that travels" (momentum, feedback, unintended consequences), told by two
// smoke rings fired along a black glass tank (style "vortex-rings"). Plain data + the style's pure planner. No THREE, no
// window: imported by scene.js (browser) and by render-sfx / export-spec (Node). The ring sizes and positions are
// integrated ONCE here (rings.js, RK4) and every camera key, framing check and sound cue reads that same PLAN.
// World: ring axis = +X at y = 0, z = 0; the drum face with the hole is the plane x = 0; the camera stays on the +Z side.
import { STYLE_SPEC as S } from "./_atlas/styles/vortex-rings/spec.js";
import { createPlan, soundEvents } from "./_atlas/styles/vortex-rings/rings.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { framingReport, fitShot, pxRect } from "./_atlas/kit/framing.js";

export const ID = "108-vortex-rings";
export const STYLE = "vortex-rings";
export const TITLE = "A push that travels";
export const DURATION = 15; // keep equal to data-duration in index.html
export const FPS = 30;

// ---------------------------------------------------------------- beats (storyboard 108, approved)
export const BEATS = [
  { id: "tap", t: 0, dur: 2.5, label: "One tap. One ring." },
  { id: "shape", t: 2.5, dur: 3, label: "It keeps its shape" },
  { id: "second", t: 5.5, dur: 2.5, label: "Send a faster second" },
  { id: "through", t: 8, dur: 3.5, label: "One passes through" },
  { id: "changed", t: 11.5, dur: 3.5, label: "Each changed the other" },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));
// hand-over at each beat boundary: the old label fades out over the last 0.25 s, the new one fades in from the boundary
export const LABEL_FADE = 0.25;
export const LABELS = BEATS.map((b, i) => ({ text: b.label, on: i ? b.t - 0.02 : -0.3, off: BEATS[i + 1] ? BEATS[i + 1].t - LABEL_FADE : Infinity }));

// ---------------------------------------------------------------- the taps and the one plan
export const TAPS = [
  { t: B.tap.t + 0.4, ring: 0, hard: 0 },     // soft tap: the big slow ring
  { t: B.second.t + 0.5, ring: 1, hard: 1 },  // harder tap: smaller, quicker
];
const RS = S.rings;
export const RINGS = TAPS.map((tp, i) => {
  const k = tp.hard ? RS.hard : RS.soft;
  return { id: `ring${i}`, launch: tp.t + RS.launchDelay, x0: RS.x0, R0: k.R0, a0: k.a0, G: k.G };
});
export const PLAN = createPlan({ rings: RINGS, nu: RS.nu, dt: RS.dt, end: DURATION + 0.5 });
export const PASS = PLAN.pass[0] ?? null;
if (!PASS || PASS.t < B.through.t + 0.6 || PASS.t > B.through.t + 2.6) {
  throw new Error(`108-vortex-rings: the threading must fall inside beat "through" (got ${PASS ? PASS.t.toFixed(2) : "none"})`);
}

// ---------------------------------------------------------------- camera: one move per beat, fitted to the plan
const FOV = S.camera.fov;
const CAP = pxRect(70, 50, 840, 150);                               // the caption chip (top-left), with margin
const WIN = { x0: -0.93, x1: 0.93, y0: -0.9, y1: 0.86 };
const WINC = { ...WIN, y1: 0.56 };                                    // shots where a ring reaches the caption corner
const ringPts = (i, t, pad = 1.0) => {
  const s = PLAN.state(i, t), e = s.R + pad * s.a, pts = [];
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * Math.PI * 2;
    for (const dx of [-pad * s.a, pad * s.a]) pts.push([s.x + dx, e * Math.cos(a), e * Math.sin(a)]);
  }
  return pts;
};
const ringBox = (i, t, pad = 1.35) => ({ pts: ringPts(i, t, pad) }); // the smoke's outline, not its bounding box
const DRUM = { box: [[-S.drum.len - 0.2, -S.drum.r, -S.drum.r], [0.05, S.drum.r, S.drum.r]] };
const MALLET = { box: [[-3.4, 0.4, -0.2], [-2.6, 2.1, 0.2]] };
const shot = (subject, az, el, o = {}) => {
  const fov = o.fov ?? FOV;
  const k = fitShot(subject, { azimuth: az, elevation: el, fov, window: WIN, fill: 0.92, ...o });
  return { pos: k.pos, target: k.target, fov };
};
const L0 = RINGS[0].launch, L1 = RINGS[1].launch;
// beat 1: drum front three-quarter, the first ring leaving the hole
const OPEN0 = shot([DRUM, ringBox(0, L0 + 0.6)], 0.7, 0.15, { fill: 0.98, align: [0, -0.1], window: WINC });
const OPEN1 = shot([DRUM, ringBox(0, B.shape.t)], 0.74, 0.13, { fill: 1.0, align: [0, -0.1], window: WINC });
// beat 2: track alongside the ring
const TRACK = (t) => ({ t, ...shot(ringBox(0, t), 0.86, 0.1, { fill: 0.86, align: [0.5, -0.15] }), ease: "linear" });
const trackKeys = [];
for (let t = B.shape.t + 0.5; t <= B.second.t - 0.2 + 1e-9; t += 0.5) trackKeys.push(TRACK(+t.toFixed(3)));
// beat 3: pull back so the drum and the first ring share the frame for the harder tap
const SECOND = shot([DRUM, MALLET, ringBox(0, B.through.t)], 0.62, 0.14, { fill: 0.98, align: [0, -0.1], window: WINC });
// beat 4: swing round to the front three-quarter view down the line: the small ring threads the big one
const passBoxes = (t) => [ringBox(0, t), ringBox(1, t)];
const PASS0 = shot(passBoxes(PASS.t), 0.98, 0.17, { fill: 0.86, align: [0.8, -0.5] });
const PASS1 = shot(passBoxes(B.changed.t - 0.2), 0.86, 0.15, { fill: 0.92, window: WINC });
// beat 5: wide alongside: both rings travel on
const WIDE0 = shot(passBoxes(B.changed.t + 1.2), 0.7, 0.13, { fov: 24, fill: 0.95, window: WINC });
const WIDE1 = shot(passBoxes(DURATION), 0.68, 0.12, { fov: 24, fill: 0.96, window: WINC });
export const CAMERA = [
  { t: 0, ...OPEN0 },
  { t: B.shape.t - 0.1, ...OPEN1, ease: "inOutSine" },
  { ...trackKeys[0], ease: "inOutSine" },
  ...trackKeys.slice(1),
  { t: TAPS[1].t + 0.05, ...SECOND, ease: "inOutCubic" },
  { t: B.through.t - 0.2, ...SECOND },
  { t: PASS.t - 0.35, ...PASS0, ease: "inOutSine", path: "arc" },
  { t: B.changed.t - 0.2, ...PASS1, ease: "linear" },
  { t: B.changed.t + 1.2, ...WIDE0, ease: "inOutSine", path: "arc" },
  { t: DURATION, ...WIDE1, ease: "linear" },
];

// ---------------------------------------------------------------- framing gate: the rings (and the drum while it acts)
const gateRegions = (t) => {
  const out = [];
  RINGS.forEach((r, i) => { if (t >= r.launch + 0.5) out.push({ id: `ring${i}`, pts: ringPts(i, t) }); });
  if (t < B.shape.t || (t > TAPS[1].t - 0.4 && t < B.through.t)) out.push({ id: "drum", box: [[-S.drum.len, -1.2, -1.2], [0, 1.2, 1.2]] });
  return out;
};
export const FRAMING = framingReport(gateRegions, CAMERA, {
  duration: DURATION, drift: S.camera.drift, fov: FOV, window: { x0: -0.97, x1: 0.97, y0: -0.97, y1: 0.97 },
  keepOut: [{ id: "caption", ...CAP }],
});
if (!FRAMING.ok && !globalThis.process?.env?.VR_NOGATE) {
  throw new Error(`108-vortex-rings framing: ${JSON.stringify({ spans: FRAMING.spans.slice(0, 6), worst: FRAMING.worst })}`);
}

export const OBJECTS = [];

// ---------------------------------------------------------------- SCORE: every cue from TAPS and the PLAN
const SND = S.sound;
export const EVENTS = soundEvents(PLAN, { taps: TAPS, step: 0.4, end: DURATION });
const voices = {
  tap: (e) => [
    { type: "thud", gain: e.hard ? SND.tap.hard : SND.tap.soft, pitch: e.hard ? 0.62 : 0.5, dur: 0.6 },
    { type: "whoosh", dir: "out", dur: 0.55, gain: 0.35 + 0.15 * e.hard, pitch: 0.7, offset: RS.launchDelay },
  ],
  air: (e) => [{ type: "whoosh", dir: "in", dur: SND.air.dur, gain: SND.air.gain * (0.25 + 0.75 * e.rel * e.rel), pitch: 0.45 + 0.5 * e.rel }],
  pass: (e) => [
    { type: "rustle", dur: 0.8, density: 0.6, gain: SND.pass.gain },
    { type: "whoosh", dir: "in", dur: 0.7, gain: SND.pass.gain * 0.8, pitch: 0.55 },
  ],
};
export const SCORE = [
  { t: 0, type: "pad", dur: DURATION, gain: SND.bed.gain, root: SND.bed.root, chord: [0, 7, 12, 16], attack: 1.2, release: 2.0, brightness: SND.bed.brightness },
  ...scoreFromEvents(EVENTS, voices, { seedBase: 201, pan: (e) => (e.x != null ? Math.max(-0.6, Math.min(0.6, (e.x - 3) / 8)) : -0.3) }),
];
export const DUCK = [];
export const NOTES = {
  mechanism: "rings.js integrates two coaxial thin vortex rings (self-induction + Biot–Savart mutual induction, slow core growth) with RK4 at load; the smoke sprites are placed around each ring's core from (x, R, a, spin) read at t.",
  pass: PASS ? { t: +PASS.t.toFixed(3), rearR: +PASS.Rrear.toFixed(3), frontR: +PASS.Rfront.toFixed(3) } : null,
  impulseDrift: PLAN.impulse.drift,
  framing: FRAMING.ok ? `ok (worst ${FRAMING.worst?.ndc} at ${FRAMING.worst?.t}s)` : "FAILS",
  ticks: EVENTS.length,
};
